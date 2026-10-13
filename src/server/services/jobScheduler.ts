import { nanoid } from 'nanoid';
import { getMetadataDb } from '../db/metadata.js';
import { dbManager } from '../db/manager.js';
import { activityService } from './activity.js';
import { backupService } from './backup.js';
import { webhookService } from './webhook.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import type { ScheduledJobRecord, ScheduleTaskRecord } from '#shared/index.js';

function matchCronField(val: number, field: string): boolean {
  const f = (field || '*').trim();
  if (f === '*' || f === '-' || f === '') return true;

  const subfields = f.split(',');
  for (const sf of subfields) {
    const s = sf.trim();
    if (s === '*' || s === '-') return true;

    // Step: e.g. */5 or 1-10/2
    if (s.includes('/')) {
      const [range, stepStr] = s.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) continue;
      if (range === '*' || range === '-' || range === '') {
        if (val % step === 0) return true;
      } else if (range.includes('-')) {
        const [start, end] = range.split('-').map(x => parseInt(x, 10));
        if (!isNaN(start) && !isNaN(end) && val >= start && val <= end && (val - start) % step === 0) {
          return true;
        }
      }
      continue;
    }

    // Range: e.g. 1-5
    if (s.includes('-')) {
      const [start, end] = s.split('-').map(x => parseInt(x, 10));
      if (!isNaN(start) && !isNaN(end) && val >= start && val <= end) {
        return true;
      }
      continue;
    }

    // Exact number
    const num = parseInt(s, 10);
    if (!isNaN(num) && val === num) return true;
  }
  return false;
}

