import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { getMetadataDb } from '../db/metadata.js';
import { logger } from '../utils/logger.js';
import { realtimeService } from './realtime.js';
import type { RealtimeEventPayload, WebhookRecord } from '../../../shared/index.js';

export class WebhookService {
  private retryQueue: Array<{
    hookId: string;
    url: string;
    secret: string;
    eventType: string;
    body: string;
    attempt: number;
    maxAttempts: number;
    nextRetryAt: number;
  }> = [];
  private retryInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Listen to all realtime events and dispatch active webhooks asynchronously
    realtimeService.on('db:*', () => {});
    this.retryInterval = setInterval(() => this.processRetryQueue(), 3000);
  }

  public init(): void {
    // Subscriber for base database events (avoids duplicate dispatch from table-scoped emission)
    const originalEmit = realtimeService.emit.bind(realtimeService);
    realtimeService.emit = (event: string | symbol, ...args: any[]): boolean => {
      if (typeof event === 'string' && event.startsWith('db:')) {
        const payload = args[0] as RealtimeEventPayload;
        // Match only the base event `db:${payload.databaseId}` so each mutation triggers dispatch exactly once
        if (payload && payload.databaseId && event === `db:${payload.databaseId}`) {
          this.dispatch(payload).catch((err) => {
            logger.warn({ err }, 'Async webhook dispatch error');
          });
        }
      }
      return originalEmit(event, ...args);
    };
  }

  private async processRetryQueue(): Promise<void> {
    if (this.retryQueue.length === 0) return;
    const now = Date.now();
    const readyItems = this.retryQueue.filter((item) => item.nextRetryAt <= now);
    this.retryQueue = this.retryQueue.filter((item) => item.nextRetryAt > now);

    for (const item of readyItems) {
      await this.executePost(item.hookId, item.url, item.secret, item.eventType, item.body, item.attempt + 1, item.maxAttempts);
    }
  }

  private async executePost(
    hookId: string,
    url: string,
    secret: string,
    eventType: string,
    body: string,
    attempt = 1,
    maxAttempts = 3
  ): Promise<boolean> {
    const metaDb = getMetadataDb();
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vanilla-Signature': signature,
          'X-Vanilla-Event': eventType,
          'X-Vanilla-Delivery-Attempt': String(attempt),
          'User-Agent': 'VanillaDatabase-Webhook/1.3',
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const now = Date.now();

      if (res.ok) {
        metaDb.prepare('UPDATE webhooks SET last_triggered_at = ?, failure_count = 0 WHERE id = ?').run(now, hookId);
        return true;
      } else {
        metaDb.prepare('UPDATE webhooks SET last_triggered_at = ?, failure_count = failure_count + 1 WHERE id = ?').run(now, hookId);
        this.scheduleRetry(hookId, url, secret, eventType, body, attempt, maxAttempts);
        return false;
      }
    } catch (err) {
      clearTimeout(timeout);
      metaDb.prepare('UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = ?').run(hookId);
      this.scheduleRetry(hookId, url, secret, eventType, body, attempt, maxAttempts);
      return false;
    }
  }

  private scheduleRetry(
    hookId: string,
    url: string,
    secret: string,
    eventType: string,
    body: string,
    attempt: number,
    maxAttempts: number
  ): void {
    if (attempt >= maxAttempts) return; // Exhausted retries

    // Exponential backoff delays: Attempt 1 -> 5s, Attempt 2 -> 15s, Attempt 3 -> 45s
    const delayMs = Math.pow(3, attempt) * 1500;
    this.retryQueue.push({
      hookId,
      url,
      secret,
      eventType,
      body,
      attempt,
      maxAttempts,
      nextRetryAt: Date.now() + delayMs,
    });
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

        let isDiscord = false;
        let isSlack = false;
        let isTelegram = false;
        try {
          const parsedUrl = new URL(hook.url);
          isDiscord = (parsedUrl.hostname === 'discord.com' || parsedUrl.hostname === 'discordapp.com') && parsedUrl.pathname.includes('/api/webhooks');
          isSlack = (parsedUrl.hostname === 'hooks.slack.com') && parsedUrl.pathname.includes('/services/');
          isTelegram = parsedUrl.hostname === 'api.telegram.org' && parsedUrl.pathname.includes('/bot');
        } catch {}

        let postPayload: any;
        if (isDiscord) {
          const colorMap: Record<string, number> = {
            insert: 0x10b981,
            update: 0x3b82f6,
            delete: 0xef4444,
            schema: 0x8b5cf6,
            alert: 0xf59e0b,
          };
          const dataStr = JSON.stringify(payload.data ?? {}, null, 2);
          const truncatedData = dataStr.length > 1000 ? dataStr.slice(0, 1000) + '...' : dataStr;

          postPayload = {
            username: 'VanillaDatabase',
            embeds: [
              {
                title: `Event: ${payload.type.toUpperCase()}`,
                color: colorMap[payload.type] || 0x64748b,
                fields: [
                  { name: 'Database', value: `\`${payload.databaseId}\``, inline: true },
                  { name: 'Table', value: payload.table ? `\`${payload.table}\`` : '—', inline: true },
                  { name: 'Data', value: `\`\`\`json\n${truncatedData}\n\`\`\``, inline: false },
                ],
                timestamp: new Date(payload.timestamp || Date.now()).toISOString(),
                footer: { text: 'VanillaDatabase Webhooks' },
              },
            ],
          };
        } else if (isSlack) {
          postPayload = {
            text: `[VanillaDB] ${payload.type.toUpperCase()} on \`${payload.databaseId}\`${payload.table ? ` (\`${payload.table}\`)` : ''}`,
            attachments: [
              {
                color: payload.type === 'insert' ? '#10b981' : payload.type === 'update' ? '#3b82f6' : '#ef4444',
                text: `\`\`\`${JSON.stringify(payload.data ?? {}, null, 2)}\`\`\``,
                ts: Math.floor((payload.timestamp || Date.now()) / 1000),
              },
            ],
          };
        } else if (isTelegram) {
          const chatIdMatch = hook.url.match(/chat_id=([^&]+)/);
          const chatId = hook.secret || (chatIdMatch ? chatIdMatch[1] : '');
          postPayload = {
            chat_id: chatId,
            text: `*[VanillaDB Event]*: \`${payload.type.toUpperCase()}\`\n*Database:* \`${payload.databaseId}\`\n${payload.table ? `*Table:* \`${payload.table}\`\n` : ''}\`\`\`json\n${JSON.stringify(payload.data ?? {}, null, 2).slice(0, 800)}\n\`\`\``,
            parse_mode: 'Markdown',
          };
        } else {
          postPayload = payload;
        }

        const body = JSON.stringify(postPayload);
        await this.executePost(hook.id, hook.url, hook.secret, payload.type, body, 1, 3);
      })
    );
  }

  public destroy(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
  }
}

export const webhookService = new WebhookService();
