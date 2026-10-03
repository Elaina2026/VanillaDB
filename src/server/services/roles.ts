import { getMetadataDb } from '../db/metadata.js';
import type { RoleRecord } from '../../../shared/index.js';

export class RolesService {
  public listRoles(): RoleRecord[] {
    const metaDb = getMetadataDb();
    const rows = metaDb.prepare('SELECT * FROM roles ORDER BY is_system DESC, created_at ASC').all() as any[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description || null,
      is_system: Boolean(r.is_system),
      permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions || '[]') : (r.permissions || []),
      max_storage_mb: r.max_storage_mb !== undefined && r.max_storage_mb !== null ? Number(r.max_storage_mb) : 500,
      max_databases: r.max_databases !== undefined && r.max_databases !== null ? Number(r.max_databases) : 5,
      rate_limit_per_minute: r.rate_limit_per_minute !== undefined && r.rate_limit_per_minute !== null ? Number(r.rate_limit_per_minute) : 180,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  }

  public getRole(id: string): RoleRecord | null {
    const metaDb = getMetadataDb();
    let r = metaDb.prepare('SELECT * FROM roles WHERE id = ?').get(id) as any;
    if (!r) {
      if (id === 'system_owner') r = metaDb.prepare('SELECT * FROM roles WHERE id = ?').get('super_admin') as any;
      else if (id === 'system_admin') r = metaDb.prepare('SELECT * FROM roles WHERE id = ?').get('admin') as any;
      else if (id === 'super_admin') r = metaDb.prepare('SELECT * FROM roles WHERE id = ?').get('system_owner') as any;
      else if (id === 'admin') r = metaDb.prepare('SELECT * FROM roles WHERE id = ?').get('system_admin') as any;
    }
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      description: r.description || null,
      is_system: Boolean(r.is_system),
      permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions || '[]') : (r.permissions || []),
      max_storage_mb: r.max_storage_mb !== undefined && r.max_storage_mb !== null ? Number(r.max_storage_mb) : 500,
      max_databases: r.max_databases !== undefined && r.max_databases !== null ? Number(r.max_databases) : 5,
      rate_limit_per_minute: r.rate_limit_per_minute !== undefined && r.rate_limit_per_minute !== null ? Number(r.rate_limit_per_minute) : 180,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  }

  public createRole(params: {
    id?: string;
    name: string;
    description?: string | null;
    permissions?: string[];
    max_storage_mb?: number | null;
    max_databases?: number | null;
    rate_limit_per_minute?: number | null;
  }): RoleRecord {
    const metaDb = getMetadataDb();
    const rawId = (params.id || params.name).toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_').slice(0, 50);
    const id = rawId || `role_${Date.now()}`;

    const existing = metaDb.prepare('SELECT id FROM roles WHERE id = ?').get(id);
    if (existing) {
      throw new Error(`Role "${id}" already exists`);
    }

    const now = Date.now();
    const permissionsJson = JSON.stringify(params.permissions || []);
    const maxStorageMb = params.max_storage_mb !== undefined && params.max_storage_mb !== null ? Number(params.max_storage_mb) : 500;
    const maxDatabases = params.max_databases !== undefined && params.max_databases !== null ? Number(params.max_databases) : 5;
    const rateLimit = params.rate_limit_per_minute !== undefined && params.rate_limit_per_minute !== null ? Number(params.rate_limit_per_minute) : 180;

    metaDb.prepare(`
      INSERT INTO roles (id, name, description, is_system, permissions, max_storage_mb, max_databases, rate_limit_per_minute, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.name.trim(),
      params.description ? params.description.trim() : null,
      permissionsJson,
      maxStorageMb,
      maxDatabases,
      rateLimit,
      now,
      now
    );

    return {
      id,
      name: params.name.trim(),
      description: params.description ? params.description.trim() : null,
      is_system: false,
      permissions: params.permissions || [],
      max_storage_mb: maxStorageMb,
      max_databases: maxDatabases,
      rate_limit_per_minute: rateLimit,
      created_at: now,
      updated_at: now,
    };
  }

  public updateRole(id: string, params: {
    name?: string;
    description?: string | null;
    permissions?: string[];
    max_storage_mb?: number | null;
    max_databases?: number | null;
    rate_limit_per_minute?: number | null;
  }): RoleRecord {
    const metaDb = getMetadataDb();
    const current = this.getRole(id);
    if (!current) {
      throw new Error(`Role "${id}" not found`);
    }

    const now = Date.now();
    const name = params.name !== undefined ? params.name.trim() : current.name;
    const description = params.description !== undefined ? (params.description ? params.description.trim() : null) : (current.description || null);
    const permissions = params.permissions !== undefined ? params.permissions : current.permissions;
    const maxStorageMb = params.max_storage_mb !== undefined ? (params.max_storage_mb !== null ? Number(params.max_storage_mb) : 0) : (current.max_storage_mb ?? 0);
    const maxDatabases = params.max_databases !== undefined ? (params.max_databases !== null ? Number(params.max_databases) : 0) : (current.max_databases ?? 0);
    const rateLimit = params.rate_limit_per_minute !== undefined ? (params.rate_limit_per_minute !== null ? Number(params.rate_limit_per_minute) : 0) : (current.rate_limit_per_minute ?? 0);

    metaDb.prepare(`
      UPDATE roles
      SET name = ?, description = ?, permissions = ?, max_storage_mb = ?, max_databases = ?, rate_limit_per_minute = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name,
      description,
      JSON.stringify(permissions),
      maxStorageMb,
      maxDatabases,
      rateLimit,
      now,
      id
    );

    return {
      ...current,
      name,
      description,
      permissions,
      max_storage_mb: maxStorageMb,
      max_databases: maxDatabases,
      rate_limit_per_minute: rateLimit,
      updated_at: now,
    };
  }

  public hasPermission(roleId: string, permission: string): boolean {
    const role = this.getRole(roleId);
    if (!role) return false;
    if (role.permissions.includes('*')) return true;
    return role.permissions.includes(permission);
  }

  public deleteRole(id: string): boolean {
    const metaDb = getMetadataDb();
    const role = this.getRole(id);
    if (!role) {
      throw new Error(`Role "${id}" not found`);
    }
    if (role.is_system || ['system_owner', 'system_admin', 'super_admin', 'admin', 'developer', 'user'].includes(id)) {
      throw new Error(`System role "${id}" cannot be deleted`);
    }

    const usersCount = metaDb.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get(id) as { count: number };
    if (usersCount.count > 0) {
      throw new Error(`Cannot delete role "${id}": it is currently assigned to ${usersCount.count} user(s)`);
    }

    metaDb.prepare('DELETE FROM roles WHERE id = ?').run(id);
    return true;
  }
}

export const rolesService = new RolesService();
