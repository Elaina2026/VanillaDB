# Kiến trúc & Toàn bộ Code VanillaDatabase

Tài liệu chi tiết toàn bộ mã nguồn liên quan đến cơ sở dữ liệu VanillaDatabase trong hệ thống, bao gồm cấu trúc bảng (schema migrations v1 → v6), cơ chế bảo vệ concurrency (`operation_guards`), mã hóa token (AES-256-GCM + AAD), và lớp client HTTP (`VanillaDatabaseClient`).

---

## Mục lục
1. [Tổng quan kiến trúc & Schema Database](#1-tổng-quan-kiến-trúc--schema-database)
2. [Chi tiết src/vanilla-database.js](#2-srcvanilla-databasejs)
3. [Chi tiết src/database.js](#3-srcdatabasejs)
4. [Chi tiết src/migrate.js](#4-srcmigratejs)

---

## 1. Tổng quan kiến trúc & Schema Database

Hệ thống sử dụng SQLite thông qua VanillaDatabase HTTP API (`@nullex/vanilladb`). Toàn bộ database gồm 6 phiên bản migration (`SCHEMA_VERSION = 6`):

### Các bảng dữ liệu (Tables)
- **`schema_migrations`**: Quản lý phiên bản migration đã chạy (`version`, `applied_at`).
- **`metadata`**: Lưu cấu hình runtime, key-check mã hóa, trạng thái legacy import (`key`, `value`, `updated_at`).
- **`migration_locks`**: Khóa phân tán chống race condition khi chạy migration song song.
- **`users`**: Thông tin người dùng Discord (`id`, `discord_id`, `username`, `global_name`, `avatar`, `created_at`, `updated_at`).
- **`entitlements`**: Quyền hạn người dùng (`user_id`, `status`, `max_tokens`, `expires_at`, ...).
- **`license_codes`**: Mã kích hoạt bản quyền (`id`, `code_hash`, `max_tokens`, `duration_seconds`, `status`, `target_discord_id`, `delivery_status`, ...).
- **`sessions`**: Phiên đăng nhập web dashboard (`token_hash`, `user_id`, `csrf_hash`, `expires_at`, `absolute_expires_at`).
- **`oauth_states`**: State chống CSRF khi đăng nhập OAuth2 Discord.
- **`accounts`**: Tài khoản Discord bot / user RPC (`id`, `user_id`, `label`, `token_ciphertext`, `token_iv`, `token_tag`, `token_crypto_version`, `form_state`, `auto_reconnect`, `last_applied_config`, `voice_config`, `voice_auto_join`, `chat_config`, `chat_auto_start`, ...).
- **`audit_logs`**: Nhật ký kiểm toán mọi hành động quan trọng (`id`, `actor_user_id`, `action`, `target_type`, `target_id`, `metadata`, `created_at`).
- **`voice_pools`**: Nhóm tài khoản cùng vào voice room (`id`, `user_id`, `label`, `guild_id`, `channel_id`, `self_mute`, `self_deaf`).
- **`voice_pool_members`**: Thành viên trong voice pool (`pool_id`, `account_id`, `position`).
- **`dm_notifications`**: Hàng đợi gửi thông báo DM Discord bất đồng bộ (`id`, `user_id`, `kind`, `fingerprint`, `payload`, `status`, `attempts`, `next_attempt_at`, `last_error_code`).
- **`operation_guards`**: Bảng tạm (semaphore) đảm bảo tính atomic và idempotent cho các thao tác batch SQL.
- **`data_imports`**: Theo dõi tiến trình import dữ liệu.

---

## 2. src/vanilla-database.js

### Chức năng chính
- Kế thừa `VanillaDatabase` từ `@nullex/vanilladb`.
- Thực hiện gọi REST API qua `fetch` (`/query` và `/batch`).
- **Bảo mật**: Không bao giờ rò rỉ token qua URL hoặc error object; xóa token khỏi error stack/message.
- **Phân loại lỗi mạng (`classifyNetworkError`)**: Nhận diện `dns`, `connect-timeout`, `connection-reset`, `tls`, `request-timeout`, `upstream-http`.
- **Giới hạn kích thước payload & stream**: Kiểm tra `MAX_REQUEST_BYTES` (16MB) và `MAX_RESPONSE_BYTES` (16MB), hủy stream sớm nếu response vượt giới hạn để chống cạn kiệt RAM.
- **Chuẩn hóa SQL & Params**: Kiểm tra chặt chẽ kiểu dữ liệu của parameters, chuyển BigInt hợp lệ thành Number, từ chối kiểu dữ liệu lạ.

### Toàn bộ code `src/vanilla-database.js`:
```javascript
import { VanillaDatabase } from '@nullex/vanilladb';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_REQUEST_BYTES = 16 * 1024 * 1024;
const BASE_URL_PATTERN = /^\/v1\/databases\/([A-Za-z0-9_-]+)\/?$/;

function defaultError(code, message) {
  const error = new Error(message);
  error.name = 'VanillaDatabaseError';
  error.code = code;
  return error;
}

function withNetworkCategory(error, networkCategory) {
  error.networkCategory = networkCategory;
  return error;
}

function classifyNetworkError(error, { timedOut = false } = {}) {
  if (timedOut) return 'request-timeout';
  const codes = new Set();
  const names = new Set();
  const seen = new Set();
  let current = error;
  for (let depth = 0; current && typeof current === 'object' && depth < 4; depth += 1) {
    if (seen.has(current)) break;
    seen.add(current);
    if (typeof current.code === 'string' && current.code.length <= 64) codes.add(current.code.toUpperCase());
    if (typeof current.name === 'string' && current.name.length <= 64) names.add(current.name);
    current = current.cause;
  }
  if (codes.has('ENOTFOUND') || codes.has('EAI_AGAIN')) return 'dns';
  if (codes.has('UND_ERR_CONNECT_TIMEOUT') || codes.has('ETIMEDOUT')) return 'connect-timeout';
  if (['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET'].some((code) => codes.has(code))) {
    return 'connection-reset';
  }
  if ([...codes].some((code) => code.startsWith('ERR_TLS_') || code.startsWith('ERR_SSL_') || [
    'CERT_HAS_EXPIRED',
    'CERT_NOT_YET_VALID',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_GET_ISSUER_CERT',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  ].includes(code))) return 'tls';
  if (codes.has('ABORT_ERR') || codes.has('UND_ERR_ABORTED')
    || names.has('AbortError') || names.has('TimeoutError')) return 'request-timeout';
  return 'network';
}

function validateBaseUrl(value, errorFactory = defaultError) {
  let url;
  try { url = new URL(String(value || '')); }
  catch { throw errorFactory('DATABASE_CONFIG_INVALID', 'VANILLA_DB_URL không hợp lệ.'); }
  const match = url.pathname.match(BASE_URL_PATTERN);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !match) {
    throw errorFactory('DATABASE_CONFIG_INVALID', 'VANILLA_DB_URL không hợp lệ.');
  }
  return { url: url.href.replace(/\/$/, ''), databaseId: match[1] };
}

function normalizeStatement(statement, errorFactory = defaultError) {
  const source = typeof statement === 'string' ? { sql: statement, args: [] } : statement;
  const sql = typeof source?.sql === 'string' ? source.sql.trim() : '';
  const args = source?.args ?? source?.params ?? [];
  if (!sql) throw errorFactory('DATABASE_QUERY_INVALID', 'SQL không được để trống.');
  if (!Array.isArray(args)) throw errorFactory('DATABASE_QUERY_INVALID', 'SQL params phải là mảng.');
  const params = args.map((value) => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'bigint' && value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER) return Number(value);
    throw errorFactory('DATABASE_QUERY_INVALID', 'SQL param không hỗ trợ kiểu dữ liệu này.');
  });
  return { sql, params };
}

function normalizeResult(value = {}) {
  const rows = Array.isArray(value.rows) ? value.rows : [];
  const rowsAffected = Number(value.changes ?? value.rowsAffected ?? 0);
  return {
    columns: Array.isArray(value.columns) ? value.columns.map(String) : [],
    rows,
    rowsAffected: Number.isFinite(rowsAffected) ? rowsAffected : 0,
    lastInsertRowid: value.lastInsertRowid ?? null,
  };
}

async function readTextBounded(response, maxBytes, errorFactory) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel?.().catch?.(() => {});
    throw errorFactory('DATABASE_RESPONSE_TOO_LARGE', 'VanillaDatabase trả response vượt giới hạn.');
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw errorFactory('DATABASE_RESPONSE_TOO_LARGE', 'VanillaDatabase trả response vượt giới hạn.');
    }
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let size = 0;
  let complete = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { complete = true; break; }
      size += value.byteLength;
      if (size > maxBytes) {
        throw errorFactory('DATABASE_RESPONSE_TOO_LARGE', 'VanillaDatabase trả response vượt giới hạn.');
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } finally {
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock?.();
  }
}

function responseError(status, payload, errorFactory) {
  const remoteCode = String(payload?.error?.code || '').toUpperCase();
  const remoteMessage = String(payload?.error?.message || '');
  if (['SQLITE_BUSY', 'DATABASE_BUSY'].includes(remoteCode)
    || /\b(?:SQLITE_BUSY|DATABASE_BUSY|database (?:is )?(?:currently )?(?:locked|busy))\b/i.test(remoteMessage)) {
    return errorFactory('SQLITE_BUSY', 'VanillaDatabase đang bận; hãy thử lại.');
  }
  if (status === 401) return errorFactory('DATABASE_AUTH_FAILED', 'VanillaDatabase token không hợp lệ hoặc đã hết hạn.');
  if (status === 403) return errorFactory('DATABASE_FORBIDDEN', 'VanillaDatabase token thiếu quyền cần thiết.');
  if (status >= 500) {
    return withNetworkCategory(
      errorFactory('DATABASE_UNAVAILABLE', 'VanillaDatabase tạm thời không khả dụng.'),
      'upstream-http',
    );
  }
  return errorFactory('DATABASE_QUERY_FAILED', `VanillaDatabase từ chối request (${remoteCode || status || 'UNKNOWN'}).`);
}

class VanillaDatabaseClient extends VanillaDatabase {
  constructor({
    url,
    token,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxResponseBytes = MAX_RESPONSE_BYTES,
    maxRequestBytes = MAX_REQUEST_BYTES,
    errorFactory = defaultError,
  } = {}) {
    const endpoint = validateBaseUrl(url, errorFactory);
    const safeToken = typeof token === 'string' ? token.trim() : '';
    if (!safeToken) throw errorFactory('DATABASE_CONFIG_INVALID', 'Thiếu VANILLA_DB_TOKEN.');
    if (typeof fetchImpl !== 'function') throw errorFactory('DATABASE_CONFIG_INVALID', 'Runtime không hỗ trợ fetch.');
    super({ url: endpoint.url, token: safeToken });
    this.databaseId = endpoint.databaseId;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.maxResponseBytes = maxResponseBytes;
    this.maxRequestBytes = maxRequestBytes;
    this.errorFactory = errorFactory;
    this.supportsConnectionPragmas = false;
  }

  async request(kind, payload) {
    const body = JSON.stringify(payload);
    if (Buffer.byteLength(body, 'utf8') > this.maxRequestBytes) {
      throw this.errorFactory('DATABASE_REQUEST_TOO_LARGE', 'VanillaDatabase request vượt giới hạn.');
    }
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    timeout.unref?.();
    let response;
    try {
      response = await this.fetch(`${this.getBaseUrl()}/${kind}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body,
        signal: controller.signal,
        redirect: 'error',
      });
      const text = await readTextBounded(response, this.maxResponseBytes, this.errorFactory);
      let result;
      try { result = JSON.parse(text); }
      catch { throw this.errorFactory('DATABASE_RESPONSE_INVALID', 'VanillaDatabase trả JSON không hợp lệ.'); }
      if (!response.ok || result?.success !== true) {
        throw responseError(response.status, result, this.errorFactory);
      }
      return result.data;
    } catch (error) {
      if (error?.code === 'SQLITE_BUSY' || error?.code?.startsWith?.('DATABASE_')) throw error;
      await response?.body?.cancel?.().catch?.(() => {});
      throw withNetworkCategory(
        this.errorFactory('DATABASE_UNAVAILABLE', 'Không thể kết nối VanillaDatabase.'),
        classifyNetworkError(error, { timedOut }),
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async query(sql, params = []) {
    const normalized = normalizeStatement({ sql, params }, this.errorFactory);
    return this.request('query', normalized);
  }

  async execute(statement) {
    const normalized = normalizeStatement(statement, this.errorFactory);
    return normalizeResult(await this.query(normalized.sql, normalized.params));
  }

  async batch(statements, transaction = true) {
    if (!Array.isArray(statements) || !statements.length) {
      throw this.errorFactory('DATABASE_QUERY_INVALID', 'Batch cần ít nhất một statement.');
    }
    const atomic = typeof transaction === 'object' ? transaction.transaction !== false
      : typeof transaction === 'string' ? transaction !== 'none' : transaction !== false;
    const normalized = statements.map((statement) => normalizeStatement(statement, this.errorFactory));
    const data = await this.request('batch', { transaction: atomic, statements: normalized });
    const results = Array.isArray(data?.results) ? data.results : [];
    const ordered = Array.from({ length: normalized.length }, () => normalizeResult());
    for (const entry of results) {
      const index = Number(entry?.statementIndex);
      if (Number.isInteger(index) && index >= 0 && index < ordered.length) {
        ordered[index] = normalizeResult(entry.result);
      }
    }
    return ordered;
  }

  close() {}
}

export {
  DEFAULT_TIMEOUT_MS,
  MAX_REQUEST_BYTES,
  MAX_RESPONSE_BYTES,
  VanillaDatabaseClient,
  classifyNetworkError,
  normalizeResult,
  normalizeStatement,
  validateBaseUrl,
};
```

---

## 3. src/database.js

### Chức năng chính
1. **Quản lý Migration (`migrateDatabase`, `assertSchema`)**:
   - Chạy 6 bước migration tuần tự, tự tạo bảng và index, ghi version vào `schema_migrations`.
   - Idempotent: chạy lại an toàn, hỗ trợ phân tán không bị đụng độ schema.
2. **Lớp ORM `Database`**:
   - Thao tác người dùng: `upsertUser`, `getUserByDiscordId`, `getUserById`, `listUsers`.
   - Quản lý metadata: `getMetadata`, `setMetadata`.
   - Quản lý quyền hạn và bản quyền: `getEntitlement`, `hasRedeemedLicense`, `listLicenseCodes`.
   - Quản lý Audit Log: `audit`, `auditStatement`, `listAuditLogs`.
   - Hàng đợi DM Notifications: `enqueueNotification`, `claimNotifications` (phân phối atomic bằng `operation_guards`), `completeNotification`, `failNotification`, `listNotificationStatuses`.
3. **Lớp quản lý tài khoản `DatabaseAccountsStore`**:
   - `createForUser`: Kiểm tra entitlement + quota tài khoản + lưu token mã hóa AES-GCM qua atomic transaction.
   - `getOwned`: Lấy và giải mã token, tự động migrate crypto version từ v1 lên v2 (thêm AAD ràng buộc `userId` và `accountId`).
   - `updateLabelForUser`, `replaceTokenForUser`, `deleteForUser`.
   - `updateFormStateForUser`, `saveAppliedConfigForUser`, `setAutoReconnectForUser`, `updateRestoreStatusForUser`.
   - Quản lý tính năng Voice / Chat tự động: `updateVoiceConfigForUser`, `updateChatConfigForUser`.
   - Quản lý Voice Pool đa tài khoản: `createVoicePoolForUser`, `updateVoicePoolForUser`, `deleteVoicePoolForUser`, `listVoicePoolsForUser`.
4. **Bảo mật & Tiện ích**:
   - `ensureEncryptionKeyCheck`: Kiểm tra tính toàn vẹn của `TOKEN_ENCRYPTION_KEY` với database khi khởi động server.
   - `importLegacyAccounts`: Import tài khoản cũ từ file `accounts.json` và tự động xóa file plaintext an toàn.

### Toàn bộ code `src/database.js`:
```javascript
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { VanillaDatabaseClient } from './vanilla-database.js';
import {
  AccountsStoreError,
  cleanLabel,
  cleanToken,
  sanitizeAccount,
  validateAccountsFile,
} from './accounts-store.js';
import { validateFormState } from './form-state.js';
import { normalizeChatConfig, normalizeVoiceConfig, normalizeVoicePool } from './feature-config.js';
import { normalizePresenceConfig } from './presence-config.js';

const SCHEMA_VERSION = 6;
const MAX_APPLIED_CONFIG_BYTES = 256 * 1024;
const LEGACY_IMPORT_KEY = 'legacy_accounts_imported';
const KEY_CHECK_KEY = 'token_encryption_key_check';

const MIGRATION_1 = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS migration_locks (
    name TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    discord_id TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    global_name TEXT,
    avatar TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS entitlements (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'revoked')),
    max_tokens INTEGER NOT NULL CHECK (max_tokens >= 1),
    expires_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS license_codes (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,
    max_tokens INTEGER NOT NULL CHECK (max_tokens >= 1),
    duration_seconds INTEGER NOT NULL CHECK (duration_seconds >= 1),
    status TEXT NOT NULL CHECK (status IN ('issued', 'redeemed', 'revoked')),
    created_by_discord_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    redeemed_by_user_id TEXT REFERENCES users(id),
    redeemed_at TEXT,
    revoked_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    absolute_expires_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS oauth_states (
    state_hash TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    token_ciphertext TEXT NOT NULL,
    token_iv TEXT NOT NULL,
    token_tag TEXT NOT NULL,
    form_state TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    actor_discord_id TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)',
  'CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at)',
  'CREATE INDEX IF NOT EXISTS idx_license_status ON license_codes(status, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at)',
];

const MIGRATION_2 = [
  'ALTER TABLE license_codes ADD COLUMN target_discord_id TEXT',
  "ALTER TABLE license_codes ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'delivered' CHECK (delivery_status IN ('pending', 'delivered', 'failed'))",
  'ALTER TABLE license_codes ADD COLUMN delivered_at TEXT',
  'ALTER TABLE accounts ADD COLUMN token_crypto_version INTEGER NOT NULL DEFAULT 1',
  'CREATE INDEX IF NOT EXISTS idx_license_target_status ON license_codes(target_discord_id, status)',
];

const MIGRATION_3 = [
  'ALTER TABLE accounts ADD COLUMN auto_reconnect INTEGER NOT NULL DEFAULT 0 CHECK (auto_reconnect IN (0, 1))',
  'ALTER TABLE accounts ADD COLUMN last_applied_config TEXT',
  'ALTER TABLE accounts ADD COLUMN last_restore_error TEXT',
  'ALTER TABLE accounts ADD COLUMN restore_attempts INTEGER NOT NULL DEFAULT 0 CHECK (restore_attempts >= 0)',
  'ALTER TABLE accounts ADD COLUMN last_restored_at TEXT',
  'CREATE INDEX IF NOT EXISTS idx_accounts_auto_reconnect ON accounts(auto_reconnect) WHERE auto_reconnect = 1',
];

const MIGRATION_4 = [
  'ALTER TABLE accounts ADD COLUMN voice_config TEXT',
  'ALTER TABLE accounts ADD COLUMN voice_auto_join INTEGER NOT NULL DEFAULT 0 CHECK (voice_auto_join IN (0, 1))',
  'ALTER TABLE accounts ADD COLUMN chat_config TEXT',
  'ALTER TABLE accounts ADD COLUMN chat_auto_start INTEGER NOT NULL DEFAULT 0 CHECK (chat_auto_start IN (0, 1))',
  `CREATE TABLE IF NOT EXISTS voice_pools (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    self_mute INTEGER NOT NULL DEFAULT 1 CHECK (self_mute IN (0, 1)),
    self_deaf INTEGER NOT NULL DEFAULT 0 CHECK (self_deaf IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS voice_pool_members (
    pool_id TEXT NOT NULL REFERENCES voice_pools(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    PRIMARY KEY(pool_id, account_id)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_accounts_voice_auto_join ON accounts(voice_auto_join) WHERE voice_auto_join = 1',
  'CREATE INDEX IF NOT EXISTS idx_accounts_chat_auto_start ON accounts(chat_auto_start) WHERE chat_auto_start = 1',
  'CREATE INDEX IF NOT EXISTS idx_voice_pools_user_id ON voice_pools(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_voice_pool_members_account_id ON voice_pool_members(account_id)',
];

const MIGRATION_5 = [
  `CREATE TABLE IF NOT EXISTS dm_notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('license_expired', 'license_revoked', 'token_invalid')),
    fingerprint TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TEXT,
    last_error_code TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    sent_at TEXT,
    UNIQUE(user_id, kind, fingerprint)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_dm_notifications_pending ON dm_notifications(status, next_attempt_at, created_at) WHERE status IN ('pending', 'sending')",
  'CREATE INDEX IF NOT EXISTS idx_dm_notifications_user ON dm_notifications(user_id, created_at)',
];

const MIGRATION_6 = [
  `CREATE TABLE IF NOT EXISTS operation_guards (
    operation_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(operation_id, subject_id)
  )`,
  `CREATE TABLE IF NOT EXISTS data_imports (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
    manifest TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS idx_operation_guards_created ON operation_guards(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_data_imports_status ON data_imports(status, started_at)',
];

const MIGRATIONS = new Map([
  [1, MIGRATION_1], [2, MIGRATION_2], [3, MIGRATION_3],
  [4, MIGRATION_4], [5, MIGRATION_5], [6, MIGRATION_6],
]);

class DatabaseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
  }
}

function rowValue(row, key) {
  const value = row?.[key];
  return typeof value === 'bigint' ? Number(value) : value;
}

function normalizeResultRows(result) {
  return result.rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' ? Number(value) : value]),
  ));
}

function createDatabaseClient({ url, token, fetchImpl } = {}) {
  return new VanillaDatabaseClient({
    url,
    token,
    fetchImpl,
    errorFactory: (code, message) => new DatabaseError(code, message),
  });
}

async function executeBatch(client, statements, { transaction = true } = {}) {
  return client.batch(statements, transaction ? 'write' : 'none');
}

async function migrateDatabase(client, { now = () => new Date() } = {}) {
  if (client.supportsConnectionPragmas !== false) await client.execute('PRAGMA foreign_keys = ON');
  await client.execute(MIGRATION_1[0]);
  const result = await client.execute('SELECT version FROM schema_migrations ORDER BY version');
  const applied = new Set(result.rows.map((row) => Number(row.version)));
  for (let version = 1; version <= SCHEMA_VERSION; version += 1) {
    if (applied.has(version)) continue;
    const statements = version === 1 ? MIGRATIONS.get(version).slice(1) : MIGRATIONS.get(version);
    try {
      await executeBatch(client, [
        ...statements,
        {
          sql: 'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
          args: [version, now().toISOString()],
        },
      ]);
    } catch (error) {
      const raced = await client.execute({
        sql: 'SELECT version FROM schema_migrations WHERE version = ?', args: [version],
      });
      if (!raced.rows.length) throw error;
    }
  }
  if (client.supportsConnectionPragmas !== false) {
    const foreignKeys = await client.execute('PRAGMA foreign_keys');
    if (Number(rowValue(foreignKeys.rows[0], 'foreign_keys')) !== 1) {
      throw new DatabaseError('DATABASE_FOREIGN_KEYS_DISABLED', 'Database phải bật PRAGMA foreign_keys.');
    }
  }
  return SCHEMA_VERSION;
}

async function assertSchema(client) {
  try {
    const result = await client.execute('SELECT MAX(version) AS version FROM schema_migrations');
    const version = Number(rowValue(result.rows[0], 'version') || 0);
    if (version !== SCHEMA_VERSION) {
      throw new DatabaseError('DATABASE_MIGRATION_REQUIRED', `Database schema ${version}; cần chạy schema ${SCHEMA_VERSION}.`);
    }
    return version;
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError('DATABASE_MIGRATION_REQUIRED', 'Database chưa được migrate. Chạy npm run db:migrate.');
  }
}

class Database {
  constructor(client, { now = () => new Date(), idFactory = () => crypto.randomUUID() } = {}) {
    this.client = client;
    this.now = now;
    this.idFactory = idFactory;
  }

  execute(statement) {
    return this.client.execute(statement);
  }

  batch(statements, options) {
    return executeBatch(this.client, statements, options);
  }

  operationId() {
    return this.idFactory();
  }

  guardExists(operationId, subjectId, kind) {
    return {
      sql: `EXISTS (SELECT 1 FROM operation_guards
        WHERE operation_id = ? AND subject_id = ? AND kind = ?)`,
      args: [operationId, subjectId, kind],
    };
  }

  auditStatement(action, {
    actorUserId = null,
    actorDiscordId = null,
    targetType = null,
    targetId = null,
    metadata = null,
    guard = null,
  } = {}) {
    const args = [
      this.idFactory(), actorUserId, actorDiscordId, action, targetType, targetId,
      metadata ? JSON.stringify(metadata) : null, this.now().toISOString(),
    ];
    let sql = `INSERT INTO audit_logs
      (id, actor_user_id, actor_discord_id, action, target_type, target_id, metadata, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?`;
    if (guard) {
      const condition = this.guardExists(guard.operationId, guard.subjectId, guard.kind);
      sql += ` WHERE ${condition.sql}`;
      args.push(...condition.args);
    }
    return { sql, args };
  }

  async getMetadata(key, executor = this.client) {
    const result = await executor.execute({ sql: 'SELECT value FROM metadata WHERE key = ?', args: [key] });
    return result.rows.length ? String(result.rows[0].value) : null;
  }

  setMetadata(key, value, executor = this.client) {
    const now = this.now().toISOString();
    return executor.execute({
      sql: `INSERT INTO metadata (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      args: [key, String(value), now],
    });
  }

  async upsertUser(profile, executor = this.client) {
    const discordId = String(profile.id || '').trim();
    const username = String(profile.username || '').trim();
    if (!/^\d{5,25}$/.test(discordId) || !username) {
      throw new DatabaseError('OAUTH_PROFILE_INVALID', 'Discord trả profile không hợp lệ.');
    }
    const timestamp = this.now().toISOString();
    const id = this.idFactory();
    await executor.execute({
      sql: `INSERT INTO users (id, discord_id, username, global_name, avatar, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(discord_id) DO UPDATE SET username = excluded.username,
          global_name = excluded.global_name, avatar = excluded.avatar, updated_at = excluded.updated_at`,
      args: [id, discordId, username, profile.global_name || null, profile.avatar || null, timestamp, timestamp],
    });
    return this.getUserByDiscordId(discordId, executor);
  }

  async getUserByDiscordId(discordId, executor = this.client) {
    const result = await executor.execute({ sql: 'SELECT * FROM users WHERE discord_id = ?', args: [discordId] });
    return result.rows.length ? normalizeResultRows(result)[0] : null;
  }

  async getUserById(id, executor = this.client) {
    const result = await executor.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
    return result.rows.length ? normalizeResultRows(result)[0] : null;
  }

  async getEntitlement(userId, executor = this.client) {
    const result = await executor.execute({ sql: 'SELECT * FROM entitlements WHERE user_id = ?', args: [userId] });
    return result.rows.length ? normalizeResultRows(result)[0] : null;
  }

  async hasRedeemedLicense(userId, executor = this.client) {
    const result = await executor.execute({
      sql: `SELECT 1 FROM license_codes
        WHERE redeemed_by_user_id = ? AND status = 'redeemed' AND redeemed_at IS NOT NULL
        LIMIT 1`,
      args: [userId],
    });
    return result.rows.length > 0;
  }

  async countAccounts(userId, executor = this.client) {
    const result = await executor.execute({ sql: 'SELECT COUNT(*) AS count FROM accounts WHERE user_id = ?', args: [userId] });
    return Number(rowValue(result.rows[0], 'count') || 0);
  }

  async audit(action, options = {}) {
    const { executor = this.client, ...input } = options;
    await executor.execute(this.auditStatement(action, input));
  }

  async listUsers({ query = '', limit = 100, offset = 0 } = {}) {
    const term = `%${String(query).trim()}%`;
    const result = await this.client.execute({
      sql: `SELECT u.*,
        CASE WHEN EXISTS (
          SELECT 1 FROM license_codes l WHERE l.redeemed_by_user_id = u.id
            AND l.status = 'redeemed' AND l.redeemed_at IS NOT NULL
        ) THEN e.status ELSE NULL END AS entitlement_status,
        CASE WHEN EXISTS (
          SELECT 1 FROM license_codes l WHERE l.redeemed_by_user_id = u.id
            AND l.status = 'redeemed' AND l.redeemed_at IS NOT NULL
        ) THEN e.max_tokens ELSE NULL END AS max_tokens,
        CASE WHEN EXISTS (
          SELECT 1 FROM license_codes l WHERE l.redeemed_by_user_id = u.id
            AND l.status = 'redeemed' AND l.redeemed_at IS NOT NULL
        ) THEN e.expires_at ELSE NULL END AS expires_at,
        EXISTS (
          SELECT 1 FROM license_codes l WHERE l.redeemed_by_user_id = u.id
            AND l.status = 'redeemed' AND l.redeemed_at IS NOT NULL
        ) AS has_redeemed_license,
        (SELECT COUNT(*) FROM accounts a WHERE a.user_id = u.id) AS account_count
        FROM users u LEFT JOIN entitlements e ON e.user_id = u.id
        WHERE (? = '%%' OR u.username LIKE ? OR u.global_name LIKE ? OR u.discord_id LIKE ?)
        ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      args: [term, term, term, term, Math.min(250, Math.max(1, limit)), Math.max(0, offset)],
    });
    return normalizeResultRows(result);
  }

  async listLicenseCodes({ limit = 100, offset = 0 } = {}) {
    const result = await this.client.execute({
      sql: `SELECT l.id, l.max_tokens, l.duration_seconds, l.status, l.created_by_discord_id,
        l.target_discord_id, l.delivery_status, l.delivered_at,
        l.created_at, l.redeemed_by_user_id, l.redeemed_at, l.revoked_at,
        u.discord_id AS redeemed_by_discord_id, u.username AS redeemed_by_username
        FROM license_codes l LEFT JOIN users u ON u.id = l.redeemed_by_user_id
        ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
      args: [Math.min(250, Math.max(1, limit)), Math.max(0, offset)],
    });
    return normalizeResultRows(result);
  }

  async listAuditLogs({ limit = 100, offset = 0 } = {}) {
    const result = await this.client.execute({
      sql: `SELECT a.*, u.username AS actor_username FROM audit_logs a
        LEFT JOIN users u ON u.id = a.actor_user_id
        ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      args: [Math.min(250, Math.max(1, limit)), Math.max(0, offset)],
    });
    return normalizeResultRows(result).map((row) => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));
  }

  async enqueueNotification({ userId, kind, fingerprint, payload = {} }, executor = this.client) {
    if (!['license_expired', 'license_revoked', 'token_invalid'].includes(kind)) {
      throw new DatabaseError('NOTIFICATION_INVALID', 'Loại notification không hợp lệ.');
    }
    const safeFingerprint = String(fingerprint || '').trim();
    if (!safeFingerprint || safeFingerprint.length > 128) throw new DatabaseError('NOTIFICATION_INVALID', 'Fingerprint notification không hợp lệ.');
    const safePayload = {
      accountId: payload.accountId ? String(payload.accountId).slice(0, 64) : null,
      accountLabel: payload.accountLabel ? String(payload.accountLabel).replace(/[\r\n\t]+/g, ' ').slice(0, 80) : null,
      expiresAt: payload.expiresAt ? String(payload.expiresAt).slice(0, 40) : null,
    };
    const timestamp = this.now().toISOString();
    const id = this.idFactory();
    await executor.execute({
      sql: `INSERT OR IGNORE INTO dm_notifications
        (id, user_id, kind, fingerprint, payload, status, attempts, next_attempt_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
      args: [id, userId, kind, safeFingerprint, JSON.stringify(safePayload), timestamp, timestamp, timestamp],
    });
    const result = await executor.execute({
      sql: 'SELECT * FROM dm_notifications WHERE user_id = ? AND kind = ? AND fingerprint = ?',
      args: [userId, kind, safeFingerprint],
    });
    return result.rows.length ? this.notificationFromRow(result.rows[0]) : null;
  }

  notificationFromRow(row) {
    return {
      id: String(row.id), userId: String(row.user_id), kind: String(row.kind),
      payload: row.payload ? JSON.parse(String(row.payload)) : {},
      status: String(row.status), attempts: Number(row.attempts || 0),
      nextAttemptAt: row.next_attempt_at ? String(row.next_attempt_at) : null,
      lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
      sentAt: row.sent_at ? String(row.sent_at) : null,
    };
  }

  async claimNotifications({ limit = 10, staleAfterMs = 5 * 60_000 } = {}) {
    const now = this.now();
    const timestamp = now.toISOString();
    const stale = new Date(now.getTime() - staleAfterMs).toISOString();
    const operationId = this.operationId();
    const kind = 'notification_claim';
    const boundedLimit = Math.min(50, Math.max(1, limit));
    const results = await this.batch([
      {
        sql: `INSERT OR IGNORE INTO operation_guards (operation_id, subject_id, kind, created_at)
          SELECT ?, id, ?, ? FROM dm_notifications
          WHERE (status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
             OR (status = 'sending' AND updated_at <= ?)
          ORDER BY created_at LIMIT ?`,
        args: [operationId, kind, timestamp, timestamp, stale, boundedLimit],
      },
      {
        sql: `UPDATE dm_notifications SET status = 'sending', attempts = attempts + 1,
          updated_at = ?, last_error_code = NULL
          WHERE id IN (SELECT subject_id FROM operation_guards WHERE operation_id = ? AND kind = ?)
            AND ((status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
              OR (status = 'sending' AND updated_at <= ?))`,
        args: [timestamp, operationId, kind, timestamp, stale],
      },
      {
        sql: `SELECT n.*, u.discord_id FROM dm_notifications n JOIN users u ON u.id = n.user_id
          JOIN operation_guards g ON g.subject_id = n.id
          WHERE g.operation_id = ? AND g.kind = ? AND n.status = 'sending' AND n.updated_at = ?
          ORDER BY n.created_at`,
        args: [operationId, kind, timestamp],
      },
      {
        sql: 'DELETE FROM operation_guards WHERE operation_id = ? AND kind = ?',
        args: [operationId, kind],
      },
    ]);
    return results[2].rows.map((row) => ({
      ...this.notificationFromRow(row), discordId: String(row.discord_id),
    }));
  }

  async completeNotification(id) {
    const timestamp = this.now().toISOString();
    const result = await this.client.execute({
      sql: `UPDATE dm_notifications SET status = 'sent', sent_at = ?, updated_at = ?,
        next_attempt_at = NULL, last_error_code = NULL WHERE id = ? AND status = 'sending'`,
      args: [timestamp, timestamp, id],
    });
    return Number(result.rowsAffected) === 1;
  }

  async failNotification(id, { code = 'UNKNOWN', permanent = false, retryAfterMs = 60_000 } = {}) {
    const now = this.now();
    const errorCode = String(code || 'UNKNOWN').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 64) || 'UNKNOWN';
    const nextAttemptAt = permanent ? null : new Date(now.getTime() + Math.max(1_000, Math.min(24 * 60 * 60_000, retryAfterMs))).toISOString();
    const result = await this.client.execute({
      sql: `UPDATE dm_notifications SET status = ?, next_attempt_at = ?, last_error_code = ?, updated_at = ?
        WHERE id = ? AND status = 'sending'`,
      args: [permanent ? 'failed' : 'pending', nextAttemptAt, errorCode, now.toISOString(), id],
    });
    return Number(result.rowsAffected) === 1;
  }

  async listNotificationStatuses({ limit = 50 } = {}) {
    const result = await this.client.execute({
      sql: `SELECT id, user_id, kind, status, attempts, last_error_code, created_at, updated_at, sent_at
        FROM dm_notifications ORDER BY created_at DESC LIMIT ?`,
      args: [Math.min(100, Math.max(1, limit))],
    });
    return normalizeResultRows(result).map((row) => ({
      id: String(row.id), userId: String(row.user_id), kind: String(row.kind), status: String(row.status),
      attempts: Number(row.attempts || 0), lastErrorCode: row.last_error_code ? String(row.last_error_code) : null,
      createdAt: String(row.created_at), updatedAt: String(row.updated_at), sentAt: row.sent_at ? String(row.sent_at) : null,
    }));
  }

  close() {
    this.client.close();
  }
}

