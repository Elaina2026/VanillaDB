import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let metaDb: DatabaseSync | null = null;

export function getMetadataDb(): DatabaseSync {
  if (metaDb) return metaDb;

  const dbPath = path.join(config.systemDir, 'vanilladb.sqlite');
  metaDb = new DatabaseSync(dbPath);

  metaDb.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = ${config.sqlBusyTimeoutMs};
    PRAGMA synchronous = NORMAL;
  `);

  runMigrations(metaDb);
  return metaDb;
}

function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT version FROM schema_migrations ORDER BY version ASC').all() as { version: number }[];
  const appliedVersions = new Set(appliedRows.map(r => r.version));

  const migrations: Array<{ version: number; name: string; sql: string }> = [
    {
      version: 1,
      name: 'initial_schema',
      sql: `
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS databases (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          description TEXT,
          filename TEXT NOT NULL UNIQUE,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          last_accessed_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS api_tokens (
          id TEXT PRIMARY KEY,
          database_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          token_prefix TEXT NOT NULL,
          token_last_chars TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          permissions TEXT NOT NULL,
          allowed_tables TEXT,
          denied_tables TEXT,
          expires_at INTEGER,
          created_at INTEGER NOT NULL,
          last_used_at INTEGER,
          revoked_at INTEGER,
          FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS database_backups (
          id TEXT PRIMARY KEY,
          database_id TEXT NOT NULL,
          filename TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          checksum TEXT NOT NULL,
          backup_type TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS activity_logs (
          id TEXT PRIMARY KEY,
          database_id TEXT,
          token_id TEXT,
          operation TEXT NOT NULL,
          duration_ms REAL NOT NULL,
          status TEXT NOT NULL,
          error_message TEXT,
          row_count INTEGER,
          timestamp INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          user TEXT NOT NULL,
          action TEXT NOT NULL,
          resource TEXT NOT NULL,
          result TEXT NOT NULL,
          request_id TEXT,
          details TEXT,
          timestamp INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `
    },
    {
      version: 2,
      name: 'create_indexes',
      sql: `
        CREATE INDEX IF NOT EXISTS idx_api_tokens_db ON api_tokens(database_id);
        CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash);
        CREATE INDEX IF NOT EXISTS idx_backups_db ON database_backups(database_id);
        CREATE INDEX IF NOT EXISTS idx_activity_db_time ON activity_logs(database_id, timestamp);
        CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(timestamp);
      `
    },
    {
      version: 3,
      name: 'create_files_table',
      sql: `
        CREATE TABLE IF NOT EXISTS files (
          id TEXT PRIMARY KEY,
          database_id TEXT NOT NULL,
          filename TEXT NOT NULL,
          original_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          checksum TEXT NOT NULL,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_files_db ON files(database_id);
      `
    },
    {
      version: 4,
      name: 'create_webhooks_table',
      sql: `
        CREATE TABLE IF NOT EXISTS webhooks (
          id TEXT PRIMARY KEY,
          database_id TEXT NOT NULL,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          secret TEXT NOT NULL,
          events TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          last_triggered_at INTEGER,
          failure_count INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_webhooks_db ON webhooks(database_id);
      `
    }
  ];

  for (const m of migrations) {
    if (!appliedVersions.has(m.version)) {
      logger.info({ migration: m.name, version: m.version }, 'Applying metadata migration');
      db.exec('BEGIN TRANSACTION;');
      try {
        db.exec(m.sql);
        db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
          m.version,
          m.name,
          Date.now()
        );
        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
    }
  }
}

export function closeMetadataDb(): void {
  if (metaDb) {
    try {
      metaDb.close();
    } catch (e) {
      logger.error(e, 'Error closing metadata db');
    }
    metaDb = null;
  }
}
