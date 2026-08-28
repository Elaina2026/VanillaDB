import { EventEmitter } from 'events';
import type { RealtimeEventPayload } from '../../../shared/index.js';

export class RealtimeService extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(2000);
  }

  public emitEvent(payload: RealtimeEventPayload): void {
    this.emit(`db:${payload.databaseId}`, payload);
    if (payload.table) {
      this.emit(`db:${payload.databaseId}:${payload.table}`, payload);
    }
  }

  public subscribe(
    databaseId: string,
    table: string | undefined,
    callback: (event: RealtimeEventPayload) => void
  ): () => void {
    const channel = table ? `db:${databaseId}:${table}` : `db:${databaseId}`;
    this.on(channel, callback);
    return () => {
      this.off(channel, callback);
    };
  }
}

export const realtimeService = new RealtimeService();
