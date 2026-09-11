import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/server/index.js';
import { dbManager } from '../src/server/db/manager.js';
import { getMetadataDb } from '../src/server/db/metadata.js';
import { databaseService } from '../src/server/services/database.js';

describe('User Management Advanced Suite (Revoke Sessions, Bulk Actions, Audit Summary)', () => {
  let app: any;
  let adminCookie: string;
  let adminUserId: string;
  let testUser1Id: string;
  let testUser2Id: string;
  let testUser1Cookie: string;
  let testDbId: string;
  const runId = Date.now();

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 1. Ensure super_admin session
    let setupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: `mgr_admin_${runId}`,
        password: 'AdminPassword123!',
        confirmPassword: 'AdminPassword123!',
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

    // 2. Create two test users
    const u1Res = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie: adminCookie },
      payload: {
        username: `test_user1_${runId}`,
        password: 'UserPassword123!',
        role: 'user',
        maxDatabases: 2,
        rateLimitPerMinute: 60,
      },
    });
    expect(u1Res.statusCode).toBe(201);
    testUser1Id = u1Res.json().data.id;

    const u2Res = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie: adminCookie },
      payload: {
        username: `test_user2_${runId}`,
        password: 'UserPassword123!',
        role: 'user',
        maxDatabases: 5,
        rateLimitPerMinute: 120,
      },
    });
    expect(u2Res.statusCode).toBe(201);
    testUser2Id = u2Res.json().data.id;

    // Login as user 1 to get a valid user session cookie
    const loginU1 = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: `test_user1_${runId}`,
        password: 'UserPassword123!',
      },
    });
    expect(loginU1.statusCode).toBe(200);
    const u1Cookie = loginU1.cookies.find((c: any) => c.name === 'vdb_session');
    testUser1Cookie = `vdb_session=${u1Cookie.value}`;

    // Create a database owned by user 1
    const db = databaseService.createDatabase(
      `User1 DB ${runId}`,
      'Test DB for user summary',
      testUser1Id
    );
    testDbId = db.id;
  }, 30000);

  afterAll(async () => {
    if (testDbId) {
      try {
        databaseService.deleteDatabase(testDbId);
      } catch {}
    }
    dbManager.closeAll();
    if (app) await app.close();
  }, 30000);

  it('verifies user 1 session is initially valid', async () => {
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: testUser1Cookie },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().data.user.username).toBe(`test_user1_${runId}`);
  });

  it('revokes sessions for user 1 and invalidates existing cookie immediately', async () => {
    const metaDb = getMetadataDb();
    const beforeUser = metaDb.prepare('SELECT token_version FROM users WHERE id = ?').get(testUser1Id) as any;

    const revokeRes = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${testUser1Id}/revoke-sessions`,
      headers: { cookie: adminCookie },
    });

    expect(revokeRes.statusCode).toBe(200);
    expect(revokeRes.json().success).toBe(true);
    expect(revokeRes.json().data.token_version).toBe(beforeUser.token_version + 1);

    // Old cookie should now be rejected with 401
    const meResAfter = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: testUser1Cookie },
    });
    expect(meResAfter.statusCode).toBe(401);
  });

  it('executes bulk disable and increments token_version for selected users', async () => {
    const metaDb = getMetadataDb();
    const u2Before = metaDb.prepare('SELECT token_version, status FROM users WHERE id = ?').get(testUser2Id) as any;

    const bulkDisableRes = await app.inject({
      method: 'POST',
      url: '/api/admin/users/bulk',
      headers: { cookie: adminCookie },
      payload: {
        userIds: [testUser1Id, testUser2Id],
        action: 'disable',
      },
    });

    expect(bulkDisableRes.statusCode).toBe(200);
    expect(bulkDisableRes.json().success).toBe(true);
    expect(bulkDisableRes.json().data.affectedCount).toBe(2);

    const u1After = metaDb.prepare('SELECT status FROM users WHERE id = ?').get(testUser1Id) as any;
    const u2After = metaDb.prepare('SELECT token_version, status FROM users WHERE id = ?').get(testUser2Id) as any;

    expect(u1After.status).toBe('disabled');
    expect(u2After.status).toBe('disabled');
    expect(u2After.token_version).toBe(u2Before.token_version + 1);
  });

  it('executes bulk activate on disabled users', async () => {
    const metaDb = getMetadataDb();

    const bulkActivateRes = await app.inject({
      method: 'POST',
      url: '/api/admin/users/bulk',
      headers: { cookie: adminCookie },
      payload: {
        userIds: [testUser1Id, testUser2Id],
        action: 'activate',
      },
    });

    expect(bulkActivateRes.statusCode).toBe(200);
    expect(bulkActivateRes.json().data.affectedCount).toBe(2);

    const u1 = metaDb.prepare('SELECT status FROM users WHERE id = ?').get(testUser1Id) as any;
    expect(u1.status).toBe('active');
  });

  it('executes bulk set_role to promote users', async () => {
    const metaDb = getMetadataDb();

    const bulkRoleRes = await app.inject({
      method: 'POST',
      url: '/api/admin/users/bulk',
      headers: { cookie: adminCookie },
      payload: {
        userIds: [testUser1Id, testUser2Id],
        action: 'set_role',
        role: 'admin',
      },
    });

    expect(bulkRoleRes.statusCode).toBe(200);
    expect(bulkRoleRes.json().data.affectedCount).toBe(2);

    const u1 = metaDb.prepare('SELECT role FROM users WHERE id = ?').get(testUser1Id) as any;
    const u2 = metaDb.prepare('SELECT role FROM users WHERE id = ?').get(testUser2Id) as any;
    expect(u1.role).toBe('admin');
    expect(u2.role).toBe('admin');
  });

  it('prevents bulk actions from modifying self when only self is passed', async () => {
    const selfRes = await app.inject({
      method: 'POST',
      url: '/api/admin/users/bulk',
      headers: { cookie: adminCookie },
      payload: {
        userIds: [adminUserId],
        action: 'disable',
      },
    });

    expect(selfRes.statusCode).toBe(400);
    expect(selfRes.json().error?.code).toBe('CANNOT_MODIFY_SELF');
  });

  it('fetches complete user summary including owned databases and disk sizes', async () => {
    const summaryRes = await app.inject({
      method: 'GET',
      url: `/api/admin/users/${testUser1Id}/summary`,
      headers: { cookie: adminCookie },
    });

    expect(summaryRes.statusCode).toBe(200);
    const data = summaryRes.json().data;

    expect(data.user).toBeDefined();
    expect(data.user.id).toBe(testUser1Id);
    expect(data.recentIp).toBeDefined();
    expect(typeof data.sqlQueries24h).toBe('number');
    expect(Array.isArray(data.databases)).toBe(true);
    expect(data.databases.length).toBeGreaterThanOrEqual(1);

    const ownedDb = data.databases.find((d: any) => d.id === testDbId);
    expect(ownedDb).toBeDefined();
    expect(ownedDb.name).toBe(`User1 DB ${runId}`);
    expect(typeof ownedDb.sizeBytes).toBe('number');
    expect(ownedDb.sizeBytes).toBeGreaterThan(0);
    expect(Array.isArray(data.recentAuditEvents)).toBe(true);
  });
});
