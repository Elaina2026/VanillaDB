import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { getMetadataDb } from '../db/metadata.js';
import { logger } from '../utils/logger.js';
import { realtimeService } from './realtime.js';
import type { RealtimeEventPayload, WebhookRecord } from '../../../shared/index.js';

export class WebhookService {
  constructor() {
    // Listen to all realtime events and dispatch active webhooks asynchronously
    realtimeService.on('db:*', () => {});
  }

  public init(): void {
    // Wildcard subscriber for all database events
    const originalEmit = realtimeService.emit.bind(realtimeService);
    realtimeService.emit = (event: string | symbol, ...args: any[]): boolean => {
      if (typeof event === 'string' && event.startsWith('db:')) {
        const payload = args[0] as RealtimeEventPayload;
        if (payload && payload.databaseId) {
          this.dispatch(payload).catch((err) => {
            logger.warn({ err }, 'Async webhook dispatch error');
          });
        }
      }
      return originalEmit(event, ...args);
    };
  }

  public listWebhooks(databaseId: string): WebhookRecord[] {
    const metaDb = getMetadataDb();
    const rows = metaDb.prepare('SELECT * FROM webhooks WHERE database_id = ? ORDER BY created_at DESC').all(databaseId) as any[];
    return rows.map((r) => ({
      id: r.id,
      database_id: r.database_id,
      name: r.name,
      url: r.url,
      secret: r.secret,
      events: JSON.parse(r.events || '[]'),
      active: Boolean(r.active),
      created_at: r.created_at,
      last_triggered_at: r.last_triggered_at,
      failure_count: r.failure_count || 0,
    }));
  }

  public createWebhook(params: {
    databaseId: string;
    name: string;
    url: string;
    secret?: string;
    events: string[];
  }): WebhookRecord {
    const metaDb = getMetadataDb();
    const id = `wh_${nanoid(16)}`;
    const secret = params.secret || `whsec_${crypto.randomBytes(24).toString('hex')}`;
    const now = Date.now();

    metaDb.prepare(`
      INSERT INTO webhooks (id, database_id, name, url, secret, events, active, created_at, last_triggered_at, failure_count)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, NULL, 0)
    `).run(
      id,
      params.databaseId,
      params.name,
      params.url,
      secret,
      JSON.stringify(params.events),
      now
    );

    return {
      id,
      database_id: params.databaseId,
      name: params.name,
      url: params.url,
      secret,
      events: params.events,
      active: true,
      created_at: now,
      last_triggered_at: null,
      failure_count: 0,
    };
  }

  public deleteWebhook(webhookId: string): boolean {
    const metaDb = getMetadataDb();
    metaDb.prepare('DELETE FROM webhooks WHERE id = ?').run(webhookId);
    return true;
  }

  public toggleWebhook(webhookId: string, active: boolean): void {
    const metaDb = getMetadataDb();
    metaDb.prepare('UPDATE webhooks SET active = ? WHERE id = ?').run(active ? 1 : 0, webhookId);
  }

  public async dispatch(payload: RealtimeEventPayload): Promise<void> {
    if (payload.type === 'ping') return;

    const metaDb = getMetadataDb();
    const hooks = metaDb.prepare('SELECT * FROM webhooks WHERE database_id = ? AND active = 1').all(payload.databaseId) as any[];

    if (!hooks || hooks.length === 0) return;

    await Promise.allSettled(
      hooks.map(async (hook) => {
        const events: string[] = JSON.parse(hook.events || '[]');
        if (!events.includes('*') && !events.includes(payload.type)) return;

        const body = JSON.stringify(payload);
        const signature = crypto.createHmac('sha256', hook.secret).update(body).digest('hex');

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        try {
          const res = await fetch(hook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Vanilla-Signature': signature,
              'X-Vanilla-Event': payload.type,
              'User-Agent': 'VanillaDatabase-Webhook/1.0',
            },
            body,
            signal: controller.signal,
          });

          clearTimeout(timeout);
          const now = Date.now();

          if (res.ok) {
            metaDb.prepare('UPDATE webhooks SET last_triggered_at = ?, failure_count = 0 WHERE id = ?').run(now, hook.id);
          } else {
            metaDb.prepare('UPDATE webhooks SET last_triggered_at = ?, failure_count = failure_count + 1 WHERE id = ?').run(now, hook.id);
          }
        } catch (err) {
          clearTimeout(timeout);
          metaDb.prepare('UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = ?').run(hook.id);
        }
      })
    );
  }
}

export const webhookService = new WebhookService();
