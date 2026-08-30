# Architecture & Engine Design

This document details the internal architecture, lifecycle, concurrency model, and data isolation mechanisms of **VanillaDatabase**.

---

## 1. System Architecture Overview

```
                      ┌─────────────────────────────────┐
                      │    HTTP / WebSocket Clients     │
                      └────────────────┬────────────────┘
                                       │
                     ┌─────────────────┴─────────────────┐
                     │ Fastify HTTP Server (Port: 3000)  │
                     │  - Helmet Security & CORS         │
                     │  - Cookie Session Parser          │
                     │  - Multipart Upload Engine        │
                     │  - Metrics & Telemetry Hook       │
                     └─────────────────┬─────────────────┘
                                       │
        ┌──────────────────────────────┴──────────────────────────────┐
        ▼                                                             ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│ Control Plane (/api/*)       │              │ Data Plane (/v1/*)           │
│ • Admin Authentication       │              │ • API Bearer Token Guard     │
│ • User RBAC & Quotas         │              │ • Token Rate Limiter         │
│ • Multi-DB SQL Translator    │              │ • Parameterized Query Engine │
│ • Scheduled Backup Worker    │              │ • Atomic Batch Transaction   │
│ • Webhook Event Dispatcher   │              │ • Realtime SSE Stream Bus    │
│ • Audit & Activity Logs      │              │ • Media Storage (Range 206)  │
└──────────────┬───────────────┘              └──────────────┬───────────────┘
               │                                             │
               ▼                                             ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│ Metadata Store               │              │ Database Manager Pool        │
│ • data/system/vanilladb.db   │              │ • Connection Handle Cache    │
│ • Schema migrations          │              │ • SQL Safety Validator       │
│ • Users, Tokens, Settings    │              │ • Vector Math & SQL Crypto   │
└──────────────────────────────┘              └──────────────┬───────────────┘
                                                             │
                                                             ▼
                                              ┌──────────────────────────────┐
                                              │ Tenant SQLite Databases      │
                                              │ • data/databases/:id.sqlite  │
                                              │ • WAL Mode & Busy Timeout    │
                                              │ • data/storage/:id/*         │
                                              └──────────────────────────────┘
```

---

## 2. Multi-Tenancy & Data Isolation

### Isolated Tenant Files
Every created database is stored as a dedicated SQLite file:
- Primary file: `data/databases/db_<nanoid>.sqlite`
- Write-Ahead Log: `data/databases/db_<nanoid>.sqlite-wal`
- Shared Memory: `data/databases/db_<nanoid>.sqlite-shm`

### Central Control Plane Metadata
System metadata, user accounts, tokens, and audit logs are kept in a separate database:
- `data/system/vanilladb.sqlite`

This physical separation ensures:
1. **Zero cross-tenant contamination**: A corrupted tenant database or query lock never impacts other tenants or system metadata.
2. **Instant portability**: Cloning, backing up, or exporting a database is as simple as copying the individual `.sqlite` file.
3. **Hard resource deletion**: Deleting a database safely deletes the `.sqlite` file, its WAL, its encrypted backup snapshots, and its media files.

---

## 3. SQLite Concurrency & Handle Management

### WAL Mode (Write-Ahead Logging)
Every database is automatically configured with:
```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```
- **Concurrent Reads & Writes**: Readers never block writers, and writers never block readers.
- **Busy Timeout**: Automatically waits up to 5,000ms if another writer is committing, eliminating `SQLITE_BUSY` crashes.

### Active Handle Cache & Idle Eviction
- Handles are managed in `DatabaseManager` (`src/server/db/manager.ts`).
- Active database handles are cached in memory for high-throughput reuse.
- A background timer checks handles every 60 seconds. Any handle idle for more than **5 minutes** (`IDLE_TIMEOUT_MS`) is automatically flushed (`wal_checkpoint(PASSIVE)`) and closed to free memory and file descriptors.

---

## 4. SQL Sandbox & Safety Guardrails

To prevent malicious queries or privilege escalation through tenant databases, all incoming SQL statements pass through `DatabaseManager.validateSqlSafety()` before execution:

1. **Forbidden Statements**:
   - `ATTACH DATABASE` & `DETACH DATABASE`: Prevents accessing system files or other tenant databases.
   - `VACUUM INTO`: Prevents writing arbitrary files to the host OS.
   - `load_extension()`: Blocks executing untrusted native C shared libraries.
   - `PRAGMA writable_schema`: Protects internal SQLite master structures.
2. **PRAGMA Whitelist**:
   - Only safe inspection pragmas (`table_info`, `index_list`, `foreign_key_list`, `integrity_check`, `quick_check`, `wal_checkpoint`, `page_count`) are allowed through API endpoints.
3. **Table Whitelists / Denylists**:
   - Restricted API tokens have table-level access rules enforced directly during query validation.
