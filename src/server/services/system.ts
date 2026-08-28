import fs from 'fs';
import path from 'path';
import os from 'os';
import { config } from '../config/index.js';
import { getMetadataDb } from '../db/metadata.js';
import { backupService } from './backup.js';
import { databaseService } from './database.js';
import { logger } from '../utils/logger.js';
import type { SystemSettings, SystemStatus } from '../../../shared/index.js';

export class SystemService {
  private schedulerInterval: NodeJS.Timeout | null = null;
  private isBackupRunning = false;

  constructor() {
    this.schedulerInterval = setInterval(() => this.runScheduledTasks(), 60 * 1000);
  }

  public getSettings(): SystemSettings {
    const metaDb = getMetadataDb();
    const rows = metaDb.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;

    return {
      instance_name: map.instance_name || 'VanillaDatabase Primary',
      base_url: map.base_url || `http://${config.host}:${config.port}`,
      default_journal_mode: map.default_journal_mode || 'wal',
      default_busy_timeout: map.default_busy_timeout ? parseInt(map.default_busy_timeout, 10) : config.sqlBusyTimeoutMs,
      default_synchronous: map.default_synchronous || 'normal',
      default_foreign_keys: map.default_foreign_keys !== 'false',
      backup_schedule: map.backup_schedule || 'daily',
      backup_retention: map.backup_retention ? parseInt(map.backup_retention, 10) : 10,
      log_sql: map.log_sql === 'true',
    };
  }

  public updateSettings(settings: Partial<SystemSettings>): SystemSettings {
    const metaDb = getMetadataDb();
    const now = Date.now();
    const stmt = metaDb.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');

    metaDb.exec('BEGIN TRANSACTION;');
    try {
      for (const [k, v] of Object.entries(settings)) {
        if (v !== undefined) {
          stmt.run(k, String(v), now);
        }
      }
      metaDb.exec('COMMIT;');
    } catch (err) {
      metaDb.exec('ROLLBACK;');
      throw err;
    }

    return this.getSettings();
  }

  public getSystemStatus(): SystemStatus {
    const dbs = databaseService.listDatabases();
    let totalDatabaseStorageBytes = 0;
    let backupStorageBytes = 0;

    for (const db of dbs) {
      const dbPath = path.resolve(config.databasesDir, db.filename);
      if (fs.existsSync(dbPath)) {
        totalDatabaseStorageBytes += fs.statSync(dbPath).size;
      }
      const walPath = `${dbPath}-wal`;
      if (fs.existsSync(walPath)) {
        totalDatabaseStorageBytes += fs.statSync(walPath).size;
      }
    }

    const calculateDirSize = (dirPath: string): number => {
      let size = 0;
      if (!fs.existsSync(dirPath)) return 0;
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          size += calculateDirSize(fullPath);
        } else {
          size += fs.statSync(fullPath).size;
        }
      }
      return size;
    };

    backupStorageBytes = calculateDirSize(config.backupsDir);
    const metaDb = getMetadataDb();
    const sqliteVersionRow = metaDb.prepare('SELECT sqlite_version() as version').get() as { version: string };

    const mem = process.memoryUsage();

    return {
      version: '1.0.0',
      nodeVersion: process.version,
      sqliteVersion: sqliteVersionRow.version,
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      uptimeSeconds: Math.floor(process.uptime()),
      databaseCount: dbs.length,
      totalDatabaseStorageBytes,
      backupStorageBytes,
      memoryUsage: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
      },
    };
  }

  private async runScheduledTasks(): Promise<void> {
    if (this.isBackupRunning) return;
    this.isBackupRunning = true;

    try {
      const settings = this.getSettings();
      if (settings.backup_schedule === 'disabled') return;

      const dbs = databaseService.listDatabases();
      const now = Date.now();

      for (const db of dbs) {
        const backups = backupService.listBackups(db.id);
        const lastBackup = backups.length > 0 ? backups[0] : null;

        let intervalMs = 24 * 60 * 60 * 1000; // default daily
        if (settings.backup_schedule === 'hourly') intervalMs = 60 * 60 * 1000;
        if (settings.backup_schedule === '6hours') intervalMs = 6 * 60 * 60 * 1000;
        if (settings.backup_schedule === '12hours') intervalMs = 12 * 60 * 60 * 1000;
        if (settings.backup_schedule === 'weekly') intervalMs = 7 * 24 * 60 * 60 * 1000;

        if (!lastBackup || now - lastBackup.created_at >= intervalMs) {
          logger.info({ databaseId: db.id }, 'Triggering scheduled backup');
          try {
            backupService.createBackup(db.id, 'scheduled');
          } catch (err) {
            logger.error({ err, databaseId: db.id }, 'Scheduled backup failed');
          }
        }

        // Apply backup retention
        if (settings.backup_retention > 0 && backups.length > settings.backup_retention) {
          const toDelete = backups.slice(settings.backup_retention);
          for (const bkp of toDelete) {
            try {
              backupService.deleteBackup(bkp.id);
            } catch (err) {
              logger.warn({ err, backupId: bkp.id }, 'Failed to delete expired backup');
            }
          }
        }
      }
    } finally {
      this.isBackupRunning = false;
    }
  }

  public destroy(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }
}

export const systemService = new SystemService();
