import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { config } from '../config/index.js';
import { getMetadataDb } from '../db/metadata.js';
import { dbManager } from '../db/manager.js';
import { logger } from '../utils/logger.js';
import { storageService } from './storage.js';
import type { DatabaseRecord, DatabaseOverviewStats, BackupRecord, DatabaseStorageStats, DatabaseMetricsStats } from '../../../shared/index.js';

export class DatabaseService {
  public createDatabase(name: string, description?: string | null, ownerId?: string | null, maxSizeMb?: number | null): DatabaseRecord {
    const metaDb = getMetadataDb();

    // Check user database quota if ownerId is specified
    if (ownerId) {
      const user = metaDb.prepare('SELECT role, max_databases FROM users WHERE id = ?').get(ownerId) as { role: string; max_databases: number } | undefined;
      if (user && user.role !== 'super_admin') {
        const countRow = metaDb.prepare('SELECT COUNT(*) as count FROM databases WHERE owner_id = ?').get(ownerId) as { count: number };
        if (countRow.count >= user.max_databases) {
          throw new Error(`Database creation limit reached. Max allowed databases for your account is ${user.max_databases}.`);
        }
      }
    }

    const id = `db_${nanoid(16)}`;
    let baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'db';
    let slug = baseSlug;

    // Check if slug exists to guarantee uniqueness
    const existingSlug = metaDb.prepare('SELECT id FROM databases WHERE slug = ?').get(slug);
    if (existingSlug) {
      slug = `${baseSlug}-${nanoid(6).toLowerCase()}`;
    }

    const filename = `${id}.sqlite`;
    const dbPath = path.resolve(config.databasesDir, filename);

    if (fs.existsSync(dbPath)) {
      throw new Error(`File already exists for database: ${filename}`);
    }

    const now = Date.now();
    metaDb.prepare(`
      INSERT INTO databases (id, name, slug, description, filename, max_size_mb, owner_id, created_at, updated_at, last_accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, slug, description || null, filename, maxSizeMb || null, ownerId || null, now, now, now);

    // Initialize the SQLite database file with WAL and Pragmas
    const db = dbManager.get(id);
    db.exec(`
      CREATE TABLE IF NOT EXISTS _vdb_meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      INSERT OR REPLACE INTO _vdb_meta (key, value) VALUES ('created_at', '${new Date().toISOString()}');
    `);

    return {
      id,
      name,
      slug,
      description: description || null,
      filename,
      max_size_mb: maxSizeMb || null,
      owner_id: ownerId || null,
      created_at: now,
      updated_at: now,
      last_accessed_at: now,
    };
  }

  public listDatabases(userId?: string, role?: string): DatabaseRecord[] {
    const metaDb = getMetadataDb();
    if (userId && role === 'user') {
      const rows = metaDb.prepare(`
        SELECT d.id, d.name, d.slug, d.description, d.filename, d.max_size_mb, d.owner_id, d.created_at, d.updated_at, d.last_accessed_at,
               u.username as owner_username,
               CASE
                 WHEN d.owner_id = ? THEN 'owner'
                 ELSE COALESCE(dm.role, 'viewer')
               END as access_role,
               CASE WHEN d.owner_id != ? THEN 1 ELSE 0 END as is_shared,
               (SELECT COUNT(*) FROM database_members WHERE database_id = d.id) as member_count
        FROM databases d
        LEFT JOIN users u ON d.owner_id = u.id
        LEFT JOIN database_members dm ON d.id = dm.database_id AND dm.user_id = ?
        WHERE d.owner_id = ? OR dm.user_id = ?
        ORDER BY d.created_at DESC
      `).all(userId, userId, userId, userId, userId) as any[];

      return rows.map(r => ({
        ...r,
        is_shared: Boolean(r.is_shared),
        access_role: r.access_role || 'viewer',
        member_count: Number(r.member_count || 0),
      }));
    }

    const rows = metaDb.prepare(`
      SELECT d.id, d.name, d.slug, d.description, d.filename, d.max_size_mb, d.owner_id, d.created_at, d.updated_at, d.last_accessed_at,
             u.username as owner_username,
             'owner' as access_role,
             0 as is_shared,
             (SELECT COUNT(*) FROM database_members WHERE database_id = d.id) as member_count
      FROM databases d
      LEFT JOIN users u ON d.owner_id = u.id
      ORDER BY d.created_at DESC
    `).all() as any[];

    return rows.map(r => ({
      ...r,
      is_shared: false,
      access_role: 'owner',
      member_count: Number(r.member_count || 0),
    }));
  }

  public getDatabase(databaseId: string): DatabaseRecord | null {
    const metaDb = getMetadataDb();
    const row = metaDb.prepare(`
      SELECT d.id, d.name, d.slug, d.description, d.filename, d.max_size_mb, d.owner_id, d.created_at, d.updated_at, d.last_accessed_at,
             u.username as owner_username
      FROM databases d
      LEFT JOIN users u ON d.owner_id = u.id
      WHERE d.id = ?
    `).get(databaseId) as any;
    return row || null;
  }

  public updateDatabase(databaseId: string, updates: { name?: string; description?: string | null; max_size_mb?: number | null }): DatabaseRecord {
    const metaDb = getMetadataDb();
    const current = this.getDatabase(databaseId);
    if (!current) throw new Error(`Database not found: ${databaseId}`);

    const name = updates.name !== undefined ? updates.name : current.name;
    const description = updates.description !== undefined ? updates.description : current.description;
    const maxSizeMb = updates.max_size_mb !== undefined ? updates.max_size_mb : current.max_size_mb;
    const now = Date.now();

    metaDb.prepare('UPDATE databases SET name = ?, description = ?, max_size_mb = ?, updated_at = ? WHERE id = ?').run(
      name,
      description,
      maxSizeMb || null,
      now,
      databaseId
    );

    return {
      ...current,
      name,
      description,
      max_size_mb: maxSizeMb || null,
      updated_at: now,
    };
  }

  public deleteDatabase(databaseId: string): boolean {
    const metaDb = getMetadataDb();
    const current = this.getDatabase(databaseId);
    if (!current) throw new Error(`Database not found: ${databaseId}`);

    // Close SQLite handle
    dbManager.close(databaseId);

    // Delete files: .sqlite, -wal, -shm
    const basePath = path.resolve(config.databasesDir, current.filename);
    const walPath = `${basePath}-wal`;
    const shmPath = `${basePath}-shm`;

    for (const f of [basePath, walPath, shmPath]) {
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch (err) {
          logger.warn({ err, file: f }, 'Failed to delete database file');
        }
      }
    }

    // Delete backups for this database
    const dbBackupsDir = path.resolve(config.backupsDir, databaseId);
    if (fs.existsSync(dbBackupsDir)) {
      try {
        fs.rmSync(dbBackupsDir, { recursive: true, force: true });
      } catch (err) {
        logger.warn({ err, dbBackupsDir }, 'Failed to delete database backups directory');
      }
    }

    // Delete media/file storage for this database
    storageService.deleteDatabaseFiles(databaseId);

    // Delete metadata
    metaDb.prepare('DELETE FROM databases WHERE id = ?').run(databaseId);
    return true;
  }

  public duplicateDatabase(sourceDatabaseId: string, newName: string): DatabaseRecord {
    const source = this.getDatabase(sourceDatabaseId);
    if (!source) throw new Error(`Source database not found: ${sourceDatabaseId}`);

    const newRecord = this.createDatabase(newName, `Duplicate of ${source.name}`);
    dbManager.close(newRecord.id);

    const sourcePath = dbManager.resolveDatabasePath(sourceDatabaseId);
    const targetPath = dbManager.resolveDatabasePath(newRecord.id);

    // Clean up newly created target WAL and SHM files to prevent WAL header salt mismatch
    const targetWal = `${targetPath}-wal`;
    const targetShm = `${targetPath}-shm`;
    if (fs.existsSync(targetWal)) fs.unlinkSync(targetWal);
    if (fs.existsSync(targetShm)) fs.unlinkSync(targetShm);

    // Checkpoint source database to ensure main .sqlite file is current
    const sourceDb = dbManager.get(sourceDatabaseId);
    try {
      sourceDb.exec('PRAGMA wal_checkpoint(FULL);');
    } catch {}

    fs.copyFileSync(sourcePath, targetPath);

    return newRecord;
  }

  public getDatabaseOverviewStats(databaseId: string): DatabaseOverviewStats {
    const dbRecord = this.getDatabase(databaseId);
    if (!dbRecord) throw new Error(`Database not found: ${databaseId}`);

    const db = dbManager.get(databaseId);
    const dbPath = dbManager.resolveDatabasePath(databaseId);

    let fileSizeBytes = 0;
    let walSizeBytes = 0;

    try {
      fileSizeBytes = fs.statSync(dbPath).size;
      const walPath = `${dbPath}-wal`;
      if (fs.existsSync(walPath)) {
        walSizeBytes = fs.statSync(walPath).size;
      }
    } catch {
      // Ignore stat error
    }

    const sqliteVersionRow = db.prepare('SELECT sqlite_version() as version').get() as { version: string };
    const pageCountRow = db.prepare('PRAGMA page_count').get() as { page_count: number };
    const pageSizeRow = db.prepare('PRAGMA page_size').get() as { page_size: number };
    const freelistRow = db.prepare('PRAGMA freelist_count').get() as { freelist_count: number };
    const journalModeRow = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    const synchronousRow = db.prepare('PRAGMA synchronous').get() as { synchronous: number | string };
    const busyTimeoutRow = db.prepare('PRAGMA busy_timeout').get() as { timeout: number };

    const schemaObjects = db.prepare(`
      SELECT type, count(*) as count
      FROM sqlite_schema
      WHERE name NOT LIKE 'sqlite_%'
      GROUP BY type
    `).all() as Array<{ type: string; count: number }>;

    let tableCount = 0;
    let indexCount = 0;
    let viewCount = 0;
    let triggerCount = 0;

    for (const row of schemaObjects) {
      if (row.type === 'table') tableCount = row.count;
      if (row.type === 'index') indexCount = row.count;
      if (row.type === 'view') viewCount = row.count;
      if (row.type === 'trigger') triggerCount = row.count;
    }

    const metaDb = getMetadataDb();
    const tokenCountRow = metaDb.prepare('SELECT count(*) as count FROM api_tokens WHERE database_id = ?').get(databaseId) as { count: number };
    const lastBackupRow = metaDb.prepare("SELECT created_at FROM database_backups WHERE database_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 1").get(databaseId) as { created_at: number } | undefined;

    return {
      database: dbRecord,
      sqliteVersion: sqliteVersionRow.version,
      fileSizeBytes,
      walSizeBytes,
      tableCount,
      indexCount,
      viewCount,
      triggerCount,
      pageCount: pageCountRow?.page_count || 0,
      pageSize: pageSizeRow?.page_size || 4096,
      freelistCount: freelistRow?.freelist_count || 0,
      journalMode: journalModeRow?.journal_mode || 'wal',
      synchronous: String(synchronousRow?.synchronous ?? 'normal'),
      busyTimeout: busyTimeoutRow?.timeout || config.sqlBusyTimeoutMs,
      tokenCount: tokenCountRow?.count || 0,
      lastBackupAt: lastBackupRow?.created_at || null,
    };
  }

  public maintainDatabase(databaseId: string, action: 'vacuum' | 'integrity_check' | 'wal_checkpoint' | 'reindex'): {
    action: string;
    success: boolean;
    result?: any;
    details?: string;
  } {
    const dbRecord = this.getDatabase(databaseId);
    if (!dbRecord) throw new Error(`Database not found: ${databaseId}`);

    const db = dbManager.get(databaseId);

    switch (action) {
      case 'vacuum': {
        db.exec('VACUUM;');
        return {
          action: 'vacuum',
          success: true,
          details: 'Database defragmented and free pages reclaimed.',
        };
      }
      case 'integrity_check': {
        const rows = db.prepare('PRAGMA integrity_check;').all() as any[];
        const isOk = rows.length === 1 && rows[0].integrity_check === 'ok';
        return {
          action: 'integrity_check',
          success: isOk,
          result: rows,
          details: isOk ? 'Database file is fully healthy. No corruption detected.' : 'Issues found during integrity check.',
        };
      }
      case 'wal_checkpoint': {
        const res = db.prepare('PRAGMA wal_checkpoint(TRUNCATE);').get();
        return {
          action: 'wal_checkpoint',
          success: true,
          result: res,
          details: 'WAL file flushed into main database file and truncated to zero bytes.',
        };
      }
      case 'reindex': {
        db.exec('REINDEX;');
        return {
          action: 'reindex',
          success: true,
          details: 'All indexes rebuilt successfully.',
        };
      }
      default:
        throw new Error(`Unknown maintenance action: ${action}`);
    }
  }

  public explainQuery(databaseId: string, sql: string): {
    plan: Array<{ id: number; parent: number; notused: number; detail: string }>;
    analysis: {
      hasFullTableScan: boolean;
      scannedTables: string[];
      usesIndex: boolean;
      recommendation?: string;
    };
  } {
    const dbRecord = this.getDatabase(databaseId);
    if (!dbRecord) throw new Error(`Database not found: ${databaseId}`);

    const db = dbManager.get(databaseId);
    const planRows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as Array<{
      id: number;
      parent: number;
      notused: number;
      detail: string;
    }>;

    let hasFullTableScan = false;
    const scannedTables: string[] = [];
    let usesIndex = false;

    for (const step of planRows) {
      const detail = step.detail || '';
      if (detail.includes('SCAN TABLE') || detail.includes('SCAN ')) {
        hasFullTableScan = true;
        const match = detail.match(/SCAN (?:TABLE )?([a-zA-Z0-9_]+)/i);
        if (match && match[1] && !match[1].startsWith('sqlite_')) {
          scannedTables.push(match[1]);
        }
      }
      if (detail.includes('SEARCH TABLE') || detail.includes('USING INDEX') || detail.includes('USING COVERING INDEX')) {
        usesIndex = true;
      }
    }

    let recommendation: string | undefined;
    if (hasFullTableScan) {
      recommendation = `Warning: Query performs a Full Table Scan on [${scannedTables.join(', ')}]. Consider adding an INDEX on filtered/sorted columns for 10x-100x speedup.`;
    } else if (usesIndex) {
      recommendation = 'Optimal: Query efficiently utilizes indexes (Index Search).';
    }

    return {
      plan: planRows,
      analysis: {
        hasFullTableScan,
        scannedTables: Array.from(new Set(scannedTables)),
        usesIndex,
        recommendation,
      },
    };
  }

  public getDatabaseStorageStats(databaseId: string): DatabaseStorageStats {
    const dbRecord = this.getDatabase(databaseId);
    if (!dbRecord) throw new Error(`Database not found: ${databaseId}`);

    const db = dbManager.get(databaseId);
    const dbPath = dbManager.resolveDatabasePath(databaseId);

    let fileSizeBytes = 0;
    let walSizeBytes = 0;

    try {
      fileSizeBytes = fs.statSync(dbPath).size;
      const walPath = `${dbPath}-wal`;
      if (fs.existsSync(walPath)) {
        walSizeBytes = fs.statSync(walPath).size;
      }
    } catch {}

    const pageSizeRow = db.prepare('PRAGMA page_size;').get() as { page_size: number };
    const pageCountRow = db.prepare('PRAGMA page_count;').get() as { page_count: number };
    const freelistRow = db.prepare('PRAGMA freelist_count;').get() as { freelist_count: number };
    const journalModeRow = db.prepare('PRAGMA journal_mode;').get() as { journal_mode: string };
    const synchronousRow = db.prepare('PRAGMA synchronous;').get() as { synchronous: number | string };
    const autoVacuumRow = db.prepare('PRAGMA auto_vacuum;').get() as { auto_vacuum: number | string };
    const cacheSizeRow = db.prepare('PRAGMA cache_size;').get() as { cache_size: number };
    const schemaVersionRow = db.prepare('PRAGMA schema_version;').get() as { schema_version: number };

    const pageSize = pageSizeRow?.page_size || 4096;
    const pageCount = pageCountRow?.page_count || 0;
    const freelistCount = freelistRow?.freelist_count || 0;
    const activePageCount = Math.max(0, pageCount - freelistCount);
    const totalSizeBytes = fileSizeBytes + walSizeBytes;
    const fragmentationPercent = pageCount > 0 ? Math.round((freelistCount / pageCount) * 1000) / 10 : 0;

    const schemaObjects = db.prepare(`
      SELECT type, name, tbl_name
      FROM sqlite_schema
      WHERE name NOT LIKE 'sqlite_%'
      ORDER BY type, name
    `).all() as Array<{ type: string; name: string; tbl_name: string }>;

    const rawTables = schemaObjects.filter((o) => o.type === 'table' || o.type === 'view');
    const rawIndexes = schemaObjects.filter((o) => o.type === 'index');

    const tables: DatabaseStorageStats['tables'] = [];
    for (const t of rawTables) {
      let rowCount = 0;
      if (t.type === 'table') {
        try {
          const c = db.prepare(`SELECT COUNT(*) as count FROM "${t.name.replace(/"/g, '""')}"`).get() as { count: number };
          rowCount = c.count;
        } catch {}
      }

      const indexCount = rawIndexes.filter((idx) => idx.tbl_name === t.name).length;
      const estimatedSizeBytes = t.type === 'table' ? Math.max(pageSize, rowCount * 128) : 0;

      tables.push({
        name: t.name,
        type: t.type as 'table' | 'view',
        rowCount,
        estimatedSizeBytes,
        indexCount,
      });
    }

    const indexes: DatabaseStorageStats['indexes'] = rawIndexes.map((idx) => {
      let unique = false;
      try {
        const list = db.prepare(`PRAGMA index_list("${idx.tbl_name.replace(/"/g, '""')}")`).all() as any[];
        const match = list.find((item) => item.name === idx.name);
        unique = match ? Boolean(match.unique) : false;
      } catch {}
      return {
        name: idx.name,
        tableName: idx.tbl_name,
        unique,
      };
    });

    return {
      pageSize,
      pageCount,
      freelistCount,
      activePageCount,
      fileSizeBytes,
      walSizeBytes,
      totalSizeBytes,
      fragmentationPercent,
      journalMode: journalModeRow?.journal_mode || 'wal',
      synchronous: String(synchronousRow?.synchronous ?? 'normal'),
      autoVacuum: autoVacuumRow?.auto_vacuum ?? 'none',
      cacheSize: cacheSizeRow?.cache_size ?? -2000,
      schemaVersion: schemaVersionRow?.schema_version ?? 1,
      tables,
      indexes,
    };
  }

  public getDatabaseMetricsStats(databaseId: string): DatabaseMetricsStats {
    const metaDb = getMetadataDb();

    // Query 24h activity for this database
    const past24h = Date.now() - 24 * 60 * 60 * 1000;
    const logs = metaDb.prepare(`
      SELECT operation, duration_ms, status, timestamp
      FROM activity_logs
      WHERE database_id = ? AND timestamp >= ?
      ORDER BY timestamp ASC
    `).all(databaseId, past24h) as Array<{
      operation: string;
      duration_ms: number;
      status: string;
      timestamp: number;
    }>;

    let totalSelect = 0;
    let totalInsert = 0;
    let totalUpdate = 0;
    let totalDelete = 0;
    let totalDdl = 0;
    let totalErrors = 0;
    let totalDuration = 0;
    const durations: number[] = [];

    // Bucket into 12 two-hour windows
    const bucketIntervalMs = 2 * 60 * 60 * 1000;
    const numBuckets = 12;
    const now = Date.now();
    const startTime = now - 24 * 60 * 60 * 1000;

    const buckets: Array<{
      timeLabel: string;
      timestamp: number;
      selectCount: number;
      insertCount: number;
      updateCount: number;
      deleteCount: number;
      ddlCount: number;
      errorCount: number;
      totalCount: number;
      durationSum: number;
    }> = [];

    for (let i = 0; i < numBuckets; i++) {
      const bucketStart = startTime + i * bucketIntervalMs;
      const d = new Date(bucketStart);
      const timeLabel = `${String(d.getHours()).padStart(2, '0')}:00`;
      buckets.push({
        timeLabel,
        timestamp: bucketStart,
        selectCount: 0,
        insertCount: 0,
        updateCount: 0,
        deleteCount: 0,
        ddlCount: 0,
        errorCount: 0,
        totalCount: 0,
        durationSum: 0,
      });
    }

    for (const log of logs) {
      durations.push(log.duration_ms);
      totalDuration += log.duration_ms;

      const isError = log.status === 'error';
      if (isError) totalErrors++;

      const op = (log.operation || '').toUpperCase();
      let category: 'select' | 'insert' | 'update' | 'delete' | 'ddl' | 'other' = 'other';

      if (op.includes('SELECT') || op.includes('READ') || op.startsWith('GET')) {
        totalSelect++;
        category = 'select';
      } else if (op.includes('INSERT') || op.includes('IMPORT') || op.startsWith('POST')) {
        totalInsert++;
        category = 'insert';
      } else if (op.includes('UPDATE') || op.startsWith('PUT') || op.startsWith('PATCH')) {
        totalUpdate++;
        category = 'update';
      } else if (op.includes('DELETE') || op.includes('TRUNCATE') || op.includes('DROP')) {
        totalDelete++;
        category = 'delete';
      } else if (op.includes('CREATE') || op.includes('ALTER') || op.includes('SCHEMA')) {
        totalDdl++;
        category = 'ddl';
      } else {
        totalSelect++;
        category = 'select';
      }

      // Assign to bucket
      const bucketIdx = Math.min(
        Math.max(Math.floor((log.timestamp - startTime) / bucketIntervalMs), 0),
        numBuckets - 1
      );
      const b = buckets[bucketIdx];
      b.totalCount++;
      b.durationSum += log.duration_ms;
      if (isError) b.errorCount++;
      if (category === 'select') b.selectCount++;
      else if (category === 'insert') b.insertCount++;
      else if (category === 'update') b.updateCount++;
      else if (category === 'delete') b.deleteCount++;
      else if (category === 'ddl') b.ddlCount++;
    }

    durations.sort((a, b) => a - b);
    const avgLatencyMs = logs.length > 0 ? Math.round((totalDuration / logs.length) * 100) / 100 : 0;
    const p95Index = Math.floor(durations.length * 0.95);
    const p95LatencyMs = durations.length > 0 ? Math.round((durations[p95Index] || 0) * 100) / 100 : 0;

    const timeline = buckets.map((b) => ({
      timeLabel: b.timeLabel,
      timestamp: b.timestamp,
      selectCount: b.selectCount,
      insertCount: b.insertCount,
      updateCount: b.updateCount,
      deleteCount: b.deleteCount,
      ddlCount: b.ddlCount,
      errorCount: b.errorCount,
      totalCount: b.totalCount,
      avgDurationMs: b.totalCount > 0 ? Math.round((b.durationSum / b.totalCount) * 100) / 100 : 0,
    }));

    return {
      databaseId,
      totalRequests: logs.length,
      totalQueries: logs.length,
      totalSelect,
      totalInsert,
      totalUpdate,
      totalDelete,
      totalDdl,
      totalErrors,
      avgLatencyMs,
      p95LatencyMs,
      timeline,
    };
  }

  public setupFts5Index(
    databaseId: string,
    params: {
      sourceTable: string;
      ftsTable?: string;
      columns: string[];
      tokenizer?: 'unicode61' | 'porter' | 'ascii' | 'trigram';
      createTriggers?: boolean;
    }
  ): { ftsTable: string; ddlStatements: string[] } {
    const db = dbManager.get(databaseId);
    const schema = dbManager.getSchema(databaseId);
    const sourceTableObj = schema.find(t => t.name === params.sourceTable);
    if (!sourceTableObj) {
      throw new Error(`Source table "${params.sourceTable}" not found`);
    }

    // Validate that requested columns exist in source table
    const validColNames = new Set(sourceTableObj.columns.map(c => c.name));
    for (const col of params.columns) {
      if (!validColNames.has(col)) {
        throw new Error(`Column "${col}" does not exist on table "${params.sourceTable}"`);
      }
    }

    const cleanSource = params.sourceTable.replace(/"/g, '""');
    const ftsContentSource = params.sourceTable.replace(/'/g, "''");
    const ftsTable = params.ftsTable || `${params.sourceTable}_fts`;
    const cleanFts = ftsTable.replace(/"/g, '""');
    const tokenizer = params.tokenizer || 'unicode61';
    const cols = params.columns.map(c => `"${c.replace(/"/g, '""')}"`).join(', ');

    // Determine PK column safely: explicit PK -> column named 'id' -> standard SQLite 'rowid'
    const explicitPk = sourceTableObj.columns.find(c => c.pk === 1)?.name;
    const hasIdCol = sourceTableObj.columns.some(c => c.name.toLowerCase() === 'id');
    const pkCol = explicitPk || (hasIdCol ? 'id' : 'rowid');
    const isExplicitColumn = sourceTableObj.columns.some(c => c.name === pkCol);

    const cleanPk = isExplicitColumn ? `"${pkCol.replace(/"/g, '""')}"` : 'rowid';
    const ftsContentPk = pkCol.replace(/'/g, "''");
    const newPkExpr = isExplicitColumn ? `new."${pkCol.replace(/"/g, '""')}"` : 'new.rowid';
    const oldPkExpr = isExplicitColumn ? `old."${pkCol.replace(/"/g, '""')}"` : 'old.rowid';

    const ddlStatements: string[] = [];

    // 1. Create Virtual FTS5 Table (safely escaping single quotes for content/content_rowid options)
    const createFtsSql = `CREATE VIRTUAL TABLE IF NOT EXISTS "${cleanFts}" USING fts5(${cols}, content='${ftsContentSource}', content_rowid='${ftsContentPk}', tokenize='${tokenizer}');`;
    ddlStatements.push(createFtsSql);

    // 2. Triggers for Automatic Sync
    if (params.createTriggers !== false) {
      const colNames = params.columns.map(c => `"${c.replace(/"/g, '""')}"`);
      const newCols = params.columns.map(c => `new."${c.replace(/"/g, '""')}"`).join(', ');
      const oldCols = params.columns.map(c => `old."${c.replace(/"/g, '""')}"`).join(', ');

      // Insert trigger
      const insertTrigger = `
        CREATE TRIGGER IF NOT EXISTS "trg_${cleanSource}_fts_ai" AFTER INSERT ON "${cleanSource}" BEGIN
          INSERT INTO "${cleanFts}"(rowid, ${colNames.join(', ')}) VALUES (${newPkExpr}, ${newCols});
        END;
      `.trim();

      // Delete trigger
      const deleteTrigger = `
        CREATE TRIGGER IF NOT EXISTS "trg_${cleanSource}_fts_ad" AFTER DELETE ON "${cleanSource}" BEGIN
          INSERT INTO "${cleanFts}"("${cleanFts}", rowid, ${colNames.join(', ')}) VALUES('delete', ${oldPkExpr}, ${oldCols});
        END;
      `.trim();

      // Update trigger
      const updateTrigger = `
        CREATE TRIGGER IF NOT EXISTS "trg_${cleanSource}_fts_au" AFTER UPDATE ON "${cleanSource}" BEGIN
          INSERT INTO "${cleanFts}"("${cleanFts}", rowid, ${colNames.join(', ')}) VALUES('delete', ${oldPkExpr}, ${oldCols});
          INSERT INTO "${cleanFts}"(rowid, ${colNames.join(', ')}) VALUES (${newPkExpr}, ${newCols});
        END;
      `.trim();

      ddlStatements.push(insertTrigger, deleteTrigger, updateTrigger);
    }

    // Execute setup
    db.exec('BEGIN TRANSACTION;');
    try {
      for (const stmt of ddlStatements) {
        db.exec(stmt);
      }
      // Populate existing rows into FTS5
      const populateSql = `INSERT INTO "${cleanFts}"(rowid, ${cols}) SELECT ${cleanPk}, ${cols} FROM "${cleanSource}";`;
      try {
        db.exec(populateSql);
      } catch {
        // Ignore duplicate if already populated
      }
      db.exec('COMMIT;');
    } catch (err: any) {
      db.exec('ROLLBACK;');
      throw err;
    }

    return { ftsTable, ddlStatements };
  }
}

export const databaseService = new DatabaseService();
