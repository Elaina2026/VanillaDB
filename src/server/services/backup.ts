import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { config } from '../config/index.js';
import { getMetadataDb } from '../db/metadata.js';
import { dbManager } from '../db/manager.js';
import { logger } from '../utils/logger.js';
import { encryptFile, decryptFile, isEncryptedFile } from '../utils/crypto.js';
import { clusterService } from './cluster.js';
import type { BackupRecord } from '../../../shared/index.js';

export class BackupService {
  public calculateChecksum(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  public async createBackup(databaseId: string, backupType: 'manual' | 'scheduled' | 'system' = 'manual'): Promise<BackupRecord> {
    const metaDb = getMetadataDb();
    const dbRow = metaDb.prepare('SELECT id, filename, node_id FROM databases WHERE id = ?').get(databaseId) as { id: string; filename: string; node_id?: string | null } | undefined;
    if (!dbRow) throw new Error(`Database not found: ${databaseId}`);

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

    const isRemote = dbRow.node_id && dbRow.node_id !== 'local' && dbRow.node_id !== config.nodeId;

    if (isRemote) {
      const workerNode = metaDb.prepare('SELECT * FROM storage_nodes WHERE id = ?').get(dbRow.node_id!) as any;
      if (!workerNode) {
        throw new Error(`Worker node "${dbRow.node_id}" not found in cluster metadata.`);
      }

      let res: Response;
      try {
        res = await fetch(`${workerNode.base_url.replace(/\/+$/, '')}/api/internal/node/databases/${databaseId}/export`, {
          method: 'GET',
          headers: {
            'x-cluster-secret': workerNode.auth_token || config.clusterSecret,
          },
          signal: AbortSignal.timeout(120_000),
        });
      } catch (fetchErr: any) {
        if (
          fetchErr.cause?.code === 'ECONNREFUSED' ||
          fetchErr.code === 'ECONNREFUSED' ||
          String(fetchErr.message).includes('ECONNREFUSED')
        ) {
          clusterService.recordNodeFailure(workerNode.id, 'Backup export ECONNREFUSED', true);
        } else {
          clusterService.recordNodeFailure(workerNode.id, fetchErr.message || 'Backup export failed', false);
        }
        throw new Error(`Cannot export snapshot from worker "${workerNode.name}" (${workerNode.base_url}): ${fetchErr.message}`);
      }

      if (!res.ok) {
        clusterService.recordNodeFailure(workerNode.id, `Worker export responded HTTP ${res.status}`, false);
        throw new Error(`Worker node export responded with HTTP ${res.status}`);
      }

      clusterService.recordNodeSuccess(workerNode.id);

      const rawBuffer = Buffer.from(await res.arrayBuffer());
      if (!fs.existsSync(config.tempDir)) {
        fs.mkdirSync(config.tempDir, { recursive: true });
      }
      const tempPlain = path.resolve(config.tempDir, `${databaseId}_bkp_temp_${Date.now()}.sqlite`);
      fs.writeFileSync(tempPlain, rawBuffer);

      try {
        encryptFile(tempPlain, targetPath);
      } finally {
        if (fs.existsSync(tempPlain)) {
          try { fs.unlinkSync(tempPlain); } catch {}
        }
      }
    } else {
      const db = dbManager.get(databaseId);
      // Flush WAL to ensure complete snapshot
      db.exec('PRAGMA wal_checkpoint(FULL);');

      const sourcePath = dbManager.resolveDatabasePath(databaseId);

      // Encrypt at-rest with AES-256-GCM
      encryptFile(sourcePath, targetPath);
    }

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

  public async restoreBackup(databaseId: string, backupId: string): Promise<boolean> {
    const metaDb = getMetadataDb();
    const dbRow = metaDb.prepare('SELECT id, filename, node_id FROM databases WHERE id = ?').get(databaseId) as { id: string; filename: string; node_id?: string | null } | undefined;
    if (!dbRow) throw new Error(`Database not found: ${databaseId}`);

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
      await this.createBackup(databaseId, 'system');
    } catch (err) {
      logger.warn({ err }, 'Failed to create safety backup before restore, proceeding carefully');
    }

    const isRemote = dbRow.node_id && dbRow.node_id !== 'local' && dbRow.node_id !== config.nodeId;

    if (!fs.existsSync(config.tempDir)) {
      fs.mkdirSync(config.tempDir, { recursive: true });
    }
    const tempDecrypted = path.resolve(config.tempDir, `${databaseId}_restore_${Date.now()}.sqlite`);

    try {
      if (isEncryptedFile(backupFilePath)) {
        decryptFile(backupFilePath, tempDecrypted);
      } else {
        fs.copyFileSync(backupFilePath, tempDecrypted);
      }

      if (isRemote) {
        const workerNode = metaDb.prepare('SELECT * FROM storage_nodes WHERE id = ?').get(dbRow.node_id!) as any;
        if (!workerNode) {
          throw new Error(`Worker node "${dbRow.node_id}" not found in cluster metadata.`);
        }

        const fileBuffer = fs.readFileSync(tempDecrypted);
        const res = await fetch(`${workerNode.base_url.replace(/\/+$/, '')}/api/internal/node/databases/${databaseId}/receive`, {
          method: 'POST',
          headers: {
            'x-cluster-secret': workerNode.auth_token || config.clusterSecret,
            'content-type': 'application/octet-stream',
          },
          body: fileBuffer,
          // @ts-ignore
          duplex: 'half',
          signal: AbortSignal.timeout(120_000),
        });

        if (!res.ok) {
          throw new Error(`Failed to restore on worker node: HTTP ${res.status}`);
        }
        return true;
      } else {
        // 3. Close database handle
        dbManager.close(databaseId);

        // 4. Overwrite database file atomically
        const dbPath = dbManager.resolveDatabasePath(databaseId);
        const walPath = `${dbPath}-wal`;
        const shmPath = `${dbPath}-shm`;

        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

        fs.copyFileSync(tempDecrypted, dbPath);

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
    } finally {
      if (fs.existsSync(tempDecrypted)) {
        try { fs.unlinkSync(tempDecrypted); } catch {}
      }
    }
  }
}

export const backupService = new BackupService();
