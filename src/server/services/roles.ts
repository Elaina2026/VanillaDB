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
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  }

  public getRole(id: string): RoleRecord | null {
    const metaDb = getMetadataDb();
    const r = metaDb.prepare('SELECT * FROM roles WHERE id = ?').get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      description: r.description || null,
      is_system: Boolean(r.is_system),
      permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions || '[]') : (r.permissions || []),
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  }

  public createRole(params: {
    id?: string;
    name: string;
    description?: string | null;
    permissions?: string[];
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

    metaDb.prepare(`
      INSERT INTO roles (id, name, description, is_system, permissions, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, ?, ?)
    `).run(
      id,
      params.name.trim(),
      params.description ? params.description.trim() : null,
      permissionsJson,
      now,
      now
    );

    return {
      id,
      name: params.name.trim(),
      description: params.description ? params.description.trim() : null,
      is_system: false,
      permissions: params.permissions || [],
      created_at: now,
      updated_at: now,
    };
  }

  public deleteRole(id: string): boolean {
    const metaDb = getMetadataDb();
    const role = this.getRole(id);
    if (!role) {
      throw new Error(`Role "${id}" not found`);
    }
    if (role.is_system || ['super_admin', 'admin', 'developer', 'user'].includes(id)) {
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