function parseAppliedConfig(value) {
  if (!value) return null;
  const text = String(value);
  if (Buffer.byteLength(text, 'utf8') > MAX_APPLIED_CONFIG_BYTES) {
    throw new DatabaseError('ACCOUNT_CONFIG_INVALID', 'Cấu hình RPC đã lưu vượt quá giới hạn.');
  }
  try { return normalizePresenceConfig(JSON.parse(text)); }
  catch { throw new DatabaseError('ACCOUNT_CONFIG_INVALID', 'Cấu hình RPC đã lưu không hợp lệ.'); }
}

function restoreErrorMessage(value) {
  return value ? String(value).replace(/[\r\n\t]+/g, ' ').slice(0, 300) : null;
}

function parseFeatureConfig(value, normalize) {
  if (!value) return null;
  try { return normalize(JSON.parse(String(value))); }
  catch { throw new DatabaseError('ACCOUNT_CONFIG_INVALID', 'Cấu hình tính năng đã lưu không hợp lệ.'); }
}

function voicePoolFromRow(row, accountIds = []) {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    label: String(row.label),
    guildId: String(row.guild_id),
    channelId: String(row.channel_id),
    selfMute: Number(row.self_mute) === 1,
    selfDeaf: Number(row.self_deaf) === 1,
    accountIds: accountIds.map(String),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function accountFromRow(row, cipher, { decrypt = false, includeAppliedConfig = false } = {}) {
  const encrypted = {
    ciphertext: String(row.token_ciphertext),
    iv: String(row.token_iv),
    tag: String(row.token_tag),
  };
  const account = {
    id: String(row.id),
    userId: String(row.user_id),
    label: String(row.label),
    hasToken: Boolean(row.token_ciphertext),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    formState: row.form_state ? validateFormState(JSON.parse(String(row.form_state))) : null,
    autoReconnect: Number(row.auto_reconnect || 0) === 1,
    hasAppliedConfig: Boolean(row.last_applied_config),
    lastRestoreError: restoreErrorMessage(row.last_restore_error),
    restoreAttempts: Number(row.restore_attempts || 0),
    lastRestoredAt: row.last_restored_at ? String(row.last_restored_at) : null,
    voiceConfig: parseFeatureConfig(row.voice_config, normalizeVoiceConfig),
    voiceAutoJoin: Number(row.voice_auto_join || 0) === 1,
    chatConfig: parseFeatureConfig(row.chat_config, normalizeChatConfig),
    chatAutoStart: Number(row.chat_auto_start || 0) === 1,
  };
  if (includeAppliedConfig) account.lastAppliedConfig = parseAppliedConfig(row.last_applied_config);
  const tokenCryptoVersion = Number(row.token_crypto_version || 1);
  if (decrypt) account.token = tokenCryptoVersion >= 2
    ? cipher.decrypt(encrypted, { userId: account.userId, accountId: account.id })
    : cipher.decrypt(encrypted);
  return account;
}

class DatabaseAccountsStore {
  constructor(database, cipher, { now = () => new Date(), idFactory = () => crypto.randomUUID() } = {}) {
    this.database = database;
    this.client = database.client;
    this.cipher = cipher;
    this.now = now;
    this.idFactory = idFactory;
  }

  async init() {
    return true;
  }

  async listForUser(userId, executor = this.client) {
    const result = await executor.execute({
      sql: 'SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at ASC',
      args: [userId],
    });
    return result.rows.map((row) => accountFromRow(row, this.cipher));
  }

  async list() {
    throw new AccountsStoreError('ACCOUNT_OWNER_REQUIRED', 'Thiếu owner khi đọc danh sách tài khoản.');
  }

  async getOwned(userId, id, { decrypt = true, includeAppliedConfig = false, executor = this.client } = {}) {
    const result = await executor.execute({
      sql: 'SELECT * FROM accounts WHERE id = ? AND user_id = ?',
      args: [id, userId],
    });
    if (!result.rows.length) throw new AccountsStoreError('ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản.');
    const account = accountFromRow(result.rows[0], this.cipher, { decrypt, includeAppliedConfig });
    const tokenCryptoVersion = Number(result.rows[0].token_crypto_version || 1);
    if (decrypt && tokenCryptoVersion < 2) {
      const encrypted = this.cipher.encrypt(account.token, { userId: account.userId, accountId: account.id });
      await executor.execute({
        sql: `UPDATE accounts SET token_ciphertext = ?, token_iv = ?, token_tag = ?, token_crypto_version = 2
          WHERE id = ? AND user_id = ? AND token_crypto_version = 1`,
        args: [encrypted.ciphertext, encrypted.iv, encrypted.tag, id, userId],
      });
    }
    return account;
  }

  getSanitizedOwned(userId, id) {
    return this.getOwned(userId, id, { decrypt: false });
  }

  async createForUser(userId, { label, token }) {
    const normalizedLabel = cleanLabel(label);
    const normalizedToken = cleanToken(token);
    const timestamp = this.now().toISOString();
    const account = {
      id: this.idFactory(), userId, label: normalizedLabel, hasToken: true,
      createdAt: timestamp, updatedAt: timestamp, formState: null,
    };
    const encrypted = this.cipher.encrypt(normalizedToken, { userId, accountId: account.id });
    const operationId = this.database.operationId();
    const kind = 'account_create';
    const guard = { operationId, subjectId: account.id, kind };
    try {
      const results = await this.database.batch([
        {
          sql: `INSERT OR IGNORE INTO operation_guards (operation_id, subject_id, kind, created_at)
            SELECT ?, ?, ?, ? WHERE EXISTS (
              SELECT 1 FROM entitlements e WHERE e.user_id = ? AND e.status = 'active'
                AND (e.expires_at IS NULL OR e.expires_at > ?)
                AND EXISTS (
                  SELECT 1 FROM license_codes l WHERE l.redeemed_by_user_id = e.user_id
                    AND l.status = 'redeemed' AND l.redeemed_at IS NOT NULL
                )
                AND (SELECT COUNT(*) FROM accounts a WHERE a.user_id = ?) < e.max_tokens
            )`,
          args: [operationId, account.id, kind, timestamp, userId, timestamp, userId],
        },
        {
          sql: `INSERT INTO accounts
            (id, user_id, label, token_ciphertext, token_iv, token_tag, token_crypto_version, form_state, created_at, updated_at)
            SELECT ?, ?, ?, ?, ?, ?, 2, NULL, ?, ?
            WHERE EXISTS (SELECT 1 FROM operation_guards WHERE operation_id = ? AND subject_id = ? AND kind = ?)`,
          args: [account.id, userId, account.label, encrypted.ciphertext, encrypted.iv, encrypted.tag,
            timestamp, timestamp, operationId, account.id, kind],
        },
        this.database.auditStatement('account.created', {
          actorUserId: userId, targetType: 'account', targetId: account.id,
          metadata: { tokenCryptoVersion: 2 }, guard,
        }),
        {
          sql: 'DELETE FROM operation_guards WHERE operation_id = ? AND subject_id = ? AND kind = ?',
          args: [operationId, account.id, kind],
        },
      ]);
      if (Number(results[1].rowsAffected) === 1) return account;
    } catch (error) {
      if (error.code !== 'SQLITE_BUSY' && !String(error.message).includes('locked')) throw error;
    }
    const [entitlement, hasRedeemedLicense] = await Promise.all([
      this.database.getEntitlement(userId),
      this.database.hasRedeemedLicense(userId),
    ]);
    if (!entitlement || !hasRedeemedLicense) throw new AccountsStoreError('LICENSE_REQUIRED', 'Cần kích hoạt license bằng mã được cấp trước.');
    const active = entitlement.status === 'active'
      && (entitlement.expires_at === null || new Date(String(entitlement.expires_at)).getTime() > this.now().getTime());
    if (!active) throw new AccountsStoreError('LICENSE_INACTIVE', 'License đã hết hạn hoặc bị thu hồi.');
    throw new AccountsStoreError('ACCOUNT_LIMIT', `License chỉ cho phép tối đa ${Number(entitlement.max_tokens)} tài khoản.`);
  }

  async updateLabelForUser(userId, id, label) {
    const normalized = cleanLabel(label);
    const result = await this.client.execute({
      sql: 'UPDATE accounts SET label = ?, updated_at = ? WHERE id = ? AND user_id = ?',
      args: [normalized, this.now().toISOString(), id, userId],
    });
    if (Number(result.rowsAffected) !== 1) throw new AccountsStoreError('ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản.');
    return this.getOwned(userId, id, { decrypt: false });
  }

  async replaceTokenForUser(userId, id, token) {
    const encrypted = this.cipher.encrypt(cleanToken(token), { userId, accountId: id });
    const timestamp = this.now().toISOString();
    const operationId = this.database.operationId();
    const kind = 'account_token_replace';
    const guard = { operationId, subjectId: id, kind };
    const results = await this.database.batch([
      {
        sql: `INSERT OR IGNORE INTO operation_guards (operation_id, subject_id, kind, created_at)
          SELECT ?, id, ?, ? FROM accounts WHERE id = ? AND user_id = ?`,
        args: [operationId, kind, timestamp, id, userId],
      },
      {
        sql: `UPDATE accounts SET token_ciphertext = ?, token_iv = ?, token_tag = ?, token_crypto_version = 2, updated_at = ?
          WHERE id = ? AND user_id = ? AND EXISTS (
            SELECT 1 FROM operation_guards WHERE operation_id = ? AND subject_id = ? AND kind = ?)`,
        args: [encrypted.ciphertext, encrypted.iv, encrypted.tag, timestamp, id, userId,
          operationId, id, kind],
      },
      this.database.auditStatement('account.token_replaced', {
        actorUserId: userId, targetType: 'account', targetId: id,
        metadata: { tokenCryptoVersion: 2 }, guard,
      }),
      {
        sql: 'DELETE FROM operation_guards WHERE operation_id = ? AND subject_id = ? AND kind = ?',
        args: [operationId, id, kind],
      },
    ]);
    if (Number(results[1].rowsAffected) !== 1) throw new AccountsStoreError('ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản.');
    return this.getOwned(userId, id, { decrypt: false });
  }

  async readFormStateForUser(userId, id) {
    return structuredClone((await this.getOwned(userId, id, { decrypt: false })).formState);
  }

  async updateFormStateForUser(userId, id, input) {
    const formState = validateFormState(input);
    const result = await this.client.execute({
      sql: 'UPDATE accounts SET form_state = ?, updated_at = ? WHERE id = ? AND user_id = ?',
      args: [JSON.stringify(formState), this.now().toISOString(), id, userId],
    });
    if (Number(result.rowsAffected) !== 1) throw new AccountsStoreError('ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản.');
    return structuredClone(formState);
  }

  async setAutoReconnectForUser(userId, id, enabled) {
    if (typeof enabled !== 'boolean') throw new AccountsStoreError('ACCOUNT_INVALID', 'Auto reconnect phải là boolean.');
    const result = await this.client.execute({
      sql: `UPDATE accounts SET auto_reconnect = ?, last_restore_error = NULL,
        restore_attempts = 0, updated_at = ? WHERE id = ? AND user_id = ?`,
      args: [enabled ? 1 : 0, this.now().toISOString(), id, userId],
    });
    if (Number(result.rowsAffected) !== 1) throw new AccountsStoreError('ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản.');
    return this.getOwned(userId, id, { decrypt: false });
  }

  async saveAppliedConfigForUser(userId, id, input) {
    const config = normalizePresenceConfig(input);
    const payload = JSON.stringify(config);
    if (Buffer.byteLength(payload, 'utf8') > MAX_APPLIED_CONFIG_BYTES) {
      throw new AccountsStoreError('ACCOUNT_CONFIG_INVALID', 'Cấu hình RPC vượt quá giới hạn 256 KB.');
    }
    const result = await this.client.execute({
      sql: `UPDATE accounts SET last_applied_config = ?, last_restore_error = NULL,
        restore_attempts = 0, updated_at = ? WHERE id = ? AND user_id = ?`,
      args: [payload, this.now().toISOString(), id, userId],
    });
    if (Number(result.rowsAffected) !== 1) throw new AccountsStoreError('ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản.');
    return structuredClone(config);
  }

  async updateRestoreStatusForUser(userId, id, { error = null, attempts = 0, restoredAt = undefined } = {}) {
    const safeError = restoreErrorMessage(error);
    const safeAttempts = Number.isSafeInteger(attempts) && attempts >= 0 ? attempts : 0;
    const timestamp = restoredAt === undefined ? null : restoredAt;
    const result = await this.client.execute({
      sql: `UPDATE accounts SET last_restore_error = ?, restore_attempts = ?,
        last_restored_at = COALESCE(?, last_restored_at), updated_at = ? WHERE id = ? AND user_id = ?`,
      args: [safeError, safeAttempts, timestamp, this.now().toISOString(), id, userId],
    });
    if (Number(result.rowsAffected) !== 1) throw new AccountsStoreError('ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản.');
    return this.getOwned(userId, id, { decrypt: false });
  }

  async listAutoReconnectAccounts() {
    const timestamp = this.now().toISOString();
    const result = await this.client.execute({
      sql: `SELECT a.* FROM accounts a JOIN entitlements e ON e.user_id = a.user_id
        WHERE a.auto_reconnect = 1 AND a.last_applied_config IS NOT NULL
          AND e.status = 'active' AND (e.expires_at IS NULL OR e.expires_at > ?)
          AND EXISTS (
            SELECT 1 FROM license_codes l WHERE l.redeemed_by_user_id = a.user_id
              AND l.status = 'redeemed' AND l.redeemed_at IS NOT NULL
          )
        ORDER BY a.user_id, a.created_at`,
      args: [timestamp],
    });
    return result.rows.map((row) => accountFromRow(row, this.cipher, {
      decrypt: true, includeAppliedConfig: true,
    }));
  }

  async updateVoiceConfigForUser(userId, id, input) {
    const config = normalizeVoiceConfig(input);
    const result = await this.client.execute({
      sql: 'UPDATE accounts SET voice_config = ?, voice_auto_join = ?, updated_at = ? WHERE id = ? AND user_id = ?',
      args: [JSON.stringify(config), config.autoJoin ? 1 : 0, this.now().toISOString(), id, userId],
    });
    if (Number(result.rowsAffected) !== 1) throw new AccountsStoreError('ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản.');
    await this.database.audit('account.voice_config_updated', {
      actorUserId: userId, targetType: 'account', targetId: id,
      metadata: { autoJoin: config.autoJoin },
    });
    return structuredClone(config);
  }

  async updateChatConfigForUser(userId, id, input) {
    const config = normalizeChatConfig(input);
    const result = await this.client.execute({
      sql: 'UPDATE accounts SET chat_config = ?, chat_auto_start = ?, updated_at = ? WHERE id = ? AND user_id = ?',
      args: [JSON.stringify(config), config.autoStart ? 1 : 0, this.now().toISOString(), id, userId],
    });
    if (Number(result.rowsAffected) !== 1) throw new AccountsStoreError('ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản.');
    await this.database.audit('account.chat_config_updated', {
      actorUserId: userId, targetType: 'account', targetId: id,
      metadata: { autoStart: config.autoStart, messageCount: config.messages.length },
    });
    return structuredClone(config);
  }

  async listFeatureRestoreAccounts() {
    const timestamp = this.now().toISOString();
    const result = await this.client.execute({
      sql: `SELECT a.* FROM accounts a JOIN entitlements e ON e.user_id = a.user_id
        WHERE ((a.voice_auto_join = 1 AND a.voice_config IS NOT NULL)
          OR (a.chat_auto_start = 1 AND a.chat_config IS NOT NULL))
          AND e.status = 'active' AND (e.expires_at IS NULL OR e.expires_at > ?)
          AND EXISTS (
            SELECT 1 FROM license_codes l WHERE l.redeemed_by_user_id = a.user_id
              AND l.status = 'redeemed' AND l.redeemed_at IS NOT NULL
          )
        ORDER BY a.user_id, a.created_at`,
      args: [timestamp],
    });
    return result.rows.map((row) => accountFromRow(row, this.cipher, { decrypt: true }));
  }

  async getVoicePoolForUser(userId, poolId, executor = this.client) {
    const result = await executor.execute({
      sql: 'SELECT * FROM voice_pools WHERE id = ? AND user_id = ?', args: [poolId, userId],
    });
    if (!result.rows.length) throw new AccountsStoreError('VOICE_POOL_NOT_FOUND', 'Không tìm thấy Voice Pool.');
    const members = await executor.execute({
      sql: 'SELECT account_id FROM voice_pool_members WHERE pool_id = ? ORDER BY position', args: [poolId],
    });
    return voicePoolFromRow(result.rows[0], members.rows.map((row) => row.account_id));
  }

  async listVoicePoolsForUser(userId) {
    const result = await this.client.execute({
      sql: 'SELECT * FROM voice_pools WHERE user_id = ? ORDER BY created_at', args: [userId],
    });
    return Promise.all(result.rows.map((row) => this.getVoicePoolForUser(userId, String(row.id))));
  }

  async validateVoicePoolMembers(userId, accountIds, executor) {
    const entitlement = await this.database.getEntitlement(userId, executor);
    const cap = Math.min(5, Number(entitlement?.max_tokens || 0));
    if (!accountIds.length || accountIds.length > cap) {
      throw new AccountsStoreError('VOICE_POOL_LIMIT', `Voice Pool cho phép từ 1 đến ${cap || 1} tài khoản.`);
    }
    const placeholders = accountIds.map(() => '?').join(', ');
    const result = await executor.execute({
      sql: `SELECT id FROM accounts WHERE user_id = ? AND id IN (${placeholders})`,
      args: [userId, ...accountIds],
    });
    if (result.rows.length !== accountIds.length) {
      throw new AccountsStoreError('ACCOUNT_NOT_FOUND', 'Voice Pool chứa tài khoản không thuộc workspace này.');
    }
  }

  voicePoolGuardStatement(operationId, subjectId, kind, userId, accountIds, timestamp, poolId = null) {
    const placeholders = accountIds.map(() => '?').join(', ');
    const poolCheck = poolId
      ? 'AND EXISTS (SELECT 1 FROM voice_pools p WHERE p.id = ? AND p.user_id = ?)'
      : '';
    return {
      sql: `INSERT OR IGNORE INTO operation_guards (operation_id, subject_id, kind, created_at)
        SELECT ?, ?, ?, ? WHERE EXISTS (
          SELECT 1 FROM entitlements e WHERE e.user_id = ?
            AND ? BETWEEN 1 AND MIN(5, e.max_tokens)
            AND (SELECT COUNT(DISTINCT id) FROM accounts
              WHERE user_id = ? AND id IN (${placeholders})) = ?
        ) ${poolCheck}`,
      args: [operationId, subjectId, kind, timestamp, userId, accountIds.length,
        userId, ...accountIds, accountIds.length, ...(poolId ? [poolId, userId] : [])],
    };
  }

  async createVoicePoolForUser(userId, input) {
    const pool = normalizeVoicePool(input);
    const id = this.idFactory();
    const timestamp = this.now().toISOString();
    const operationId = this.database.operationId();
    const kind = 'voice_pool_create';
    const guard = { operationId, subjectId: id, kind };
    const statements = [
      this.voicePoolGuardStatement(operationId, id, kind, userId, pool.accountIds, timestamp),
      {
        sql: `INSERT INTO voice_pools
          (id, user_id, label, guild_id, channel_id, self_mute, self_deaf, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
            SELECT 1 FROM operation_guards WHERE operation_id = ? AND subject_id = ? AND kind = ?)`,
        args: [id, userId, pool.label, pool.guildId, pool.channelId, pool.selfMute ? 1 : 0,
          pool.selfDeaf ? 1 : 0, timestamp, timestamp, operationId, id, kind],
      },
      ...pool.accountIds.map((accountId, position) => ({
        sql: `INSERT INTO voice_pool_members (pool_id, account_id, position)
          SELECT ?, ?, ? WHERE EXISTS (
            SELECT 1 FROM operation_guards WHERE operation_id = ? AND subject_id = ? AND kind = ?)`,
        args: [id, accountId, position, operationId, id, kind],
      })),
      this.database.auditStatement('voice_pool.created', {
        actorUserId: userId, targetType: 'voice_pool', targetId: id,
        metadata: { accountCount: pool.accountIds.length }, guard,
      }),
      {
        sql: 'DELETE FROM operation_guards WHERE operation_id = ? AND subject_id = ? AND kind = ?',
        args: [operationId, id, kind],
      },
    ];
    const results = await this.database.batch(statements);
    if (Number(results[1].rowsAffected) !== 1) {
      await this.validateVoicePoolMembers(userId, pool.accountIds, this.client);
      throw new AccountsStoreError('VOICE_POOL_LIMIT', 'Không thể tạo Voice Pool với các account này.');
    }
    return this.getVoicePoolForUser(userId, id);
  }

  async updateVoicePoolForUser(userId, poolId, input) {
    const pool = normalizeVoicePool(input);
    const timestamp = this.now().toISOString();
    const operationId = this.database.operationId();
    const kind = 'voice_pool_update';
    const guard = { operationId, subjectId: poolId, kind };
    const statements = [
      this.voicePoolGuardStatement(operationId, poolId, kind, userId, pool.accountIds, timestamp, poolId),
      {
        sql: `UPDATE voice_pools SET label = ?, guild_id = ?, channel_id = ?, self_mute = ?, self_deaf = ?, updated_at = ?
          WHERE id = ? AND user_id = ? AND EXISTS (
            SELECT 1 FROM operation_guards WHERE operation_id = ? AND subject_id = ? AND kind = ?)`,
        args: [pool.label, pool.guildId, pool.channelId, pool.selfMute ? 1 : 0, pool.selfDeaf ? 1 : 0,
          timestamp, poolId, userId, operationId, poolId, kind],
      },
      {
        sql: `DELETE FROM voice_pool_members WHERE pool_id = ? AND EXISTS (
          SELECT 1 FROM operation_guards WHERE operation_id = ? AND subject_id = ? AND kind = ?)`,
        args: [poolId, operationId, poolId, kind],
      },
      ...pool.accountIds.map((accountId, position) => ({
        sql: `INSERT INTO voice_pool_members (pool_id, account_id, position)
          SELECT ?, ?, ? WHERE EXISTS (
            SELECT 1 FROM operation_guards WHERE operation_id = ? AND subject_id = ? AND kind = ?)`,
        args: [poolId, accountId, position, operationId, poolId, kind],
      })),
      this.database.auditStatement('voice_pool.updated', {
        actorUserId: userId, targetType: 'voice_pool', targetId: poolId,
        metadata: { accountCount: pool.accountIds.length }, guard,
      }),
      {
        sql: 'DELETE FROM operation_guards WHERE operation_id = ? AND subject_id = ? AND kind = ?',
        args: [operationId, poolId, kind],
      },
    ];
    const results = await this.database.batch(statements);
    if (Number(results[1].rowsAffected) !== 1) {
      await this.getVoicePoolForUser(userId, poolId);
      await this.validateVoicePoolMembers(userId, pool.accountIds, this.client);
      throw new AccountsStoreError('VOICE_POOL_LIMIT', 'Không thể cập nhật Voice Pool với các account này.');
    }
    return this.getVoicePoolForUser(userId, poolId);
  }

  async deleteVoicePoolForUser(userId, poolId) {
    const pool = await this.getVoicePoolForUser(userId, poolId);
    const operationId = this.database.operationId();
    const kind = 'voice_pool_delete';
    const timestamp = this.now().toISOString();
    const guard = { operationId, subjectId: poolId, kind };
    const results = await this.database.batch([
      {
        sql: `INSERT OR IGNORE INTO operation_guards (operation_id, subject_id, kind, created_at)
          SELECT ?, id, ?, ? FROM voice_pools WHERE id = ? AND user_id = ?`,
        args: [operationId, kind, timestamp, poolId, userId],
      },
      this.database.auditStatement('voice_pool.deleted', {
        actorUserId: userId, targetType: 'voice_pool', targetId: poolId, guard,
      }),
      {
        sql: `DELETE FROM voice_pools WHERE id = ? AND user_id = ? AND EXISTS (
          SELECT 1 FROM operation_guards WHERE operation_id = ? AND subject_id = ? AND kind = ?)`,
        args: [poolId, userId, operationId, poolId, kind],
      },
      {
        sql: 'DELETE FROM operation_guards WHERE operation_id = ? AND subject_id = ? AND kind = ?',
        args: [operationId, poolId, kind],
      },
    ]);
    if (Number(results[2].rowsAffected) !== 1) throw new AccountsStoreError('VOICE_POOL_NOT_FOUND', 'Không tìm thấy Voice Pool.');
    return pool;
  }

  async deleteForUser(userId, id) {
    const account = await this.getOwned(userId, id, { decrypt: false });
    const operationId = this.database.operationId();
    const kind = 'account_delete';
    const timestamp = this.now().toISOString();
    const guard = { operationId, subjectId: id, kind };
    const results = await this.database.batch([
      {
        sql: `INSERT OR IGNORE INTO operation_guards (operation_id, subject_id, kind, created_at)
          SELECT ?, id, ?, ? FROM accounts WHERE id = ? AND user_id = ?`,
        args: [operationId, kind, timestamp, id, userId],
      },
      this.database.auditStatement('account.deleted', {
        actorUserId: userId, targetType: 'account', targetId: id, guard,
      }),
      {
        sql: `DELETE FROM accounts WHERE id = ? AND user_id = ? AND EXISTS (
          SELECT 1 FROM operation_guards WHERE operation_id = ? AND subject_id = ? AND kind = ?)`,
        args: [id, userId, operationId, id, kind],
      },
      {
        sql: 'DELETE FROM operation_guards WHERE operation_id = ? AND subject_id = ? AND kind = ?',
        args: [operationId, id, kind],
      },
    ]);
    if (Number(results[2].rowsAffected) !== 1) throw new AccountsStoreError('ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản.');
    return account;
  }
}

async function ensureEncryptionKeyCheck(database, cipher) {
  const existing = await database.getMetadata(KEY_CHECK_KEY);
  if (existing) {
    try {
      const payload = JSON.parse(existing);
      if (cipher.decrypt(payload) !== 'presence-desk-key-check-v1') throw new Error('mismatch');
    } catch {
      throw new DatabaseError('ENCRYPTION_KEY_MISMATCH', 'TOKEN_ENCRYPTION_KEY không khớp database.');
    }
    return;
  }
  await database.setMetadata(KEY_CHECK_KEY, JSON.stringify(cipher.encrypt('presence-desk-key-check-v1')));
}

async function importLegacyAccounts({
  database,
  store,
  user,
  adminDiscordIds,
  filePath = path.resolve(import.meta.dirname, '../data/accounts.json'),
  now = () => new Date(),
} = {}) {
  if (!adminDiscordIds.has(user.discord_id)) return { imported: false, reason: 'not-admin' };
  const backupPath = `${filePath}.bak`;
  if (await database.getMetadata(LEGACY_IMPORT_KEY)) {
    let legacyBackupDeleted = false;
    try { await fs.unlink(backupPath); legacyBackupDeleted = true; }
    catch (error) { if (error.code !== 'ENOENT') throw new DatabaseError('LEGACY_PLAINTEXT_CLEANUP_FAILED', `Không thể xóa backup token plaintext (${error.code || 'UNKNOWN'}).`); }
    if (legacyBackupDeleted) {
      await database.audit('legacy.plaintext_backup_deleted', {
        actorUserId: user.id, actorDiscordId: user.discord_id,
        targetType: 'legacy_file', targetId: 'data/accounts.json.bak',
      });
    }
    let legacySourceDeleted = false;
    try { await fs.unlink(filePath); legacySourceDeleted = true; }
    catch (error) { if (error.code !== 'ENOENT') throw new DatabaseError('LEGACY_PLAINTEXT_CLEANUP_FAILED', `Không thể xóa source token plaintext (${error.code || 'UNKNOWN'}).`); }
    if (legacySourceDeleted) {
      await database.audit('legacy.plaintext_source_deleted', {
        actorUserId: user.id, actorDiscordId: user.discord_id,
        targetType: 'legacy_file', targetId: 'data/accounts.json',
      });
    }
    return { imported: false, reason: 'already-imported', legacyBackupDeleted, legacySourceDeleted };
  }
  let text;
  try { text = await fs.readFile(filePath, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') {
      await database.setMetadata(LEGACY_IMPORT_KEY, 'no-source');
      return { imported: false, reason: 'missing' };
    }
    throw error;
  }
  const legacy = validateAccountsFile(JSON.parse(text));
  const timestamp = now().toISOString();
  const operationId = database.operationId();
  const kind = 'legacy_import';
  const guard = { operationId, subjectId: user.id, kind };
  await database.batch([
    {
      sql: `INSERT OR IGNORE INTO operation_guards (operation_id, subject_id, kind, created_at)
        SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM metadata WHERE key = ?)`,
      args: [operationId, user.id, kind, timestamp, LEGACY_IMPORT_KEY],
    },
    ...legacy.accounts.map((item) => {
      const encrypted = store.cipher.encrypt(item.token, { userId: user.id, accountId: item.id });
      return {
        sql: `INSERT OR IGNORE INTO accounts
          (id, user_id, label, token_ciphertext, token_iv, token_tag, token_crypto_version, form_state, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, 2, ?, ?, ? WHERE EXISTS (
            SELECT 1 FROM operation_guards WHERE operation_id = ? AND subject_id = ? AND kind = ?)`,
        args: [item.id, user.id, item.label, encrypted.ciphertext, encrypted.iv, encrypted.tag,
          item.formState ? JSON.stringify(item.formState) : null, item.createdAt, item.updatedAt,
          operationId, user.id, kind],
      };
    }),
    {
      sql: `INSERT INTO metadata (key, value, updated_at)
        SELECT ?, ?, ? WHERE EXISTS (
          SELECT 1 FROM operation_guards WHERE operation_id = ? AND subject_id = ? AND kind = ?)
        ON CONFLICT(key) DO NOTHING`,
      args: [LEGACY_IMPORT_KEY, JSON.stringify({ userId: user.id, count: legacy.accounts.length }), timestamp,
        operationId, user.id, kind],
    },
    database.auditStatement('legacy.import', {
      actorUserId: user.id, actorDiscordId: user.discord_id, targetType: 'user', targetId: user.id,
      metadata: { accountCount: legacy.accounts.length }, guard,
    }),
    {
      sql: 'DELETE FROM operation_guards WHERE operation_id = ? AND subject_id = ? AND kind = ?',
      args: [operationId, user.id, kind],
    },
  ]);
  let sourceCleanupError = null;
  try { await fs.unlink(filePath); }
  catch (error) { if (error.code !== 'ENOENT') sourceCleanupError = error; }
  await database.audit(sourceCleanupError ? 'legacy.plaintext_cleanup_failed' : 'legacy.plaintext_deleted', {
    actorUserId: user.id, actorDiscordId: user.discord_id,
    targetType: 'legacy_file', targetId: 'data/accounts.json',
    metadata: { accountCount: legacy.accounts.length, errorCode: sourceCleanupError?.code || null },
  });

  let legacyBackupDeleted = false;
  let backupCleanupError = null;
  try { await fs.unlink(backupPath); legacyBackupDeleted = true; }
  catch (error) { if (error.code !== 'ENOENT') backupCleanupError = error; }
  if (legacyBackupDeleted || backupCleanupError) {
    await database.audit(backupCleanupError ? 'legacy.plaintext_cleanup_failed' : 'legacy.plaintext_backup_deleted', {
      actorUserId: user.id, actorDiscordId: user.discord_id,
      targetType: 'legacy_file', targetId: 'data/accounts.json.bak',
      metadata: { errorCode: backupCleanupError?.code || null },
    });
  }

  const cleanupError = sourceCleanupError || backupCleanupError;
  if (cleanupError) {
    throw new DatabaseError('LEGACY_PLAINTEXT_CLEANUP_FAILED', `Đã import nhưng không thể xóa file token plaintext (${cleanupError.code || 'UNKNOWN'}).`);
  }
  return { imported: true, count: legacy.accounts.length, sourceDeleted: true, legacyBackupDeleted };
}

export {
  Database,
  DatabaseError,
  KEY_CHECK_KEY,
  LEGACY_IMPORT_KEY,
  MAX_APPLIED_CONFIG_BYTES,
  MIGRATION_1,
  MIGRATION_2,
  MIGRATION_3,
  MIGRATION_4,
  MIGRATION_5,
  MIGRATION_6,
  MIGRATIONS,
  SCHEMA_VERSION,
  DatabaseAccountsStore,
  assertSchema,
  createDatabaseClient,
  ensureEncryptionKeyCheck,
  importLegacyAccounts,
  migrateDatabase,
  normalizeResultRows,
  executeBatch,
};
```

---

## 4. src/migrate.js

### Chức năng chính
- Tải biến môi trường từ file `.env`.
- Cung cấp hàm `runMigrations` khởi tạo database client từ `VANILLA_DB_URL` và `VANILLA_DB_TOKEN`.
- Đóng vai trò là entrypoint CLI (`node src/migrate.js` hoặc `npm run db:migrate`) để áp dụng migration trước khi khởi chạy ứng dụng.

### Toàn bộ code `src/migrate.js`:
```javascript
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabaseClient, migrateDatabase } from './database.js';

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

async function runMigrations({
  url = process.env.VANILLA_DB_URL,
  token = process.env.VANILLA_DB_TOKEN,
} = {}) {
  const client = createDatabaseClient({ url, token });
  try { return await migrateDatabase(client); }
  finally { client.close(); }
}

const isEntrypoint = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  const version = await runMigrations();
  console.log(`VanillaDatabase schema đã ở version ${version}.`);
}

export { runMigrations };
```