export function parseNextRunTime(cronExpr: string, fromTime = Date.now()): number {
  const trimmed = cronExpr.trim().toLowerCase();

  // Friendly aliases
  if (trimmed === '@every_minute') {
    return fromTime + 60 * 1000;
  }
  if (trimmed === '@every_5m') {
    return fromTime + 5 * 60 * 1000;
  }
  if (trimmed === '@every_15m') {
    return fromTime + 15 * 60 * 1000;
  }
  if (trimmed === '@every_30m') {
    return fromTime + 30 * 60 * 1000;
  }
  if (trimmed === '@hourly') {
    const d = new Date(fromTime);
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return d.getTime();
  }
  if (trimmed === '@daily' || trimmed === '@midnight') {
    const d = new Date(fromTime);
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (trimmed === '@weekly') {
    const d = new Date(fromTime);
    d.setDate(d.getDate() + (7 - d.getDay()));
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (trimmed === '@monthly') {
    const d = new Date(fromTime);
    d.setMonth(d.getMonth() + 1, 1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  // Handle standard 5-part cron syntax (minute hour dom month dow)
  const parts = trimmed.split(/\s+/);
  if (parts.length === 5) {
    const [minPart, hourPart, domPart, monPart, dowPart] = parts;
    const start = new Date(fromTime);
    // Align to start of the next minute
    start.setSeconds(0, 0);
    start.setMinutes(start.getMinutes() + 1);

    // Search upcoming calendar minutes (up to 366 days)
    const cur = new Date(start);
    const maxMinutes = 527040;

    for (let i = 0; i < maxMinutes; i++) {
      const min = cur.getMinutes();
      const hour = cur.getHours();
      const dom = cur.getDate();
      const mon = cur.getMonth() + 1;
      const dow = cur.getDay();

      if (
        matchCronField(min, minPart) &&
        matchCronField(hour, hourPart) &&
        matchCronField(dom, domPart) &&
        matchCronField(mon, monPart) &&
        matchCronField(dow, dowPart)
      ) {
        return cur.getTime();
      }

      // Fast-forward hour if hour condition does not match
      if (!matchCronField(hour, hourPart)) {
        cur.setMinutes(0, 0, 0);
        cur.setHours(cur.getHours() + 1);
        continue;
      }

      cur.setMinutes(cur.getMinutes() + 1);
    }
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
        try {
          await this.runJob(rawJob);
        } catch (jobErr) {
          logger.warn({ err: jobErr, jobId: rawJob.id }, 'Error executing scheduled job');
        }
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
      const dbRow = metaDb.prepare('SELECT id, node_id FROM databases WHERE id = ?').get(job.database_id) as { id: string; node_id?: string } | undefined;
      if (!dbRow) {
        throw new Error(`Database ${job.database_id} not found.`);
      }

      let tasks: ScheduleTaskRecord[] = [];
      if (job.tasks_json) {
        try {
          tasks = JSON.parse(job.tasks_json);
        } catch {
          tasks = [];
        }
      }

      // Backward compatibility: if no tasks specified, use sql_query as send_command
      if (tasks.length === 0 && job.sql_query && job.sql_query.trim()) {
        tasks = [{
          id: `task_default_${job.id}`,
          action: 'send_command',
          payload: job.sql_query,
          time_offset: 0,
          continue_on_failure: false,
        }];
      }

      const isRemote = dbRow && dbRow.node_id && dbRow.node_id !== 'local' && dbRow.node_id !== config.nodeId;

      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        if (i > 0 && task.time_offset > 0) {
          const delaySec = Math.min(task.time_offset, 300);
          await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));
        }

        try {
          if (task.action === 'send_command') {
            if (isRemote) {
              const workerNode = metaDb.prepare('SELECT * FROM storage_nodes WHERE id = ?').get(dbRow.node_id!) as any;
              if (!workerNode) throw new Error(`Worker node "${dbRow.node_id}" not found.`);
              const res = await fetch(`${workerNode.base_url.replace(/\/+$/, '')}/api/admin/databases/${job.database_id}/exec`, {
                method: 'POST',
                headers: {
                  'x-cluster-secret': workerNode.auth_token || config.clusterSecret,
                  'content-type': 'application/json',
                },
                body: JSON.stringify({ sql: task.payload }),
                signal: AbortSignal.timeout(60_000),
              });
              if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson?.error?.message || `Worker execution failed: ${res.status}`);
              }
            } else {
              dbManager.executeMultiStatements(job.database_id, task.payload);
            }
          } else if (task.action === 'create_backup' || task.action === 'export_data') {
            // Backup snapshot / data export execution support
            await backupService.createBackup(job.database_id, 'scheduled');
          } else if (task.action === 'run_maintenance' || task.action === 'send_power_action') {
            const act = (task.payload || '').trim().toLowerCase();
            if (act === 'vacuum') {
              dbManager.executeMultiStatements(job.database_id, 'VACUUM;');
            } else if (act === 'optimize') {
              dbManager.executeMultiStatements(job.database_id, 'PRAGMA optimize;');
            } else if (act === 'reindex') {
              dbManager.executeMultiStatements(job.database_id, 'REINDEX;');
            } else {
              // Default maintenance: WAL checkpoint truncate + optimize
              dbManager.executeMultiStatements(job.database_id, 'PRAGMA wal_checkpoint(TRUNCATE); PRAGMA optimize;');
            }
          } else if (task.action === 'trigger_webhook') {
            await webhookService.dispatch({
              type: 'update',
              databaseId: job.database_id,
              table: 'scheduled_jobs',
              timestamp: Date.now(),
              data: {
                event: 'scheduled_job_webhook',
                jobId: job.id,
                jobName: job.name,
                taskId: task.id,
                payload: task.payload || null,
              },
            });
          }
        } catch (taskErr: any) {
          logger.warn({ taskErr, taskId: task.id, jobId: job.id }, 'Schedule task execution failed');
          if (!task.continue_on_failure) {
            throw taskErr;
          }
          errorMessage = `Task ${i + 1} (${task.action}) failed: ${taskErr.message || String(taskErr)}`;
        }
      }

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

    return rows.map((r) => this.formatJobRow(r));
  }

  public getJob(jobId: string): ScheduledJobRecord | null {
    const metaDb = getMetadataDb();
    const row = metaDb.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(jobId) as any;
    if (!row) return null;
    return this.formatJobRow(row);
  }

  private formatJobRow(r: any): ScheduledJobRecord {
    let tasks: ScheduleTaskRecord[] = [];
    if (r.tasks_json) {
      try {
        tasks = JSON.parse(r.tasks_json);
      } catch {
        tasks = [];
      }
    }
    if (tasks.length === 0 && r.sql_query && r.sql_query.trim()) {
      tasks = [{
        id: `task_default_${r.id}`,
        action: 'send_command',
        payload: r.sql_query,
        time_offset: 0,
        continue_on_failure: false,
      }];
    }

    const cronParts = (r.cron_expression || '* * * * *').split(/\s+/);
    return {
      id: r.id,
      database_id: r.database_id,
      name: r.name,
      cron_expression: r.cron_expression,
      cron_minute: r.cron_minute || cronParts[0] || '*',
      cron_hour: r.cron_hour || cronParts[1] || '*',
      cron_day_month: r.cron_day_month || cronParts[2] || '*',
      cron_month: r.cron_month || cronParts[3] || '*',
      cron_day_week: r.cron_day_week || cronParts[4] || '*',
      only_when_online: r.only_when_online !== 0,
      sql_query: r.sql_query || '',
      tasks,
      enabled: r.enabled === 1,
      last_run_at: r.last_run_at,
      next_run_at: r.next_run_at,
      last_status: r.last_status,
      last_error: r.last_error,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  }

  public createJob(
    databaseId: string,
    nameOrOpts: string | {
      name: string;
      cron_expression?: string;
      cron_minute?: string;
      cron_hour?: string;
      cron_day_month?: string;
      cron_month?: string;
      cron_day_week?: string;
      only_when_online?: boolean;
      tasks?: ScheduleTaskRecord[];
      sql_query?: string;
      enabled?: boolean;
    },
    cronExpressionArg?: string,
    sqlQueryArg?: string
  ): ScheduledJobRecord {
    const metaDb = getMetadataDb();
    const id = `job_${nanoid(16)}`;
    const now = Date.now();

    let name = '';
    let cronExpression = '* * * * *';
    let cronMinute = '*';
    let cronHour = '*';
    let cronDom = '*';
    let cronMonth = '*';
    let cronDow = '*';
    let onlyWhenOnline = true;
    let tasks: ScheduleTaskRecord[] = [];
    let sqlQuery = '';
    let enabled = true;

    if (typeof nameOrOpts === 'string') {
      name = nameOrOpts;
      cronExpression = cronExpressionArg || '* * * * *';
      sqlQuery = sqlQueryArg || '';
      const parts = cronExpression.split(/\s+/);
      cronMinute = parts[0] || '*';
      cronHour = parts[1] || '*';
      cronDom = parts[2] || '*';
      cronMonth = parts[3] || '*';
      cronDow = parts[4] || '*';
      if (sqlQuery.trim()) {
        tasks = [{
          id: `task_${nanoid(10)}`,
          action: 'send_command',
          payload: sqlQuery,
          time_offset: 0,
          continue_on_failure: false,
        }];
      }
    } else {
      name = nameOrOpts.name;
      cronMinute = nameOrOpts.cron_minute || '*';
      cronHour = nameOrOpts.cron_hour || '*';
      cronDom = nameOrOpts.cron_day_month || '*';
      cronMonth = nameOrOpts.cron_month || '*';
      cronDow = nameOrOpts.cron_day_week || '*';
      cronExpression = nameOrOpts.cron_expression || `${cronMinute} ${cronHour} ${cronDom} ${cronMonth} ${cronDow}`;
      onlyWhenOnline = nameOrOpts.only_when_online !== false;
      tasks = nameOrOpts.tasks || [];
      sqlQuery = nameOrOpts.sql_query || (tasks.find(t => t.action === 'send_command')?.payload || '');
      enabled = nameOrOpts.enabled !== false;
    }

    const nextRun = parseNextRunTime(cronExpression, now);
    const tasksJson = JSON.stringify(tasks);

    metaDb.prepare(`
      INSERT INTO scheduled_jobs (
        id, database_id, name, cron_expression, cron_minute, cron_hour, cron_day_month,
        cron_month, cron_day_week, only_when_online, tasks_json, sql_query, enabled,
        last_run_at, next_run_at, last_status, last_error, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, ?, ?)
    `).run(
      id, databaseId, name, cronExpression, cronMinute, cronHour, cronDom,
      cronMonth, cronDow, onlyWhenOnline ? 1 : 0, tasksJson, sqlQuery, enabled ? 1 : 0,
      nextRun, now, now
    );

    return {
      id,
      database_id: databaseId,
      name,
      cron_expression: cronExpression,
      cron_minute: cronMinute,
      cron_hour: cronHour,
      cron_day_month: cronDom,
      cron_month: cronMonth,
      cron_day_week: cronDow,
      only_when_online: onlyWhenOnline,
      sql_query: sqlQuery,
      tasks,
      enabled,
      last_run_at: null,
      next_run_at: nextRun,
      last_status: null,
      created_at: now,
      updated_at: now,
    };
  }

  public updateJob(
    jobId: string,
    updates: Partial<{
      name: string;
      cron_expression: string;
      cron_minute: string;
      cron_hour: string;
      cron_day_month: string;
      cron_month: string;
      cron_day_week: string;
      only_when_online: boolean;
      sql_query: string;
      tasks: ScheduleTaskRecord[];
      enabled: boolean;
    }>
  ): ScheduledJobRecord | null {
    const metaDb = getMetadataDb();
    const existing = metaDb.prepare('SELECT * FROM scheduled_jobs WHERE id = ?').get(jobId) as any;
    if (!existing) return null;

    const name: string = updates.name ?? existing.name ?? '';
    const cronMin: string = updates.cron_minute ?? existing.cron_minute ?? '*';
    const cronHr: string = updates.cron_hour ?? existing.cron_hour ?? '*';
    const cronDom: string = updates.cron_day_month ?? existing.cron_day_month ?? '*';
    const cronMon: string = updates.cron_month ?? existing.cron_month ?? '*';
    const cronDow: string = updates.cron_day_week ?? existing.cron_day_week ?? '*';

    let cron: string = updates.cron_expression || '';
    if (!cron && (updates.cron_minute || updates.cron_hour || updates.cron_day_month || updates.cron_month || updates.cron_day_week)) {
      cron = `${cronMin} ${cronHr} ${cronDom} ${cronMon} ${cronDow}`;
    } else if (!cron) {
      cron = existing.cron_expression || '* * * * *';
    }

    const onlyOnline: number = updates.only_when_online !== undefined
      ? (updates.only_when_online ? 1 : 0)
      : (existing.only_when_online !== undefined ? existing.only_when_online : 1);

    let tasksJson: string | null = existing.tasks_json ?? null;
    if (updates.tasks !== undefined) {
      tasksJson = JSON.stringify(updates.tasks);
    }

    let sql: string = updates.sql_query ?? existing.sql_query ?? '';
    if (updates.tasks !== undefined && !updates.sql_query) {
      const cmdTask = updates.tasks.find(t => t.action === 'send_command');
      if (cmdTask) sql = cmdTask.payload;
    }

    const enabled: number = updates.enabled !== undefined ? (updates.enabled ? 1 : 0) : existing.enabled;
    const nextRun: number = (updates.cron_expression || updates.cron_minute || updates.cron_hour)
      ? parseNextRunTime(cron)
      : (typeof existing.next_run_at === 'number' ? existing.next_run_at : parseNextRunTime(cron));
    const now = Date.now();

    metaDb.prepare(`
      UPDATE scheduled_jobs
      SET name = ?, cron_expression = ?, cron_minute = ?, cron_hour = ?, cron_day_month = ?,
          cron_month = ?, cron_day_week = ?, only_when_online = ?, tasks_json = ?,
          sql_query = ?, enabled = ?, next_run_at = ?, updated_at = ?
      WHERE id = ?
    `).run(name, cron, cronMin, cronHr, cronDom, cronMon, cronDow, onlyOnline, tasksJson, sql, enabled, nextRun, now, jobId);

    return this.getJob(jobId);
  }

  public addTask(jobId: string, taskInput: Omit<ScheduleTaskRecord, 'id'>): ScheduleTaskRecord | null {
    const job = this.getJob(jobId);
    if (!job) return null;

    const newTask: ScheduleTaskRecord = {
      ...taskInput,
      id: `task_${nanoid(10)}`,
      time_offset: Math.max(0, Number(taskInput.time_offset) || 0),
      continue_on_failure: Boolean(taskInput.continue_on_failure),
    };

    const updatedTasks = [...(job.tasks || []), newTask];
    this.updateJob(jobId, { tasks: updatedTasks });
    return newTask;
  }

  public updateTask(jobId: string, taskId: string, taskUpdates: Partial<ScheduleTaskRecord>): ScheduleTaskRecord | null {
    const job = this.getJob(jobId);
    if (!job) return null;

    const tasks = job.tasks || [];
    const idx = tasks.findIndex(t => t.id === taskId);
    if (idx === -1) return null;

    tasks[idx] = {
      ...tasks[idx],
      ...taskUpdates,
      time_offset: taskUpdates.time_offset !== undefined ? Math.max(0, Number(taskUpdates.time_offset)) : tasks[idx].time_offset,
      continue_on_failure: taskUpdates.continue_on_failure !== undefined ? Boolean(taskUpdates.continue_on_failure) : tasks[idx].continue_on_failure,
    };

    this.updateJob(jobId, { tasks });
    return tasks[idx];
  }

  public deleteTask(jobId: string, taskId: string): boolean {
    const job = this.getJob(jobId);
    if (!job) return false;

    const tasks = (job.tasks || []).filter(t => t.id !== taskId);
    this.updateJob(jobId, { tasks });
    return true;
  }

  public deleteJob(jobId: string): boolean {
    const metaDb = getMetadataDb();
    const res = metaDb.prepare('DELETE FROM scheduled_jobs WHERE id = ?').run(jobId);
    return res.changes > 0;
  }
}

export const jobSchedulerService = new JobSchedulerService();
