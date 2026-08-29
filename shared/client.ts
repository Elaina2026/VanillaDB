import type { SqlQueryResult, SqlExecutionResult, BatchResult, SqlStatement, RealtimeEventPayload, FileRecord } from './index.js';

export interface VanillaDbClientOptions {
  url: string;
  token: string;
}

export interface TableQueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  order?: 'ASC' | 'DESC';
}

export interface VectorSearchOptions {
  table: string;
  vectorColumn: string;
  vector: number[];
  limit?: number;
  select?: string;
  threshold?: number;
}

export class TableQueryBuilder<T = Record<string, any>> {
  constructor(
    private client: VanillaDatabase,
    private tableName: string
  ) {}

  async select(options: TableQueryOptions = {}): Promise<{ rows: T[]; rowCount: number }> {
    const base = this.client.getBaseUrl();
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));
    if (options.orderBy) params.set('orderBy', options.orderBy);
    if (options.order) params.set('order', options.order);

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${base}/tables/${encodeURIComponent(this.tableName)}/rows${queryStr}`, {
      headers: {
        'Authorization': `Bearer ${this.client.getToken()}`,
      },
    });

    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error?.message || `Select failed: ${res.status}`);
    return json.data;
  }

  async insert(row: Partial<T>): Promise<SqlExecutionResult> {
    const base = this.client.getBaseUrl();
    const res = await fetch(`${base}/tables/${encodeURIComponent(this.tableName)}/rows`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.client.getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(row),
    });

    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error?.message || `Insert failed: ${res.status}`);
    return json.data;
  }

  async update(where: { [key: string]: any }, values: Partial<T>): Promise<SqlExecutionResult> {
    const base = this.client.getBaseUrl();
    const res = await fetch(`${base}/tables/${encodeURIComponent(this.tableName)}/rows`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.client.getToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ where, values }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error?.message || `Update failed: ${res.status}`);
    return json.data;
  }

  async delete(primaryKeyOrCondition: { [key: string]: any }): Promise<SqlExecutionResult> {
    const base = this.client.getBaseUrl();
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(primaryKeyOrCondition)) {
      params.set(k, String(v));
    }

    const res = await fetch(`${base}/tables/${encodeURIComponent(this.tableName)}/rows?${params.toString()}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.client.getToken()}`,
      },
    });

    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error?.message || `Delete failed: ${res.status}`);
    return json.data;
  }
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

  public getBaseUrl(): string {
    return this.url.replace(/\/query|\/batch|\/files|\/realtime$/, '');
  }

  public getToken(): string {
    return this.token;
  }

  // 1. Table CRUD Helper
  from<T = Record<string, any>>(tableName: string): TableQueryBuilder<T> {
    return new TableQueryBuilder<T>(this, tableName);
  }

  table<T = Record<string, any>>(tableName: string): TableQueryBuilder<T> {
    return this.from<T>(tableName);
  }

  // 2. AI Vector Cosine Similarity Search Helper
  async vectorSearch<T = Record<string, any>>(options: VectorSearchOptions): Promise<Array<T & { similarity: number }>> {
    const { table, vectorColumn, vector, limit = 10, select = '*', threshold } = options;
    const vecJson = JSON.stringify(vector);

    let sql = `
      SELECT ${select}, vec_cosine_similarity(${vectorColumn}, ?) as similarity
      FROM "${table.replace(/"/g, '""')}"
    `;

    const params: any[] = [vecJson];

    if (typeof threshold === 'number') {
      sql += ` WHERE similarity >= ?`;
      params.push(threshold);
    }

    sql += ` ORDER BY similarity DESC LIMIT ?`;
    params.push(limit);

    const result = await this.query(sql, params);
    return ((result as any).rows || []) as Array<T & { similarity: number }>;
  }

  // 3. Raw SQL Query
  async query<T = Record<string, any>>(sql: string, params: any[] | Record<string, any> = []): Promise<SqlQueryResult<T>> {
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

  // 4. Batch Execution & Transaction
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

  // 5. Realtime SSE Subscription
  subscribe(callback: (event: RealtimeEventPayload) => void, table?: string): () => void {
    const base = this.getBaseUrl();
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

  // 6. File Storage API
  async listFiles(): Promise<FileRecord[]> {
    const base = this.getBaseUrl();
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
    const base = this.getBaseUrl();
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

  async deleteFile(fileId: string): Promise<boolean> {
    const base = this.getBaseUrl();
    const res = await fetch(`${base}/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error?.message || 'Delete file failed');
    return true;
  }
}

