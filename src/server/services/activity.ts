import { nanoid } from 'nanoid';
import { getMetadataDb } from '../db/metadata.js';
import type { ActivityRecord, AuditRecord } from '../../../shared/index.js';

export class ActivityService {
  private activityQueue: ActivityRecord[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.flushInterval = setInterval(() => this.flush(), 5 * 1000);
  }

  public recordActivity(params: {
    databaseId?: string | null;
    tokenId?: string | null;
    operation: string;
    durationMs: number;
    status: 'success' | 'error';
    errorMessage?: string | null;
    rowCount?: number;
  }): void {
    const record: ActivityRecord = {
      id: `act_${nanoid(16)}`,
      database_id: params.databaseId || null,
      token_id: params.tokenId || null,
      operation: params.operation,
      duration_ms: params.durationMs,
      status: params.status,
      error_message: params.errorMessage || null,
      row_count: params.rowCount !== undefined ? params.rowCount : undefined,
      timestamp: Date.now(),
    };
    this.activityQueue.push(record);
    if (this.activityQueue.length >= 100) {
      this.flush();
    }
  }

  public recordAudit(params: {
    user: string;
    action: string;
    resource: string;
    result: 'success' | 'failure';
    requestId?: string;
    details?: string | null;
  }): void {
    const metaDb = getMetadataDb();
    const id = `aud_${nanoid(16)}`;
    const now = Date.now();

    try {
      metaDb.prepare(`
        INSERT INTO audit_logs (id, user, action, resource, result, request_id, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        params.user,
        params.action,
        params.resource,
        params.result,
        params.requestId || null,
        params.details || null,
        now
      );
    } catch {
      // Ignore audit log error
    }
  }

  public listActivity(filters?: {
    databaseId?: string;
    tokenId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): { items: ActivityRecord[]; total: number } {
    this.flush();
    const metaDb = getMetadataDb();

    let query = 'SELECT * FROM activity_logs WHERE 1=1';
    let countQuery = 'SELECT COUNT(*) as count FROM activity_logs WHERE 1=1';
    const params: any[] = [];
    const countParams: any[] = [];

    if (filters?.databaseId) {
      query += ' AND database_id = ?';
      countQuery += ' AND database_id = ?';
      params.push(filters.databaseId);
      countParams.push(filters.databaseId);
    }
    if (filters?.tokenId) {
      query += ' AND token_id = ?';
      countQuery += ' AND token_id = ?';
      params.push(filters.tokenId);
      countParams.push(filters.tokenId);
    }
    if (filters?.status) {
      query += ' AND status = ?';
      countQuery += ' AND status = ?';
      params.push(filters.status);
      countParams.push(filters.status);
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;
    params.push(limit, offset);

    const items = metaDb.prepare(query).all(...params) as unknown as ActivityRecord[];
    const totalRow = metaDb.prepare(countQuery).get(...countParams) as { count: number };

    return { items, total: totalRow.count };
  }

  public listAuditLogs(limit = 50, offset = 0): { items: AuditRecord[]; total: number } {
    const metaDb = getMetadataDb();
    const items = metaDb.prepare(`
      SELECT id, user, action, resource, result, request_id, details, timestamp
      FROM audit_logs
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as unknown as AuditRecord[];

    const totalRow = metaDb.prepare('SELECT COUNT(*) as count FROM audit_logs').get() as { count: number };
    return { items, total: totalRow.count };
  }

  public flush(): void {
    if (this.activityQueue.length === 0) return;
    const metaDb = getMetadataDb();
    const items = [...this.activityQueue];
    this.activityQueue = [];

    const stmt = metaDb.prepare(`
      INSERT INTO activity_logs (id, database_id, token_id, operation, duration_ms, status, error_message, row_count, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    metaDb.exec('BEGIN TRANSACTION;');
    try {
      for (const item of items) {
        stmt.run(
          item.id,
          item.database_id,
          item.token_id,
          item.operation,
          item.duration_ms,
          item.status,
          item.error_message || null,
          item.row_count || null,
          item.timestamp
        );
      }
      metaDb.exec('COMMIT;');
    } catch {
      metaDb.exec('ROLLBACK;');
    }
  }

  public destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush();
  }
}

export const activityService = new ActivityService();
