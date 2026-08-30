# VanillaDatabase (VanillaDB) — LLM & AI Agent Reference

This document provides technical context, architecture constraints, file mappings, and conventions for AI coding agents (Claude Code, Codex, Cursor, Copilot) working in this repository.

---

## 1. Core Project Architecture

VanillaDatabase is a **multi-tenant SQLite cloud engine** built on Node.js 22+ native `node:sqlite` and Fastify.

```
src/
├── server/               # Fastify backend, SQLite connection pool, services, routes
│   ├── api/              # HTTP Route Handlers (admin.ts, auth.ts, data.ts, system.ts)
│   ├── config/           # Environment variable parsing with defaults (index.ts)
│   ├── db/               # SQLite handles (manager.ts) & Metadata system DB (metadata.ts)
│   ├── middleware/       # Fastify authentication hooks (auth.ts)
│   ├── services/         # Business logic (database, auth, tokens, backup, storage, webhook, realtime)
│   └── utils/            # Crypto (AES-256-GCM), logger (Pino), SQL translator
└── web/                  # React 19 + Tailwind CSS + Monaco Editor frontend dashboard
shared/                   # Shared TypeScript interfaces & isomorphic VanillaDatabase client SDK
```

---

## 2. Important Files & Roles

| File Path | Description & Precautions |
| :--- | :--- |
| `src/server/index.ts` | Fastify entrypoint, plugin registrations, error handlers, static asset serving. |
| `src/server/db/manager.ts` | SQLite connection manager. Caches handles for 5 minutes. Validates SQL safety (`validateSqlSafety`). Registers custom SQL functions (`vec_cosine_*`, `encrypt_aes`, etc.). |
| `src/server/db/metadata.ts` | Metadata SQLite store (`vanilladb.sqlite`). Manages schema migrations (`schema_migrations`). |
| `src/server/api/data.ts` | Public Data Plane (`/v1/*`). Token-authenticated SQL execution, table CRUD, SSE stream, media streaming. |
| `src/server/api/admin.ts` | Control Plane (`/api/admin/*`). Admin-only database creation, schema inspection, backup restore, import/export, users. |
| `src/server/middleware/auth.ts` | `requireAdminAuth`, `requireRole`, and `requireTokenPermission` route guards. |
| `src/server/utils/crypto.ts` | AES-256-GCM envelope encryption (`VENC` magic header, PBKDF2 salt, IV, tag). |
| `src/server/utils/sqlTranslator.ts` | Translates MySQL, PostgreSQL, CSV, and NDJSON dumps into SQLite dialect. |
| `shared/index.ts` | Single source of truth for shared TypeScript types and schemas. |
| `shared/client.ts` | Lightweight TypeScript/JavaScript client SDK. |

---

## 3. Critical Security & Architectural Rules

1. **SQL Sandboxing**:
   - Never allow `ATTACH DATABASE`, `DETACH DATABASE`, `load_extension()`, or `PRAGMA writable_schema`.
   - Any query execution in `DatabaseManager` must run through `validateSqlSafety()`.
2. **Path Traversal Protection**:
   - All filesystem operations involving user input or IDs must use `path.basename()` or verify that `resolvedPath.startsWith(allowedRootDir)`.
3. **Database Isolation**:
   - Tenant databases are stored individually at `data/databases/:id.sqlite`.
   - Metadata is isolated in `data/system/vanilladb.sqlite`.
   - Media storage is partitioned per database at `data/storage/:databaseId/`.
4. **Token Security**:
   - API tokens are generated as `vdb_live_*` or `vdb_test_*`.
   - Raw secrets are **never stored** in SQLite. Only `token_hash` (SHA-256) is persisted.
5. **No Breaking API Changes**:
   - Public Data Plane endpoints under `/v1/databases/:databaseId/*` must maintain backward compatibility for client SDKs.
6. **Synchronous Native SQLite**:
   - Node.js 22 `node:sqlite` uses `DatabaseSync`. All queries are synchronous on worker threads. Do not wrap SQLite prepare/run/all calls in unnecessary native Promises.

---

## 4. Development & Verification Commands

```bash
# Type check all TypeScript files (Client + Server)
npm run typecheck

# Run automated Vitest test suite
npm test

# Run development server with live reload
npm run dev

# Run benchmark suite
npm run benchmark

# Reset admin credentials via CLI
npm run admin:reset <username> <password>
```

---

## 5. Common Modification Tasks

### Adding a New Database Pragma / Custom SQL Function
1. Edit `src/server/db/manager.ts`.
2. In `DatabaseManager.get()`, register the function using `(db as any).function?.('function_name', fn)`.
3. In `validateSqlSafety()`, ensure safe PRAGMAs or functions are whitelisted.
4. Add automated test case in `tests/vanilladb.test.ts`.

### Adding a New Data Plane Route (`/v1`)
1. Edit `src/server/api/data.ts`.
2. Attach `preHandler: [requireTokenPermission('database:...')]`.
3. Record duration and metrics with `activityService.recordActivity()`.
4. Emit mutation events if modifying state: `realtimeService.emitEvent()`.
5. Update `shared/client.ts` if client SDK needs helper methods.

### Adding a System Configuration Setting
1. Add setting key to `src/server/config/index.ts` and `src/server/services/system.ts`.
2. Update schema in `src/server/api/system.ts`.
3. Update `.env.example` and documentation in `README.md`.

---

## 6. Prohibited Practices (Do Not)

- ❌ Do not use external database drivers (`better-sqlite3`, `sqlite3`). Use native `node:sqlite`.
- ❌ Do not hardcode secret keys or session tokens in source files.
- ❌ Do not bypass token permission checks or user quota checks.
- ❌ Do not commit runtime artifacts (`data/`, `dist/`, `.env`).
- ❌ Do not remove or alter `WAL` journal mode configurations.
