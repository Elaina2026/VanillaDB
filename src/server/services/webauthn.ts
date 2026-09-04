import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { nanoid } from 'nanoid';
import { getMetadataDb } from '../db/metadata.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { WebAuthnCredentialRecord } from '#shared/index.js';

interface CachedChallenge {
  challenge: string;
  userId?: string;
  username?: string;
  expiresAt: number;
}

export class WebAuthnService {
  private challenges = new Map<string, CachedChallenge>();
  private readonly rpName = 'VanillaDatabase';

  constructor() {
    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.challenges.entries()) {
        if (v.expiresAt <= now) this.challenges.delete(k);
      }
    }, 60 * 1000);
  }

  private getRpId(hostname?: string): string {
    if (hostname) {
      return hostname.split(':')[0]; // strip port
    }
    return config.host === '0.0.0.0' ? 'localhost' : config.host;
  }

  private getExpectedOrigin(requestOrigin?: string): string {
    if (requestOrigin) return requestOrigin;
    return `http://${config.host}:${config.port}`;
  }

  public async getRegistrationOptions(userId: string, username: string, hostname?: string) {
    const metaDb = getMetadataDb();
    const existingCreds = metaDb
      .prepare('SELECT credential_id FROM webauthn_credentials WHERE user_id = ?')
      .all(userId) as Array<{ credential_id: string }>;

    const rpID = this.getRpId(hostname);

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID,
      userID: new TextEncoder().encode(userId),
      userName: username,
      userDisplayName: username,
      attestationType: 'none',
      excludeCredentials: existingCreds.map((c) => ({
        id: c.credential_id,
        transports: ['internal', 'usb', 'nfc', 'ble'],
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    const challengeKey = `reg_${userId}`;
    this.challenges.set(challengeKey, {
      challenge: options.challenge,
      userId,
      username,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return options;
  }

  public async verifyRegistration(
    userId: string,
    body: RegistrationResponseJSON,
    hostname?: string,
    origin?: string
  ): Promise<{ success: boolean; error?: string }> {
    const challengeKey = `reg_${userId}`;
    const cached = this.challenges.get(challengeKey);
    if (!cached) {
      return { success: false, error: 'Registration challenge expired or invalid' };
    }
    this.challenges.delete(challengeKey);

    const rpID = this.getRpId(hostname);
    const expectedOrigin = this.getExpectedOrigin(origin);

    try {
      const verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge: cached.challenge,
        expectedOrigin,
        expectedRPID: rpID,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return { success: false, error: 'WebAuthn registration verification failed' };
      }

      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
      const metaDb = getMetadataDb();
      const id = `wcred_${nanoid(16)}`;
      const pubKeyBase64 = Buffer.from(credential.publicKey).toString('base64');
      const transportsJson = JSON.stringify(body.response.transports || []);

      metaDb.prepare(`
        INSERT INTO webauthn_credentials (
          id, user_id, credential_id, public_key, counter, device_type, backed_up, transports, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        userId,
        credential.id,
        pubKeyBase64,
        credential.counter,
        credentialDeviceType,
        credentialBackedUp ? 1 : 0,
        transportsJson,
        Date.now()
      );

      logger.info({ userId, credentialId: credential.id }, 'WebAuthn passkey registered successfully');
      return { success: true };
    } catch (err: any) {
      logger.error({ err }, 'Error verifying WebAuthn registration');
      return { success: false, error: err.message || 'Verification error' };
    }
  }

  public async getLoginOptions(username?: string, hostname?: string) {
    const metaDb = getMetadataDb();
    let allowCredentials: any[] | undefined = undefined;

    if (username) {
      const user = metaDb.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: string } | undefined;
      if (user) {
        const creds = metaDb
          .prepare('SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = ?')
          .all(user.id) as Array<{ credential_id: string; transports: string | null }>;
        allowCredentials = creds.map((c) => ({
          id: c.credential_id,
          transports: c.transports ? JSON.parse(c.transports) : undefined,
        }));
      }
    }

    const rpID = this.getRpId(hostname);
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: 'preferred',
    });

    const challengeKey = `auth_${options.challenge}`;
    this.challenges.set(challengeKey, {
      challenge: options.challenge,
      username,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return options;
  }

  public async verifyLogin(
    body: AuthenticationResponseJSON,
    hostname?: string,
    origin?: string
  ): Promise<{ success: boolean; user?: any; error?: string }> {
    // Find cached challenge
    let matchedKey: string | null = null;
    let cached: CachedChallenge | null = null;

    for (const [k, v] of this.challenges.entries()) {
      if (k.startsWith('auth_')) {
        matchedKey = k;
        cached = v;
        break;
      }
    }

    if (!matchedKey || !cached) {
      return { success: false, error: 'Authentication challenge expired or not found' };
    }
    this.challenges.delete(matchedKey);

    const metaDb = getMetadataDb();
    const credRow = metaDb
      .prepare('SELECT * FROM webauthn_credentials WHERE credential_id = ?')
      .get(body.id) as any;

    if (!credRow) {
      return { success: false, error: 'Passkey not recognized' };
    }

    const user = metaDb.prepare('SELECT * FROM users WHERE id = ?').get(credRow.user_id) as any;
    if (!user || user.status !== 'active') {
      return { success: false, error: 'Account disabled or not found' };
    }

    const rpID = this.getRpId(hostname);
    const expectedOrigin = this.getExpectedOrigin(origin);

    try {
      const verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge: cached.challenge,
        expectedOrigin,
        expectedRPID: rpID,
        credential: {
          id: credRow.credential_id,
          publicKey: Buffer.from(credRow.public_key, 'base64'),
          counter: credRow.counter,
        },
      });

      if (!verification.verified) {
        return { success: false, error: 'Passkey verification failed' };
      }

      metaDb.prepare(`
        UPDATE webauthn_credentials
        SET counter = ?, last_used_at = ?
        WHERE id = ?
      `).run(verification.authenticationInfo.newCounter, Date.now(), credRow.id);

      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          status: user.status,
        },
      };
    } catch (err: any) {
      logger.error({ err }, 'Error verifying WebAuthn authentication');
      return { success: false, error: err.message || 'Passkey verification error' };
    }
  }

  public listUserCredentials(userId: string): WebAuthnCredentialRecord[] {
    const metaDb = getMetadataDb();
    const rows = metaDb
      .prepare('SELECT * FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as any[];

    return rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      credential_id: r.credential_id,
      public_key: r.public_key,
      counter: r.counter,
      device_type: r.device_type,
      backed_up: r.backed_up === 1,
      transports: r.transports ? JSON.parse(r.transports) : null,
      created_at: r.created_at,
      last_used_at: r.last_used_at,
    }));
  }

  public deleteCredential(userId: string, credentialId: string): boolean {
    const metaDb = getMetadataDb();
    const res = metaDb
      .prepare('DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?')
      .run(credentialId, userId);
    return res.changes > 0;
  }
}

export const webAuthnService = new WebAuthnService();
