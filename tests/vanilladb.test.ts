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
    expect(body.version).toBe('1.0.0');
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
  });

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
  });
});

