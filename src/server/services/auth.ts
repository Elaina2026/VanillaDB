import argon2 from 'argon2';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { getMetadataDb } from '../db/metadata.js';
import type { UserRecord } from '../../../shared/index.js';

export class AuthService {
  public async hashPassword(password: string): Promise<string> {
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  public async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  public hasAdminUser(): boolean {
    const metaDb = getMetadataDb();
    const row = metaDb.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return row.count > 0;
  }

  public async createAdminUser(username: string, password: string): Promise<UserRecord> {
    const metaDb = getMetadataDb();
    const existing = metaDb.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      throw new Error(`Username "${username}" already exists`);
    }

    const id = `usr_${nanoid(16)}`;
    const hash = await this.hashPassword(password);
    const now = Date.now();

    metaDb.prepare(`
      INSERT INTO users (id, username, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, username, hash, now, now);

    return { id, username, created_at: now };
  }

  public async validateUser(username: string, password: string): Promise<UserRecord | null> {
    const metaDb = getMetadataDb();
    const row = metaDb.prepare('SELECT id, username, password_hash, created_at FROM users WHERE username = ?').get(username) as
      | { id: string; username: string; password_hash: string; created_at: number }
      | undefined;

    if (!row) return null;

    const isValid = await this.verifyPassword(row.password_hash, password);
    if (!isValid) return null;

    return {
      id: row.id,
      username: row.username,
      created_at: row.created_at,
    };
  }

  public createSessionSignature(userId: string, username: string, expiresAt: number, secret: string): string {
    const payload = `${userId}:${username}:${expiresAt}`;
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  public verifySessionCookie(cookieValue: string, secret: string): { userId: string; username: string } | null {
    try {
      const parts = cookieValue.split('.');
      if (parts.length !== 4) return null;
      const [userId, username, expiresAtStr, signature] = parts;
      const expiresAt = parseInt(expiresAtStr, 10);
      if (isNaN(expiresAt) || Date.now() > expiresAt) return null;

      const expectedSignature = this.createSessionSignature(userId, username, expiresAt, secret);
      if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return { userId, username };
      }
      return null;
    } catch {
      return null;
    }
  }

  public generateSessionCookie(user: UserRecord, secret: string): { cookieValue: string; expires: Date } {
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    const expiresAt = Date.now() + maxAgeMs;
    const signature = this.createSessionSignature(user.id, user.username, expiresAt, secret);
    const cookieValue = `${user.id}.${user.username}.${expiresAt}.${signature}`;
    return {
      cookieValue,
      expires: new Date(expiresAt),
    };
  }
}

export const authService = new AuthService();
