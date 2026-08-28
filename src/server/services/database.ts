import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { config } from '../config/index.js';
import { getMetadataDb } from '../db/metadata.js';
import { dbManager } from '../db/manager.js';
import { logger } from '../utils/logger.js';
import { storageService } from './storage.js';
import type { DatabaseRecord, DatabaseOverviewStats, BackupRecord } from '../../../shared/index.js';

export class DatabaseService {
  public createDatabase(name: string, description?: string | null): DatabaseRecord {
    const metaDb = getMetadataDb();
    const id = `db_${nanoid(16)}`;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `db-${nanoid(6)}`;

    const filename = `${id}.sqlite`;
    const dbPath = path.resolve(config.databasesDir, filename);

    if (fs.existsSync(dbPath)) {
      throw new Error(`File already exists for database: ${filename}`);
    }

    const now = Date.now();
    metaDb.prepare(`
      INSERT INTO databases (id, name, slug, description, filename, created_at, updated_at, last_accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, slug, description || null, filename, now, now, now);

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
      created_at: now,
      updated_at: now,
      last_accessed_at: now,
    };
  }

  public listDatabases(): DatabaseRecord[] {
    const metaDb = getMetadataDb();
    const rows = metaDb.prepare('SELECT id, name, slug, description, filename, created_at, updated_at, last_accessed_at FROM databases ORDER BY created_at DESC').all() as any[];
    return rows;
  }

  public getDatabase(databaseId: string): DatabaseRecord | null {
    const metaDb = getMetadataDb();
    const row = metaDb.prepare('SELECT id, name, slug, description, filename, created_at, updated_at, last_accessed_at FROM databases WHERE id = ?').get(databaseId) as any;
    return row || null;
  }

  public updateDatabase(databaseId: string, updates: { name?: string; description?: string | null }): DatabaseRecord {
    const metaDb = getMetadataDb();
    const current = this.getDatabase(databaseId);
    if (!current) throw new Error(`Database not found: ${databaseId}`);

    const name = updates.name !== undefined ? updates.name : current.name;
    const description = updates.description !== undefined ? updates.description : current.description;
    const now = Date.now();

    metaDb.prepare('UPDATE databases SET name = ?, description = ?, updated_at = ? WHERE id = ?').run(
      name,
      description,
      now,
      databaseId
    );

    return {
      ...current,
      name,
      description,
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

    // Safely copy using SQLite checkpoint or file copy
    const sourceDb = dbManager.get(sourceDatabaseId);
    sourceDb.exec('PRAGMA wal_checkpoint(FULL);');

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
}

export const databaseService = new DatabaseService();
