import { nanoid } from 'nanoid';
import { getMetadataDb } from '../db/metadata.js';
import { dbManager } from '../db/manager.js';
import { activityService } from './activity.js';
import { logger } from '../utils/logger.js';
import type { ScheduledJobRecord } from '#shared/index.js';

export function parseNextRunTime(cronExpr: string, fromTime = Date.now()): number {
  const trimmed = cronExpr.trim().toLowerCase();
  const date = new Date(fromTime);

  // Friendly aliases
  if (trimmed === '@every_minute' || trimmed === '* * * * *') {
    return fromTime + 60 * 1000;
  }
  if (trimmed === '@every_5m' || trimmed === '*/5 * * * *') {
    return fromTime + 5 * 60 * 1000;
  }
  if (trimmed === '@every_15m' || trimmed === '*/15 * * * *') {
    return fromTime + 15 * 60 * 1000;
  }
  if (trimmed === '@hourly' || trimmed === '0 * * * *') {
    date.setHours(date.getHours() + 1, 0, 0, 0);
    return date.getTime();
  }
  if (trimmed === '@daily' || trimmed === '0 0 * * *') {
    date.setDate(date.getDate() + 1);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }
  if (trimmed === '@weekly' || trimmed === '0 0 * * 0') {
    date.setDate(date.getDate() + (7 - date.getDay()));
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  // Default fallback: 1 hour later
  return fromTime + 60 * 60 * 1000;
}

export class JobSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private readonly pollIntervalMs = 20 * 1000; // 20s tick

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.pollIntervalMs);
    // Initial evaluation
    setTimeout(() => this.tick(), 2000);
    logger.info('Scheduled Job Engine started');
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async tick(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = Date.now();
      const metaDb = getMetadataDb();
      const dueJobs = metaDb.prepare(`
        SELECT * FROM scheduled_jobs
        WHERE enabled = 1 AND (next_run_at IS NULL OR next_run_at <= ?)
        LIMIT 10
      `).all(now) as any[];

      for (const rawJob of dueJobs) {
        await this.runJob(rawJob);
      }
    } catch (err) {
      logger.warn({ err }, 'Error in job scheduler tick');
    } finally {
      this.isProcessing = false;
    }
  }

  public async runJob(job: any): Promise<{ success: boolean; error?: string }> {
    const metaDb = getMetadataDb();
    const startTime = performance.now();
    let status: 'success' | 'failed' = 'success';
    let errorMessage: string | null = null;

    try {
      dbManager.executeMultiStatements(job.database_id, job.sql_query);
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

      activityService.recordActivity({
        databaseId: job.database_id,
        operation: `CRON_JOB:${job.name}`,
        durationMs,
        status: 'success',
      });
    } catch (err: any) {
      status = 'failed';
      errorMessage = err.message || String(err);
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

      activityService.recordActivity({
        databaseId: job.database_id,
        operation: `CRON_JOB:${job.name}`,
        durationMs,
        status: 'error',
        errorMessage,
      });
      logger.error({ err, jobId: job.id, jobName: job.name }, 'Failed to execute scheduled job');
    }

    const nextRun = parseNextRunTime(job.cron_expression, Date.now());
    metaDb.prepare(`
      UPDATE scheduled_jobs
      SET last_run_at = ?, next_run_at = ?, last_status = ?, last_error = ?, updated_at = ?
      WHERE id = ?
    `).run(Date.now(), nextRun, status, errorMessage, Date.now(), job.id);

    return { success: status === 'success', error: errorMessage || undefined };
  }

  public listJobs(databaseId: string): ScheduledJobRecord[] {
    const metaDb = getMetadataDb();
    const rows = metaDb.prepare(`
      SELECT * FROM scheduled_jobs
      WHERE database_id = ?
      ORDER BY created_at DESC
    `).all(databaseId) as any[];

    return rows.map((r) => ({
      id: r.id,
      database_id: r.database_id,
      name: r.name,
      cron_expression: r.cron_expression,
      sql_query: r.sql_query,
      enabled: r.enabled === 1,
      last_run_at: r.last_run_at,
      next_run_at: r.next_run_at,
      last_status: r.last_status,
      last_error: r.last_error,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  }

  public createJob(databaseId: string, name: string, cronExpression: string, sqlQuery: string): ScheduledJobRecord {
    const metaDb = getMetadataDb();
    const id = `job_${nanoid(16)}`;
    const now = Date.now();
    const nextRun = parseNextRunTime(cronExpression, now);

    metaDb.prepare(`
      INSERT INTO scheduled_jobs (id, database_id, name, cron_expression, sql_query, enabled, last_run_at, next_run_at, last_status, last_error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, NULL, ?, NULL, NULL, ?, ?)
    `).run(id, databaseId, name, cronExpression, sqlQuery, nextRun, now, now);

    return {
      id,
      database_id: databaseId,
      name,
      cron_expression: cronExpression,
      sql_query: sqlQuery,
      enabled: true,
      last_run_at: null,
      next_run_at: nextRun,
      last_status: null,
      created_at: now,
      updated_at: now,
    };
  }

  public updateJob(jobId: string, updates: Partial<{ name: string; cron_expression: string; sql_query: string; enabled: boolean }>): ScheduledJobRecord | null {
    const metaDb = getMetadataDb();
    const existing = metaDb.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(jobId) as any;
    if (!existing) return null;

    const name = updates.name ?? existing.name;
    const cron = updates.cron_expression ?? existing.cron_expression;
    const sql = updates.sql_query ?? existing.sql_query;
    const enabled = updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : existing.enabled;
    const nextRun = updates.cron_expression ? parseNextRunTime(cron) : existing.next_run_at;
    const now = Date.now();

    metaDb.prepare(`
      UPDATE scheduled_jobs
      SET name = ?, cron_expression = ?, sql_query = ?, enabled = ?, next_run_at = ?, updated_at = ?
      WHERE id = ?
    `).run(name, cron, sql, enabled, nextRun, now, jobId);

    return {
      ...existing,
      name,
      cron_expression: cron,
      sql_query: sql,
      enabled: enabled === 1,
      next_run_at: nextRun,
      updated_at: now,
    };
  }

  public deleteJob(jobId: string): boolean {
    const metaDb = getMetadataDb();
    const res = metaDb.prepare('DELETE FROM scheduled_jobs WHERE id = ?').run(jobId);
    return res.changes > 0;
  }
}

export const jobSchedulerService = new JobSchedulerService();
