import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { getMetadataDb } from '../db/metadata.js';
import type { ApiTokenRecord, TokenPermission } from '../../../shared/index.js';

export class TokenService {
  private tokenCache: Map<string, { token: ApiTokenRecord; expiresAt: number }> = new Map();
  private lastUsedBuffer: Map<string, number> = new Map();
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.flushInterval = setInterval(() => this.flushLastUsed(), 10 * 1000);
  }

  public generateTokenSecret(type: 'live' | 'test' = 'live'): string {
    const randomHex = crypto.randomBytes(32).toString('hex');
    return `vdb_${type}_${randomHex}`;
  }

  public hashTokenSecret(secret: string): string {
    return crypto.createHash('sha256').update(secret).digest('hex');
  }

  public async createToken(params: {
    databaseId: string;
    name: string;
    description?: string | null;
    permissions: TokenPermission[];
    allowedTables?: string[] | null;
    deniedTables?: string[] | null;
    expiresInDays?: number | null;
    type?: 'live' | 'test';
  }): Promise<{ tokenRecord: ApiTokenRecord; plainSecret: string }> {
    const metaDb = getMetadataDb();
    const plainSecret = this.generateTokenSecret(params.type || 'live');
    const tokenHash = this.hashTokenSecret(plainSecret);
    const id = `tok_${nanoid(16)}`;
    const prefix = plainSecret.substring(0, 9);
    const lastChars = plainSecret.substring(plainSecret.length - 4);
    const now = Date.now();
    const expiresAt = params.expiresInDays && params.expiresInDays > 0 ? now + params.expiresInDays * 24 * 60 * 60 * 1000 : null;

    metaDb.prepare(`
      INSERT INTO api_tokens (
        id, database_id, name, description, token_prefix, token_last_chars, token_hash,
        permissions, allowed_tables, denied_tables, expires_at, created_at, last_used_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.databaseId,
      params.name,
      params.description || null,
      prefix,
      lastChars,
      tokenHash,
      JSON.stringify(params.permissions),
      params.allowedTables ? JSON.stringify(params.allowedTables) : null,
      params.deniedTables ? JSON.stringify(params.deniedTables) : null,
      expiresAt,
      now,
      null,
      null
    );

    const tokenRecord: ApiTokenRecord = {
      id,
      database_id: params.databaseId,
      name: params.name,
      description: params.description || null,
      token_prefix: prefix,
      token_last_chars: lastChars,
      permissions: params.permissions,
      allowed_tables: params.allowedTables || null,
      denied_tables: params.deniedTables || null,
      expires_at: expiresAt,
      created_at: now,
      last_used_at: null,
      revoked_at: null,
    };

    return { tokenRecord, plainSecret };
  }

  public validateToken(plainSecret: string, requiredDatabaseId: string): ApiTokenRecord | null {
    if (!plainSecret || !plainSecret.startsWith('vdb_')) return null;

    const tokenHash = this.hashTokenSecret(plainSecret);
    const cached = this.tokenCache.get(tokenHash);
    const now = Date.now();

    let record: ApiTokenRecord | null = null;

    if (cached && cached.expiresAt > now) {
      record = cached.token;
    } else {
      const metaDb = getMetadataDb();
      const row = metaDb.prepare(`
        SELECT id, database_id, name, description, token_prefix, token_last_chars,
               permissions, allowed_tables, denied_tables, expires_at, created_at, last_used_at, revoked_at
        FROM api_tokens
        WHERE token_hash = ?
      `).get(tokenHash) as any;

      if (!row) return null;

      record = {
        id: row.id,
        database_id: row.database_id,
        name: row.name,
        description: row.description,
        token_prefix: row.token_prefix,
        token_last_chars: row.token_last_chars,
        permissions: JSON.parse(row.permissions),
        allowed_tables: row.allowed_tables ? JSON.parse(row.allowed_tables) : null,
        denied_tables: row.denied_tables ? JSON.parse(row.denied_tables) : null,
        expires_at: row.expires_at,
        created_at: row.created_at,
        last_used_at: row.last_used_at,
        revoked_at: row.revoked_at,
      };

      this.tokenCache.set(tokenHash, { token: record, expiresAt: now + 30 * 1000 });
    }

    if (record.revoked_at !== null) return null;
    if (record.expires_at !== null && record.expires_at < now) return null;
    if (record.database_id !== requiredDatabaseId) return null;

    this.lastUsedBuffer.set(record.id, now);
    return record;
  }

  public listTokens(databaseId: string): ApiTokenRecord[] {
    const metaDb = getMetadataDb();
    const rows = metaDb.prepare(`
      SELECT id, database_id, name, description, token_prefix, token_last_chars,
             permissions, allowed_tables, denied_tables, expires_at, created_at, last_used_at, revoked_at
      FROM api_tokens
      WHERE database_id = ?
      ORDER BY created_at DESC
    `).all(databaseId) as any[];

    return rows.map(r => ({
      id: r.id,
      database_id: r.database_id,
      name: r.name,
      description: r.description,
      token_prefix: r.token_prefix,
      token_last_chars: r.token_last_chars,
      permissions: JSON.parse(r.permissions),
      allowed_tables: r.allowed_tables ? JSON.parse(r.allowed_tables) : null,
      denied_tables: r.denied_tables ? JSON.parse(r.denied_tables) : null,
      expires_at: r.expires_at,
      created_at: r.created_at,
      last_used_at: r.last_used_at,
      revoked_at: r.revoked_at,
    }));
  }

  public revokeToken(tokenId: string): boolean {
    const metaDb = getMetadataDb();
    const now = Date.now();
    const res = metaDb.prepare('UPDATE api_tokens SET revoked_at = ? WHERE id = ?').run(now, tokenId);
    this.tokenCache.clear();
    return res.changes > 0;
  }

  public deleteToken(tokenId: string): boolean {
    const metaDb = getMetadataDb();
    const res = metaDb.prepare('DELETE FROM api_tokens WHERE id = ?').run(tokenId);
    this.tokenCache.clear();
    return res.changes > 0;
  }

  private flushLastUsed(): void {
    if (this.lastUsedBuffer.size === 0) return;
    const metaDb = getMetadataDb();
    const entries = Array.from(this.lastUsedBuffer.entries());
    this.lastUsedBuffer.clear();

    const stmt = metaDb.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?');
    for (const [id, timestamp] of entries) {
      try {
        stmt.run(timestamp, id);
      } catch {
        // Ignore background metadata write error
      }
    }
  }

  public destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flushLastUsed();
  }
}

export const tokenService = new TokenService();
