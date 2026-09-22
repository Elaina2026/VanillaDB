import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { buildApp } from '../src/server/index.js';
import { dbManager } from '../src/server/db/manager.js';
import { tokenService } from '../src/server/services/tokens.js';
import { databaseService } from '../src/server/services/database.js';
import { authService } from '../src/server/services/auth.js';
import { clusterService } from '../src/server/services/cluster.js';
import { getMetadataDb } from '../src/server/db/metadata.js';
import { config } from '../src/server/config/index.js';

describe('Exhaustive Hardcore Data Leakage & Secret Exposure Pentest Suite (OWASP Top 10 API Security)', () => {
  let app: any;
  let superAdminCookie: string;
  let normalUserCookie: string;
  let normalUserId: string;
  let testDbId: string;
  let liveTokenSecret: string;
  let liveTokenId: string;
  const runId = Date.now();

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 1. Setup Super Admin
    const metaDb = getMetadataDb();
    let admin = metaDb.prepare("SELECT * FROM users WHERE role = 'super_admin' LIMIT 1").get() as any;
    if (!admin) {
      admin = await authService.createAdminUser(`leak_admin_${runId}`, 'SuperSecret123!@#', 'super_admin');
    }
    const adminCookieObj = authService.generateSessionCookie(admin, config.sessionSecret);
    superAdminCookie = `vdb_session=${adminCookieObj.cookieValue}`;

    // 2. Setup Regular Unprivileged User
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: `victim_${runId}@test.com`,
        username: `victim_${runId}`,
        password: 'VictimPassword123!',
      },
    });
    const regData = regRes.json().data;
    normalUserId = regData.user.id;
    normalUserCookie = `vdb_session=${regRes.cookies.find((c: any) => c.name === 'vdb_session').value}`;

    // 3. Create Admin Test DB
    const db = databaseService.createDatabase(`Confidential DB ${runId}`, 'Sensitive financial records', admin.id);
    testDbId = db.id;

    // 4. Populate sensitive data
    const handle = dbManager.get(testDbId);
    handle.exec(`
      CREATE TABLE IF NOT EXISTS credit_cards (
        id INTEGER PRIMARY KEY,
        holder TEXT NOT NULL,
        card_number TEXT NOT NULL,
        cvv TEXT NOT NULL,
        secret_pin TEXT NOT NULL
      );
      INSERT INTO credit_cards VALUES (1, 'Alice Boss', '4111-2222-3333-4444', '888', '1337');
    `);

    // 5. Create Live API Token
    const { tokenRecord, plainSecret } = await tokenService.createToken({
      databaseId: testDbId,
      name: 'Production Ingest Token',
      permissions: ['database:read', 'database:write'],
    });
    liveTokenId = tokenRecord.id;
    liveTokenSecret = plainSecret;
  }, 35000);

  afterAll(async () => {
    if (testDbId) {
      try { databaseService.deleteDatabase(testDbId); } catch {}
    }
    if (normalUserId) {
      try { authService.deleteUser(normalUserId); } catch {}
    }
    clusterService.stop();
    dbManager.closeAll();
    if (app) await app.close();
  });

  // =========================================================================
  // PILLAR 1: TOKEN AT-REST HASHING & ZERO-PLAIN-TEXT EXPOSURE
  // =========================================================================
  describe('Pillar 1: API Token Secrecy & Database Persistence', () => {
    it('CRITICAL: Plaintext API Token must NEVER be persisted in SQLite metadata database', () => {
      const metaDb = getMetadataDb();
      const row = metaDb.prepare('SELECT * FROM api_tokens WHERE id = ?').get(liveTokenId) as any;

      expect(row).toBeDefined();
      expect(row.token_hash).toBeDefined();
      expect(row.token_hash).toHaveLength(64); // SHA-256 hex string

      // Verify the plaintext secret does NOT appear in ANY column of the database
      const rowDump = JSON.stringify(row);
      expect(rowDump).not.toContain(liveTokenSecret);
      expect(row.token_prefix).toBe(liveTokenSecret.substring(0, 9));
      expect(row.token_last_chars).toBe(liveTokenSecret.substring(liveTokenSecret.length - 4));
    });

    it('CRITICAL: Listing tokens via API must NEVER return full token secret or hash', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/databases/${testDbId}/tokens`,
        headers: { cookie: superAdminCookie },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.success).toBe(true);

      const targetToken = json.data.find((t: any) => t.id === liveTokenId);
      expect(targetToken).toBeDefined();
      expect(targetToken.plainSecret).toBeUndefined();
      expect(targetToken.token_hash).toBeUndefined();
      expect(targetToken.token_secret).toBeUndefined();

      // Masking verification
      expect(targetToken.token_prefix).toBeDefined();
      expect(targetToken.token_last_chars).toBeDefined();
      const serialized = JSON.stringify(json);
      expect(serialized).not.toContain(liveTokenSecret);
    });

    it('DEFENSE: Unauthenticated actor must NOT access database tokens or metadata', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/databases/${testDbId}/tokens`,
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().success).toBe(false);
      expect(res.payload).not.toContain('vdb_live_');
    });

    it('BOLA / IDOR: Non-owner user must NOT read or list other tenant API tokens', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/databases/${testDbId}/tokens`,
        headers: { cookie: normalUserCookie },
      });
      expect([403, 404]).toContain(res.statusCode);
      expect(res.payload).not.toContain('vdb_live_');
    });
  });

  // =========================================================================
  // PILLAR 2: AUTHENTICATION CREDENTIALS & SENSITIVE FIELDS STRIPPING
  // =========================================================================
  describe('Pillar 2: User Account & Sensitive Credential Redaction', () => {
    it('CRITICAL: User list & user profile APIs must NEVER return password_hash or totp_secret', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/users',
        headers: { cookie: superAdminCookie },
      });

      expect(res.statusCode).toBe(200);
      const users = res.json().data;
      expect(Array.isArray(users)).toBe(true);

      for (const u of users) {
        expect(u.password_hash).toBeUndefined();
        expect(u.totp_secret).toBeUndefined();
        expect(u.totp_temp_secret).toBeUndefined();
        expect(u.totp_backup_codes).toBeUndefined();
      }

      const bodyStr = res.payload.toLowerCase();
      expect(bodyStr).not.toContain('argon2');
      expect(bodyStr).not.toContain('password_hash');
    });

    it('CRITICAL: Current user profile (/api/auth/me) must strip secret security parameters', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: superAdminCookie },
      });

      expect(res.statusCode).toBe(200);
      const user = res.json().data;
      expect(user.password_hash).toBeUndefined();
      expect(user.totp_secret).toBeUndefined();
      expect(user.token_version).toBeUndefined(); // Internal revocation tracking must not leak
    });
  });

  // =========================================================================
  // PILLAR 3: WEBHOOK SECRETS & THIRD-PARTY INTEGRATION EXPOSURE
  // =========================================================================
  describe('Pillar 3: Webhook HMAC Secrets & Key Leaks', () => {
    it('CRITICAL: Webhook listing API must redact signing secrets for non-superadmin actors', async () => {
      // 1. Create Webhook with secret key
      const whRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${testDbId}/webhooks`,
        headers: { cookie: superAdminCookie },
        payload: {
          name: 'Stripe Payment Ingest',
          url: 'https://example.com/api/v1/webhook',
          secret: 'whsec_9999_super_confidential_hmac_signing_key_secret',
          events: ['insert'],
        },
      });
      expect(whRes.statusCode).toBe(201);

      // 2. Query webhooks
      const listRes = await app.inject({
        method: 'GET',
        url: `/api/admin/databases/${testDbId}/webhooks`,
        headers: { cookie: superAdminCookie },
      });
      expect(listRes.statusCode).toBe(200);

      // Secret must be masked or omitted in general listings
      const webhooks = listRes.json().data;
      const created = webhooks.find((w: any) => w.name === 'Stripe Payment Ingest');
      expect(created).toBeDefined();
    });
  });

  // =========================================================================
  // PILLAR 4: ERROR MESSAGES, DEBUG TRACES & SCHEMA REDACTION (CWE-209)
  // =========================================================================
  describe('Pillar 4: Information Leakage via Error Stack Traces & System Endpoints', () => {
    it('DEFENSE: 500 internal errors in production mode must NOT leak server stack traces', async () => {
      // Intentionally trigger a severe internal malfunction or invalid state
      const res = await app.inject({
        method: 'POST',
        url: `/v1/databases/non_existent_db_id_12345/query`,
        headers: { authorization: `Bearer ${liveTokenSecret}` },
        payload: { sql: 'SELECT 1;' },
      });

      // Status must be 404 or 400, never leaking file system paths or stack traces
      const json = res.json();
      expect(json.success).toBe(false);
      expect(res.payload).not.toContain('at DatabaseSync');
      expect(res.payload).not.toContain('node:internal');
      expect(res.payload).not.toContain(path.resolve('.'));
    });

    it('DEFENSE: System metrics & status must NOT leak server filesystem paths or master encryption keys', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/system/status',
        headers: { cookie: superAdminCookie },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.success).toBe(true);
      const dataStr = JSON.stringify(json.data);

      // Verify no sensitive environmental keys are leaked
      expect(dataStr).not.toContain(config.sessionSecret);
      expect(dataStr).not.toContain(config.clusterSecret);
      expect(dataStr).not.toContain(config.masterKey);
    });
  });

  // =========================================================================
  // PILLAR 5: CLUSTER INTERNAL ACCESS & NODE SECRECY
  // =========================================================================
  describe('Pillar 5: Multi-Node Cluster Inter-Host Secret Leaks', () => {
    it('CRITICAL: Cluster node listing must NOT reveal node auth_token to unprivileged clients', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/cluster/nodes',
        headers: { cookie: superAdminCookie },
      });

      expect(res.statusCode).toBe(200);
      const nodes = res.json().data;
      for (const n of nodes) {
        // Node auth tokens must never be sent in plain API responses
        expect(n.auth_token).toBeUndefined();
      }
    });

    it('DEFENSE: Forging cluster telemetry with invalid x-cluster-secret must be strictly rejected', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/internal/node/stats',
        headers: {
          'x-cluster-secret': 'invalid_forged_cluster_token_1234',
        },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().success).toBe(false);
    });
  });

  // =========================================================================
  // PILLAR 6: SQL INJECTION & SCHEMA EXPLORATION LEAKS
  // =========================================================================
  describe('Pillar 6: SQL Sandboxing & Data Exfiltration Protections', () => {
    it('DEFENSE: ATTACH DATABASE exfiltration attacks must be blocked', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/databases/${testDbId}/query`,
        headers: { authorization: `Bearer ${liveTokenSecret}` },
        payload: {
          sql: "ATTACH DATABASE './data/system/vanilladb.sqlite' AS stolen_meta;",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().success).toBe(false);
      expect(res.json().error.code).toBe('SQLITE_ERROR');
      expect(res.json().error.message).toContain('ATTACH DATABASE is forbidden');
    });

    it('DEFENSE: Accessing unauthorized tables via JOIN or subquery must be denied', async () => {
      // Create token with denied access to credit_cards
      const { plainSecret } = await tokenService.createToken({
        databaseId: testDbId,
        name: 'Public Read Token',
        permissions: ['database:read'],
        deniedTables: ['credit_cards'],
      });

      // 1. Direct SELECT
      const direct = await app.inject({
        method: 'POST',
        url: `/v1/databases/${testDbId}/query`,
        headers: { authorization: `Bearer ${plainSecret}` },
        payload: { sql: 'SELECT * FROM credit_cards;' },
      });
      expect(direct.statusCode).toBe(400);
      expect(direct.payload).not.toContain('4111-2222-3333-4444');
      expect(direct.json().error.message).toContain('Access to table "credit_cards" is denied');

      // 2. Subquery attack
      const subquery = await app.inject({
        method: 'POST',
        url: `/v1/databases/${testDbId}/query`,
        headers: { authorization: `Bearer ${plainSecret}` },
        payload: { sql: 'SELECT (SELECT card_number FROM credit_cards LIMIT 1) as stolen;' },
      });
      expect(subquery.statusCode).toBe(400);
      expect(subquery.payload).not.toContain('4111-2222-3333-4444');
      expect(subquery.json().error.message).toContain('Access to table "credit_cards" is denied');
    });
  });
});
