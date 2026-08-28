import { z } from 'zod';

export type TokenPermission = 'database:read' | 'database:write' | 'database:ddl' | 'database:admin';

export const TokenPermissionSchema = z.enum([
  'database:read',
  'database:write',
  'database:ddl',
  'database:admin'
]);

export interface UserRecord {
  id: string;
  username: string;
  created_at: number;
}

export interface DatabaseRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  filename: string;
  created_at: number;
  updated_at: number;
  last_accessed_at: number | null;
}

export interface ApiTokenRecord {
  id: string;
  database_id: string;
  name: string;
  description: string | null;
  token_prefix: string;
  token_last_chars: string;
  permissions: TokenPermission[];
  allowed_tables?: string[] | null;
  denied_tables?: string[] | null;
  rate_limit?: number | null; // Max requests per minute (null = unlimited)
  expires_at: number | null;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
}

export interface BackupRecord {
  id: string;
  database_id: string;
  filename: string;
  size_bytes: number;
  checksum: string;
  backup_type: 'manual' | 'scheduled' | 'system';
  created_at: number;
  status: 'completed' | 'failed';
}

export interface FileRecord {
  id: string;
  database_id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  checksum: string;
  metadata: string | null;
  created_at: number;
  updated_at: number;
}

export interface WebhookRecord {
  id: string;
  database_id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  created_at: number;
  last_triggered_at: number | null;
  failure_count: number;
}

export type RealtimeEventType = 'insert' | 'update' | 'delete' | 'schema' | 'ping';

export interface RealtimeEventPayload {
  databaseId: string;
  table?: string;
  type: RealtimeEventType;
  data?: any;
  timestamp: number;
}

export interface ActivityRecord {
  id: string;
  database_id: string | null;
  token_id: string | null;
  operation: string;
  duration_ms: number;
  status: 'success' | 'error';
  error_message?: string | null;
  timestamp: number;
  row_count?: number;
}

export interface AuditRecord {
  id: string;
  timestamp: number;
  user: string;
  action: string;
  resource: string;
  result: 'success' | 'failure';
  request_id?: string;
  details?: string | null;
}

export interface SqlQueryResult<T = Record<string, any>> {
  columns: string[];
  rows: T[];
  rowCount: number;
  durationMs: number;
}

export interface SqlWriteResult {
  changes: number;
  lastInsertRowid: number | string;
  durationMs: number;
}

export type SqlExecutionResult = SqlQueryResult | SqlWriteResult;

export interface SqlStatement {
  sql: string;
  params?: any[] | Record<string, any>;
}

export interface BatchRequest {
  transaction?: boolean;
  statements: SqlStatement[];
}

export interface BatchResult {
  results: Array<{
    statementIndex: number;
    result?: SqlExecutionResult;
    error?: string;
  }>;
  totalDurationMs: number;
}

export interface TableColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: any;
  pk: number;
  hidden?: number;
}

export interface TableIndexInfo {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
  columns?: string[];
  sql?: string;
}

export interface TableForeignKeyInfo {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
  match: string;
}

export interface TableTriggerInfo {
  name: string;
  tbl_name: string;
  sql: string;
}

export interface TableSchemaDetail {
  name: string;
  type: 'table' | 'view';
  sql: string | null;
  columns: TableColumnInfo[];
  indexes: TableIndexInfo[];
  foreignKeys: TableForeignKeyInfo[];
  triggers?: TableTriggerInfo[];
  rowCountEstimate?: number;
}

export interface DatabaseOverviewStats {
  database: DatabaseRecord;
  sqliteVersion: string;
  fileSizeBytes: number;
  walSizeBytes: number;
  tableCount: number;
  indexCount: number;
  viewCount: number;
  triggerCount: number;
  pageCount: number;
  pageSize: number;
  freelistCount: number;
  journalMode: string;
  synchronous: string;
  busyTimeout: number;
  tokenCount: number;
  lastBackupAt: number | null;
}

export interface SystemSettings {
  instance_name: string;
  base_url: string;
  default_journal_mode: string;
  default_busy_timeout: number;
  default_synchronous: string;
  default_foreign_keys: boolean;
  backup_schedule: string;
  backup_retention: number;
  log_sql: boolean;
}

export interface SystemStatus {
  version: string;
  nodeVersion: string;
  sqliteVersion: string;
  platform: string;
  cpuModel: string;
  cpuCount: number;
  uptimeSeconds: number;
  systemUptimeSeconds: number;
  databaseCount: number;
  totalDatabaseStorageBytes: number;
  mediaStorageBytes: number;
  backupStorageBytes: number;
  totalTokensCount: number;
  activeWebhooksCount: number;
  totalQueries24h: number;
  avgQueryDurationMs: number;
  errorRatePercent: number;
  osMemory: {
    total: number;
    free: number;
    used: number;
  };
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
}
