import { databaseService } from './database.js';
import { dbManager } from '../db/manager.js';
import { systemService } from './system.js';
import { activityService } from './activity.js';
import { logger } from '../utils/logger.js';

// ponytail: in-process interval worker; add distributed job queue (BullMQ/Redis) when running multi-instance cluster.
export class MaintenanceWorker {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isStopped = true;

  public start(): void {
    if (this.timer && !this.isStopped) return;
    this.isStopped = false;
    logger.info('Starting Background Auto-Maintenance Worker (PRAGMA optimize & log retention)');
    // Initial run delayed by 45s after startup to allow boot
    this.scheduleNextRun(45 * 1000);
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
        await this.runMaintenanceCycle();
      } finally {
        if (!this.isStopped) {
          // Run maintenance cycle every 60 minutes
          this.scheduleNextRun(60 * 60 * 1000);
        }
      }
    }, delayMs);
    if (this.timer.unref) this.timer.unref();
  }

  public async runMaintenanceCycle(): Promise<{ prunedLogs: number; optimizedDatabases: number }> {
    if (this.isRunning) return { prunedLogs: 0, optimizedDatabases: 0 };
    this.isRunning = true;

    let prunedLogs = 0;
    let optimizedDatabases = 0;

    try {
      const settings = systemService.getSettings();

      // 1. Purge expired activity & audit logs
      const retentionDays = settings.log_retention_days || 30;
      prunedLogs = activityService.purgeOldLogs(retentionDays);
      if (prunedLogs > 0) {
        logger.info({ prunedLogs, retentionDays }, 'Auto-maintenance pruned expired activity & audit logs');
      }

      // 2. Perform background optimization on all active databases
      const dbs = databaseService.listDatabases();
      for (const db of dbs) {
        try {
          const dbHandle = dbManager.get(db.id);
          // PRAGMA optimize builds query planner statistics in sqlite_stat1
          dbHandle.exec('PRAGMA optimize;');
          // PRAGMA incremental_vacuum frees deleted pages back to disk if auto_vacuum is incremental
          try {
            dbHandle.exec('PRAGMA incremental_vacuum(50);');
          } catch {}
          optimizedDatabases++;
        } catch (err: any) {
          logger.debug({ dbId: db.id, error: err.message }, 'Skipping maintenance on locked or busy database');
        }
      }

      if (optimizedDatabases > 0) {
        logger.debug({ optimizedDatabases }, 'Auto-maintenance finished SQLite optimization cycle');
      }
    } catch (err) {
      logger.warn({ err }, 'Error during background maintenance worker cycle');
    } finally {
      this.isRunning = false;
    }

    return { prunedLogs, optimizedDatabases };
  }
}

export const maintenanceWorker = new MaintenanceWorker();
