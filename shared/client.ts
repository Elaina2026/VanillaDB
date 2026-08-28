import type { SqlExecutionResult, BatchResult, SqlStatement, RealtimeEventPayload, FileRecord } from './index.js';

export interface VanillaDbClientOptions {
  url: string;
  token: string;
}

export class VanillaDatabase {
  private url: string;
  private token: string;

  constructor(options: VanillaDbClientOptions) {
    if (!options.url) throw new Error('VanillaDatabase: URL is required');
    if (!options.token) throw new Error('VanillaDatabase: API token is required');
    this.url = options.url.replace(/\/$/, '');
    this.token = options.token;
  }

  // 1. Raw SQL Query
  async query<T = Record<string, any>>(sql: string, params: any[] | Record<string, any> = []): Promise<SqlExecutionResult> {
    const endpoint = this.url.endsWith('/query') ? this.url : `${this.url}/query`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error?.message || `VanillaDatabase query failed: ${res.status}`);
    }
    return json.data;
  }

  // 2. Batch Execution & Transaction
  async batch(statements: SqlStatement[], transaction = true): Promise<BatchResult> {
    const endpoint = this.url.endsWith('/batch') ? this.url : `${this.url}/batch`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ transaction, statements }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error?.message || `VanillaDatabase batch failed: ${res.status}`);
    }
    return json.data;
  }

  // 3. Realtime SSE Subscription
  subscribe(callback: (event: RealtimeEventPayload) => void, table?: string): () => void {
    const base = this.url.replace(/\/query|\/batch|\/files|\/realtime$/, '');
    let sseUrl = `${base}/realtime?token=${encodeURIComponent(this.token)}`;
    if (table) {
      sseUrl += `&table=${encodeURIComponent(table)}`;
    }

    const EventSourceImpl =
      typeof EventSource !== 'undefined'
        ? EventSource
        : (globalThis as any).EventSource;

    if (!EventSourceImpl) {
      throw new Error('EventSource is not available in this environment');
    }

    const es = new EventSourceImpl(sseUrl);

    es.onmessage = (event: MessageEvent) => {
      try {
        const payload: RealtimeEventPayload = JSON.parse(event.data);
        if (payload.type !== 'ping') {
          callback(payload);
        }
      } catch {}
    };

    ['insert', 'update', 'delete', 'schema'].forEach((eventType) => {
      es.addEventListener(eventType, (event: any) => {
        try {
          const payload: RealtimeEventPayload = JSON.parse(event.data);
          callback(payload);
        } catch {}
      });
    });

    return () => {
      es.close();
    };
  }

  // 4. File Storage API
  async listFiles(): Promise<FileRecord[]> {
    const base = this.url.replace(/\/query|\/batch|\/files|\/realtime$/, '');
    const res = await fetch(`${base}/files`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error?.message || 'List files failed');
    return json.data;
  }

  getFileUrl(fileId: string): string {
    const base = this.url.split('/v1/')[0];
    return `${base}/v1/files/${fileId}/view`;
  }

  async uploadFile(fileData: Blob | Buffer | Uint8Array, fileName: string, mimeType?: string): Promise<FileRecord> {
    const base = this.url.replace(/\/query|\/batch|\/files|\/realtime$/, '');
    const formData = new FormData();

    if (typeof Blob !== 'undefined' && fileData instanceof Blob) {
      formData.append('file', fileData, fileName);
    } else {
      const blob = new Blob([fileData as any], { type: mimeType || 'application/octet-stream' });
      formData.append('file', blob, fileName);
    }

    const res = await fetch(`${base}/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
      body: formData,
    });

    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error?.message || 'Upload file failed');
    return json.data;
  }
}
