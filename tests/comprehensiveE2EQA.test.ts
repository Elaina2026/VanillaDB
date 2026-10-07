import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { buildApp } from '../src/server/index.js';
import { getMetadataDb } from '../src/server/db/metadata.js';
import { dbManager } from '../src/server/db/manager.js';
import { config } from '../src/server/config/index.js';
import { databaseService } from '../src/server/services/database.js';
import { storageService } from '../src/server/services/storage.js';
import { tokenService } from '../src/server/services/tokens.js';
import { backupService } from '../src/server/services/backup.js';
import { authService } from '../src/server/services/auth.js';

describe('Comprehensive E2E QA Test Suite (Sections A-L)', () => {
  let app: any;
  let serverPort: number;
  let baseUrl: string;
  let adminCookie: string;
  let adminUserId: string;
  let primaryDbId: string;
  let secondaryDbId: string;
  let primaryToken: string;
  let secondaryToken: string;
  const runId = Date.now();
  const createdDbIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    serverPort = typeof address === 'object' && address ? address.port : 3000;
    baseUrl = `http://127.0.0.1:${serverPort}`;

    // Admin authentication
    const setupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: `qa_master_${runId}`,
        password: 'MasterPassword123!',
        confirmPassword: 'MasterPassword123!',
        email: `qa_master_${runId}@example.com`,
      },
    });

    if (setupRes.statusCode === 201) {
      const cookie = setupRes.cookies.find((c: any) => c.name === 'vdb_session');
      adminCookie = `vdb_session=${cookie.value}`;
      adminUserId = setupRes.json().data.user.id;
    } else {
      let loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: process.env.VDB_ADMIN_USERNAME || 'VanillaDatabase',
          password: process.env.VDB_ADMIN_PASSWORD || '123456',
        },
      });

      if (loginRes.statusCode !== 200) {
        loginRes = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: {
            username: 'admin_test',
            password: 'SuperSecretPassword123!',
          },
        });
      }

      const cookie = loginRes.cookies.find((c: any) => c.name === 'vdb_session');
      adminCookie = `vdb_session=${cookie.value}`;
      const meRes = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: adminCookie },
      });
      adminUserId = meRes.json().data.user.userId;
    }

    // Provision Primary Database
    const db1 = databaseService.createDatabase(`QA Primary ${runId}`, 'Main QA Testing DB', adminUserId);
    primaryDbId = db1.id;
    createdDbIds.push(primaryDbId);

    // Provision Secondary Database (for cross-tenant IDOR checks)
    const db2 = databaseService.createDatabase(`QA Secondary ${runId}`, 'Tenant B Database', adminUserId);
    secondaryDbId = db2.id;
    createdDbIds.push(secondaryDbId);

    // Create Tokens
    const tok1 = await tokenService.createToken({
      databaseId: primaryDbId,
      name: 'Primary RW Token',
      permissions: ['database:read', 'database:write', 'database:ddl'],
      allowedTables: null,
      deniedTables: null,
    });
    primaryToken = tok1.plainSecret;

    const tok2 = await tokenService.createToken({
      databaseId: secondaryDbId,
      name: 'Secondary RW Token',
      permissions: ['database:read', 'database:write'],
    });
    secondaryToken = tok2.plainSecret;
  }, 35000);

  afterAll(async () => {
    for (const dbId of createdDbIds) {
      try { databaseService.deleteDatabase(dbId); } catch {}
      try { storageService.deleteDatabaseFiles(dbId); } catch {}
    }
    for (const uid of createdUserIds) {
      try { authService.deleteUser(uid); } catch {}
    }
    dbManager.closeAll();
    if (app) {
      await app.close();
    }
  }, 35000);

  // Helper for multipart payloads
  function createMultipart(filename: string, content: string | Buffer, metadata?: string) {
    const boundary = `----WebKitFormBoundaryQA${Date.now()}`;
    let body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n${content}\r\n`;
    if (metadata !== undefined) {
      body += `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${metadata}\r\n`;
    }
    body += `--${boundary}--\r\n`;
    return {
      contentType: `multipart/form-data; boundary=${boundary}`,
      payload: body,
    };
  }

  // ==========================================
  // SECTION A: Auth, Session & Security
  // ==========================================
  describe('[A] Authentication & Session Management', () => {
    it('should reject setup once already initialized (HTTP 400)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: {
          username: 'another_admin',
          password: 'Password123!',
          confirmPassword: 'Password123!',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().success).toBe(false);
      expect(res.json().error.code).toBe('ALREADY_INITIALIZED');
    });

    it('should reject login with wrong password (HTTP 401)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: `qa_master_${runId}`,
          password: 'WrongPassword999!',
        },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().success).toBe(false);
      expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should support user self-registration and reject duplicates', async () => {
      const testEmail = `user_register_${runId}@test.com`;
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: testEmail,
          password: 'UserPass123!',
          username: `user_${runId}`,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.user.email).toBe(testEmail);
      createdUserIds.push(json.data.user.id);

      // Duplicate registration must fail
      const dupRes = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: testEmail,
          password: 'UserPass123!',
        },
      });
      expect(dupRes.statusCode).toBe(400);
      expect(dupRes.json().success).toBe(false);
    });

    it('should revoke previous session cookies upon password change (VDB-SEC-01)', async () => {
      // 1. Create a dedicated user for password change test
      const pwdUser = await authService.createUser({
        username: `pwd_user_${runId}`,
        password: 'InitialPassword123!',
        role: 'user',
      });
      createdUserIds.push(pwdUser.id);

      // 2. Login to get session cookie
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: `pwd_user_${runId}`,
          password: 'InitialPassword123!',
        },
      });
      expect(loginRes.statusCode).toBe(200);
      const userCookie = `vdb_session=${loginRes.cookies.find((c: any) => c.name === 'vdb_session').value}`;

      // 3. Verify session works
      const meBefore = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: userCookie },
      });
      expect(meBefore.statusCode).toBe(200);

      // 4. Change password using the session
      const changeRes = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: { cookie: userCookie },
        payload: {
          currentPassword: 'InitialPassword123!',
          newPassword: 'NewPassword999!',
        },
      });
      expect(changeRes.statusCode).toBe(200);

      // 5. Verify OLD session cookie is now IMMEDIATELY REVOKED (HTTP 401)
      const meAfter = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: userCookie },
      });
      expect(meAfter.statusCode).toBe(401);

      // 6. Login with new password succeeds
      const newLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: `pwd_user_${runId}`,
          password: 'NewPassword999!',
        },
      });
      expect(newLogin.statusCode).toBe(200);
    });

    it('should support WebAuthn service registration options and login options', async () => {
      const regOpts = await app.inject({
        method: 'POST',
        url: '/api/auth/webauthn/register-options',
        headers: { cookie: adminCookie },
      });
      expect(regOpts.statusCode).toBe(200);
      expect(regOpts.json().success).toBe(true);
      expect(regOpts.json().data.challenge).toBeDefined();

      const loginOpts = await app.inject({
        method: 'POST',
        url: '/api/auth/webauthn/login-options',
        payload: { username: `qa_master_${runId}` },
      });
      expect(loginOpts.statusCode).toBe(200);
      expect(loginOpts.json().success).toBe(true);
      expect(loginOpts.json().data.challenge).toBeDefined();
    });

    it('should enforce API token scopes and handle revocation cleanly', async () => {
      const tempToken = await tokenService.createToken({
        databaseId: primaryDbId,
        name: 'Ephemeral Token',
        permissions: ['database:read'],
      });

      // Valid read
      const readRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${primaryDbId}/query`,
        headers: { authorization: `Bearer ${tempToken.plainSecret}` },
        payload: { sql: 'SELECT 1 as test;' },
      });
      expect(readRes.statusCode).toBe(200);

      // Disallowed write with read-only token -> 403
      const writeRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${primaryDbId}/query`,
        headers: { authorization: `Bearer ${tempToken.plainSecret}` },
        payload: { sql: 'CREATE TABLE forbidden_write (id INT);' },
      });
      expect(writeRes.statusCode).toBe(403);
      expect(writeRes.json().error.code).toBe('FORBIDDEN');

      // Revoke token
      tokenService.revokeToken(tempToken.tokenRecord.id);

      // Query with revoked token -> 401
      const revokedRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${primaryDbId}/query`,
        headers: { authorization: `Bearer ${tempToken.plainSecret}` },
        payload: { sql: 'SELECT 1 as test;' },
      });
      expect(revokedRes.statusCode).toBe(401);
    });
  });

  // ==========================================
  // SECTION B: Users, Members & RBAC
  // ==========================================
  describe('[B] Users, Members & RBAC Permissions', () => {
    let regularUserCookie: string;
    let regularUserId: string;

    beforeAll(async () => {
      const regUser = await authService.createUser({
        username: `normal_user_${runId}`,
        password: 'UserPass123!',
        role: 'user',
      });
      regularUserId = regUser.id;
      createdUserIds.push(regularUserId);

      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: `normal_user_${runId}`, password: 'UserPass123!' },
      });
      regularUserCookie = `vdb_session=${login.cookies.find((c: any) => c.name === 'vdb_session').value}`;
    });

    it('should block privilege escalation when standard user accesses admin endpoints (HTTP 403)', async () => {
      const endpoints = [
        { method: 'GET', url: '/api/admin/users' },
        { method: 'GET', url: '/api/admin/roles' },
        { method: 'GET', url: '/api/system/metrics' },
        { method: 'POST', url: '/api/admin/roles', payload: { name: 'SuperHacker' } },
      ];

      for (const ep of endpoints) {
        const res = await app.inject({
          method: ep.method as any,
          url: ep.url,
          headers: { cookie: regularUserCookie },
          payload: (ep as any).payload,
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().success).toBe(false);
      }
    });

    it('should enforce role hierarchy: viewer vs editor vs admin permissions on tenant DB', async () => {
      // 1. Invite regular user as viewer on primaryDb
      const addRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${primaryDbId}/members`,
        headers: { cookie: adminCookie },
        payload: { emailOrUsername: `normal_user_${runId}`, role: 'viewer' },
      });
      expect(addRes.statusCode).toBe(201);
      const inviteData = addRes.json().data;

      // Accept invite as regular user
      const acceptRes = await app.inject({
        method: 'POST',
        url: `/api/admin/inbox/invites/${inviteData.id}/accept`,
        headers: { cookie: regularUserCookie },
      });
      expect(acceptRes.statusCode).toBe(200);

      // Create a test table first using admin
      await app.inject({
        method: 'POST',
        url: `/v1/databases/${primaryDbId}/query`,
        headers: { authorization: `Bearer ${primaryToken}` },
        payload: { sql: 'CREATE TABLE IF NOT EXISTS member_test (id INTEGER PRIMARY KEY, note TEXT);' },
      });

      // 2. Viewer can SELECT
      const viewerRead = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${primaryDbId}/query`,
        headers: { cookie: regularUserCookie },
        payload: { sql: 'SELECT * FROM member_test;' },
      });
      expect(viewerRead.statusCode).toBe(200);

      // 3. Viewer CANNOT INSERT (HTTP 403)
      const viewerWrite = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${primaryDbId}/query`,
        headers: { cookie: regularUserCookie },
        payload: { sql: "INSERT INTO member_test (note) VALUES ('illegal');" },
      });
      expect(viewerWrite.statusCode).toBe(403);

      // 4. Upgrade user to editor (inviting existing member updates their role directly)
      const updateRoleRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${primaryDbId}/members`,
        headers: { cookie: adminCookie },
        payload: { emailOrUsername: `normal_user_${runId}`, role: 'editor' },
      });
      expect(updateRoleRes.statusCode).toBe(201);
      expect(updateRoleRes.json().type).toBe('member');

      // 5. Editor CAN INSERT
      const editorWrite = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${primaryDbId}/query`,
        headers: { cookie: regularUserCookie },
        payload: { sql: "INSERT INTO member_test (note) VALUES ('editor_ok');" },
      });
      expect(editorWrite.statusCode).toBe(200);

      // 6. Editor CANNOT execute DDL (HTTP 403)
      const editorDdl = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${primaryDbId}/query`,
        headers: { cookie: regularUserCookie },
        payload: { sql: 'DROP TABLE member_test;' },
      });
      expect(editorDdl.statusCode).toBe(403);
    });

    it('should clean up user references without breaking foreign keys when user is deleted', async () => {
      const delUser = await authService.createUser({
        username: `del_user_${runId}`,
        password: 'DelPass123!',
        role: 'user',
      });
      const dbOwned = databaseService.createDatabase(`Owned DB ${runId}`, null, delUser.id);
      createdDbIds.push(dbOwned.id);

      // Delete the user
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${delUser.id}`,
        headers: { cookie: adminCookie },
      });
      expect(delRes.statusCode).toBe(200);

      // Database owner must now be NULL, not broken FK
      const metaDb = getMetadataDb();
      const updatedDb = metaDb.prepare('SELECT owner_id FROM databases WHERE id = ?').get(dbOwned.id) as any;
      expect(updatedDb.owner_id).toBeNull();
    });
  });

  // ==========================================
  // SECTION C: Database Management
  // ==========================================
  describe('[C] Database Lifecycle & Path Security', () => {
    it('should handle duplicate names by assigning unique slugs', async () => {
      const name = `Duplicate Name ${runId}`;
      const d1 = databaseService.createDatabase(name);
      const d2 = databaseService.createDatabase(name);
      createdDbIds.push(d1.id, d2.id);

      expect(d1.slug).not.toBe(d2.slug);
      expect(d2.slug.startsWith(d1.slug)).toBe(true);
    });

    it('should block path traversal attempts in database ID', async () => {
      const invalidIds = ['../../etc/passwd', '..%2F..%2Fvanilladb', 'invalid!@#$'];
      for (const inv of invalidIds) {
        const res = await app.inject({
          method: 'GET',
          url: `/api/admin/databases/${encodeURIComponent(inv)}`,
          headers: { cookie: adminCookie },
        });
        expect([400, 404]).toContain(res.statusCode);
      }
    });

    it('should handle concurrent database creations cleanly without race conditions', async () => {
      const count = 5;
      const tasks = Array.from({ length: count }, (_, i) => {
        return app.inject({
          method: 'POST',
          url: '/api/admin/databases',
          headers: { cookie: adminCookie },
          payload: { name: `Concurrent DB ${runId} - ${i}` },
        });
      });

      const results = await Promise.all(tasks);
      for (const r of results) {
        expect(r.statusCode).toBe(201);
        const data = r.json().data;
        expect(data.id).toBeDefined();
        createdDbIds.push(data.id);
      }
    });

    it('should delete database files on disk and return HTTP 404 on subsequent accesses', async () => {
      const tempDb = databaseService.createDatabase(`To Delete ${runId}`);
      const filename = tempDb.filename;
      const filePath = path.resolve(config.databasesDir, filename);
      expect(fs.existsSync(filePath)).toBe(true);

      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/admin/databases/${tempDb.id}`,
        headers: { cookie: adminCookie },
      });
      expect(delRes.statusCode).toBe(200);
      expect(fs.existsSync(filePath)).toBe(false);

      const getRes = await app.inject({
        method: 'GET',
        url: `/api/admin/databases/${tempDb.id}`,
        headers: { cookie: adminCookie },
      });
      expect(getRes.statusCode).toBe(404);
      expect(getRes.json().success).toBe(false);
    });
  });

  // ==========================================
  // SECTION D: Data API & SQL Safety
  // ==========================================
  describe('[D] Data API, Query Execution & SQL Safety Sandboxing', () => {
    it('should execute DDL, INSERT with Unicode Vietnamese & NULL, and SELECT with pagination', async () => {
      // 1. DDL
      const ddlRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${primaryDbId}/query`,
        headers: { authorization: `Bearer ${primaryToken}` },
        payload: {
          sql: `
            CREATE TABLE IF NOT EXISTS menu_items (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              price REAL,
              note TEXT,
              created_at INTEGER
            );
          `,
        },
      });
      expect(ddlRes.statusCode).toBe(200);

      // 2. INSERT rows (Unicode Vietnamese, NULL, empty string)
      const insertSql = `
        INSERT INTO menu_items (name, price, note, created_at)
        VALUES (?, ?, ?, ?);
      `;
      const rowsToInsert = [
        ['Cà phê sữa đá Sài Gòn ☕', 25000.5, 'Ít đường, nhiều sữa', Date.now()],
        ['Bánh mì chả lụa pate', 30000.0, null, Date.now()],
        ['Trà đào cam sả', 35000.0, '', Date.now()],
      ];

      for (const row of rowsToInsert) {
        const ins = await app.inject({
          method: 'POST',
          url: `/v1/databases/${primaryDbId}/query`,
          headers: { authorization: `Bearer ${primaryToken}` },
          payload: { sql: insertSql, params: row },
        });
        expect(ins.statusCode).toBe(200);
      }

      // 3. SELECT with pagination & sorting
      const selRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${primaryDbId}/query`,
        headers: { authorization: `Bearer ${primaryToken}` },
        payload: {
          sql: 'SELECT id, name, price, note FROM menu_items ORDER BY price DESC LIMIT ? OFFSET ?;',
          params: [2, 0],
        },
      });
      expect(selRes.statusCode).toBe(200);
      const data = selRes.json().data;
      expect(data.rowCount).toBe(2);
      expect(data.rows[0].price).toBe(35000.0);
      expect(data.rows[1].price).toBe(30000.0);
    });

    it('should strictly block dangerous SQL injections (ATTACH, load_extension, writable_schema)', async () => {
      const maliciousSqls = [
        'ATTACH DATABASE ":memory:" AS evil_db;',
        'DETACH DATABASE evil_db;',
        "SELECT load_extension('malicious.dll');",
        'PRAGMA writable_schema = ON;',
        'PRAGMA foreign_keys = OFF;',
        'PRAGMA "foreign_keys" = OFF;',
        'PRAGMA [foreign_keys] = OFF;',
        'PRAGMA main.foreign_keys = OFF;',
        '/* Comment Injection */ ATTACH DATABASE "foo.sqlite" AS foo;',
      ];

      for (const sql of maliciousSqls) {
        const res = await app.inject({
          method: 'POST',
          url: `/v1/databases/${primaryDbId}/query`,
          headers: { authorization: `Bearer ${primaryToken}` },
          payload: { sql },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().success).toBe(false);
      }
    });

    it('should support atomic transaction rollback on batch failure', async () => {
      const batchRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${primaryDbId}/batch`,
        headers: { authorization: `Bearer ${primaryToken}` },
        payload: {
          transaction: true,
          statements: [
            { sql: "INSERT INTO menu_items (name, price) VALUES ('Valid 1', 100);" },
            { sql: "INSERT INTO non_existent_table (x) VALUES ('fails');" },
          ],
        },
      });

      expect(batchRes.statusCode).toBe(400);

      // Verify Valid 1 was rolled back
      const checkRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${primaryDbId}/query`,
        headers: { authorization: `Bearer ${primaryToken}` },
        payload: { sql: "SELECT * FROM menu_items WHERE name = 'Valid 1';" },
      });
      expect(checkRes.json().data.rowCount).toBe(0);
    });

    it('should translate MySQL DDL dumps to SQLite cleanly', async () => {
      const mysqlDdl = `
        CREATE TABLE \`users_mysql\` (
          \`id\` int(11) NOT NULL AUTO_INCREMENT,
          \`username\` varchar(255) NOT NULL,
          \`score\` decimal(10,2) DEFAULT NULL,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `;

      const importRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${primaryDbId}/import`,
        headers: {
          cookie: adminCookie,
          'content-type': 'multipart/form-data; boundary=----WebKitFormBoundaryMySQLTest',
        },
        payload: '------WebKitFormBoundaryMySQLTest\r\nContent-Disposition: form-data; name="file"; filename="mysql_dump.sql"\r\nContent-Type: text/plain\r\n\r\n' + mysqlDdl + '\r\n------WebKitFormBoundaryMySQLTest--\r\n',
      });

      expect(importRes.statusCode).toBe(200);

      // Verify table was created in SQLite
      const verifyRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${primaryDbId}/query`,
        headers: { authorization: `Bearer ${primaryToken}` },
        payload: { sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='users_mysql';" },
      });
      expect(verifyRes.json().data.rowCount).toBe(1);
    });
  });

  // ==========================================
  // SECTION E: Storage & Files
  // ==========================================
  describe('[E] File Storage, Envelope Encryption & Range Streaming', () => {
    let uploadedFileId: string;
    const fileBytes = Buffer.from('VANILLADB_RANGE_STREAM_TEST_PAYLOAD_1234567890');

    it('should upload stream file with AES-256-GCM encryption and normalize metadata', async () => {
      const { contentType, payload } = createMultipart('stream_test.dat', fileBytes, '   ');

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${primaryDbId}/files`,
        headers: {
          cookie: adminCookie,
          'content-type': contentType,
        },
        payload,
      });

      expect(res.statusCode).toBe(201);
      const data = res.json().data;
      expect(data.database_id).toBe(primaryDbId);
      expect(data.size_bytes).toBe(fileBytes.length);
      expect(data.metadata).toBeNull();
      uploadedFileId = data.id;

      // Verify file is encrypted on disk
      const metaDb = getMetadataDb();
      const row = metaDb.prepare('SELECT filename FROM files WHERE id = ?').get(uploadedFileId) as any;
      const filePath = storageService.getStoragePath(primaryDbId, row.filename);
      expect(fs.existsSync(filePath)).toBe(true);
      const onDiskBytes = fs.readFileSync(filePath);
      expect(onDiskBytes.toString('utf-8')).not.toContain('VANILLADB_RANGE_STREAM');
    });

    it('should support HTTP 206 Partial Content Range streaming over real socket', async () => {
      const streamUrl = `${baseUrl}/v1/databases/${primaryDbId}/storage/${uploadedFileId}`;

      // Request bytes 0 to 9
      const rangeRes = await fetch(streamUrl, {
        headers: {
          authorization: `Bearer ${primaryToken}`,
          range: 'bytes=0-9',
        },
      });

      expect(rangeRes.status).toBe(206);
      expect(rangeRes.headers.get('content-range')).toBe(`bytes 0-9/${fileBytes.length}`);
      const sliceBuf = Buffer.from(await rangeRes.arrayBuffer());
      expect(sliceBuf.toString('utf-8')).toBe('VANILLADB_');
    });

    it('should return HTTP 416 on unsatisfiable range request', async () => {
      const streamUrl = `${baseUrl}/v1/databases/${primaryDbId}/storage/${uploadedFileId}`;

      const res = await fetch(streamUrl, {
        headers: {
          authorization: `Bearer ${primaryToken}`,
          range: 'bytes=99999-100000',
        },
      });

      expect(res.status).toBe(416);
    });

    it('should return HTTP 404 with clean envelope when uploading to non-existent database', async () => {
      const nonExistentId = 'db_not_exist_404_check';
      const { contentType, payload } = createMultipart('lost.bin', 'DATA');

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${nonExistentId}/files`,
        headers: {
          cookie: adminCookie,
          'content-type': contentType,
        },
        payload,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().success).toBe(false);
      expect(res.json().error.code).toBe('DATABASE_NOT_FOUND');
    });

    it('should delete file and remove encrypted payload from disk', async () => {
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/admin/files/${uploadedFileId}`,
        headers: { cookie: adminCookie },
      });
      expect(delRes.statusCode).toBe(200);

      // Verify file is gone
      const fileRecord = storageService.getFile(uploadedFileId);
      expect(fileRecord).toBeNull();
    });
  });

  // ==========================================
  // SECTION F: Backup & Restore
  // ==========================================
  describe('[F] Backup, Checksum Verification & Restore Safety', () => {
    let backupId: string;
    let backupPath: string;

    it('should create manual backup with SHA-256 checksum', async () => {
      const bkpRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${primaryDbId}/backups`,
        headers: { cookie: adminCookie },
      });

      expect(bkpRes.statusCode).toBe(201);
      const data = bkpRes.json().data;
      backupId = data.id;
      expect(data.checksum).toBeDefined();

      const bkp = backupService.getBackup(backupId);
      backupPath = path.resolve(config.backupsDir, primaryDbId, bkp!.filename);
      expect(fs.existsSync(backupPath)).toBe(true);
    });

    it('should abort restore and protect database if backup file has been corrupted', async () => {
      // Intentionally tamper with backup bytes
      const original = fs.readFileSync(backupPath);
      const tampered = Buffer.from(original);
      tampered[tampered.length - 1] ^= 0xff;
      fs.writeFileSync(backupPath, tampered);

      const restoreRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${primaryDbId}/backups/${backupId}/restore`,
        headers: { cookie: adminCookie },
      });

      expect(restoreRes.statusCode).toBe(400);
      expect(restoreRes.json().error.message).toContain('Checksum mismatch');

      // Restore original bytes for subsequent tests
      fs.writeFileSync(backupPath, original);
    });

    it('should restore valid backup cleanly and retain data integrity', async () => {
      const restoreRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${primaryDbId}/backups/${backupId}/restore`,
        headers: { cookie: adminCookie },
      });
      expect(restoreRes.statusCode).toBe(200);

      // Verify database is functional
      const checkRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${primaryDbId}/query`,
        headers: { authorization: `Bearer ${primaryToken}` },
        payload: { sql: 'SELECT COUNT(*) as cnt FROM menu_items;' },
      });
      expect(checkRes.statusCode).toBe(200);
      expect(checkRes.json().data.rows[0].cnt).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // SECTION G: Realtime & Webhook SSRF Prevention
  // ==========================================
  describe('[G] Realtime Streaming & SSRF Defenses', () => {
    it('should strictly reject private and loopback webhook URLs (SSRF Protection)', async () => {
      const forbiddenUrls = [
        'http://127.0.0.1:8080/hook',
        'http://localhost:3000/hook',
        'http://169.254.169.254/latest/meta-data',
        'http://192.168.1.100:5000/hook',
        'http://10.0.0.1/hook',
        'http://0.0.0.0/hook',
      ];

      for (const url of forbiddenUrls) {
        const res = await app.inject({
          method: 'POST',
          url: `/api/admin/databases/${primaryDbId}/webhooks`,
          headers: { cookie: adminCookie },
          payload: {
            name: 'SSRF Test Hook',
            url,
            events: ['insert', 'update'],
          },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().success).toBe(false);
        expect(res.json().error.message).toMatch(/Private network|forbidden/i);
      }
    });

    it('should accept public HTTPS webhook endpoints', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${primaryDbId}/webhooks`,
        headers: { cookie: adminCookie },
        payload: {
          name: 'Public HTTPS Hook',
          url: 'https://webhook.site/00000000-0000-0000-0000-000000000000',
          events: ['insert'],
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().success).toBe(true);
    });
  });

  // ==========================================
  // SECTION H: Cluster & Health
  // ==========================================
  describe('[H] Cluster & System Telemetry', () => {
    it('should return cluster status and storage nodes overview', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/admin/cluster/status',
        headers: { cookie: adminCookie },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      expect(res.json().data.nodes).toBeDefined();
    });

    it('should return 200 on /health and /api/health', async () => {
      const h1 = await app.inject({ method: 'GET', url: '/health' });
      expect(h1.statusCode).toBe(200);
      expect(['ok', 'operational']).toContain(h1.json().status);

      const h2 = await app.inject({ method: 'GET', url: '/api/health' });
      expect(h2.statusCode).toBe(200);
      expect(['ok', 'operational']).toContain(h2.json().status);
    });

    it('should return system telemetry metrics and rolling history', async () => {
      const metricsRes = await app.inject({
        method: 'GET',
        url: '/api/system/metrics',
        headers: { cookie: adminCookie },
      });
      expect(metricsRes.statusCode).toBe(200);
      expect(metricsRes.json().data.timeline).toBeDefined();
    });
  });

  // ==========================================
  // SECTION J: Security & Cross-Tenant Isolation
  // ==========================================
  describe('[J] Cross-Tenant IDOR & Security Headers', () => {
    it('should block token of Tenant A from accessing Tenant B database (IDOR defense)', async () => {
      const idorRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${secondaryDbId}/query`,
        headers: { authorization: `Bearer ${primaryToken}` },
        payload: { sql: 'SELECT 1;' },
      });
      expect([401, 403]).toContain(idorRes.statusCode);
      expect(idorRes.json().success).toBe(false);
    });

    it('should include Helmet security headers on responses', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    });
  });

  // ==========================================
  // SECTION K: Endurance & Concurrency
  // ==========================================
  describe('[K] Concurrency & High Load Endurance', () => {
    it('should handle 60 concurrent read/write queries without SQLITE_BUSY', async () => {
      const count = 60;
      const startTime = performance.now();

      const requests = Array.from({ length: count }, (_, i) => {
        const isWrite = i % 3 === 0;
        const sql = isWrite
          ? `INSERT INTO menu_items (name, price) VALUES ('Concurrent item ${i}', ${i * 10});`
          : `SELECT id, name, price FROM menu_items LIMIT 5;`;

        return app.inject({
          method: 'POST',
          url: `/v1/databases/${primaryDbId}/query`,
          headers: { authorization: `Bearer ${primaryToken}` },
          payload: { sql },
        });
      });

      const results = await Promise.all(requests);
      const totalDuration = performance.now() - startTime;

      let successCount = 0;
      for (const r of results) {
        if (r.statusCode === 200) successCount++;
      }

      expect(successCount).toBe(count);
      // Average latency per request in concurrent burst
      const avgMs = Math.round(totalDuration / count);
      expect(avgMs).toBeLessThan(150); // fast under local WAL mode
    });
  });

  // ==========================================
  // SECTION L: UI Client Asset Serving
  // ==========================================
  describe('[L] Web Frontend Client Serving', () => {
    it('should serve index.html for root path', async () => {
      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });
  });
});
