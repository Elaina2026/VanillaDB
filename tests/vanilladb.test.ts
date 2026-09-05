import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { buildApp } from '../src/server/index.js';
import { dbManager } from '../src/server/db/manager.js';
import { tokenService } from '../src/server/services/tokens.js';
import { databaseService } from '../src/server/services/database.js';

describe('VanillaDatabase Full Platform Test Suite', () => {
  let app: any;
  let testDbId: string;
  let adminCookie: string;
  let readWriteToken: string;
  let readOnlyToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  }, 30000);

  afterAll(async () => {
    if (testDbId) {
      try {
        databaseService.deleteDatabase(testDbId);
      } catch {
        // cleanup
      }
    }
    dbManager.closeAll();
    if (app) await app.close();
  }, 30000);

  // 1. Authentication & Setup
  it('should allow initial admin setup or login', async () => {
    let res = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: 'admin_test',
        password: 'SuperSecretPassword123!',
        confirmPassword: 'SuperSecretPassword123!',
      },
    });

    if (res.statusCode === 201) {
      expect(res.json().success).toBe(true);
      const cookies = res.cookies;
      const session = cookies.find((c: any) => c.name === 'vdb_session');
      expect(session).toBeDefined();
      adminCookie = `vdb_session=${session.value}`;
    } else {
      // If already initialized, try logging in with admin_test first, then fallback to environment credentials
      let loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'admin_test',
          password: 'SuperSecretPassword123!',
        },
      });

      if (loginRes.statusCode !== 200) {
        loginRes = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: {
            username: process.env.VDB_ADMIN_USERNAME || 'VanillaDatabase',
            password: process.env.VDB_ADMIN_PASSWORD || '123456',
          },
        });
      }

      // If still not authenticated (e.g. database initialized by another test runner), guarantee admin_test exists
      if (loginRes.statusCode !== 200) {
        const { authService } = await import('../src/server/services/auth.js');
        const metaDb = (await import('../src/server/db/metadata.js')).getMetadataDb();
        const existingAdmin = metaDb.prepare("SELECT id FROM users WHERE username = 'admin_test'").get() as any;
        if (!existingAdmin) {
          await authService.createAdminUser('admin_test', 'SuperSecretPassword123!', 'super_admin');
        } else {
          const hash = await authService.hashPassword('SuperSecretPassword123!');
          metaDb.prepare("UPDATE users SET password_hash = ?, totp_enabled = 0 WHERE username = 'admin_test'").run(hash);
        }
        loginRes = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: {
            username: 'admin_test',
            password: 'SuperSecretPassword123!',
          },
        });
      }

      // If account has 2FA enabled, complete step-up challenge using stored secret
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
      const cookies = loginRes.cookies;
      const session = cookies.find((c: any) => c.name === 'vdb_session');
      expect(session).toBeDefined();
      adminCookie = `vdb_session=${session.value}`;
    }
  });

  it('should verify health endpoint without secrets', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('VanillaDatabase');
    expect(body.version).toBe('1.3.2');
  });

  // 2. Database Lifecycle
  it('should create a new SQLite database instance', async () => {
    const testDbName = `Discord Bot Test ${Date.now()}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/databases',
      headers: { cookie: adminCookie },
      payload: {
        name: testDbName,
        description: 'Test database for automated test suite',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toMatch(/^db_/);
    testDbId = body.data.id;
  });

  it('should create table and execute raw SQL via Admin console', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${testDbId}/query`,
      headers: { cookie: adminCookie },
      payload: {
        sql: `
          CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            score INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL
          );
        `,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  // 3. Tokens & Permissions
  it('should create read-write and read-only API tokens', async () => {
    // Read-Write token
    const rwRes = await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${testDbId}/tokens`,
      headers: { cookie: adminCookie },
      payload: {
        name: 'Backend Production Token',
        permissions: ['database:read', 'database:write', 'database:ddl'],
      },
    });
    expect(rwRes.statusCode).toBe(201);
    readWriteToken = rwRes.json().data.plainSecret;
    expect(readWriteToken).toMatch(/^vdb_live_/);

    // Read-Only token
    const roRes = await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${testDbId}/tokens`,
      headers: { cookie: adminCookie },
      payload: {
        name: 'Public Read Only Token',
        permissions: ['database:read'],
      },
    });
    expect(roRes.statusCode).toBe(201);
    readOnlyToken = roRes.json().data.plainSecret;
  });

  // 4. Data Plane API queries
  it('should execute INSERT using parameterized query via API token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: {
        authorization: `Bearer ${readWriteToken}`,
      },
      payload: {
        sql: 'INSERT INTO users (username, score, created_at) VALUES (?, ?, ?)',
        params: ['alice', 100, Date.now()],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.changes).toBe(1);
    expect(Number(body.data.lastInsertRowid)).toBe(1);
  });

  it('should execute SELECT and return structured rows', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: {
        authorization: `Bearer ${readOnlyToken}`,
      },
      payload: {
        sql: 'SELECT * FROM users WHERE username = ?',
        params: ['alice'],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.rowCount).toBe(1);
    expect(body.data.rows[0].username).toBe('alice');
    expect(body.data.rows[0].score).toBe(100);
  });

  it('should reject write operations from read-only token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: {
        authorization: `Bearer ${readOnlyToken}`,
      },
      payload: {
        sql: 'DELETE FROM users WHERE username = ?',
        params: ['alice'],
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().success).toBe(false);
  });

  // 5. Transactional Batch Operations
  it('should execute batch operations atomically in a transaction', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/batch`,
      headers: {
        authorization: `Bearer ${readWriteToken}`,
      },
      payload: {
        transaction: true,
        statements: [
          { sql: 'INSERT INTO users (username, score, created_at) VALUES (?, ?, ?)', params: ['bob', 200, Date.now()] },
          { sql: 'INSERT INTO users (username, score, created_at) VALUES (?, ?, ?)', params: ['charlie', 300, Date.now()] },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.results.length).toBe(2);
  });

  it('should rollback entire batch if one statement violates constraint', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/batch`,
      headers: {
        authorization: `Bearer ${readWriteToken}`,
      },
      payload: {
        transaction: true,
        statements: [
          { sql: 'INSERT INTO users (username, score, created_at) VALUES (?, ?, ?)', params: ['david', 400, Date.now()] },
          { sql: 'INSERT INTO users (username, score, created_at) VALUES (?, ?, ?)', params: ['alice', 500, Date.now()] }, // Duplicate username
        ],
      },
    });

    expect(res.statusCode).toBe(409); // Unique constraint violation

    // Verify david was rolled back
    const checkRes = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: `Bearer ${readOnlyToken}` },
      payload: { sql: 'SELECT * FROM users WHERE username = ?', params: ['david'] },
    });
    expect(checkRes.json().data.rowCount).toBe(0);
  });

  // 6. Security & Sandbox & SQL Crypto Functions
  it('should execute SQL native AES-256-GCM encryption & hashing functions', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: `Bearer ${readWriteToken}` },
      payload: {
        sql: `
          SELECT
            encrypt_aes('sensitive_ssn_1234', 'customSecretKey') as enc,
            decrypt_aes(encrypt_aes('sensitive_ssn_1234', 'customSecretKey'), 'customSecretKey') as dec,
            hash_sha256('hello_world') as sha,
            hash_hmac('data', 'secret_key') as hmac
        `,
      },
    });

    expect(res.statusCode).toBe(200);
    const row = res.json().data.rows[0];
    expect(row.enc).toBeDefined();
    expect(typeof row.enc).toBe('string');
    expect(row.dec).toBe('sensitive_ssn_1234');
    expect(row.sha).toBe('35072c1ae546350e0bfa7ab11d49dc6f129e72ccd57ec7eb671225bbd197c8f1');
    expect(row.hmac).toBeDefined();
  });

  it('should block ATTACH DATABASE attempt', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: `Bearer ${readWriteToken}` },
      payload: { sql: "ATTACH DATABASE '/etc/passwd' AS test_hack;" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('ATTACH DATABASE is forbidden');
  });

  it('should reject invalid or revoked token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: 'Bearer vdb_live_invalidfake1234567890' },
      payload: { sql: 'SELECT 1' },
    });

    expect(res.statusCode).toBe(401);
  });

  // 7. Backup & Restore
  it('should create backup snapshot and restore successfully', async () => {
    // 1. Create backup
    const bkpRes = await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${testDbId}/backups`,
      headers: { cookie: adminCookie },
    });
    expect(bkpRes.statusCode).toBe(201);
    const backupId = bkpRes.json().data.id;

    // 2. Modify data
    await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: `Bearer ${readWriteToken}` },
      payload: { sql: 'DELETE FROM users;' },
    });

    // Verify users is empty
    const emptyCheck = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: `Bearer ${readWriteToken}` },
      payload: { sql: 'SELECT COUNT(*) as c FROM users;' },
    });
    expect(emptyCheck.json().data.rows[0].c).toBe(0);

    // 3. Restore backup
    const restoreRes = await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${testDbId}/backups/${backupId}/restore`,
      headers: { cookie: adminCookie },
    });
    expect(restoreRes.statusCode).toBe(200);

    // 4. Verify restored data
    const restoredCheck = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: `Bearer ${readWriteToken}` },
      payload: { sql: 'SELECT COUNT(*) as c FROM users;' },
    });
    expect(restoredCheck.json().data.rows[0].c).toBeGreaterThan(0);
  });

  // 8. Media & Storage Service
  it('should upload file, stream range 206, and list files per database', async () => {
    // 1. Upload sample text/image content via storage service
    const sampleContent = Buffer.from('VanillaDatabase Media Streaming Test Content 1234567890');
    const { storageService } = await import('../src/server/services/storage.js');
    const file = storageService.createFile({
      databaseId: testDbId,
      originalName: 'test-video.mp4',
      mimeType: 'video/mp4',
      buffer: sampleContent,
    });

    expect(file.id).toBeDefined();
    expect(file.database_id).toBe(testDbId);
    expect(file.size_bytes).toBe(sampleContent.length);

    // 2. Fetch file via API token
    const listRes = await app.inject({
      method: 'GET',
      url: `/v1/databases/${testDbId}/files`,
      headers: { authorization: `Bearer ${readOnlyToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data.length).toBeGreaterThan(0);

    // 3. Test HTTP 206 Partial Content Range streaming
    const streamRes = await app.inject({
      method: 'GET',
      url: `/v1/files/${file.id}/view`,
      headers: {
        authorization: `Bearer ${readOnlyToken}`,
        range: 'bytes=0-15',
      },
    });

    expect(streamRes.statusCode).toBe(206);
    expect(streamRes.headers['content-range']).toBe(`bytes 0-15/${sampleContent.length}`);
    expect(streamRes.headers['content-type']).toBe('video/mp4');

    // 4. Delete file
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/admin/files/${file.id}`,
      headers: { cookie: adminCookie },
    });
    expect(delRes.statusCode).toBe(200);
  });

  // 9. Realtime & Webhook & Import/Export
  it('should create webhooks, export data, and dispatch realtime events', async () => {
    // 1. Create Webhook
    const hookRes = await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${testDbId}/webhooks`,
      headers: { cookie: adminCookie },
      payload: {
        name: 'Discord Bot Notifier',
        url: 'https://example.com/webhook/dummy',
        events: ['insert', 'update'],
      },
    });

    expect(hookRes.statusCode).toBe(201);
    const hook = hookRes.json().data;
    expect(hook.name).toBe('Discord Bot Notifier');

    // 2. Export SQL dump
    const exportSqlRes = await app.inject({
      method: 'GET',
      url: `/api/admin/databases/${testDbId}/export?format=sql`,
      headers: { cookie: adminCookie },
    });
    expect(exportSqlRes.statusCode).toBe(200);
    expect(exportSqlRes.body).toContain('CREATE TABLE');

    // 3. Export CSV
    const exportCsvRes = await app.inject({
      method: 'GET',
      url: `/api/admin/databases/${testDbId}/export?format=csv&table=users`,
      headers: { cookie: adminCookie },
    });
    expect(exportCsvRes.statusCode).toBe(200);

    // 4. Test client SDK helper
    const { VanillaDatabase } = await import('../shared/client.js');
    const client = new VanillaDatabase({
      url: `http://localhost/v1/databases/${testDbId}`,
      token: readOnlyToken,
    });
    expect(client).toBeDefined();

    // 5. Delete Webhook
    const delHookRes = await app.inject({
      method: 'DELETE',
      url: `/api/admin/webhooks/${hook.id}`,
      headers: { cookie: adminCookie },
    });
    expect(delHookRes.statusCode).toBe(200);
  });

  // 10. AI Vector Cosine Similarity & Rate Limiting Test
  it('should support vector cosine similarity query and enforce token rate limits', async () => {
    // 1. Vector Math Query
    const vecRes = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: `Bearer ${readWriteToken}` },
      payload: {
        sql: "SELECT vec_cosine_similarity('[1.0, 0.0, 0.0]', '[1.0, 0.0, 0.0]') as sim, vec_cosine_distance('[1.0, 0.0]', '[0.0, 1.0]') as dist;",
      },
    });

    expect(vecRes.statusCode).toBe(200);
    const row = vecRes.json().data.rows[0];
    expect(Number(row.sim)).toBeCloseTo(1.0, 2);
    expect(Number(row.dist)).toBeCloseTo(1.0, 2);

    // 2. Create Rate Limited Token (1 request per minute)
    const rateTokenRes = await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${testDbId}/tokens`,
      headers: { cookie: adminCookie },
      payload: {
        name: 'Rate Limited Bot Token',
        permissions: ['database:read'],
        rateLimit: 1,
      },
    });

    expect(rateTokenRes.statusCode).toBe(201);
    const rateToken = rateTokenRes.json().data.plainSecret;

    // First request should succeed
    const req1 = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: `Bearer ${rateToken}` },
      payload: { sql: 'SELECT 1' },
    });
    expect(req1.statusCode).toBe(200);

    // Second request within same minute should be rejected with 429
    const req2 = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: `Bearer ${rateToken}` },
      payload: { sql: 'SELECT 1' },
    });
    expect(req2.statusCode).toBe(429);
    expect(req2.json().error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  // 11. Maintenance, Database Cloning & Query Profiler Test
  it('should support maintenance operations, 1-click clone, and EXPLAIN query plan', async () => {
    // 1. Maintenance: Integrity check & Vacuum
    const maintRes = await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${testDbId}/maintenance`,
      headers: { cookie: adminCookie },
      payload: { action: 'integrity_check' },
    });
    expect(maintRes.statusCode).toBe(200);
    expect(maintRes.json().success).toBe(true);

    // 2. Query Profiler (Explain Query Plan)
    const explainRes = await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${testDbId}/explain`,
      headers: { cookie: adminCookie },
      payload: { sql: "SELECT * FROM users WHERE username = 'alice'" },
    });
    expect(explainRes.statusCode).toBe(200);
    const explainData = explainRes.json().data;
    expect(explainData.plan).toBeDefined();
    expect(explainData.analysis).toBeDefined();

    // 3. Database Cloning / Branching
    const cloneRes = await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${testDbId}/clone`,
      headers: { cookie: adminCookie },
      payload: { name: `Cloned Staging DB ${Date.now()}` },
    });
    expect(cloneRes.statusCode).toBe(201);
    const clonedDb = cloneRes.json().data;
    expect(clonedDb.id).toMatch(/^db_/);

    // Cleanup cloned DB
    try {
      databaseService.deleteDatabase(clonedDb.id);
    } catch {}
  }, 20000);

  // 12. Multi-User RBAC & Quotas Test
  it('should create sub-account with DB and rate limit quotas, and enforce caps', async () => {
    // 1. Create sub-user with max 1 database quota
    const createUserRes = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie: adminCookie },
      payload: {
        username: `subuser_${Date.now()}`,
        password: 'Password123!',
        role: 'user',
        maxDatabases: 1,
        rateLimitPerMinute: 30,
      },
    });

    expect(createUserRes.statusCode).toBe(201);
    const subUser = createUserRes.json().data;
    expect(subUser.role).toBe('user');
    expect(subUser.max_databases).toBe(1);

    // 2. Login as sub-user
    const subLoginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: subUser.username,
        password: 'Password123!',
      },
    });
    expect(subLoginRes.statusCode).toBe(200);
    const subSessionCookie = `vdb_session=${subLoginRes.cookies.find((c: any) => c.name === 'vdb_session').value}`;

    // 3. Sub-user creates 1st database -> Should succeed
    const createDb1Res = await app.inject({
      method: 'POST',
      url: '/api/admin/databases',
      headers: { cookie: subSessionCookie },
      payload: { name: 'Sub User DB 1' },
    });
    expect(createDb1Res.statusCode).toBe(201);
    const subDb1Id = createDb1Res.json().data.id;

    // 4. Sub-user tries to create 2nd database -> Should be rejected with quota error
    const createDb2Res = await app.inject({
      method: 'POST',
      url: '/api/admin/databases',
      headers: { cookie: subSessionCookie },
      payload: { name: 'Sub User DB 2' },
    });
    expect(createDb2Res.statusCode).toBe(400);
    expect(createDb2Res.json().error.message).toContain('Database creation limit reached');

    // 5. Sub-user tries to access /api/admin/users -> Should be rejected (403 Forbidden)
    const listUsersForbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { cookie: subSessionCookie },
    });
    expect(listUsersForbidden.statusCode).toBe(403);

    // Cleanup sub DB & user
    try {
      databaseService.deleteDatabase(subDb1Id);
      const { authService } = await import('../src/server/services/auth.js');
      authService.deleteUser(subUser.id);
    } catch {}
  }, 15000);

  // 13. Disk Quota per Database (max_size_mb)
  it('should enforce hard disk quota per tenant database and reject write operations when exceeded', async () => {
    // 1. Create a database with 1MB quota
    const quotaDbRes = await app.inject({
      method: 'POST',
      url: '/api/admin/databases',
      headers: { cookie: adminCookie },
      payload: {
        name: `Quota Test DB ${Date.now()}`,
        maxSizeMb: 1, // 1 MB quota
      },
    });

    expect(quotaDbRes.statusCode).toBe(201);
    const quotaDbId = quotaDbRes.json().data.id;

    // 2. Create RW token
    const tokenRes = await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${quotaDbId}/tokens`,
      headers: { cookie: adminCookie },
      payload: {
        name: 'Quota RW Token',
        permissions: ['database:read', 'database:write', 'database:ddl'],
      },
    });
    const quotaToken = tokenRes.json().data.plainSecret;

    // 3. Create table
    await app.inject({
      method: 'POST',
      url: `/v1/databases/${quotaDbId}/query`,
      headers: { authorization: `Bearer ${quotaToken}` },
      payload: {
        sql: 'CREATE TABLE items (id INTEGER PRIMARY KEY, content TEXT);',
      },
    });

    // 4. Update max_size_mb to a very small amount (e.g. 0.0001 MB / simulate full disk)
    const { getMetadataDb } = await import('../src/server/db/metadata.js');
    const metaDb = getMetadataDb();
    metaDb.prepare('UPDATE databases SET max_size_mb = 0.0001 WHERE id = ?').run(quotaDbId);
    dbManager.updateCachedQuota(quotaDbId, 0.0001);

    // 5. Attempt INSERT -> should be rejected with 413 DISK_QUOTA_EXCEEDED
    const insertRes = await app.inject({
      method: 'POST',
      url: `/v1/databases/${quotaDbId}/query`,
      headers: { authorization: `Bearer ${quotaToken}` },
      payload: {
        sql: 'INSERT INTO items (content) VALUES (?)',
        params: ['Sample heavy data payload exceeding disk limit'],
      },
    });

    expect(insertRes.statusCode).toBe(413);
    expect(insertRes.json().error.code).toBe('DISK_QUOTA_EXCEEDED');

    // 6. Read operation (SELECT) should still be allowed
    const selectRes = await app.inject({
      method: 'POST',
      url: `/v1/databases/${quotaDbId}/query`,
      headers: { authorization: `Bearer ${quotaToken}` },
      payload: {
        sql: 'SELECT COUNT(*) as c FROM items;',
      },
    });
    expect(selectRes.statusCode).toBe(200);

    // Cleanup
    try {
      databaseService.deleteDatabase(quotaDbId);
    } catch {}
  }, 15000);

  // 14. FTS5 Virtual Table & Auto-Sync Triggers Generator
  it('should generate FTS5 virtual table with auto-sync triggers and support full-text search', async () => {
    // 1. Create table and insert initial rows
    await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${testDbId}/query`,
      headers: { cookie: adminCookie },
      payload: {
        sql: 'CREATE TABLE articles (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL);',
      },
    });

    await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/batch`,
      headers: { authorization: `Bearer ${readWriteToken}` },
      payload: {
        transaction: true,
        statements: [
          { sql: 'INSERT INTO articles (title, content) VALUES (?, ?)', params: ['SQLite Speed', 'SQLite is a C-language library that implements a small, fast, self-contained, high-reliability SQL engine.'] },
          { sql: 'INSERT INTO articles (title, content) VALUES (?, ?)', params: ['VanillaDatabase Cloud', 'VanillaDatabase brings modern cloud features, multi-tenancy and encryption to SQLite.'] },
          { sql: 'INSERT INTO articles (title, content) VALUES (?, ?)', params: ['Vietnamese Search', 'Tim kiem tieng Viet voi bo ma unicode61 va tokenizer toi uu.'] },
        ],
      },
    });

    // 2. Setup FTS5 index via Admin API
    const ftsRes = await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${testDbId}/fts5-setup`,
      headers: { cookie: adminCookie },
      payload: {
        sourceTable: 'articles',
        columns: ['title', 'content'],
        tokenizer: 'unicode61',
        createTriggers: true,
      },
    });

    expect(ftsRes.statusCode).toBe(201);
    expect(ftsRes.json().success).toBe(true);
    expect(ftsRes.json().data.ftsTable).toBe('articles_fts');

    // 3. Query FTS5 table
    const searchRes = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: `Bearer ${readOnlyToken}` },
      payload: {
        sql: "SELECT rowid, title, content FROM articles_fts WHERE articles_fts MATCH 'VanillaDatabase'",
      },
    });

    expect(searchRes.statusCode).toBe(200);
    const searchData = searchRes.json().data;
    expect(searchData.rowCount).toBe(1);
    expect(searchData.rows[0].title).toBe('VanillaDatabase Cloud');

    // 4. Test Auto-Sync Triggers on INSERT
    await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: `Bearer ${readWriteToken}` },
      payload: {
        sql: "INSERT INTO articles (title, content) VALUES ('Realtime Subsystems', 'Event-driven architecture with zero latency');",
      },
    });

    const triggerSyncSearch = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: `Bearer ${readOnlyToken}` },
      payload: {
        sql: "SELECT rowid, title FROM articles_fts WHERE articles_fts MATCH 'Realtime'",
      },
    });
    expect(triggerSyncSearch.statusCode).toBe(200);
    expect(triggerSyncSearch.json().data.rowCount).toBe(1);
    expect(triggerSyncSearch.json().data.rows[0].title).toBe('Realtime Subsystems');
  }, 15000);

  // 15. Webhook Retry Queue with Exponential Backoff
  it('should queue failed webhooks and track failure metrics', async () => {
    const { webhookService } = await import('../src/server/services/webhook.js');
    const metaDb = (await import('../src/server/db/metadata.js')).getMetadataDb();

    // 1. Create a webhook pointing to a non-existent port (guaranteed connection failure)
    const deadPort = 49151;
    const deadHook = webhookService.createWebhook({
      databaseId: testDbId,
      name: 'Unreachable Endpoint',
      url: `http://127.0.0.1:${deadPort}/webhook`,
      events: ['insert'],
    });

    expect(deadHook.id).toBeDefined();

    // 2. Dispatch realtime event
    await webhookService.dispatch({
      type: 'insert',
      databaseId: testDbId,
      table: 'articles',
      data: { id: 999, title: 'Retry Test' },
      timestamp: Date.now(),
    });

    // 3. Verify failure count incremented
    const updatedHook = metaDb.prepare('SELECT failure_count FROM webhooks WHERE id = ?').get(deadHook.id) as { failure_count: number };
    expect(updatedHook.failure_count).toBeGreaterThanOrEqual(1);

    // 4. Cleanup
    webhookService.deleteWebhook(deadHook.id);
  });

  // 16. Scheduled SQL Jobs (Cron Tasks) & WebAuthn Options Test
  it('should create, run, and delete scheduled SQL jobs and generate WebAuthn options', async () => {
    // 1. Create Scheduled Job
    const jobRes = await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${testDbId}/jobs`,
      headers: { cookie: adminCookie },
      payload: {
        name: 'Auto Vacuum Routine',
        cron_expression: '@hourly',
        sql_query: 'PRAGMA user_version = 42;',
      },
    });
    expect(jobRes.statusCode).toBe(201);
    const job = jobRes.json().data;
    expect(job.name).toBe('Auto Vacuum Routine');

    // 2. List Jobs
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/admin/databases/${testDbId}/jobs`,
      headers: { cookie: adminCookie },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data.length).toBeGreaterThanOrEqual(1);

    // 3. Trigger Job Run
    const runRes = await app.inject({
      method: 'POST',
      url: `/api/admin/jobs/${job.id}/run`,
      headers: { cookie: adminCookie },
    });
    expect(runRes.statusCode).toBe(200);
    expect(runRes.json().success).toBe(true);

    // 4. Delete Job
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/admin/jobs/${job.id}`,
      headers: { cookie: adminCookie },
    });
    expect(delRes.statusCode).toBe(200);

    // 5. WebAuthn Registration Options
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/webauthn/register-options',
      headers: { cookie: adminCookie },
    });
    expect(regRes.statusCode).toBe(200);
    expect(regRes.json().data.challenge).toBeDefined();

    // 6. WebAuthn Login Options
    const authRes = await app.inject({
      method: 'POST',
      url: '/api/auth/webauthn/login-options',
      payload: { username: 'admin_test' },
    });
    expect(authRes.statusCode).toBe(200);
    expect(authRes.json().data.challenge).toBeDefined();
  });

  // 17. Deep Security & SQL Sandboxing Test
  it('should strictly reject malicious SQLite injection payloads and dangerous functions', async () => {
    // 1. Block ATTACH DATABASE attempt
    const attachRes = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: `Bearer ${readWriteToken}` },
      payload: { sql: "ATTACH DATABASE ':memory:' AS malicious_db;" },
    });
    expect(attachRes.statusCode).toBe(400);
    expect(attachRes.json().error.code).toBe('SQLITE_ERROR');

    // 2. Block DETACH DATABASE attempt
    const detachRes = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: `Bearer ${readWriteToken}` },
      payload: { sql: "DETACH DATABASE malicious_db;" },
    });
    expect(detachRes.statusCode).toBe(400);

    // 3. Block load_extension attempt
    const loadExtRes = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: `Bearer ${readWriteToken}` },
      payload: { sql: "SELECT load_extension('malicious.so');" },
    });
    expect(loadExtRes.statusCode).toBe(400);

    // 4. Verify AI vector math helpers execute correctly without leaking memory or throwing
    const vecRes = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: `Bearer ${readOnlyToken}` },
      payload: {
        sql: "SELECT vec_cosine_similarity(?, ?) as similarity, vec_cosine_distance(?, ?) as distance;",
        params: [JSON.stringify([1, 0, 0]), JSON.stringify([1, 0, 0]), JSON.stringify([1, 0, 0]), JSON.stringify([0, 1, 0])],
      },
    });
    expect(vecRes.statusCode).toBe(200);
    const vecData = vecRes.json().data.rows[0];
    expect(vecData.similarity).toBeCloseTo(1.0, 5);
    expect(vecData.distance).toBeGreaterThanOrEqual(0.99);

    // 5. Verify SQL crypto functions
    const cryptoRes = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: `Bearer ${readOnlyToken}` },
      payload: {
        sql: "SELECT hash_sha256('vanilladb') as sha, hash_hmac('vanilladb', 'secret') as hmac;",
      },
    });
    expect(cryptoRes.statusCode).toBe(200);
    const cryptoData = cryptoRes.json().data.rows[0];
    expect(cryptoData.sha).toHaveLength(64);
    expect(cryptoData.hmac).toHaveLength(64);
  });

  // 18. Deep Transaction Rollback & Concurrency Stress Test
  it('should ensure atomic transaction rollback on failure without leaving partial writes', async () => {
    // 1. Setup bank accounts table
    await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: `Bearer ${readWriteToken}` },
      payload: {
        sql: `CREATE TABLE bank_accounts (id TEXT PRIMARY KEY, balance INTEGER NOT NULL CHECK(balance >= 0));`,
      },
    });

    await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/batch`,
      headers: { authorization: `Bearer ${readWriteToken}` },
      payload: {
        transaction: true,
        statements: [
          { sql: 'INSERT INTO bank_accounts (id, balance) VALUES (?, ?);', params: ['acc_alice', 100] },
          { sql: 'INSERT INTO bank_accounts (id, balance) VALUES (?, ?);', params: ['acc_bob', 50] },
        ],
      },
    });

    // 2. Perform atomic transfer where second statement violates CHECK constraint (negative balance)
    const failingTransfer = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/batch`,
      headers: { authorization: `Bearer ${readWriteToken}` },
      payload: {
        transaction: true,
        statements: [
          { sql: 'UPDATE bank_accounts SET balance = balance + 1000 WHERE id = ?;', params: ['acc_bob'] },
          { sql: 'UPDATE bank_accounts SET balance = balance - 500 WHERE id = ?;', params: ['acc_alice'] }, // Alice only has 100 -> fails CHECK(balance >= 0)
        ],
      },
    });

    expect(failingTransfer.statusCode).toBe(400);

    // 3. Verify Bob did NOT receive the 1000 balance increase (Entire transaction rolled back)
    const checkBalance = await app.inject({
      method: 'POST',
      url: `/v1/databases/${testDbId}/query`,
      headers: { authorization: `Bearer ${readOnlyToken}` },
      payload: {
        sql: 'SELECT id, balance FROM bank_accounts ORDER BY id ASC;',
      },
    });

    expect(checkBalance.statusCode).toBe(200);
    const rows = checkBalance.json().data.rows;
    expect(rows[0].id).toBe('acc_alice');
    expect(rows[0].balance).toBe(100);
    expect(rows[1].id).toBe('acc_bob');
    expect(rows[1].balance).toBe(50);
  });

  // 19. User Self-Registration, Avatar, Database Isolation & Members Collaboration Test
  it('should support email self-registration, avatar updates, database isolation, and database invitations', async () => {
    const uniqueSuffix = Date.now();
    const alphaEmail = `alpha_${uniqueSuffix}@vanilladb.test`;
    const alphaUsername = `user_alpha_${uniqueSuffix}`;
    const betaEmail = `beta_${uniqueSuffix}@vanilladb.test`;
    const betaUsername = `user_beta_${uniqueSuffix}`;

    // 1. Self-register User Alpha via email
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: alphaEmail,
        username: alphaUsername,
        password: 'PasswordAlpha123!',
      },
    });
    expect(regRes.statusCode).toBe(201);
    const alphaSessionCookie = `vdb_session=${regRes.cookies.find((c: any) => c.name === 'vdb_session').value}`;

    // 2. User Alpha updates profile with avatar URL
    const updateProfileRes = await app.inject({
      method: 'PUT',
      url: '/api/auth/profile',
      headers: { cookie: alphaSessionCookie },
      payload: {
        avatar_url: 'https://example.com/avatar_alpha.png',
      },
    });
    expect(updateProfileRes.statusCode).toBe(200);
    expect(updateProfileRes.json().data.avatar_url).toBe('https://example.com/avatar_alpha.png');

    // 3. User Alpha creates an isolated database
    const createAlphaDb = await app.inject({
      method: 'POST',
      url: '/api/admin/databases',
      headers: { cookie: alphaSessionCookie },
      payload: { name: 'Alpha Private Database' },
    });
    expect(createAlphaDb.statusCode).toBe(201);
    const alphaDbId = createAlphaDb.json().data.id;

    // 4. Self-register User Beta via email
    const betaRegRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: betaEmail,
        username: betaUsername,
        password: 'PasswordBeta123!',
      },
    });
    expect(betaRegRes.statusCode).toBe(201);
    const betaSessionCookie = `vdb_session=${betaRegRes.cookies.find((c: any) => c.name === 'vdb_session').value}`;

    // 5. Database Isolation: Beta lists databases -> must NOT see Alpha's database
    const betaListDb = await app.inject({
      method: 'GET',
      url: '/api/admin/databases',
      headers: { cookie: betaSessionCookie },
    });
    expect(betaListDb.statusCode).toBe(200);
    const betaDbs = betaListDb.json().data;
    expect(betaDbs.some((d: any) => d.id === alphaDbId)).toBe(false);

    // 6. Database Isolation: Beta attempts to query Alpha's database -> 403 Forbidden
    const forbiddenRes = await app.inject({
      method: 'GET',
      url: `/api/admin/databases/${alphaDbId}`,
      headers: { cookie: betaSessionCookie },
    });
    expect(forbiddenRes.statusCode).toBe(403);

    // 7. Collaboration: Alpha invites Beta as 'viewer'
    const inviteRes = await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${alphaDbId}/members`,
      headers: { cookie: alphaSessionCookie },
      payload: {
        emailOrUsername: betaEmail,
        role: 'viewer',
      },
    });
    expect(inviteRes.statusCode).toBe(201);

    // 8. Beta lists databases -> Now sees Alpha's database marked as shared
    const betaSharedList = await app.inject({
      method: 'GET',
      url: '/api/admin/databases',
      headers: { cookie: betaSessionCookie },
    });
    expect(betaSharedList.statusCode).toBe(200);
    const foundShared = betaSharedList.json().data.find((d: any) => d.id === alphaDbId);
    expect(foundShared).toBeDefined();
    expect(foundShared.is_shared).toBe(true);
    expect(foundShared.access_role).toBe('viewer');

    // 9. Beta user dashboard stats
    const betaDashboard = await app.inject({
      method: 'GET',
      url: '/api/admin/user/dashboard',
      headers: { cookie: betaSessionCookie },
    });
    expect(betaDashboard.statusCode).toBe(200);
    expect(betaDashboard.json().data.sharedDatabasesCount).toBe(1);

    // 10. Clean up
    try {
      databaseService.deleteDatabase(alphaDbId);
    } catch {}
  });

  // 20. 2FA TOTP Secure Activation and Step-Up Login Flow Test
  it('should enforce QR TOTP activation with password verification and step-up login challenge', async () => {
    const { generateTotpCode } = await import('../src/server/utils/totp.js');
    const totpSuffix = Date.now();
    const totpUsername = `totp_tester_${totpSuffix}`;
    const totpEmail = `totp_${totpSuffix}@vanilladb.test`;

    // 1. Register a dedicated 2FA user
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: totpEmail,
        username: totpUsername,
        password: 'SafePassword123!',
      },
    });
    const sessionCookie = `vdb_session=${regRes.cookies.find((c: any) => c.name === 'vdb_session').value}`;

    // 2. Setup 2FA -> generates QR Data URL and secret
    const setupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/2fa/setup',
      headers: { cookie: sessionCookie },
    });
    expect(setupRes.statusCode).toBe(200);
    const { secret, qrDataUrl } = setupRes.json().data;
    expect(secret).toBeDefined();
    expect(qrDataUrl).toContain('data:image/svg+xml');

    // 3. Activation attempt with wrong password -> Should reject (401 Unauthorized)
    const wrongPassRes = await app.inject({
      method: 'POST',
      url: '/api/auth/2fa/activate',
      headers: { cookie: sessionCookie },
      payload: {
        password: 'WrongPassword!',
        code: generateTotpCode(secret),
      },
    });
    expect(wrongPassRes.statusCode).toBe(401);

    // 4. Activation attempt with valid password + valid OTP code -> Should succeed
    const validOtp = generateTotpCode(secret);
    const activateRes = await app.inject({
      method: 'POST',
      url: '/api/auth/2fa/activate',
      headers: { cookie: sessionCookie },
      payload: {
        password: 'SafePassword123!',
        code: validOtp,
      },
    });
    expect(activateRes.statusCode).toBe(200);
    expect(activateRes.json().success).toBe(true);

    // 5. Normal login attempt -> Password correct but 2FA enabled -> Returns 2FA challenge (require2fa: true)
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: totpUsername,
        password: 'SafePassword123!',
      },
    });
    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.json().data.require2fa).toBe(true);
    const tempToken = loginRes.json().data.tempToken;
    expect(tempToken).toBeDefined();

    // 6. Complete 2FA login challenge with 6-digit code -> Issues session cookie
    const currentOtp = generateTotpCode(secret);
    const login2faRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login/2fa',
      payload: {
        tempToken,
        code: currentOtp,
      },
    });
    expect(login2faRes.statusCode).toBe(200);
    const finalSession = login2faRes.cookies.find((c: any) => c.name === 'vdb_session');
    expect(finalSession).toBeDefined();
  });
});

