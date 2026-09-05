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
          role TEXT NOT NULL DEFAULT 'super_admin',
          max_databases INTEGER NOT NULL DEFAULT 1000,
          rate_limit_per_minute INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'active',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS databases (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          description TEXT,
          filename TEXT NOT NULL UNIQUE,
          owner_id TEXT,
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
          rate_limit INTEGER,
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
    },
    {
      version: 5,
      name: 'add_rate_limit_to_tokens',
      sql: `
        ALTER TABLE api_tokens ADD COLUMN rate_limit INTEGER;
      `
    },
    {
      version: 6,
      name: 'multi_user_rbac_and_quotas',
      sql: `
        ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'super_admin';
        ALTER TABLE users ADD COLUMN max_databases INTEGER NOT NULL DEFAULT 1000;
        ALTER TABLE users ADD COLUMN rate_limit_per_minute INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
        ALTER TABLE databases ADD COLUMN owner_id TEXT;
        CREATE INDEX IF NOT EXISTS idx_databases_owner ON databases(owner_id);
        UPDATE users SET role = 'super_admin', max_databases = 1000, rate_limit_per_minute = 0;
      `
    },
    {
      version: 7,
      name: 'add_disk_quota_to_databases',
      sql: `
        ALTER TABLE databases ADD COLUMN max_size_mb INTEGER;
      `
    },
    {
      version: 8,
      name: 'create_scheduled_jobs_table',
      sql: `
        CREATE TABLE IF NOT EXISTS scheduled_jobs (
          id TEXT PRIMARY KEY,
          database_id TEXT NOT NULL,
          name TEXT NOT NULL,
          cron_expression TEXT NOT NULL,
          sql_query TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          last_run_at INTEGER,
          next_run_at INTEGER,
          last_status TEXT,
          last_error TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next ON scheduled_jobs(enabled, next_run_at);
        CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_db ON scheduled_jobs(database_id);
      `
    },
    {
      version: 9,
      name: 'create_webauthn_credentials_table',
      sql: `
        CREATE TABLE IF NOT EXISTS webauthn_credentials (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          credential_id TEXT NOT NULL UNIQUE,
          public_key TEXT NOT NULL,
          counter INTEGER NOT NULL DEFAULT 0,
          device_type TEXT,
          backed_up INTEGER NOT NULL DEFAULT 0,
          transports TEXT,
          created_at INTEGER NOT NULL,
          last_used_at INTEGER,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_webauthn_user ON webauthn_credentials(user_id);
        CREATE INDEX IF NOT EXISTS idx_webauthn_cred ON webauthn_credentials(credential_id);
      `
    },
    {
      version: 10,
      name: 'add_user_profile_2fa_and_db_members',
      sql: `
        ALTER TABLE users ADD COLUMN email TEXT;
        ALTER TABLE users ADD COLUMN avatar_url TEXT;
        ALTER TABLE users ADD COLUMN totp_secret TEXT;
        ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN totp_temp_secret TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

        CREATE TABLE IF NOT EXISTS database_members (
          id TEXT PRIMARY KEY,
          database_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'viewer',
          invited_by TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(database_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_db_members_user ON database_members(user_id);
        CREATE INDEX IF NOT EXISTS idx_db_members_db ON database_members(database_id);

        CREATE TABLE IF NOT EXISTS database_invites (
          id TEXT PRIMARY KEY,
          database_id TEXT NOT NULL,
          email TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'viewer',
          invited_by TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE,
          UNIQUE(database_id, email)
        );
        CREATE INDEX IF NOT EXISTS idx_db_invites_email ON database_invites(email);
        CREATE INDEX IF NOT EXISTS idx_db_invites_db ON database_invites(database_id);
      `
    }
  ];

  for (const m of migrations) {
    if (!appliedVersions.has(m.version)) {
      logger.info({ migration: m.name, version: m.version }, 'Applying metadata migration');
      db.exec('BEGIN TRANSACTION;');
      try {
        const statements = m.sql.split(';').map(s => s.trim()).filter(Boolean);
        for (const stmt of statements) {
          try {
            db.exec(stmt);
          } catch (stmtErr: any) {
            // Ignore duplicate column errors if table was already created with the column
            if (!stmtErr.message?.includes('duplicate column name')) {
              throw stmtErr;
            }
          }
        }
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
