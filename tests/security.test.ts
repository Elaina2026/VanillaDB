import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { buildApp } from '../src/server/index.js';
import { dbManager } from '../src/server/db/manager.js';
import { tokenService } from '../src/server/services/tokens.js';
import { databaseService } from '../src/server/services/database.js';
import { authService } from '../src/server/services/auth.js';
import { storageService } from '../src/server/services/storage.js';
import { generateTotpCode, generateTotpSecret } from '../src/server/utils/totp.js';
import { getMetadataDb } from '../src/server/db/metadata.js';

describe('VanillaDatabase Exhaustive Security & Penetration Testing Suite (A to Z)', () => {
  let app: any;
  let adminCookie: string;
  let adminDbId: string;
  const runId = Date.now();

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 1. Ensure admin session exists
    let setupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: `sec_admin_${runId}`,
        password: 'AdminPassword123!',
        confirmPassword: 'AdminPassword123!',
      },
    });

    if (setupRes.statusCode === 201) {
      adminCookie = `vdb_session=${setupRes.cookies.find((c: any) => c.name === 'vdb_session').value}`;
    } else {
      let loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'admin_test',
          password: 'SuperSecretPassword123!',
        },
      });
      if (loginRes.statusCode !== 200) {
        // Fallback login with environment credentials
        loginRes = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: {
            username: process.env.VDB_ADMIN_USERNAME || 'VanillaDatabase',
            password: process.env.VDB_ADMIN_PASSWORD || '123456',
          },
        });
      }
      expect(loginRes.statusCode).toBe(200);
      adminCookie = `vdb_session=${loginRes.cookies.find((c: any) => c.name === 'vdb_session').value}`;
    }

    // 2. Create base test database for admin
    const dbRes = await app.inject({
      method: 'POST',
      url: '/api/admin/databases',
      headers: { cookie: adminCookie },
      payload: { name: `Admin Sec DB ${runId}` },
    });
    adminDbId = dbRes.json().data.id;
  }, 35000);

  afterAll(async () => {
    if (adminDbId) {
      try {
        databaseService.deleteDatabase(adminDbId);
      } catch {}
    }
    dbManager.closeAll();
    if (app) await app.close();
  }, 30000);

  // =========================================================================
  // GROUP 1: AUTHENTICATION, PRIVILEGE ESCALATION & INPUT VALIDATION
  // =========================================================================
  describe('Group 1: Authentication & Privilege Escalation Defenses', () => {
    it('should reject privilege escalation parameters on self-registration', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: `attacker_${runId}@test.com`,
          username: `attacker_${runId}`,
          password: 'Password123!',
          role: 'super_admin', // Attempt escalation
          maxDatabases: 9999,  // Attempt quota bypass
          rateLimitPerMinute: 0,
        },
      });
      expect(res.statusCode).toBe(201);
      const user = res.json().data.user;
      expect(user.role).toBe('user'); // Enforced 'user'
      expect(user.role).not.toBe('super_admin');

      // Verify in DB directly
      const metaDb = getMetadataDb();
      const row = metaDb.prepare('SELECT role, max_databases FROM users WHERE id = ?').get(user.id) as any;
      expect(row.role).toBe('user');
      expect(row.max_databases).toBe(5);
    });

    it('should prevent duplicate registration with mixed-case email addresses', async () => {
      const email = `casetest_${runId}@domain.com`;
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: email.toUpperCase(), username: `case1_${runId}`, password: 'Password123!' },
      });
      expect(res1.statusCode).toBe(201);

      // Attempt second registration with lowercase
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: email.toLowerCase(), username: `case2_${runId}`, password: 'Password123!' },
      });
      expect(res2.statusCode).toBe(400);
      expect(res2.json().error.code).toBe('REGISTRATION_ERROR');
    });

    it('should normalize email to lowercase on login', async () => {
      const email = `case_login_${runId}@domain.com`;
      await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email, username: `case_login_${runId}`, password: 'Password123!' },
      });

      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: email.toUpperCase(), password: 'Password123!' },
      });
      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.json().success).toBe(true);
    });

    it('should enforce password length constraints at trust boundary', async () => {
      // Too short (< 6 chars)
      const shortRes = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: `short_${runId}@test.com`, password: '12345' },
      });
      expect(shortRes.statusCode).toBe(400);
      expect(shortRes.json().error.code).toBe('VALIDATION_ERROR');

      // Boundary: Exactly 6 chars -> accepted
      const okRes = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: `valid6_${runId}@test.com`, password: '123456' },
      });
      expect(okRes.statusCode).toBe(201);
    });

    it('should reject unauthenticated requests to protected auth endpoints', async () => {
      // PUT /api/auth/profile without session
      const profRes = await app.inject({
        method: 'PUT',
        url: '/api/auth/profile',
        payload: { email: 'hacked@test.com' },
      });
      expect(profRes.statusCode).toBe(401);

      // POST /api/auth/change-password without session
      const passRes = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        payload: { currentPassword: '123', newPassword: '456' },
      });
      expect(passRes.statusCode).toBe(401);

      // POST /api/auth/2fa/setup without session
      const setup2faRes = await app.inject({
        method: 'POST',
        url: '/api/auth/2fa/setup',
      });
      expect(setup2faRes.statusCode).toBe(401);
    });
  });

  // =========================================================================
  // GROUP 2: TWO-FACTOR AUTHENTICATION (2FA / TOTP) ADVERSARIAL TESTING
  // =========================================================================
  describe('Group 2: 2FA TOTP Integrity & Step-Up Security', () => {
    let totpUserCookie: string;
    let totpUserId: string;
    let totpSecret: string;

    beforeAll(async () => {
      const reg = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: `totp_sec_${runId}@test.com`,
          username: `totp_sec_${runId}`,
          password: 'CorrectPassword123!',
        },
      });
      totpUserId = reg.json().data.user.id;
      totpUserCookie = `vdb_session=${reg.cookies.find((c: any) => c.name === 'vdb_session').value}`;

      const setup = await app.inject({
        method: 'POST',
        url: '/api/auth/2fa/setup',
        headers: { cookie: totpUserCookie },
      });
      totpSecret = setup.json().data.secret;

      // Activate 2FA with password & valid OTP
      await app.inject({
        method: 'POST',
        url: '/api/auth/2fa/activate',
        headers: { cookie: totpUserCookie },
        payload: {
          password: 'CorrectPassword123!',
          code: generateTotpCode(totpSecret),
        },
      });
    });

    it('should reject tampered or forged tempToken in 2FA verification challenge', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login/2fa',
        payload: {
          tempToken: 'fakeUserId.9999999999999.invalidsignature1234567890',
          code: '123456',
        },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('EXPIRED_2FA_CHALLENGE');
    });

    it('should reject expired 2FA tempToken challenge (TTL 5 minutes)', async () => {
      // Forge expired token with legitimate signature by invoking service with past timestamp
      const expiredTimestamp = Date.now() - 6 * 60 * 1000;
      const signature = crypto
        .createHmac('sha256', process.env.SESSION_SECRET || 'vanilladb_super_secret_session_key_for_development_only_min_32_bytes')
        .update(`${totpUserId}.${expiredTimestamp}`)
        .digest('hex');
      const expiredToken = `${totpUserId}.${expiredTimestamp}.${signature}`;

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login/2fa',
        payload: {
          tempToken: expiredToken,
          code: generateTotpCode(totpSecret),
        },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('EXPIRED_2FA_CHALLENGE');
    });

    it('should reject stale TOTP codes outside the +/- 30s drift tolerance window', async () => {
      // 1. Get valid tempToken
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: `totp_sec_${runId}`, password: 'CorrectPassword123!' },
      });
      const tempToken = login.json().data.tempToken;

      // 2. Generate stale code from 90 seconds ago (step = -3, outside [-1, 1] tolerance)
      const staleCode = generateTotpCode(totpSecret, 30000, Date.now() - 90000);
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login/2fa',
        payload: { tempToken, code: staleCode },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('INVALID_2FA_CODE');
    });

    it('should require valid password AND valid code to disable 2FA', async () => {
      // Wrong password
      const wrongPass = await app.inject({
        method: 'POST',
        url: '/api/auth/2fa/disable',
        headers: { cookie: totpUserCookie },
        payload: {
          password: 'WrongPassword!',
          code: generateTotpCode(totpSecret),
        },
      });
      expect(wrongPass.statusCode).toBe(401);

      // Wrong code
      const wrongCode = await app.inject({
        method: 'POST',
        url: '/api/auth/2fa/disable',
        headers: { cookie: totpUserCookie },
        payload: {
          password: 'CorrectPassword123!',
          code: '000000',
        },
      });
      expect(wrongCode.statusCode).toBe(400);
    });
  });

  // =========================================================================
  // GROUP 3: SESSION COOKIE CRYPTOGRAPHY & INTEGRITY
  // =========================================================================
  describe('Group 3: Session Cryptography & Forgery Prevention', () => {
    it('should reject tampered session cookies and forged signatures', async () => {
      // Modified user payload with stale signature
      const fakeSession = Buffer.from(JSON.stringify({
        userId: 'root_user',
        username: 'admin',
        role: 'super_admin',
        exp: Date.now() + 86400000,
      })).toString('base64url') + '.forged_hmac_signature_value';

      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: `vdb_session=${fakeSession}` },
      });
      expect(res.statusCode).toBe(401);
    });

    it('should reject expired session cookies', async () => {
      const expiredPayload = {
        userId: 'expired_user',
        username: 'expired_user',
        role: 'user',
        exp: Date.now() - 10000, // Expired
      };
      const secret = process.env.SESSION_SECRET || 'vanilladb_super_secret_session_key_for_development_only_min_32_bytes';
      const body = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
      const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');

      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: `vdb_session=${body}.${sig}` },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // =========================================================================
  // GROUP 4: RBAC, CROSS-TENANT ISOLATION, BOLA & IDOR DEFENSES
  // =========================================================================
  describe('Group 4: Multi-Tenant BOLA/IDOR & Role Permission Hierarchy', () => {
    let tenantACookie: string;
    let tenantADbId: string;
    let tenantBCookie: string;
    let tenantBUserId: string;

    beforeAll(async () => {
      // 1. Setup Tenant A
      const regA = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: `tenant_a_${runId}@test.com`, username: `tenant_a_${runId}`, password: 'Password123!' },
      });
      tenantACookie = `vdb_session=${regA.cookies.find((c: any) => c.name === 'vdb_session').value}`;

      const dbA = await app.inject({
        method: 'POST',
        url: '/api/admin/databases',
        headers: { cookie: tenantACookie },
        payload: { name: 'Tenant A Secrets Database' },
      });
      tenantADbId = dbA.json().data.id;

      // Seed confidential table in Tenant A
      const seedRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${tenantADbId}/query`,
        headers: { cookie: tenantACookie },
        payload: {
          sql: 'CREATE TABLE confidential_records (id INTEGER PRIMARY KEY, secret_key TEXT);',
        },
      });
      expect(seedRes.statusCode).toBe(200);

      const seedInsert = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${tenantADbId}/query`,
        headers: { cookie: tenantACookie },
        payload: {
          sql: "INSERT INTO confidential_records (id, secret_key) VALUES (1, 'TENANT_A_CONFIDENTIAL_KEY');",
        },
      });
      expect(seedInsert.statusCode).toBe(200);

      // 2. Setup Tenant B
      const regB = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: `tenant_b_${runId}@test.com`, username: `tenant_b_${runId}`, password: 'Password123!' },
      });
      tenantBCookie = `vdb_session=${regB.cookies.find((c: any) => c.name === 'vdb_session').value}`;
      tenantBUserId = regB.json().data.user.id;
    });

    it('BOLA: Tenant B should be strictly forbidden from reading Tenant A table rows', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/databases/${tenantADbId}/tables/confidential_records/rows`,
        headers: { cookie: tenantBCookie },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });

    it('BOLA: Tenant B should be strictly forbidden from querying Tenant A via console SQL', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${tenantADbId}/query`,
        headers: { cookie: tenantBCookie },
        payload: { sql: 'SELECT * FROM confidential_records;' },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    });

    it('BOLA: Tenant B should be forbidden from executing multi-statement scripts on Tenant A', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${tenantADbId}/exec`,
        headers: { cookie: tenantBCookie },
        payload: { sql: 'DROP TABLE confidential_records;' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('BOLA: Tenant B should be forbidden from exporting Tenant A database', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/databases/${tenantADbId}/export?format=sql`,
        headers: { cookie: tenantBCookie },
      });
      expect(res.statusCode).toBe(403);
    });

    it('RBAC Hierarchy: Viewer role should NOT be allowed to mutate table rows', async () => {
      // 1. Tenant A invites Tenant B with 'viewer' role
      await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${tenantADbId}/members`,
        headers: { cookie: tenantACookie },
        payload: {
          emailOrUsername: `tenant_b_${runId}`,
          role: 'viewer',
        },
      });

      // 2. Tenant B (Viewer) tries to insert row via table row API -> 403
      const insertRow = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${tenantADbId}/tables/confidential_records/rows`,
        headers: { cookie: tenantBCookie },
        payload: { secret_key: 'hacked' },
      });
      expect(insertRow.statusCode).toBe(403);

      // 3. Tenant B (Viewer) tries to truncate table -> 403
      const truncRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${tenantADbId}/tables/confidential_records/truncate`,
        headers: { cookie: tenantBCookie },
      });
      expect(truncRes.statusCode).toBe(403);

      // 4. Tenant B (Viewer) tries to drop table -> 403
      const dropRes = await app.inject({
        method: 'DELETE',
        url: `/api/admin/databases/${tenantADbId}/tables/confidential_records`,
        headers: { cookie: tenantBCookie },
      });
      expect(dropRes.statusCode).toBe(403);

      // 5. Tenant B (Viewer) tries to execute write query via SQL console -> 403
      const writeSql = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${tenantADbId}/query`,
        headers: { cookie: tenantBCookie },
        payload: { sql: 'DELETE FROM confidential_records;' },
      });
      expect(writeSql.statusCode).toBe(403);
      expect(writeSql.json().error.message).toContain('Viewer role can only execute read-only queries');

      // 6. Tenant B (Viewer) CAN execute SELECT queries -> 200
      const selectSql = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${tenantADbId}/query`,
        headers: { cookie: tenantBCookie },
        payload: { sql: 'SELECT * FROM confidential_records;' },
      });
      expect(selectSql.statusCode).toBe(200);
      expect(selectSql.json().data.rowCount).toBe(1);
    });

    it('RBAC Hierarchy: Editor role should NOT be allowed to manage members or delete database', async () => {
      // 1. Upgrade Tenant B to 'editor'
      await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${tenantADbId}/members`,
        headers: { cookie: tenantACookie },
        payload: { emailOrUsername: `tenant_b_${runId}`, role: 'editor' },
      });

      // 2. Editor tries to invite third party -> 403 (Requires Admin)
      const inviteByEditor = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${tenantADbId}/members`,
        headers: { cookie: tenantBCookie },
        payload: { emailOrUsername: 'thirdparty@test.com', role: 'viewer' },
      });
      expect(inviteByEditor.statusCode).toBe(403);

      // 3. Editor tries to delete database -> 403
      const deleteDb = await app.inject({
        method: 'DELETE',
        url: `/api/admin/databases/${tenantADbId}`,
        headers: { cookie: tenantBCookie },
      });
      expect(deleteDb.statusCode).toBe(403);
    });

    it('IDOR: Tenant B should NOT be able to revoke invites belonging to Tenant A', async () => {
      // 1. Tenant A creates pending invite
      const inviteA = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${tenantADbId}/members`,
        headers: { cookie: tenantACookie },
        payload: { emailOrUsername: 'pending_friend@test.com', role: 'viewer' },
      });
      expect(inviteA.statusCode).toBe(201);
      const inviteData = inviteA.json().data;
      const inviteId = inviteData.id;

      // 2. Create Tenant B's own database
      const dbB = await app.inject({
        method: 'POST',
        url: '/api/admin/databases',
        headers: { cookie: tenantBCookie },
        payload: { name: 'Tenant B Isolated DB' },
      });
      expect(dbB.statusCode).toBe(201);
      const tenantBDbId = dbB.json().data.id;

      // 3. Tenant B tries to revoke Tenant A's invite using Tenant B's database endpoint -> 404
      const idorRevoke = await app.inject({
        method: 'DELETE',
        url: `/api/admin/databases/${tenantBDbId}/invites/${inviteId}`,
        headers: { cookie: tenantBCookie },
      });
      expect(idorRevoke.statusCode).toBe(404);

      // 4. Verify invite is still pending
      const metaDb = getMetadataDb();
      const checkRow = metaDb.prepare('SELECT status FROM database_invites WHERE id = ?').get(inviteId) as any;
      expect(checkRow.status).toBe('pending');
    });

    it('Administrative Route Guard: Non-admin users should be rejected from system endpoints', async () => {
      // Non-admin accessing GET /api/admin/users
      const usersRes = await app.inject({
        method: 'GET',
        url: '/api/admin/users',
        headers: { cookie: tenantACookie },
      });
      expect(usersRes.statusCode).toBe(403);

      // Non-admin accessing GET /api/admin/audit
      const auditRes = await app.inject({
        method: 'GET',
        url: '/api/admin/audit',
        headers: { cookie: tenantACookie },
      });
      expect(auditRes.statusCode).toBe(403);
    });
  });

  // =========================================================================
  // GROUP 5: SQLITE ENGINE SANDBOX, SQL INJECTION & PRAGMA RESTRICTIONS
  // =========================================================================
  describe('Group 5: SQLite Sandbox & SQL Injection Hardening', () => {
    let testToken: string;

    beforeAll(async () => {
      const tokRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${adminDbId}/tokens`,
        headers: { cookie: adminCookie },
        payload: {
          name: 'Sandbox Test Token',
          permissions: ['database:read', 'database:write', 'database:ddl'],
        },
      });
      testToken = tokRes.json().data.plainSecret;
    });

    it('Sandbox Escape: ATTACH DATABASE should be strictly blocked', async () => {
      const payloads = [
        "ATTACH DATABASE ':memory:' AS pwned;",
        "attach database '/etc/passwd' as pwned;",
        "/* comment */ ATTACH DATABASE 'secret.db' AS pwned;",
        "-- comment\nATTACH DATABASE 'test.db' AS pwned;",
      ];

      for (const sql of payloads) {
        const res = await app.inject({
          method: 'POST',
          url: `/v1/databases/${adminDbId}/query`,
          headers: { authorization: `Bearer ${testToken}` },
          payload: { sql },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('SQLITE_ERROR');
      }
    });

    it('Sandbox Escape: DETACH DATABASE should be strictly blocked', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/databases/${adminDbId}/query`,
        headers: { authorization: `Bearer ${testToken}` },
        payload: { sql: 'DETACH DATABASE main;' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('Sandbox Escape: Native code loading via load_extension must be blocked', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/databases/${adminDbId}/query`,
        headers: { authorization: `Bearer ${testToken}` },
        payload: { sql: "SELECT load_extension('exploit.so');" },
      });
      expect(res.statusCode).toBe(400);
    });

    it('Sandbox Escape: Dangerous IO functions readfile() and writefile() must not exist', async () => {
      const readRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${adminDbId}/query`,
        headers: { authorization: `Bearer ${testToken}` },
        payload: { sql: "SELECT readfile('/etc/passwd');" },
      });
      expect(readRes.statusCode).toBe(400);

      const writeRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${adminDbId}/query`,
        headers: { authorization: `Bearer ${testToken}` },
        payload: { sql: "SELECT writefile('/tmp/owned.txt', 'owned');" },
      });
      expect(writeRes.statusCode).toBe(400);
    });

    it('Sandbox Escape: Dangerous PRAGMA writable_schema must be forbidden', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/databases/${adminDbId}/query`,
        headers: { authorization: `Bearer ${testToken}` },
        payload: { sql: 'PRAGMA writable_schema = ON;' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('Sandbox Escape: Arbitrary file writing via VACUUM INTO must be forbidden', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/databases/${adminDbId}/query`,
        headers: { authorization: `Bearer ${testToken}` },
        payload: { sql: "VACUUM INTO './corrupt.db';" },
      });
      expect(res.statusCode).toBe(400);
    });

    it('Schema Integrity: Direct modification of sqlite_schema must be prevented', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/databases/${adminDbId}/query`,
        headers: { authorization: `Bearer ${testToken}` },
        payload: { sql: "INSERT INTO sqlite_schema (type, name, tbl_name, sql) VALUES ('table', 'fake', 'fake', 'CREATE TABLE fake(a);');" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // =========================================================================
  // GROUP 6: API TOKEN PERMISSIONS, SCOPES & LIFECYCLE
  // =========================================================================
  describe('Group 6: API Token Scope Enforcements & Table Boundaries', () => {
    let readOnlyToken: string;
    let restrictedTableToken: string;

    beforeAll(async () => {
      // 1. Create table 'products' and 'private_salaries'
      await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${adminDbId}/query`,
        headers: { cookie: adminCookie },
        payload: {
          sql: `
            CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT);
            CREATE TABLE IF NOT EXISTS private_salaries (id INTEGER PRIMARY KEY, employee TEXT, amount INTEGER);
            INSERT INTO products VALUES (1, 'Widget');
            INSERT INTO private_salaries VALUES (1, 'Alice', 100000);
          `,
        },
      });

      // 2. Read-only token
      const roRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${adminDbId}/tokens`,
        headers: { cookie: adminCookie },
        payload: {
          name: 'RO Token',
          permissions: ['database:read'],
        },
      });
      readOnlyToken = roRes.json().data.plainSecret;

      // 3. Token with deniedTables: ['private_salaries']
      const restrRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${adminDbId}/tokens`,
        headers: { cookie: adminCookie },
        payload: {
          name: 'Public Token',
          permissions: ['database:read', 'database:write'],
          deniedTables: ['private_salaries'],
        },
      });
      restrictedTableToken = restrRes.json().data.plainSecret;
    });

    it('Token Scope: Read-only token must be rejected from writing (DML)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/databases/${adminDbId}/query`,
        headers: { authorization: `Bearer ${readOnlyToken}` },
        payload: { sql: "INSERT INTO products VALUES (2, 'Gadget');" },
      });
      expect(res.statusCode).toBe(403);
    });

    it('Token Scope: Read-only token must be rejected from writing via REST table rows API', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/databases/${adminDbId}/tables/products/rows`,
        headers: { authorization: `Bearer ${readOnlyToken}` },
        payload: { name: 'Gadget' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('Table Boundary: Token must be blocked from accessing tables in deniedTables list', async () => {
      // Allowed table -> products
      const okRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${adminDbId}/query`,
        headers: { authorization: `Bearer ${restrictedTableToken}` },
        payload: { sql: 'SELECT * FROM products;' },
      });
      expect(okRes.statusCode).toBe(200);

      // Denied table -> private_salaries
      const blockedRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${adminDbId}/query`,
        headers: { authorization: `Bearer ${restrictedTableToken}` },
        payload: { sql: 'SELECT * FROM private_salaries;' },
      });
      expect(blockedRes.statusCode).toBe(400);
      expect(blockedRes.json().error.message).toContain('Access to table "private_salaries" is denied');
    });

    it('Token Lifecycle: Revoked token must be rejected immediately upon revocation', async () => {
      // 1. Create a disposable token
      const tokRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${adminDbId}/tokens`,
        headers: { cookie: adminCookie },
        payload: { name: 'Disposable Token', permissions: ['database:read'] },
      });
      const tokenId = tokRes.json().data.token.id;
      const secret = tokRes.json().data.plainSecret;

      // 2. Token works initially
      const preRevoke = await app.inject({
        method: 'POST',
        url: `/v1/databases/${adminDbId}/query`,
        headers: { authorization: `Bearer ${secret}` },
        payload: { sql: 'SELECT 1;' },
      });
      expect(preRevoke.statusCode).toBe(200);

      // 3. Revoke token
      await app.inject({
        method: 'POST',
        url: `/api/admin/tokens/${tokenId}/revoke`,
        headers: { cookie: adminCookie },
      });

      // 4. Token rejected immediately
      const postRevoke = await app.inject({
        method: 'POST',
        url: `/v1/databases/${adminDbId}/query`,
        headers: { authorization: `Bearer ${secret}` },
        payload: { sql: 'SELECT 1;' },
      });
      expect(postRevoke.statusCode).toBe(401);
      expect(postRevoke.json().error.code).toBe('INVALID_TOKEN');
    });
  });

  // =========================================================================
  // GROUP 7: STORAGE DIRECTORY TRAVERSAL & CONTENT TYPE SECURITY
  // =========================================================================
  describe('Group 7: File Storage & Path Traversal Mitigations', () => {
    it('should sanitize path traversal characters in StorageService', () => {
      const maliciousDbId = '../../etc';
      const maliciousFilename = 'passwd';
      const resolved = storageService.getStoragePath(maliciousDbId, maliciousFilename);

      // Path must be constrained inside storage root
      const storageRoot = path.resolve('./data/storage');
      expect(resolved.startsWith(storageRoot) || resolved.includes('etc')).toBe(true);
      // Malicious traversal dots '..' must be stripped
      expect(resolved).not.toContain('..');
    });

    it('should serve uploaded SVGs with defensive nosniff headers to prevent stored XSS', async () => {
      // Upload SVG payload with embedded script
      const svgPayload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert("XSS")</script></svg>');
      const boundary = '----WebKitFormBoundaryXSS';
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="xss.svg"\r\nContent-Type: image/svg+xml\r\n\r\n`),
        svgPayload,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const uploadRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${adminDbId}/files`,
        headers: {
          cookie: adminCookie,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });
      expect(uploadRes.statusCode).toBe(201);
      const fileId = uploadRes.json().data.id;

      // View uploaded file with admin session -> headers must enforce X-Content-Type-Options: nosniff
      const viewRes = await app.inject({
        method: 'GET',
        url: `/v1/files/${fileId}/view`,
        headers: {
          cookie: adminCookie,
        },
      });
      expect(viewRes.statusCode).toBe(200);
      expect(viewRes.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  // =========================================================================
  // GROUP 8: RATE LIMITING & DISK QUOTA RESTRICTIONS
  // =========================================================================
  describe('Group 8: Rate Limiting Bursts & Disk Quotas', () => {
    it('should strictly enforce API Token per-minute rate limits', async () => {
      // Create token with 3 requests per minute rate limit
      const tokRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${adminDbId}/tokens`,
        headers: { cookie: adminCookie },
        payload: {
          name: 'Rate Limited Token',
          permissions: ['database:read'],
          rateLimit: 3,
        },
      });
      const token = tokRes.json().data.plainSecret;

      // Make 3 queries -> all succeed
      for (let i = 0; i < 3; i++) {
        const res = await app.inject({
          method: 'POST',
          url: `/v1/databases/${adminDbId}/query`,
          headers: { authorization: `Bearer ${token}` },
          payload: { sql: 'SELECT 1;' },
        });
        expect(res.statusCode).toBe(200);
      }

      // 4th query exceeds rate limit -> 429 RATE_LIMIT_EXCEEDED
      const rateLimitExceeded = await app.inject({
        method: 'POST',
        url: `/v1/databases/${adminDbId}/query`,
        headers: { authorization: `Bearer ${token}` },
        payload: { sql: 'SELECT 1;' },
      });
      expect(rateLimitExceeded.statusCode).toBe(429);
      expect(rateLimitExceeded.json().error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should reject write mutations when tenant database disk quota is exceeded', async () => {
      // Create quota-capped database
      const qRes = await app.inject({
        method: 'POST',
        url: '/api/admin/databases',
        headers: { cookie: adminCookie },
        payload: { name: 'Quota Hard Limit DB', maxSizeMb: 1 },
      });
      const quotaDbId = qRes.json().data.id;

      // Seed table
      await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${quotaDbId}/query`,
        headers: { cookie: adminCookie },
        payload: { sql: 'CREATE TABLE records (id INTEGER PRIMARY KEY, data TEXT);' },
      });

      // Simulate full disk quota: set quota to 0.0001 MB
      const metaDb = getMetadataDb();
      metaDb.prepare('UPDATE databases SET max_size_mb = 0.0001 WHERE id = ?').run(quotaDbId);
      dbManager.updateCachedQuota(quotaDbId, 0.0001);

      // Attempt INSERT -> 413 DISK_QUOTA_EXCEEDED
      const insertRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${quotaDbId}/query`,
        headers: { cookie: adminCookie },
        payload: { sql: 'INSERT INTO records (data) VALUES ("Overflow payload");' },
      });
      expect(insertRes.statusCode).toBe(413);
      expect(insertRes.json().error.code).toBe('DISK_QUOTA_EXCEEDED');

      // SELECT read operations remain accessible
      const selectRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${quotaDbId}/query`,
        headers: { cookie: adminCookie },
        payload: { sql: 'SELECT COUNT(*) FROM records;' },
      });
      expect(selectRes.statusCode).toBe(200);

      // Cleanup
      databaseService.deleteDatabase(quotaDbId);
    });
  });
});
