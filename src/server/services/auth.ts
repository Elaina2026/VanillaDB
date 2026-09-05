import argon2 from 'argon2';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { getMetadataDb } from '../db/metadata.js';
import { systemService } from './system.js';
import type { UserRecord, UserRole } from '../../../shared/index.js';

export interface SessionUser {
  userId: string;
  username: string;
  role: UserRole;
}

export class AuthService {
  public async hashPassword(password: string): Promise<string> {
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  public async verifyPassword(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  public hasAdminUser(): boolean {
    const metaDb = getMetadataDb();
    const row = metaDb.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    return row.count > 0;
  }

  public async createAdminUser(
    username: string,
    password: string,
    role: UserRole = 'super_admin',
    maxDatabases: number = 1000,
    rateLimitPerMinute: number = 0,
    email?: string,
    avatarUrl?: string
  ): Promise<UserRecord> {
    const metaDb = getMetadataDb();
    const existing = metaDb.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      throw new Error(`Username "${username}" already exists`);
    }
    if (email) {
      const existingEmail = metaDb.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existingEmail) {
        throw new Error(`Email "${email}" already exists`);
      }
    }

    const id = `usr_${nanoid(16)}`;
    const hash = await this.hashPassword(password);
    const now = Date.now();

    metaDb.prepare(`
      INSERT INTO users (id, username, email, avatar_url, password_hash, role, max_databases, rate_limit_per_minute, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(id, username, email || null, avatarUrl || null, hash, role, maxDatabases, rateLimitPerMinute, now, now);

    return {
      id,
      username,
      email: email || null,
      avatar_url: avatarUrl || null,
      role,
      max_databases: maxDatabases,
      rate_limit_per_minute: rateLimitPerMinute,
      status: 'active',
      totp_enabled: false,
      created_at: now,
      updated_at: now,
    };
  }

  public async createUser(data: {
    username: string;
    password: string;
    email?: string;
    avatarUrl?: string;
    role?: UserRole;
    maxDatabases?: number;
    rateLimitPerMinute?: number;
  }): Promise<UserRecord> {
    const role = data.role || 'user';
    const settings = systemService.getSettings();
    const defaultMaxDb = settings.default_user_max_databases ?? 2;
    const defaultRateLimit = settings.default_user_rate_limit ?? 180;
    const maxDatabases = data.maxDatabases !== undefined ? data.maxDatabases : defaultMaxDb;
    const rateLimit = data.rateLimitPerMinute !== undefined ? data.rateLimitPerMinute : defaultRateLimit;
    return this.createAdminUser(data.username, data.password, role, maxDatabases, rateLimit, data.email, data.avatarUrl);
  }

  public listUsers(): UserRecord[] {
    const metaDb = getMetadataDb();
    const users = metaDb.prepare(`
      SELECT u.id, u.username, u.email, u.avatar_url, u.role, u.max_databases, u.rate_limit_per_minute, u.status, u.totp_enabled, u.created_at, u.updated_at,
             (SELECT COUNT(*) FROM databases d WHERE d.owner_id = u.id) as database_count
      FROM users u
      ORDER BY u.created_at ASC
    `).all() as any[];

    return users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email || null,
      avatar_url: u.avatar_url || null,
      role: (u.role as UserRole) || 'user',
      max_databases: u.max_databases ?? 5,
      rate_limit_per_minute: u.rate_limit_per_minute ?? 60,
      status: u.status || 'active',
      totp_enabled: Boolean(u.totp_enabled),
      database_count: Number(u.database_count || 0),
      created_at: u.created_at,
      updated_at: u.updated_at,
    }));
  }

  public getUserById(userId: string): UserRecord | null {
    const metaDb = getMetadataDb();
    const u = metaDb.prepare(`
      SELECT u.id, u.username, u.email, u.avatar_url, u.role, u.max_databases, u.rate_limit_per_minute, u.status, u.totp_enabled, u.created_at, u.updated_at,
             (SELECT COUNT(*) FROM databases d WHERE d.owner_id = u.id) as database_count
      FROM users u
      WHERE u.id = ?
    `).get(userId) as any;

    if (!u) return null;
    return {
      id: u.id,
      username: u.username,
      email: u.email || null,
      avatar_url: u.avatar_url || null,
      role: (u.role as UserRole) || 'user',
      max_databases: u.max_databases ?? 5,
      rate_limit_per_minute: u.rate_limit_per_minute ?? 60,
      status: u.status || 'active',
      totp_enabled: Boolean(u.totp_enabled),
      database_count: Number(u.database_count || 0),
      created_at: u.created_at,
      updated_at: u.updated_at,
    };
  }

  public getTotpSecretInternal(userId: string): { totp_secret?: string; totp_temp_secret?: string } | null {
    const metaDb = getMetadataDb();
    const row = metaDb.prepare('SELECT totp_secret, totp_temp_secret FROM users WHERE id = ?').get(userId) as any;
    if (!row) return null;
    return {
      totp_secret: row.totp_secret || undefined,
      totp_temp_secret: row.totp_temp_secret || undefined,
    };
  }

  public async updateUser(
    userId: string,
    updates: {
      email?: string | null;
      avatarUrl?: string | null;
      password?: string;
      role?: UserRole;
      maxDatabases?: number;
      rateLimitPerMinute?: number;
      status?: 'active' | 'disabled';
    }
  ): Promise<UserRecord> {
    const metaDb = getMetadataDb();
    const existing = this.getUserById(userId);
    if (!existing) throw new Error(`User not found: ${userId}`);

    const now = Date.now();
    let hash: string | null = null;
    if (updates.password && updates.password.trim()) {
      hash = await this.hashPassword(updates.password.trim());
    }

    if (updates.email && updates.email !== existing.email) {
      const emailConflict = metaDb.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(updates.email, userId);
      if (emailConflict) {
        throw new Error(`Email "${updates.email}" is already taken`);
      }
    }

    const email = (updates.email !== undefined ? updates.email : existing.email) ?? null;
    const avatarUrl = (updates.avatarUrl !== undefined ? updates.avatarUrl : existing.avatar_url) ?? null;
    const role = updates.role || existing.role;
    const maxDatabases = updates.maxDatabases !== undefined ? updates.maxDatabases : existing.max_databases;
    const rateLimit = updates.rateLimitPerMinute !== undefined ? updates.rateLimitPerMinute : existing.rate_limit_per_minute;
    const status = updates.status || existing.status;

    if (hash) {
      metaDb.prepare(`
        UPDATE users
        SET email = ?, avatar_url = ?, password_hash = ?, role = ?, max_databases = ?, rate_limit_per_minute = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(email, avatarUrl, hash, role, maxDatabases, rateLimit, status, now, userId);
    } else {
      metaDb.prepare(`
        UPDATE users
        SET email = ?, avatar_url = ?, role = ?, max_databases = ?, rate_limit_per_minute = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(email, avatarUrl, role, maxDatabases, rateLimit, status, now, userId);
    }

    return this.getUserById(userId)!;
  }

  public deleteUser(userId: string): boolean {
    const metaDb = getMetadataDb();
    const user = this.getUserById(userId);
    if (!user) throw new Error(`User not found: ${userId}`);

    // Prevent deleting the last super admin
    if (user.role === 'super_admin') {
      const superAdminCount = metaDb.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'super_admin'").get() as { count: number };
      if (superAdminCount.count <= 1) {
        throw new Error('Cannot delete the only Super Administrator account');
      }
    }

    metaDb.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return true;
  }

  public async validateUser(usernameOrEmail: string, password: string): Promise<UserRecord | null> {
    const metaDb = getMetadataDb();
    const cleanIdentifier = usernameOrEmail.trim();
    const cleanLower = cleanIdentifier.toLowerCase();
    const row = metaDb.prepare(`
      SELECT id, username, email, avatar_url, password_hash, role, max_databases, rate_limit_per_minute, status, totp_enabled, created_at, updated_at
      FROM users
      WHERE username = ? OR email = ? OR LOWER(email) = ? OR LOWER(username) = ?
    `).get(cleanIdentifier, cleanIdentifier, cleanLower, cleanLower) as
      | { id: string; username: string; email?: string | null; avatar_url?: string | null; password_hash: string; role?: string; max_databases?: number; rate_limit_per_minute?: number; status?: string; totp_enabled?: number; created_at: number; updated_at: number }
      | undefined;

    if (!row) return null;
    if (row.status === 'disabled') return null;

    const isValid = await this.verifyPassword(row.password_hash, password);
    if (!isValid) return null;

    return {
      id: row.id,
      username: row.username,
      email: row.email || null,
      avatar_url: row.avatar_url || null,
      role: (row.role as UserRole) || 'user',
      max_databases: row.max_databases ?? 5,
      rate_limit_per_minute: row.rate_limit_per_minute ?? 60,
      status: (row.status as any) || 'active',
      totp_enabled: Boolean(row.totp_enabled),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  public createSessionSignature(userId: string, username: string, role: string, expiresAt: number, secret: string): string {
    const payload = `${userId}:${username}:${role}:${expiresAt}`;
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  public verifySessionCookie(cookieValue: string, secret: string): SessionUser | null {
    try {
      const parts = cookieValue.split('.');
      if (parts.length === 4) {
        // Old 4-part cookie fallback [userId, username, expiresAt, signature]
        const [userId, username, expiresAtStr, signature] = parts;
        const expiresAt = parseInt(expiresAtStr, 10);
        if (isNaN(expiresAt) || Date.now() > expiresAt) return null;

        const expectedSignature = crypto.createHmac('sha256', secret).update(`${userId}:${username}:${expiresAt}`).digest('hex');
        if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
          const user = this.getUserById(userId);
          return { userId, username, role: user?.role || 'super_admin' };
        }
        return null;
      }

      if (parts.length !== 5) return null;
      const [userId, username, role, expiresAtStr, signature] = parts;
      const expiresAt = parseInt(expiresAtStr, 10);
      if (isNaN(expiresAt) || Date.now() > expiresAt) return null;

      const expectedSignature = this.createSessionSignature(userId, username, role, expiresAt, secret);
      if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return { userId, username, role: role as UserRole };
      }
      return null;
    } catch {
      return null;
    }
  }

  public async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    const metaDb = getMetadataDb();
    const row = metaDb.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined;
    if (!row) {
      throw new Error('User not found');
    }

    const isValid = await this.verifyPassword(row.password_hash, currentPassword);
    if (!isValid) {
      throw new Error('Mật khẩu hiện tại không chính xác');
    }

    const newHash = await this.hashPassword(newPassword);
    metaDb.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, Date.now(), userId);
    return true;
  }

  public generateSessionCookie(user: UserRecord, secret: string): { cookieValue: string; expires: Date } {
    const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
    const expiresAt = Date.now() + maxAgeMs;
    const role = user.role || 'user';
    const signature = this.createSessionSignature(user.id, user.username, role, expiresAt, secret);
    const cookieValue = `${user.id}.${user.username}.${role}.${expiresAt}.${signature}`;
    return {
      cookieValue,
      expires: new Date(expiresAt),
    };
  }

  public createTemp2faChallenge(userId: string, secret: string): string {
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity
    const sig = crypto.createHmac('sha256', secret).update(`2fa:${userId}:${expiresAt}`).digest('hex');
    return `${userId}.${expiresAt}.${sig}`;
  }

  public verifyTemp2faChallenge(token: string, secret: string): string | null {
    try {
      const [userId, expiresAtStr, sig] = token.split('.');
      const expiresAt = parseInt(expiresAtStr, 10);
      if (isNaN(expiresAt) || Date.now() > expiresAt) return null;

      const expected = crypto.createHmac('sha256', secret).update(`2fa:${userId}:${expiresAt}`).digest('hex');
      if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        return userId;
      }
      return null;
    } catch {
      return null;
    }
  }
}

export const authService = new AuthService();
