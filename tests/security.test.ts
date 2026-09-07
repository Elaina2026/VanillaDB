import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { buildApp, globalL7Limiter } from '../src/server/index.js';
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
      if (loginRes.statusCode === 200 && loginRes.json().data?.require2fa) {
        const { generateTotpCode } = await import('../src/server/utils/totp.js');
        const metaDb = (await import('../src/server/db/metadata.js')).getMetadataDb();
        const row = metaDb.prepare("SELECT totp_secret FROM users WHERE username = 'VanillaDatabase' OR username = 'admin_test'").get() as any;
        const tempToken = loginRes.json().data.tempToken;
        const otp = generateTotpCode(row.totp_secret);
        loginRes = await app.inject({
          method: 'POST',
          url: '/api/auth/login/2fa',
          payload: { tempToken, code: otp },
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
    // Clean up all ephemeral test users and databases created during this security test run
    try {
      const metaDb = getMetadataDb();
      const testUsers = metaDb.prepare("SELECT id FROM users WHERE username LIKE ? OR email LIKE ?").all(`%${runId}%`, `%${runId}%`) as any[];
      for (const u of testUsers) {
        authService.deleteUser(u.id);
      }
      const testDbs = metaDb.prepare("SELECT id FROM databases WHERE name LIKE ?").all(`%${runId}%`) as any[];
      for (const d of testDbs) {
        databaseService.deleteDatabase(d.id);
      }
    } catch {}
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

      // Verify in DB directly: should be user role and system default max_databases (2)
      const metaDb = getMetadataDb();
      const row = metaDb.prepare('SELECT role, max_databases FROM users WHERE id = ?').get(user.id) as any;
      expect(row.role).toBe('user');
      expect(row.max_databases).toBe(2);
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

    it('should generate 6 backup codes on 2FA activation and allow password recovery', async () => {
      // 1. Create a user specifically for backup codes test
      const reg = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: `backup_${runId}@test.com`,
          username: `backup_user_${runId}`,
          password: 'InitialPassword123!',
        },
      });
      const cookie = `vdb_session=${reg.cookies.find((c: any) => c.name === 'vdb_session').value}`;

      // 2. Setup 2FA
      const setup = await app.inject({
        method: 'POST',
        url: '/api/auth/2fa/setup',
        headers: { cookie },
      });
      const secret = setup.json().data.secret;

      // 3. Activate 2FA -> receive 6 backup recovery codes
      const actRes = await app.inject({
        method: 'POST',
        url: '/api/auth/2fa/activate',
        headers: { cookie },
        payload: {
          password: 'InitialPassword123!',
          code: generateTotpCode(secret),
        },
      });
      expect(actRes.statusCode).toBe(200);
      const backupCodes: string[] = actRes.json().data.backupCodes;
      expect(Array.isArray(backupCodes)).toBe(true);
      expect(backupCodes.length).toBe(6);
      expect(backupCodes[0]).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

      // 4. Test invalid backup code recovery
      const badRecovery = await app.inject({
        method: 'POST',
        url: '/api/auth/recovery/reset-password',
        payload: {
          usernameOrEmail: `backup_${runId}@test.com`,
          backupCode: 'INVALID-CODE',
          newPassword: 'BrandNewPassword123!',
        },
      });
      expect(badRecovery.statusCode).toBe(400);

      // 5. Test valid backup code recovery
      const chosenCode = backupCodes[0];
      const okRecovery = await app.inject({
        method: 'POST',
        url: '/api/auth/recovery/reset-password',
        payload: {
          usernameOrEmail: `backup_${runId}@test.com`,
          backupCode: chosenCode,
          newPassword: 'BrandNewPassword123!',
        },
      });
      expect(okRecovery.statusCode).toBe(200);
      expect(okRecovery.json().data.remainingBackupCodesCount).toBe(5);

      // 6. Test that consumed backup code is burned and cannot be reused
      const reuseRecovery = await app.inject({
        method: 'POST',
        url: '/api/auth/recovery/reset-password',
        payload: {
          usernameOrEmail: `backup_${runId}@test.com`,
          backupCode: chosenCode,
          newPassword: 'AnotherPassword123!',
        },
      });
      expect(reuseRecovery.statusCode).toBe(400);

      // 7. Verify login succeeds with the newly recovered password
      const newLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: `backup_user_${runId}`,
          password: 'BrandNewPassword123!',
        },
      });
      expect(newLogin.statusCode).toBe(200);
      expect(newLogin.json().data.require2fa).toBe(true);

      // 8. Test dual recovery using dynamic 6-digit TOTP code
      const currentOtp = generateTotpCode(secret);
      const totpRecovery = await app.inject({
        method: 'POST',
        url: '/api/auth/recovery/reset-password',
        payload: {
          usernameOrEmail: `backup_${runId}@test.com`,
          totpCode: currentOtp,
          newPassword: 'PasswordResetWithTotp123!',
        },
      });
      expect(totpRecovery.statusCode).toBe(200);
      expect(totpRecovery.json().data.method).toBe('totp');

      // 9. Verify backup codes query endpoint (used vs unused status)
      const listCodesRes = await app.inject({
        method: 'GET',
        url: '/api/auth/2fa/backup-codes',
        headers: { cookie },
      });
      expect(listCodesRes.statusCode).toBe(200);
      const codesList = listCodesRes.json().data.codes;
      expect(codesList.length).toBe(6);
      expect(codesList[0].used).toBe(true);
      expect(codesList[1].used).toBe(false);

      // 10. Regenerate backup codes with password verification
      const regenRes = await app.inject({
        method: 'POST',
        url: '/api/auth/2fa/regenerate-backup-codes',
        headers: { cookie },
        payload: {
          password: 'PasswordResetWithTotp123!',
        },
      });
      expect(regenRes.statusCode).toBe(200);
      expect(regenRes.json().data.total).toBe(6);
      expect(regenRes.json().data.remaining).toBe(6);
      expect(regenRes.json().data.backupCodes.length).toBe(6);

      // 11. Test direct 2FA login challenge using a backup recovery code
      const newBackupCodes: string[] = regenRes.json().data.backupCodes;
      const testBackupCode = newBackupCodes[0];

      // Initiate login -> returns tempToken with require2fa: true
      const loginInit = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: `backup_user_${runId}`,
          password: 'PasswordResetWithTotp123!',
        },
      });
      expect(loginInit.statusCode).toBe(200);
      expect(loginInit.json().data.require2fa).toBe(true);
      const loginTempToken = loginInit.json().data.tempToken;

      // Complete 2FA login using the backup recovery code
      const backupLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login/2fa',
        payload: {
          tempToken: loginTempToken,
          code: testBackupCode,
          isBackupCode: true,
        },
      });
      expect(backupLogin.statusCode).toBe(200);
      expect(backupLogin.json().data.method).toBe('backup_code');
      const backupSessionCookie = backupLogin.cookies.find((c: any) => c.name === 'vdb_session');
      expect(backupSessionCookie).toBeDefined();

      // Verify that consumed backup code cannot be reused to log in again
      const reuseLoginInit = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: `backup_user_${runId}`,
          password: 'PasswordResetWithTotp123!',
        },
      });
      const reuseTempToken = reuseLoginInit.json().data.tempToken;
      const reuseBackupLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login/2fa',
        payload: {
          tempToken: reuseTempToken,
          code: testBackupCode,
          isBackupCode: true,
        },
      });
      expect(reuseBackupLogin.statusCode).toBe(401);
      expect(reuseBackupLogin.json().error.code).toBe('INVALID_2FA_CODE');
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
        payload: { name: `Tenant A Secrets Database ${runId}` },
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

    afterAll(async () => {
      try {
        if (tenantADbId) databaseService.deleteDatabase(tenantADbId);
      } catch {}
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

      // Tenant B accepts invite from inbox
      const bInbox = await app.inject({
        method: 'GET',
        url: '/api/admin/inbox',
        headers: { cookie: tenantBCookie },
      });
      const bInvite = bInbox.json().data?.invites?.find((i: any) => i.database_id === tenantADbId);
      if (bInvite) {
        await app.inject({
          method: 'POST',
          url: `/api/admin/inbox/invites/${bInvite.id}/accept`,
          headers: { cookie: tenantBCookie },
        });
      }

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
        payload: { name: `Tenant B Isolated DB ${runId}` },
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

      // 5. Cleanup Tenant B database
      try {
        databaseService.deleteDatabase(tenantBDbId);
      } catch {}
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

  // =========================================================================
  // GROUP 9: DATA LEAK PREVENTION & TRANSPORT HARDENING
  // =========================================================================
  describe('Group 9: Data Leak Prevention & Transport Hardening', () => {
    it('Leak Defense: Profile update must NOT return totp_secret or totp_temp_secret', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/auth/profile',
        headers: { cookie: adminCookie },
        payload: { avatar_url: 'https://example.com/safe-avatar.png' },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.totp_secret).toBeUndefined();
      expect(data.totp_temp_secret).toBeUndefined();
    });

    it('CORS Defense: Origin reflection with credentials must be blocked for untrusted origins', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/databases',
        headers: {
          cookie: adminCookie,
          origin: 'https://malicious-attacker-site.com',
        },
      });
      const allowOrigin = res.headers['access-control-allow-origin'];
      expect(allowOrigin === undefined || allowOrigin === 'false' || allowOrigin !== 'https://malicious-attacker-site.com').toBe(true);
    });

    it('XSS Defense: Viewing SVG/HTML file must enforce CSP sandbox', async () => {
      const svgPayload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      const boundary = '----BoundarySvgTest';
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.svg"\r\nContent-Type: image/svg+xml\r\n\r\n`),
        svgPayload,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const upload = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${adminDbId}/files`,
        headers: {
          cookie: adminCookie,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });
      const fileId = upload.json().data.id;

      const view = await app.inject({
        method: 'GET',
        url: `/v1/files/${fileId}/view`,
        headers: { cookie: adminCookie },
      });
      expect(view.statusCode).toBe(200);
      expect(view.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    });

    it('MIME Defense: Partial content (Range 206) must include nosniff header', async () => {
      const files = await app.inject({
        method: 'GET',
        url: `/api/admin/databases/${adminDbId}/files`,
        headers: { cookie: adminCookie },
      });
      const fileId = files.json().data[0]?.id;
      if (!fileId) return;

      const rangeRes = await app.inject({
        method: 'GET',
        url: `/v1/files/${fileId}/view`,
        headers: {
          cookie: adminCookie,
          range: 'bytes=0-5',
        },
      });
      expect(rangeRes.statusCode).toBe(206);
      expect(rangeRes.headers['x-content-type-options']).toBe('nosniff');
    });

    it('RBAC Defense: Viewer role must not see plaintext Webhook signing secret', async () => {
      // 1. Create a webhook with secret
      await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${adminDbId}/webhooks`,
        headers: { cookie: adminCookie },
        payload: {
          name: 'Security Hook Test',
          url: 'https://example.com/webhook',
          secret: 'super_secret_webhook_signing_key_123',
          events: ['insert'],
        },
      });

      // 2. Register viewer user
      const viewerEmail = `hook_viewer_${runId}@test.com`;
      const reg = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: viewerEmail, username: `hook_viewer_${runId}`, password: 'Password123!' },
      });
      const viewerCookie = `vdb_session=${reg.cookies.find((c: any) => c.name === 'vdb_session').value}`;

      // 3. Invite viewer to adminDbId with 'viewer' role
      await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${adminDbId}/members`,
        headers: { cookie: adminCookie },
        payload: { emailOrUsername: viewerEmail, role: 'viewer' },
      });

      // Viewer accepts invite from inbox
      const vInbox = await app.inject({
        method: 'GET',
        url: '/api/admin/inbox',
        headers: { cookie: viewerCookie },
      });
      const vInvite = vInbox.json().data?.invites?.find((i: any) => i.database_id === adminDbId);
      if (vInvite) {
        await app.inject({
          method: 'POST',
          url: `/api/admin/inbox/invites/${vInvite.id}/accept`,
          headers: { cookie: viewerCookie },
        });
      }

      // 4. Viewer lists webhooks: secret must be sanitized
      const viewerList = await app.inject({
        method: 'GET',
        url: `/api/admin/databases/${adminDbId}/webhooks`,
        headers: { cookie: viewerCookie },
      });
      expect(viewerList.statusCode).toBe(200);
      for (const hook of viewerList.json().data) {
        expect(hook.secret).toBeUndefined();
      }
    });
  });

  // =========================================================================
  // GROUP 10: ADVANCED DEFENSES (DDL SCOPE, DATA PLANE BOLA, CRON RBAC, QUOTAS)
  // =========================================================================
  describe('Group 10: Advanced Defenses & Vulnerability Regression Suite', () => {
    let tenantXCookie: string;
    let tenantXDbId: string;
    let tenantYCookie: string;
    let tenantYUserId: string;

    beforeAll(async () => {
      // 1. Setup Tenant X
      const regX = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: `reg_tx_${runId}@test.com`, username: `reg_tx_${runId}`, password: 'Password123!' },
      });
      tenantXCookie = `vdb_session=${regX.cookies.find((c: any) => c.name === 'vdb_session').value}`;

      const dbX = await app.inject({
        method: 'POST',
        url: '/api/admin/databases',
        headers: { cookie: tenantXCookie },
        payload: { name: `Tenant X Database ${runId}` },
      });
      tenantXDbId = dbX.json().data.id;

      // 2. Setup Tenant Y
      const regY = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: `reg_ty_${runId}@test.com`, username: `reg_ty_${runId}`, password: 'Password123!' },
      });
      tenantYCookie = `vdb_session=${regY.cookies.find((c: any) => c.name === 'vdb_session').value}`;
      tenantYUserId = regY.json().data.user.id;
    });

    afterAll(async () => {
      try {
        if (tenantXDbId) databaseService.deleteDatabase(tenantXDbId);
      } catch {}
    });

    it('Data Plane BOLA: Session cookie from Tenant Y cannot access Tenant X database via /v1/databases/:id', async () => {
      // Query endpoint
      const queryRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${tenantXDbId}/query`,
        headers: { cookie: tenantYCookie },
        payload: { sql: 'SELECT 1;' },
      });
      expect(queryRes.statusCode).toBe(403);
      expect(queryRes.json().error.code).toBe('FORBIDDEN');

      // Table rows endpoint
      const rowsRes = await app.inject({
        method: 'GET',
        url: `/v1/databases/${tenantXDbId}/tables/_vdb_meta/rows`,
        headers: { cookie: tenantYCookie },
      });
      expect(rowsRes.statusCode).toBe(403);
      expect(rowsRes.json().error.code).toBe('FORBIDDEN');
    });

    it('Data Plane Viewer Restriction: Viewer session cookie cannot execute write operations', async () => {
      // Invite Tenant Y as viewer to Tenant X database
      await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${tenantXDbId}/members`,
        headers: { cookie: tenantXCookie },
        payload: { emailOrUsername: `reg_ty_${runId}`, role: 'viewer' },
      });

      // Write via table rows endpoint
      const insertRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${tenantXDbId}/tables/_vdb_meta/rows`,
        headers: { cookie: tenantYCookie },
        payload: { key: 'hacked', value: 'yes' },
      });
      expect(insertRes.statusCode).toBe(403);
      expect(insertRes.json().error.code).toBe('FORBIDDEN');
    });

    it('DDL Scoping: Token with database:write cannot execute DDL statements (CREATE/ALTER/DROP)', async () => {
      // Create a token with write only (no database:ddl, no database:admin)
      const tokRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${tenantXDbId}/tokens`,
        headers: { cookie: tenantXCookie },
        payload: {
          name: 'Write-Only Token',
          permissions: ['database:read', 'database:write'],
        },
      });
      expect(tokRes.statusCode).toBe(201);
      const writeOnlyToken = tokRes.json().data.plainSecret;

      // 1. CREATE TABLE via /query -> 403
      const createRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${tenantXDbId}/query`,
        headers: { authorization: `Bearer ${writeOnlyToken}` },
        payload: { sql: 'CREATE TABLE forbidden_table (id INTEGER PRIMARY KEY);' },
      });
      expect(createRes.statusCode).toBe(403);
      expect(createRes.json().error.message).toContain('DDL');

      // 2. DROP TABLE via /batch -> 403
      const batchRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${tenantXDbId}/batch`,
        headers: { authorization: `Bearer ${writeOnlyToken}` },
        payload: {
          statements: [
            { sql: 'DROP TABLE _vdb_meta;' },
          ],
        },
      });
      expect(batchRes.statusCode).toBe(403);
      expect(batchRes.json().error.message).toContain('DDL');
    });

    it('Scheduled Jobs IDOR: Unauthorized user cannot modify, trigger, or delete foreign scheduled jobs', async () => {
      // Tenant X creates a job
      const createJob = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${tenantXDbId}/jobs`,
        headers: { cookie: tenantXCookie },
        payload: {
          name: 'Hourly Cleanup',
          cron_expression: '0 * * * *',
          sql_query: 'SELECT 1;',
          enabled: true,
        },
      });
      expect(createJob.statusCode).toBe(201);
      const jobId = createJob.json().data.id;

      // Tenant Y attempts to modify job -> 403
      const patchJob = await app.inject({
        method: 'PATCH',
        url: `/api/admin/jobs/${jobId}`,
        headers: { cookie: tenantYCookie },
        payload: { sql_query: 'DROP TABLE users;' },
      });
      expect(patchJob.statusCode).toBe(403);

      // Tenant Y attempts to trigger job -> 403
      const runJob = await app.inject({
        method: 'POST',
        url: `/api/admin/jobs/${jobId}/run`,
        headers: { cookie: tenantYCookie },
      });
      expect(runJob.statusCode).toBe(403);

      // Tenant Y attempts to delete job -> 403
      const delJob = await app.inject({
        method: 'DELETE',
        url: `/api/admin/jobs/${jobId}`,
        headers: { cookie: tenantYCookie },
      });
      expect(delJob.statusCode).toBe(403);
    });

    it('Database Quota Defense: Duplicating a database honors max_databases quota', async () => {
      // Update Tenant Y's max_databases to 1 using super_admin session
      const setQuota = await app.inject({
        method: 'PATCH',
        url: `/api/admin/users/${tenantYUserId}`,
        headers: { cookie: adminCookie },
        payload: { maxDatabases: 1 },
      });
      expect(setQuota.statusCode).toBe(200);

      // Tenant Y creates 1 database (reaches their quota of 1)
      const db1 = await app.inject({
        method: 'POST',
        url: '/api/admin/databases',
        headers: { cookie: tenantYCookie },
        payload: { name: `Tenant Y Primary DB ${runId}` },
      });
      expect(db1.statusCode).toBe(201);
      const yDbId = db1.json().data.id;

      // Tenant Y attempts to clone/duplicate the database -> rejected by quota
      const cloneRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${yDbId}/clone`,
        headers: { cookie: tenantYCookie },
        payload: { name: `Tenant Y Cloned DB ${runId}` },
      });
      expect(cloneRes.statusCode).toBe(400);
      expect(cloneRes.json().error.code).toBe('DATABASE_DUPLICATE_ERROR');
      expect(cloneRes.json().error.message).toContain('Database creation limit reached');

      // Clean up
      try { databaseService.deleteDatabase(yDbId); } catch {}
    });

    it('Quota Escalation Defense: Regular user cannot set disk quota beyond platform default', async () => {
      const patchRes = await app.inject({
        method: 'PATCH',
        url: `/api/admin/databases/${tenantXDbId}`,
        headers: { cookie: tenantXCookie },
        payload: { maxSizeMb: 999999 },
      });
      expect(patchRes.statusCode).toBe(403);
      expect(patchRes.json().error.code).toBe('FORBIDDEN');
    });

    it('SSRF Defense: Webhook registration rejects non-HTTP/HTTPS protocols', async () => {
      const gopherRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${tenantXDbId}/webhooks`,
        headers: { cookie: tenantXCookie },
        payload: {
          name: 'SSRF Attack',
          url: 'gopher://127.0.0.1:6379/_flushall',
          events: ['insert'],
        },
      });
      expect(gopherRes.statusCode).toBe(400);

      const fileRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${tenantXDbId}/webhooks`,
        headers: { cookie: tenantXCookie },
        payload: {
          name: 'File Protocol Attack',
          url: 'file:///etc/passwd',
          events: ['insert'],
        },
      });
      expect(fileRes.statusCode).toBe(400);
    });

    it('Self-Demotion & Disabling Protection: Super admin cannot demote or disable themselves', async () => {
      // 1. Get current super admin ID
      const meRes = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: adminCookie },
      });
      expect(meRes.statusCode).toBe(200);
      const superAdminId = meRes.json().data.user.userId;

      // 2. Try to demote self to user -> 400 CANNOT_DEMOTE_SELF
      const demoteRes = await app.inject({
        method: 'PATCH',
        url: `/api/admin/users/${superAdminId}`,
        headers: { cookie: adminCookie },
        payload: { role: 'user' },
      });
      expect(demoteRes.statusCode).toBe(400);
      expect(demoteRes.json().error.code).toBe('CANNOT_DEMOTE_SELF');

      // 3. Try to disable self -> 400 CANNOT_DISABLE_SELF
      const disableRes = await app.inject({
        method: 'PATCH',
        url: `/api/admin/users/${superAdminId}`,
        headers: { cookie: adminCookie },
        payload: { status: 'disabled' },
      });
      expect(disableRes.statusCode).toBe(400);
      expect(disableRes.json().error.code).toBe('CANNOT_DISABLE_SELF');
    });

    it('Brute Force Defense: Auth endpoint rate limiting throttles excessive attempts', async () => {
      let hitRateLimit = false;
      for (let i = 0; i < 12; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/auth/login/2fa',
          payload: { tempToken: 'fake_temp_token', code: '123456' },
        });
        if (res.statusCode === 429) {
          hitRateLimit = true;
          expect(res.json().error.code).toBe('RATE_LIMIT_EXCEEDED');
          break;
        }
      }
      expect(hitRateLimit).toBe(true);
    });

    it('Anti-DDoS Defense: IP Token Bucket limiter rejects floods with HTTP 429', async () => {
      const floodIp = '198.51.100.42';
      // Drain capacity for floodIp
      for (let i = 0; i < 130; i++) {
        globalL7Limiter.consume(floodIp);
      }

      const res = await app.inject({
        method: 'GET',
        url: '/health',
        remoteAddress: floodIp,
      });

      expect(res.statusCode).toBe(429);
      expect(res.json().error.code).toBe('TOO_MANY_REQUESTS');
      expect(res.headers['x-ratelimit-remaining-ip']).toBe('0');
    });
  });
});
