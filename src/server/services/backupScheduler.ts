import { systemService } from './system.js';
import { backupService } from './backup.js';
import { getMetadataDb } from '../db/metadata.js';
import { logger } from '../utils/logger.js';

export class BackupScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isStopped = true;

  public start(): void {
    if (this.timer && !this.isStopped) return;
    this.isStopped = false;
    logger.info('Starting Automated Backup Scheduler');
    this.scheduleNextRun(60 * 1000); // initial check after 1 minute
  }

  public stop(): void {
    this.isStopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNextRun(delayMs: number): void {
    if (this.isStopped) return;
    this.timer = setTimeout(async () => {
      try {
        await this.runBackupCycle();
      } finally {
        if (!this.isStopped) {
          this.scheduleNextRun(30 * 60 * 1000); // check every 30 minutes
        }
      }
    }, delayMs);
  }

  private async runBackupCycle(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const settings = systemService.getSettings();
      if (!settings.backup_schedule || settings.backup_schedule === 'disabled') {
        this.isRunning = false;
        return;
      }

      const metaDb = getMetadataDb();
      const databases = metaDb.prepare('SELECT id, name FROM databases').all() as { id: string; name: string }[];

      for (const db of databases) {
        try {
          const lastBackup = metaDb.prepare(
            "SELECT created_at FROM database_backups WHERE database_id = ? AND backup_type = 'scheduled' ORDER BY created_at DESC LIMIT 1"
          ).get(db.id) as { created_at: number } | undefined;

          const now = Date.now();
          let shouldBackup = false;

          if (!lastBackup) {
            shouldBackup = true;
          } else {
            const elapsedHours = (now - lastBackup.created_at) / (1000 * 60 * 60);
            if (settings.backup_schedule === 'hourly' && elapsedHours >= 1) shouldBackup = true;
            else if (settings.backup_schedule === '6hours' && elapsedHours >= 6) shouldBackup = true;
            else if (settings.backup_schedule === '12hours' && elapsedHours >= 12) shouldBackup = true;
            else if (settings.backup_schedule === 'daily' && elapsedHours >= 24) shouldBackup = true;
            else if (settings.backup_schedule === 'weekly' && elapsedHours >= 168) shouldBackup = true;
          }

          if (shouldBackup) {
            logger.info({ databaseId: db.id, name: db.name }, 'Creating automated scheduled snapshot');
            backupService.createBackup(db.id, 'scheduled');
            this.pruneBackups(db.id, settings.backup_retention);
          }
        } catch (err) {
          logger.warn({ err, databaseId: db.id }, 'Scheduled backup failed for database');
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in scheduled backup worker cycle');
    } finally {
      this.isRunning = false;
    }
  }

  public pruneBackups(databaseId: string, retentionCount: number): void {
    if (retentionCount < 0) return;
    const backups = backupService.listBackups(databaseId);
    if (backups.length > retentionCount) {
      const toDelete = backups.slice(retentionCount);
      for (const bkp of toDelete) {
        try {
          backupService.deleteBackup(bkp.id);
        } catch {}
      }
    }
  }
}

export const backupScheduler = new BackupScheduler();
