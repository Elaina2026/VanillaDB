# VanillaDatabase (VanillaDB) — LLM & AI Agent Architecture Reference

Technical context, architectural constraints, file mappings, and conventions for Large Language Models and AI coding agents working in this repository.

---

## 1. System Architecture & Topology

VanillaDatabase is a **lightweight, multi-tenant SQLite cloud engine** built on Node.js 22+ native `better-sqlite3` and Fastify.

```
src/
|-- server/               # Fastify backend, SQLite connection pool, services, routes
|   |-- api/              # HTTP Route Handlers (admin.ts, auth.ts, data.ts, system.ts)
|   |-- config/           # Environment variable parsing with defaults (index.ts)
|   |-- db/               # SQLite handles (manager.ts) & Metadata system DB (metadata.ts)
|   |-- middleware/       # Fastify authentication hooks & rate limiters (auth.ts)
|   |-- services/         # Business logic (database, auth, tokens, backup, storage, webhook, realtime)
|   `-- utils/            # Crypto (AES-256-GCM), logger (Pino), SQL translator, TOTP RFC 6238
`-- web/                  # React 19 + Tailwind CSS v4 + Monaco Editor frontend dashboard
shared/                   # Shared TypeScript interfaces & isomorphic VanillaDatabase client SDK
tests/                    # Vitest end-to-end integration and unit test suite
```

---

## 2. Key Files & Responsibilities

| File Path | Responsibility & Precautions |
| :--- | :--- |
| `src/server/index.ts` | Fastify entrypoint, Helmet CSP rules, CORS handler, static asset serving. |
| `src/server/db/manager.ts` | SQLite connection manager. Caches handles for 5 minutes. Validates SQL safety via `validateSqlSafety()`. Registers AI vector functions (`vec_cosine_*`) and cryptographic SQL functions. |
| `src/server/db/metadata.ts` | Metadata SQLite store (`vanilladb.sqlite`). Manages schema migrations (`schema_migrations`, version 14 active). |
| `src/server/api/data.ts` | Data Plane (`/v1/*`). Token-authenticated SQL query/exec/batch, table CRUD, SSE stream, media streaming. |
| `src/server/api/admin.ts` | Control Plane (`/api/admin/*`). Admin/owner database creation, schema inspection, backup restore, import/export, users. |
| `src/server/api/auth.ts` | Authentication endpoints (`/api/auth/*`). Self-registration, login, 2FA TOTP challenges, session status. |
| `src/server/services/auth.ts` | Password hashing (Argon2id), HMAC session cookies with `token_version` binding. |
| `src/server/middleware/auth.ts` | `requireAdminAuth`, `requireRole`, and `requireTokenPermission` route guards with rate limiting. |
| `src/server/utils/totp.ts` | RFC 6238 TOTP engine with monotonic time-step tracking to reject duplicate token replay. |
| `src/server/utils/crypto.ts` | AES-256-GCM envelope encryption (`VENC` magic header, PBKDF2 salt, IV, auth tag). |
| `src/server/utils/sqlTranslator.ts` | Translates MySQL, PostgreSQL, CSV, and NDJSON dumps into SQLite dialect. |
| `shared/index.ts` | Single source of truth for shared TypeScript types and schemas. |

---

## 3. Critical Security & Architectural Rules

1. **SQL Sandboxing & Safety**:
   - `ATTACH DATABASE`, `DETACH DATABASE`, `load_extension()`, and `PRAGMA writable_schema` are blocked by default.
   - Any raw query execution in `DatabaseManager` must run through `validateSqlSafety()`.
2. **Path Traversal Protection**:
   - Filesystem operations involving database IDs or media files must use `path.basename()` or verify that `resolvedPath.startsWith(allowedRootDir)`.
3. **Tenant Database Isolation**:
   - Tenant databases are stored individually at `data/databases/:id.sqlite`.
   - Metadata is isolated in `data/system/vanilladb.sqlite`.
   - Media storage is partitioned per database at `data/storage/:databaseId/`.
4. **Token Security**:
   - API tokens are generated with prefix `vdb_live_*` or `vdb_test_*`.
   - Raw tokens are never stored in SQLite; only SHA-256 hashes (`token_hash`) are persisted.
5. **Session Revocation (VDB-SEC-01)**:
   - HMAC session cookies include `token_version`.
   - When a password is changed or account disabled, `token_version` is incremented, immediately revoking active sessions.
6. **TOTP Replay Defense (VDB-SEC-02)**:
   - Verification accepts `lastUsedStep` and requires `candidateStep > lastUsedStep`.
7. **SSRF Blocker**:
   - Webhook destinations reject private RFC 1918, loopback, and cloud metadata (`169.254.169.254`).

---

## 4. Development & Build Commands

```bash
# Run complete test suite (94 tests)
npm test

# Type check TypeScript files
npm run typecheck

# Build frontend and server bundles
npm run build

# Run development server with hot reload
npm run dev

# Run performance benchmark suite
npm run benchmark
```

---

# Tham chiếu Kiến trúc Dành cho Mô hình LLM (Tiếng Việt)

Tài liệu cung cấp ngữ cảnh kỹ thuật, ranh giới thiết kế, sơ đồ tệp và quy chuẩn dành cho các mô hình ngôn ngữ lớn (LLM) và tác tử lập trình tự động.

---

## 1. Ngữ cảnh & Mục đích

VanillaDatabase là động cơ SQLite đám mây đa người thuê, hỗ trợ kết nối qua REST API và SQL, phát sự kiện realtime SSE, lưu trữ tệp tin mã hóa với HTTP 206 Partial Content, và hỗ trợ hàm AI Vector native.

## 2. Quy tắc an ninh cốt lõi

- **Không nối chuỗi SQL thô:** Toàn bộ truy vấn siêu dữ liệu bắt buộc dùng câu lệnh chuẩn bị (Prepared Statements) với tham số hóa.
- **Bảo vệ phiên làm việc:** Cookie phiên HMAC đính kèm `token_version`. Bất kỳ thay đổi mật khẩu nào phải kích hoạt tăng `token_version` để thu hồi phiên cũ.
- **Chống phát lại 2FA:** Mã TOTP phải kiểm tra `last_totp_step` theo RFC 6238 để ngăn chặn gửi lại trong cửa sổ trôi dạt 90s.
- **Chặn SSRF:** Webhook kiểm tra hostname và địa chỉ IP phân giải, cấm mọi dải IP riêng tư hoặc metadata đám mây.
