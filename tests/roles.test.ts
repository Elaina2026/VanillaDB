import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/server/index.js';
import { rolesService } from '../src/server/services/roles.js';

describe('Roles and Quota Management Suite', () => {
  let app: any;
  let adminCookie: string;
  const runId = Date.now();
  const testRoleId = `qa_role_${runId}`;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Ensure super_admin session
    let setupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: `role_admin_${runId}`,
        password: 'AdminPassword123!',
        confirmPassword: 'AdminPassword123!',
      },
    });

    if (setupRes.statusCode === 201) {
      const cookie = setupRes.cookies.find((c: any) => c.name === 'vdb_session');
      adminCookie = `vdb_session=${cookie.value}`;
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
    }
  });

  afterAll(async () => {
    try {
      rolesService.deleteRole(testRoleId);
    } catch {}
    await app.close();
  });

  it('lists existing roles with quotas', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/roles',
      headers: { cookie: adminCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);

    const superAdmin = body.data.find((r: any) => r.id === 'system_owner' || r.id === 'super_admin');
    expect(superAdmin).toBeDefined();
    expect(superAdmin.name).toBe('Platform Owner');
    expect(superAdmin.max_storage_mb).toBe(0);
    expect(superAdmin.max_databases).toBe(0);
    expect(superAdmin.rate_limit_per_minute).toBe(0);

    const standardUser = body.data.find((r: any) => r.id === 'user');
    expect(standardUser).toBeDefined();
    expect(standardUser.max_storage_mb).toBeGreaterThanOrEqual(0);
    expect(standardUser.max_databases).toBeGreaterThanOrEqual(0);
  });

  it('creates custom role with disk quota, db count, rate limit, and permissions', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/roles',
      headers: { cookie: adminCookie },
      payload: {
        id: testRoleId,
        name: 'QA Tester',
        description: 'Quality assurance test role with specific quota',
        max_storage_mb: 250,
        max_databases: 3,
        rate_limit_per_minute: 120,
        permissions: ['databases:read', 'databases:query'],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(testRoleId);
    expect(body.data.max_storage_mb).toBe(250);
    expect(body.data.max_databases).toBe(3);
    expect(body.data.rate_limit_per_minute).toBe(120);
    expect(body.data.permissions).toEqual(['databases:read', 'databases:query']);
  });

  it('updates custom role quota and permissions', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/admin/roles/${testRoleId}`,
      headers: { cookie: adminCookie },
      payload: {
        name: 'QA Tester Senior',
        max_storage_mb: 1024,
        max_databases: 10,
        rate_limit_per_minute: 300,
        permissions: ['databases:read', 'databases:write', 'databases:query'],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('QA Tester Senior');
    expect(body.data.max_storage_mb).toBe(1024);
    expect(body.data.max_databases).toBe(10);
    expect(body.data.rate_limit_per_minute).toBe(300);
    expect(body.data.permissions).toContain('databases:write');
  });

  it('checks permissions via rolesService.hasPermission', () => {
    expect(rolesService.hasPermission('system_owner', 'any:permission')).toBe(true);
    expect(rolesService.hasPermission('super_admin', 'any:permission')).toBe(true);
    expect(rolesService.hasPermission(testRoleId, 'databases:query')).toBe(true);
    expect(rolesService.hasPermission(testRoleId, 'users:manage')).toBe(false);
  });

  it('deletes custom role', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/roles/${testRoleId}`,
      headers: { cookie: adminCookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    const fetched = rolesService.getRole(testRoleId);
    expect(fetched).toBeNull();
  });
});
