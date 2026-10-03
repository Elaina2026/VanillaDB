import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/server/index.js';
import { getMetadataDb } from '../src/server/db/metadata.js';
import { databaseService } from '../src/server/services/database.js';

describe('Workflow Launch Exec: Complete End-to-End Role Operations Matrix', () => {
  let app: any;
  const runId = Date.now();

  let superAdminCookie: string;
  let adminCookie: string;
  let devCookie: string;
  let userCookie: string;

  let superAdminId: string;
  let adminId: string;
  let devId: string;
  let userId: string;

  let superAdminDbId: string;
  let adminDbId: string;
  let devDbId: string;
  let userDbId: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // 1. Authenticate super_admin
    const setupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: `exec_sa_${runId}`,
        password: 'SuperAdminPassword123!',
        confirmPassword: 'SuperAdminPassword123!',
      },
    });

    if (setupRes.statusCode === 201) {
      superAdminCookie = `vdb_session=${setupRes.cookies.find((c: any) => c.name === 'vdb_session').value}`;
      superAdminId = setupRes.json().data.user.id;
    } else {
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: process.env.VDB_ADMIN_USERNAME || 'VanillaDatabase',
          password: process.env.VDB_ADMIN_PASSWORD || '123456',
        },
      });
      superAdminCookie = `vdb_session=${loginRes.cookies.find((c: any) => c.name === 'vdb_session').value}`;
      const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: superAdminCookie } });
      superAdminId = me.json().data.user.userId;
    }

    // 2. Create and login admin
    const createAdmin = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie: superAdminCookie },
      payload: { username: `exec_adm_${runId}`, password: 'AdminPassword123!', role: 'admin' },
    });
    expect(createAdmin.statusCode).toBe(201);
    adminId = createAdmin.json().data.id;
    const loginAdmin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: `exec_adm_${runId}`, password: 'AdminPassword123!' },
    });
    adminCookie = `vdb_session=${loginAdmin.cookies.find((c: any) => c.name === 'vdb_session').value}`;

    // 3. Create and login developer
    const createDev = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie: superAdminCookie },
      payload: { username: `exec_dev_${runId}`, password: 'DevPassword123!', role: 'developer' },
    });
    expect(createDev.statusCode).toBe(201);
    devId = createDev.json().data.id;
    const loginDev = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: `exec_dev_${runId}`, password: 'DevPassword123!' },
    });
    devCookie = `vdb_session=${loginDev.cookies.find((c: any) => c.name === 'vdb_session').value}`;

    // 4. Create and login standard user
    const createUser = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie: superAdminCookie },
      payload: { username: `exec_usr_${runId}`, password: 'UserPassword123!', role: 'user' },
    });
    expect(createUser.statusCode).toBe(201);
    userId = createUser.json().data.id;
    const loginUser = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: `exec_usr_${runId}`, password: 'UserPassword123!' },
    });
    userCookie = `vdb_session=${loginUser.cookies.find((c: any) => c.name === 'vdb_session').value}`;
  });

  afterAll(async () => {
    await app.close();
  });

  // -------------------------------------------------------------------------
  // PHASE 1: Super Admin (Platform Owner) Operations
  // -------------------------------------------------------------------------
  describe('Phase 1: Super Admin (Platform Owner)', () => {
    it('creates database instance and manages tables & lifecycle', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/databases',
        headers: { cookie: superAdminCookie },
        payload: { name: `SA_DB_${runId}`, description: 'Super Admin DB' },
      });
      expect(res.statusCode).toBe(201);
      superAdminDbId = res.json().data.id;

      // Create table
      const qRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${superAdminDbId}/query`,
        headers: { cookie: superAdminCookie },
        payload: { sql: 'CREATE TABLE sa_items (id INTEGER PRIMARY KEY, title TEXT); INSERT INTO sa_items (title) VALUES ("Item 1");' },
      });
      expect(qRes.statusCode).toBe(200);

      // Verify overview stats
      const statsRes = await app.inject({
        method: 'GET',
        url: `/api/admin/databases/${superAdminDbId}`,
        headers: { cookie: superAdminCookie },
      });
      expect(statsRes.statusCode).toBe(200);
      expect(statsRes.json().data.database.access_role).toBe('owner');
    });

    it('manages roles schema and permissions', async () => {
      const customRole = `exec_role_${runId}`;
      const createRole = await app.inject({
        method: 'POST',
        url: '/api/admin/roles',
        headers: { cookie: superAdminCookie },
        payload: {
          id: customRole,
          name: 'Executive Auditor',
          max_storage_mb: 500,
          max_databases: 10,
          rate_limit_per_minute: 200,
          permissions: ['databases:read'],
        },
      });
      expect(createRole.statusCode).toBe(201);

      // Delete custom role
      const delRole = await app.inject({
        method: 'DELETE',
        url: `/api/admin/roles/${customRole}`,
        headers: { cookie: superAdminCookie },
      });
      expect(delRole.statusCode).toBe(200);
    });

    it('inspects cluster telemetry and system audit logs', async () => {
      const clusterRes = await app.inject({
        method: 'GET',
        url: '/api/admin/cluster/status',
        headers: { cookie: superAdminCookie },
      });
      expect(clusterRes.statusCode).toBe(200);

      const auditRes = await app.inject({
        method: 'GET',
        url: '/api/admin/audit',
        headers: { cookie: superAdminCookie },
      });
      expect(auditRes.statusCode).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 2: Admin (Platform Administrator) Operations
  // -------------------------------------------------------------------------
  describe('Phase 2: Admin (Platform Administrator)', () => {
    it('creates and manages own database instance', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/databases',
        headers: { cookie: adminCookie },
        payload: { name: `ADM_DB_${runId}` },
      });
      expect(res.statusCode).toBe(201);
      adminDbId = res.json().data.id;
    });

    it('can manage non-owner users but is blocked from modifying Platform Owner', async () => {
      // Admin lists users -> 200
      const listUsers = await app.inject({
        method: 'GET',
        url: '/api/admin/users',
        headers: { cookie: adminCookie },
      });
      expect(listUsers.statusCode).toBe(200);

      // Admin tries to disable super_admin -> 403 Forbidden
      const demoteOwner = await app.inject({
        method: 'PATCH',
        url: `/api/admin/users/${superAdminId}`,
        headers: { cookie: adminCookie },
        payload: { role: 'user' },
      });
      expect(demoteOwner.statusCode).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 3: Developer (Database Engineer) Operations & Isolation
  // -------------------------------------------------------------------------
  describe('Phase 3: Developer (Database Engineer)', () => {
    it('creates own database and sees strictly isolated list', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/databases',
        headers: { cookie: devCookie },
        payload: { name: `DEV_DB_${runId}` },
      });
      expect(res.statusCode).toBe(201);
      devDbId = res.json().data.id;

      // Developer lists databases -> only sees their own database (isolation check)
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/admin/databases',
        headers: { cookie: devCookie },
      });
      expect(listRes.statusCode).toBe(200);
      const list = listRes.json().data;
      expect(list.some((d: any) => d.id === devDbId)).toBe(true);
      expect(list.some((d: any) => d.id === superAdminDbId)).toBe(false);
      expect(list.some((d: any) => d.id === adminDbId)).toBe(false);
    });

    it('can create tokens, backups, and execute SQL on owned DB', async () => {
      // Execute SQL
      const qRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${devDbId}/query`,
        headers: { cookie: devCookie },
        payload: { sql: 'CREATE TABLE metrics (id INTEGER PRIMARY KEY, val REAL);' },
      });
      expect(qRes.statusCode).toBe(200);

      // Create API token
      const tokRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${devDbId}/tokens`,
        headers: { cookie: devCookie },
        payload: { name: 'dev_api_key', permissions: ['database:read', 'database:write'] },
      });
      expect(tokRes.statusCode).toBe(201);
    });

    it('is strictly blocked from system administration endpoints', async () => {
      const usersRes = await app.inject({
        method: 'GET',
        url: '/api/admin/users',
        headers: { cookie: devCookie },
      });
      expect(usersRes.statusCode).toBe(403);

      const auditRes = await app.inject({
        method: 'GET',
        url: '/api/admin/audit',
        headers: { cookie: devCookie },
      });
      expect(auditRes.statusCode).toBe(403);
    });
  });

  // -------------------------------------------------------------------------
  // PHASE 4: Standard User Operations & Database Deletion Bug Verification
  // -------------------------------------------------------------------------
  describe('Phase 4: Standard User Operations & Deletion', () => {
    it('creates own database and sees strictly isolated list', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/databases',
        headers: { cookie: userCookie },
        payload: { name: `USR_DB_${runId}`, description: 'Standard user DB' },
      });
      expect(res.statusCode).toBe(201);
      userDbId = res.json().data.id;

      // User lists databases -> sees only their own database
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/admin/databases',
        headers: { cookie: userCookie },
      });
      expect(listRes.statusCode).toBe(200);
      const list = listRes.json().data;
      expect(list.some((d: any) => d.id === userDbId)).toBe(true);
      expect(list.some((d: any) => d.id === superAdminDbId)).toBe(false);
      expect(list.some((d: any) => d.id === devDbId)).toBe(false);
    });

    it('can perform table queries and invite members', async () => {
      // Create table
      const qRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${userDbId}/query`,
        headers: { cookie: userCookie },
        payload: { sql: 'CREATE TABLE notes (id INTEGER PRIMARY KEY, content TEXT);' },
      });
      expect(qRes.statusCode).toBe(200);

      // Invite developer as viewer
      const invRes = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${userDbId}/members`,
        headers: { cookie: userCookie },
        payload: { emailOrUsername: `exec_dev_${runId}`, role: 'viewer' },
      });
      expect(invRes.statusCode).toBe(201);
    });

    it('strictly forbids standard user from deleting databases belonging to other users', async () => {
      // User tries to delete Super Admin's DB -> 403 Forbidden
      const delSaRes = await app.inject({
        method: 'DELETE',
        url: `/api/admin/databases/${superAdminDbId}`,
        headers: { cookie: userCookie },
      });
      expect(delSaRes.statusCode).toBe(403);
      expect(delSaRes.json().error.code).toBe('FORBIDDEN');
    });

    it('allows standard user to delete their OWN database successfully', async () => {
      // User deletes userDbId -> 200 OK
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/admin/databases/${userDbId}`,
        headers: { cookie: userCookie },
      });
      expect(delRes.statusCode).toBe(200);
      expect(delRes.json().success).toBe(true);

      // Verify database is completely gone
      const verifyRes = await app.inject({
        method: 'GET',
        url: `/api/admin/databases/${userDbId}`,
        headers: { cookie: userCookie },
      });
      expect(verifyRes.statusCode).toBe(404);
    });

    it('allows developer to delete their OWN database successfully', async () => {
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/admin/databases/${devDbId}`,
        headers: { cookie: devCookie },
      });
      expect(delRes.statusCode).toBe(200);
      expect(delRes.json().success).toBe(true);
    });

    it('allows admin to delete their OWN database successfully', async () => {
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/admin/databases/${adminDbId}`,
        headers: { cookie: adminCookie },
      });
      expect(delRes.statusCode).toBe(200);
      expect(delRes.json().success).toBe(true);
    });

    it('allows super_admin to delete their OWN database successfully', async () => {
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/admin/databases/${superAdminDbId}`,
        headers: { cookie: superAdminCookie },
      });
      expect(delRes.statusCode).toBe(200);
      expect(delRes.json().success).toBe(true);
    });
  });
});
