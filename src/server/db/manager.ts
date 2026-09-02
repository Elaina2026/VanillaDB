import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getMetadataDb } from './metadata.js';
import { serializeSqlRow, deserializeSqlParam } from '../utils/serialize.js';
import { encryptBuffer, decryptBuffer, deriveKeyFromString } from '../utils/crypto.js';
import crypto from 'crypto';
import type { SqlQueryResult, SqlWriteResult, TableSchemaDetail, TableColumnInfo, TableIndexInfo, TableForeignKeyInfo, TableTriggerInfo } from '../../../shared/index.js';

interface CachedHandle {
  db: DatabaseSync;
  resolvedPath: string;
  maxSizeMb?: number | null;
  lastQuotaCheck?: number;
  lastUsed: number;
}

export class DatabaseManager {
  private handles: Map<string, CachedHandle> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly IDLE_TIMEOUT_MS = 5 * 60 * 1000;
  private readonly QUOTA_CHECK_INTERVAL_MS = 2 * 1000; // Throttle statSync to at most once per 2s per DB

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanupIdleHandles(), 60 * 1000);
  }

  public resolveDatabasePath(databaseId: string): string {
    const cached = this.handles.get(databaseId);
    if (cached?.resolvedPath) return cached.resolvedPath;

    const metaDb = getMetadataDb();
    const row = metaDb.prepare('SELECT filename FROM databases WHERE id = ?').get(databaseId) as { filename: string } | undefined;
    if (!row || !row.filename) {
      throw new Error(`Database not found: ${databaseId}`);
    }

    const safeFilename = path.basename(row.filename);
    const resolvedPath = path.resolve(config.databasesDir, safeFilename);

    if (!resolvedPath.startsWith(path.resolve(config.databasesDir))) {
      throw new Error('Security Error: Path traversal attempt detected');
    }

    return resolvedPath;
  }

  public get(databaseId: string): DatabaseSync {
    const cached = this.handles.get(databaseId);
    if (cached) {
      cached.lastUsed = Date.now();
      // Re-insert to maintain LRU order in Map
      this.handles.delete(databaseId);
      this.handles.set(databaseId, cached);
      return cached.db;
    }

    // Enforce LRU Max Open Handles limit
    if (this.handles.size >= (config.maxOpenHandles || 100)) {
      const oldestKey = this.handles.keys().next().value;
      if (oldestKey) {
        this.close(oldestKey);
      }
    }

    const dbPath = this.resolveDatabasePath(databaseId);
    const db = new DatabaseSync(dbPath);

    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = ${config.sqlBusyTimeoutMs};
      PRAGMA synchronous = NORMAL;
    `);

    // Register Vector Math Custom Functions for AI / RAG Embeddings
    try {
      (db as any).function?.('vec_cosine_distance', (aStr: any, bStr: any) => {
        if (!aStr || !bStr) return 1.0;
        try {
          const a = typeof aStr === 'string' ? JSON.parse(aStr) : aStr;
          const b = typeof bStr === 'string' ? JSON.parse(bStr) : bStr;
          if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
            return 1.0;
          }
          let dotProduct = 0;
          let normA = 0;
          let normB = 0;
          for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
          }
          if (normA === 0 || normB === 0) return 1.0;
          const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
          return 1.0 - similarity; // 0 = identical, 2 = opposite
        } catch {
          return 1.0;
        }
      });

      (db as any).function?.('vec_cosine_similarity', (aStr: any, bStr: any) => {
        if (!aStr || !bStr) return 0.0;
        try {
          const a = typeof aStr === 'string' ? JSON.parse(aStr) : aStr;
          const b = typeof bStr === 'string' ? JSON.parse(bStr) : bStr;
          if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
            return 0.0;
          }
          let dotProduct = 0;
          let normA = 0;
          let normB = 0;
          for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
          }
          if (normA === 0 || normB === 0) return 0.0;
          return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
        } catch {
          return 0.0;
        }
      });

      // At-Rest & In-Flight SQL Column/Field Encryption Functions (AES-256-GCM)
      (db as any).function?.('encrypt_aes', (data: any, customKey?: any) => {
        if (data === null || data === undefined || data === '') return null;
        try {
          const key = customKey ? deriveKeyFromString(String(customKey)) : (config.derivedEncryptionKey as Buffer);
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf-8');
          const encrypted = encryptBuffer(buf, key);
          return encrypted.toString('hex');
        } catch {
          return null;
        }
      });

      (db as any).function?.('decrypt_aes', (hexCipher: any, customKey?: any) => {
        if (hexCipher === null || hexCipher === undefined || hexCipher === '') return null;
        try {
          const key = customKey ? deriveKeyFromString(String(customKey)) : (config.derivedEncryptionKey as Buffer);
          const buf = Buffer.from(String(hexCipher), 'hex');
          const decrypted = decryptBuffer(buf, key);
          return decrypted.toString('utf-8');
        } catch {
          return null;
        }
      });

      (db as any).function?.('hash_sha256', (data: any) => {
        if (data === null || data === undefined) return null;
        return crypto.createHash('sha256').update(String(data)).digest('hex');
      });

      (db as any).function?.('hash_hmac', (data: any, secret: any) => {
        if (data === null || data === undefined || !secret) return null;
        return crypto.createHmac('sha256', String(secret)).update(String(data)).digest('hex');
      });
    } catch {
      // Ignore function registration if not supported in runtime
    }

    // Fetch max_size_mb for quota caching
    let maxSizeMb: number | null = null;
    try {
      const metaRow = getMetadataDb().prepare('SELECT max_size_mb FROM databases WHERE id = ?').get(databaseId) as { max_size_mb: number | null } | undefined;
      maxSizeMb = metaRow?.max_size_mb ?? null;
    } catch {}

    this.handles.set(databaseId, {
      db,
      resolvedPath: dbPath,
      maxSizeMb,
      lastQuotaCheck: 0,
      lastUsed: Date.now(),
    });

    try {
      getMetadataDb().prepare('UPDATE databases SET last_accessed_at = ? WHERE id = ?').run(Date.now(), databaseId);
    } catch {
      // Ignore metadata update error
    }

    return db;
  }

  public close(databaseId: string): void {
    const cached = this.handles.get(databaseId);
    if (cached) {
      try {
        cached.db.exec('PRAGMA wal_checkpoint(PASSIVE);');
        cached.db.close();
      } catch (err) {
        logger.warn({ err, databaseId }, 'Error closing SQLite handle');
      }
      this.handles.delete(databaseId);
    }
  }

  public closeAll(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    for (const [id, cached] of this.handles.entries()) {
      try {
        cached.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        cached.db.close();
      } catch (err) {
        logger.warn({ err, id }, 'Error closing SQLite handle during shutdown');
      }
    }
    this.handles.clear();
  }

  private cleanupIdleHandles(): void {
    const now = Date.now();
    for (const [id, cached] of this.handles.entries()) {
      if (now - cached.lastUsed > this.IDLE_TIMEOUT_MS) {
        this.close(id);
      }
    }
  }

  public executeSql(
    databaseId: string,
    sqlText: string,
    paramsInput?: any[] | Record<string, any>,
    options?: { readonly?: boolean; allowedTables?: string[] | null; deniedTables?: string[] | null }
  ): SqlQueryResult | SqlWriteResult {
    this.validateSqlSafety(sqlText, options);

    const db = this.get(databaseId);
    const trimmed = sqlText.trim();
    const startTime = performance.now();

    // Accurately distinguish read vs write, including mutating CTEs (WITH ... INSERT/UPDATE/DELETE)
    const isMutatingCte = /^WITH\b/i.test(trimmed) && /\b(INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|REPLACE\s+INTO)\b/i.test(trimmed);
    const isSelect = (/^(SELECT|EXPLAIN|PRAGMA)\b/i.test(trimmed) || /^WITH\b/i.test(trimmed)) && !isMutatingCte;

    let params: any[] | Record<string, any> = [];
    if (Array.isArray(paramsInput)) {
      params = paramsInput.map(deserializeSqlParam);
    } else if (paramsInput && typeof paramsInput === 'object') {
      const obj: Record<string, any> = {};
      for (const [k, v] of Object.entries(paramsInput)) {
        obj[k] = deserializeSqlParam(v);
      }
      params = obj;
    }

    try {
      if (isSelect) {
        const stmt = db.prepare(trimmed);
        let rawRows: any[] = [];
        if (Array.isArray(params)) {
          rawRows = stmt.all(...params) as any[];
        } else {
          rawRows = stmt.all(params as any) as any[];
        }

        const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
        const rows = rawRows.map(serializeSqlRow);
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

        return {
          columns,
          rows,
          rowCount: rows.length,
          durationMs,
        };
      } else {
        if (options?.readonly) {
          throw new Error('Database write operation not permitted with read-only permissions');
        }

        this.checkDiskQuota(databaseId);

        const stmt = db.prepare(trimmed);
        let result: { changes: number | bigint; lastInsertRowid: number | bigint };
        if (Array.isArray(params)) {
          result = stmt.run(...params);
        } else {
          result = stmt.run(params as any);
        }

        const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
        return {
          changes: Number(result.changes),
          lastInsertRowid: typeof result.lastInsertRowid === 'bigint' ? result.lastInsertRowid.toString() : result.lastInsertRowid,
          durationMs,
        };
      }
    } catch (err: any) {
      throw this.transformSqliteError(err);
    }
  }

  public executeMultiStatements(databaseId: string, sqlScript: string): { changes: number; durationMs: number } {
    const db = this.get(databaseId);
    this.validateSqlSafety(sqlScript);

    // If script contains write actions, enforce disk quota
    if (!/^\s*(SELECT|WITH|EXPLAIN|PRAGMA)\b/i.test(sqlScript.trim())) {
      this.checkDiskQuota(databaseId);
    }

    const startTime = performance.now();
    try {
      db.exec(sqlScript);
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      return { changes: 1, durationMs };
    } catch (err: any) {
      throw this.transformSqliteError(err);
    }
  }

  public executeBatch(
    databaseId: string,
    statements: Array<{ sql: string; params?: any[] | Record<string, any> }>,
    inTransaction = true,
    options?: { readonly?: boolean; allowedTables?: string[] | null; deniedTables?: string[] | null }
  ): { results: Array<{ statementIndex: number; result?: any; error?: string }>; totalDurationMs: number } {
    const db = this.get(databaseId);
    const startTime = performance.now();
    const results: Array<{ statementIndex: number; result?: any; error?: string }> = [];

    if (inTransaction) {
      db.exec('BEGIN TRANSACTION;');
      try {
        for (let i = 0; i < statements.length; i++) {
          const stmt = statements[i];
          const res = this.executeSql(databaseId, stmt.sql, stmt.params, options);
          results.push({ statementIndex: i, result: res });
        }
        db.exec('COMMIT;');
      } catch (err: any) {
        try {
          db.exec('ROLLBACK;');
        } catch {
          // Ignore rollback error
        }
        throw this.transformSqliteError(err);
      }
    } else {
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        try {
          const res = this.executeSql(databaseId, stmt.sql, stmt.params, options);
          results.push({ statementIndex: i, result: res });
        } catch (err: any) {
          results.push({ statementIndex: i, error: err.message || String(err) });
        }
      }
    }

    const totalDurationMs = Math.round((performance.now() - startTime) * 100) / 100;
    return { results, totalDurationMs };
  }

  public updateCachedQuota(databaseId: string, maxSizeMb: number | null): void {
    const cached = this.handles.get(databaseId);
    if (cached) {
      cached.maxSizeMb = maxSizeMb;
      cached.lastQuotaCheck = 0;
    }
  }

  public checkDiskQuota(databaseId: string, force = false): void {
    const cached = this.handles.get(databaseId);
    const now = Date.now();

    if (!force && cached && cached.lastQuotaCheck && (now - cached.lastQuotaCheck < this.QUOTA_CHECK_INTERVAL_MS)) {
      return;
    }

    let maxSizeMb = cached?.maxSizeMb;
    let dbPath = cached?.resolvedPath;

    if (maxSizeMb === undefined || !dbPath) {
      const metaDb = getMetadataDb();
      const row = metaDb.prepare('SELECT filename, max_size_mb FROM databases WHERE id = ?').get(databaseId) as { filename: string; max_size_mb: number | null } | undefined;
      if (!row || !row.max_size_mb || row.max_size_mb <= 0) {
        if (cached) {
          cached.maxSizeMb = null;
          cached.lastQuotaCheck = now;
        }
        return;
      }
      maxSizeMb = row.max_size_mb;
      dbPath = this.resolveDatabasePath(databaseId);
      if (cached) {
        cached.maxSizeMb = maxSizeMb;
        cached.resolvedPath = dbPath;
      }
    }

    if (!maxSizeMb || maxSizeMb <= 0) {
      if (cached) cached.lastQuotaCheck = now;
      return;
    }

    try {
      const walPath = `${dbPath}-wal`;
      let totalBytes = 0;
      if (fs.existsSync(dbPath)) totalBytes += fs.statSync(dbPath).size;
      if (fs.existsSync(walPath)) totalBytes += fs.statSync(walPath).size;

      if (cached) cached.lastQuotaCheck = now;

      const maxBytes = maxSizeMb * 1024 * 1024;
      if (totalBytes >= maxBytes) {
        const currentMb = (totalBytes / (1024 * 1024)).toFixed(2);
        const err: any = new Error(`Database disk quota exceeded. Current size: ${currentMb}MB, Max allowed: ${maxSizeMb}MB.`);
        err.code = 'DISK_QUOTA_EXCEEDED';
        err.statusCode = 413;
        throw err;
      }
    } catch (e: any) {
      if (e.code === 'DISK_QUOTA_EXCEEDED') throw e;
    }
  }

  public validateSqlSafety(sql: string, options?: { readonly?: boolean; allowedTables?: string[] | null; deniedTables?: string[] | null }): void {
    // Strip SQL comments to prevent comment-based filter evasion (/* ... */ and -- ...)
    const stripped = sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\r\n]*/g, ' ');

    if (/\bATTACH(\s+DATABASE)?\b/i.test(stripped)) {
      throw new Error('ATTACH DATABASE is forbidden for security reasons.');
    }
    if (/\bDETACH(\s+DATABASE)?\b/i.test(stripped)) {
      throw new Error('DETACH DATABASE is forbidden for security reasons.');
    }
    if (/\bVACUUM\s+INTO\b/i.test(stripped)) {
      throw new Error('VACUUM INTO is forbidden for security reasons.');
    }
    if (/\bload_extension\b/i.test(stripped)) {
      throw new Error('load_extension() is disabled for security reasons.');
    }
    if (/\bwritable_schema\b/i.test(stripped)) {
      throw new Error('PRAGMA writable_schema is forbidden for security reasons.');
    }

    if (/\bPRAGMA\b/i.test(stripped)) {
      const pragmaMatches = stripped.matchAll(/\bPRAGMA\s+([a-zA-Z0-9_]+)/gi);
      const safePragmas = [
        'table_info',
        'table_xinfo',
        'index_list',
        'index_info',
        'index_xinfo',
        'foreign_key_list',
        'database_list',
        'journal_mode',
        'page_count',
        'page_size',
        'freelist_count',
        'quick_check',
        'integrity_check',
        'user_version',
        'schema_version',
        'busy_timeout',
        'synchronous',
        'wal_checkpoint',
        'optimize',
      ];
      for (const match of pragmaMatches) {
        const pragmaName = match[1].toLowerCase();
        if (!safePragmas.includes(pragmaName)) {
          throw new Error(`PRAGMA ${pragmaName} is not permitted through this API.`);
        }
      }
    }

    if (options?.deniedTables && options.deniedTables.length > 0) {
      for (const table of options.deniedTables) {
        const regex = new RegExp(`\\b${table}\\b`, 'i');
        if (regex.test(stripped)) {
          throw new Error(`Access to table "${table}" is denied for this token.`);
        }
      }
    }
  }

  public getTableInfo(databaseId: string, tableName: string): { exists: boolean; pkCol: string; columns: TableColumnInfo[] } | null {
    const db = this.get(databaseId);
    const tableRow = db.prepare(`SELECT name FROM sqlite_schema WHERE type IN ('table', 'view') AND (name = ? OR LOWER(name) = LOWER(?)) LIMIT 1`).get(tableName, tableName) as { name: string } | undefined;
    if (!tableRow) return null;

    const actualName = tableRow.name;
    const cols = db.prepare(`PRAGMA table_info("${actualName.replace(/"/g, '""')}")`).all() as unknown as TableColumnInfo[];
    const pkCol = cols.find(c => c.pk === 1)?.name || cols.find(c => c.name.toLowerCase() === 'id')?.name || 'rowid';

    return {
      exists: true,
      pkCol,
      columns: cols,
    };
  }

  public getSchema(databaseId: string, includeRowCounts = false): TableSchemaDetail[] {
    const db = this.get(databaseId);
    const schemaObjects = db.prepare(`
      SELECT type, name, tbl_name, sql
      FROM sqlite_schema
      WHERE name NOT LIKE 'sqlite_%'
      ORDER BY type, name
    `).all() as Array<{ type: string; name: string; tbl_name: string; sql: string | null }>;

    const tables = schemaObjects.filter(o => o.type === 'table');
    const views = schemaObjects.filter(o => o.type === 'view');
    const triggers = schemaObjects.filter(o => o.type === 'trigger');

    const result: TableSchemaDetail[] = [];

    for (const item of [...tables, ...views]) {
      const isView = item.type === 'view';
      const cleanItemName = item.name.replace(/"/g, '""');
      const cols = db.prepare(`PRAGMA table_info("${cleanItemName}")`).all() as unknown as TableColumnInfo[];
      const indexes = isView ? [] : (db.prepare(`PRAGMA index_list("${cleanItemName}")`).all() as any[]);
      const fks = isView ? [] : (db.prepare(`PRAGMA foreign_key_list("${cleanItemName}")`).all() as unknown as TableForeignKeyInfo[]);

      const detailedIndexes: TableIndexInfo[] = indexes.map((idx: any) => {
        const idxCols = db.prepare(`PRAGMA index_info("${String(idx.name).replace(/"/g, '""')}")`).all() as Array<{ name: string }>;
        return {
          seq: idx.seq,
          name: idx.name,
          unique: idx.unique,
          origin: idx.origin,
          partial: idx.partial,
          columns: idxCols.map(c => c.name),
        };
      });

      const tableTriggers: TableTriggerInfo[] = triggers
        .filter(t => t.tbl_name === item.name)
        .map(t => ({ name: t.name, tbl_name: t.tbl_name, sql: t.sql || '' }));

      let rowCountEstimate = 0;
      if (!isView && includeRowCounts) {
        try {
          const countRow = db.prepare(`SELECT COUNT(*) as count FROM "${cleanItemName}"`).get() as { count: number };
          rowCountEstimate = countRow.count;
        } catch {
          // Ignore table count error
        }
      }

      result.push({
        name: item.name,
        type: isView ? 'view' : 'table',
        sql: item.sql,
        columns: cols,
        indexes: detailedIndexes,
        foreignKeys: fks,
        triggers: tableTriggers,
        rowCountEstimate,
      });
    }

    return result;
  }

  public transformSqliteError(err: any): Error {
    const msg = err?.message || String(err);
    if (msg.includes('busy') || msg.includes('locked')) {
      const error: any = new Error('Database is currently busy. Retry the operation.');
      error.code = 'DATABASE_BUSY';
      error.statusCode = 503;
      return error;
    }
    if (msg.includes('UNIQUE constraint failed')) {
      const error: any = new Error(msg);
      error.code = 'SQLITE_CONSTRAINT_UNIQUE';
      error.statusCode = 409;
      return error;
    }
    if (msg.includes('FOREIGN KEY constraint failed')) {
      const error: any = new Error(msg);
      error.code = 'SQLITE_CONSTRAINT_FOREIGNKEY';
      error.statusCode = 400;
      return error;
    }
    return err;
  }
}

export const dbManager = new DatabaseManager();
