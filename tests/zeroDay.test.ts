import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { buildApp } from '../src/server/index.js';
import { authService } from '../src/server/services/auth.js';
import { tokenService } from '../src/server/services/tokens.js';
import { databaseService } from '../src/server/services/database.js';
import { WebhookService } from '../src/server/services/webhook.js';
import { dbManager } from '../src/server/db/manager.js';
import { clusterService } from '../src/server/services/cluster.js';
import { getMetadataDb } from '../src/server/db/metadata.js';
import { config } from '../src/server/config/index.js';
import { generateTotpCode } from '../src/server/utils/totp.js';

describe('Zero-Day & Security Hardening Verification Suite', () => {
  let app: any;
  let testUserId: string;
  let oldSessionCookie: string;
  let testDbId: string;
  const runId = Date.now();

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Setup victim user
    const user = await authService.createUser({
      username: `zeroday_victim_${runId}`,
      password: 'OriginalPassword123!',
      email: `victim_${runId}@test.com`,
    });
    testUserId = user.id;

    // Generate initial session cookie
    const sess = authService.generateSessionCookie(user, config.sessionSecret);
    oldSessionCookie = `vdb_session=${sess.cookieValue}`;

    // Enable 2FA on victim account
    const metaDb = getMetadataDb();
    metaDb.prepare('UPDATE users SET totp_enabled = 1, totp_secret = ? WHERE id = ?').run('JBSWY3DPEHPK3PXP', testUserId);

    // Create a test database
    const db = databaseService.createDatabase(`ZeroDay DB ${runId}`, 'Test DB', testUserId);
    testDbId = db.id;

    const handle = dbManager.get(testDbId);
    handle.exec(`
      CREATE TABLE IF NOT EXISTS public_notes (id INTEGER PRIMARY KEY, title TEXT);
      CREATE TABLE IF NOT EXISTS secret_vault (id INTEGER PRIMARY KEY, secret_key TEXT);
      INSERT INTO public_notes VALUES (1, 'Hello World');
      INSERT INTO secret_vault VALUES (1, 'SuperSecretKey12345');
    `);
  });

  afterAll(async () => {
    if (testDbId) {
      try { databaseService.deleteDatabase(testDbId); } catch {}
    }
    if (testUserId) {
      try { authService.deleteUser(testUserId); } catch {}
    }
    clusterService.stop();
    dbManager.closeAll();
    if (app) await app.close();
  });

  // =========================================================================
  // FIX 1: WEBHOOK SSRF PROTECTIONS
  // =========================================================================
  describe('Fix 1: Webhook SSRF Protections (Decimal, Hex, Octal & Redirect Defense)', () => {
    it('should reject integer/decimal representation of 127.0.0.1 (2130706433)', () => {
      const res = WebhookService.isSafeWebhookUrl('http://2130706433/webhook');
      expect(res.safe).toBe(false);
      expect(res.reason).toContain('forbidden');
    });

    it('should reject hex representation of loopback (0x7f000001)', () => {
      const res = WebhookService.isSafeWebhookUrl('http://0x7f000001/webhook');
      expect(res.safe).toBe(false);
      expect(res.reason).toContain('forbidden');
    });

    it('should reject cloud metadata integer/hex IP addresses', () => {
      // 169.254.169.254 = 2852039166
      const res = WebhookService.isSafeWebhookUrl('http://2852039166/latest/meta-data/');
      expect(res.safe).toBe(false);
    });

    it('should verify resolved hosts via DNS and reject internal targets', async () => {
      const localhostRes = await WebhookService.verifyResolvedHostIsSafe('localhost');
      expect(localhostRes.safe).toBe(false);
    });
  });

  // =========================================================================
  // FIX 2: VDB-SEC-01 PASSWORD RECOVERY SESSION REVOCATION
  // =========================================================================
  describe('Fix 2: VDB-SEC-01 Session Invalidation on Password Recovery', () => {
    it('MUST revoke old sessions when password is reset via /api/auth/recovery/reset-password', async () => {
      // 1. Verify old session cookie currently works
      const beforeMe = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: oldSessionCookie },
      });
      expect(beforeMe.statusCode).toBe(200);

      // 2. Perform recovery reset with valid TOTP code
      const currentCode = generateTotpCode('JBSWY3DPEHPK3PXP');
      const resetRes = await app.inject({
        method: 'POST',
        url: '/api/auth/recovery/reset-password',
        payload: {
          usernameOrEmail: `zeroday_victim_${runId}`,
          totpCode: currentCode,
          newPassword: 'BrandNewSecurePassword123!',
        },
      });
      expect(resetRes.statusCode).toBe(200);

      // 3. Old session cookie MUST now be revoked immediately (401)
      const afterMe = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: oldSessionCookie },
      });
      expect(afterMe.statusCode).toBe(401);
      expect(afterMe.json().error.code).toBe('UNAUTHORIZED');
      expect(afterMe.json().error.message).toContain('Session revoked');
    });
  });

  // =========================================================================
  // FIX 3: LEGACY COOKIE FALLBACK REMOVAL
  // =========================================================================
  describe('Fix 3: Strict 6-Part Cookie Enforcement', () => {
    it('should reject legacy 4-part or 5-part session cookies that lack token_version', () => {
      const expiresAt = Date.now() + 86400000;
      const legacyPayload = `${testUserId}:zeroday_victim_${runId}:user:${expiresAt}`;
      const legacySig = crypto.createHmac('sha256', config.sessionSecret).update(legacyPayload).digest('hex');
      const legacyCookie = `${testUserId}.zeroday_victim_${runId}.user.${expiresAt}.${legacySig}`;

      // verifySessionCookie must refuse legacy 5-part cookie
      const parsed = authService.verifySessionCookie(legacyCookie, config.sessionSecret);
      expect(parsed).toBeNull();
    });
  });

  // =========================================================================
  // FIX 4: SQL TABLE ACCESS CONTROL (SCHEMA PREFIX & COMMA JOIN BYPASS)
  // =========================================================================
  describe('Fix 4: SQL Table Access Control (Bypass Prevention)', () => {
    let scopedToken: string;

    beforeAll(async () => {
      const { plainSecret } = await tokenService.createToken({
        databaseId: testDbId,
        name: 'Scoped Read Token',
        permissions: ['database:read'],
        allowedTables: ['public_notes'],
        deniedTables: ['secret_vault'],
      });
      scopedToken = plainSecret;
    });

    it('should deny access when querying denied table via main schema prefix (main.secret_vault)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/databases/${testDbId}/query`,
        headers: { authorization: `Bearer ${scopedToken}` },
        payload: { sql: 'SELECT * FROM main.secret_vault;' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.payload).not.toContain('SuperSecretKey12345');
      expect(res.json().error.message).toContain('is denied');
    });

    it('should permit access when querying allowed table via main schema prefix (main.public_notes)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/databases/${testDbId}/query`,
        headers: { authorization: `Bearer ${scopedToken}` },
        payload: { sql: 'SELECT * FROM main.public_notes;' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.rows[0].title).toBe('Hello World');
    });

    it('should catch multi-table comma join syntax attempting to access unauthorized table (FROM public_notes, secret_vault)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/databases/${testDbId}/query`,
        headers: { authorization: `Bearer ${scopedToken}` },
        payload: { sql: 'SELECT * FROM public_notes, secret_vault;' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.payload).not.toContain('SuperSecretKey12345');
      expect(res.json().error.message).toMatch(/(denied|not permitted)/);
    });
  });

  // =========================================================================
  // FIX 5: TIMING ATTACK DEFENSE ON CLUSTER SECRET
  // =========================================================================
  describe('Fix 5: Cluster Secret Timing-Safe Verification', () => {
    it('should reject invalid x-cluster-secret with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/internal/node/stats',
        headers: { 'x-cluster-secret': 'forged_fake_secret_value' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED_CLUSTER_NODE');
    });

    it('should accept valid x-cluster-secret with 200', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/internal/node/stats',
        headers: { 'x-cluster-secret': config.clusterSecret },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      expect(res.json().data.nodeId).toBeDefined();
    });
  });
});
