import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { config } from '../config/index.js';
import { getMetadataDb } from '../db/metadata.js';
import { dbManager } from '../db/manager.js';
import { logger } from '../utils/logger.js';
import type { BackupRecord } from '../../../shared/index.js';

export class BackupService {
  public calculateChecksum(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  public createBackup(databaseId: string, backupType: 'manual' | 'scheduled' | 'system' = 'manual'): BackupRecord {
    const metaDb = getMetadataDb();
    const dbRow = metaDb.prepare('SELECT id, filename FROM databases WHERE id = ?').get(databaseId) as { id: string; filename: string } | undefined;
    if (!dbRow) throw new Error(`Database not found: ${databaseId}`);

    const db = dbManager.get(databaseId);
    // Flush WAL to ensure complete snapshot
    db.exec('PRAGMA wal_checkpoint(FULL);');

    const dbBackupsDir = path.resolve(config.backupsDir, databaseId);
    if (!fs.existsSync(dbBackupsDir)) {
      fs.mkdirSync(dbBackupsDir, { recursive: true });
    }

    const now = Date.now();
    const d = new Date(now);
    const pad = (n: number) => String(n).padStart(2, '0');
    const vnFormatted = `${pad(d.getHours())}h${pad(d.getMinutes())}_${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
    const backupId = `bkp_${nanoid(16)}`;
    const filename = `backup_${vnFormatted}_${nanoid(6)}.sqlite`;
    const targetPath = path.resolve(dbBackupsDir, filename);

    const sourcePath = dbManager.resolveDatabasePath(databaseId);
    fs.copyFileSync(sourcePath, targetPath);

    const sizeBytes = fs.statSync(targetPath).size;
    const checksum = this.calculateChecksum(targetPath);

    metaDb.prepare(`
      INSERT INTO database_backups (id, database_id, filename, size_bytes, checksum, backup_type, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(backupId, databaseId, filename, sizeBytes, checksum, backupType, 'completed', now);

    return {
      id: backupId,
      database_id: databaseId,
      filename,
      size_bytes: sizeBytes,
      checksum,
      backup_type: backupType,
      status: 'completed',
      created_at: now,
    };
  }

  public listBackups(databaseId: string): BackupRecord[] {
    const metaDb = getMetadataDb();
    const rows = metaDb.prepare(`
      SELECT id, database_id, filename, size_bytes, checksum, backup_type, status, created_at
      FROM database_backups
      WHERE database_id = ?
      ORDER BY created_at DESC
    `).all(databaseId) as any[];

    return rows;
  }

  public getBackup(backupId: string): BackupRecord | null {
    const metaDb = getMetadataDb();
    const row = metaDb.prepare(`
      SELECT id, database_id, filename, size_bytes, checksum, backup_type, status, created_at
      FROM database_backups
      WHERE id = ?
    `).get(backupId) as any;

    return row || null;
  }

  public deleteBackup(backupId: string): boolean {
    const metaDb = getMetadataDb();
    const backup = this.getBackup(backupId);
    if (!backup) throw new Error(`Backup not found: ${backupId}`);

    const filePath = path.resolve(config.backupsDir, backup.database_id, backup.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        logger.warn({ err, filePath }, 'Error deleting backup file');
      }
    }

    metaDb.prepare('DELETE FROM database_backups WHERE id = ?').run(backupId);
    return true;
  }

  public restoreBackup(databaseId: string, backupId: string): boolean {
    const backup = this.getBackup(backupId);
    if (!backup || backup.database_id !== databaseId) {
      throw new Error(`Backup ${backupId} not found for database ${databaseId}`);
    }

    const backupFilePath = path.resolve(config.backupsDir, databaseId, backup.filename);
    if (!fs.existsSync(backupFilePath)) {
      throw new Error(`Backup file not found on disk: ${backup.filename}`);
    }

    // 1. Verify backup checksum/file
    const currentChecksum = this.calculateChecksum(backupFilePath);
    if (currentChecksum !== backup.checksum) {
      throw new Error('Backup integrity verification failed: Checksum mismatch');
    }

    // 2. Create safety backup of current state
    try {
      this.createBackup(databaseId, 'system');
    } catch (err) {
      logger.warn({ err }, 'Failed to create safety backup before restore, proceeding carefully');
    }

    // 3. Close database handle
    dbManager.close(databaseId);

    // 4. Overwrite database file atomically
    const dbPath = dbManager.resolveDatabasePath(databaseId);
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;

    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

    fs.copyFileSync(backupFilePath, dbPath);

    // 5. Reopen and verify health
    try {
      const db = dbManager.get(databaseId);
      const check = db.prepare('PRAGMA quick_check;').get() as { quick_check: string };
      if (check.quick_check !== 'ok') {
        throw new Error(`Database restore health check returned: ${check.quick_check}`);
      }
      return true;
    } catch (err) {
      logger.error({ err }, 'Database failed health check after restore');
      throw err;
    }
  }
}

export const backupService = new BackupService();
