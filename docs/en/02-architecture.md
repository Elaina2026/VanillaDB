# Architecture & Engine Design

This document details the internal architecture, connection pooling, concurrency model, and multi-tenant data isolation mechanisms of **VanillaDatabase**.

---

## 1. High-Level Architectural Diagram

```
                      ┌─────────────────────────────────┐
                      │        HTTP / SSE Clients       │
                      │  (Web Dashboard, SDKs, Scripts) │
                      └────────────────┬────────────────┘
                                       │
                     ┌─────────────────┴─────────────────┐
                     │ Fastify HTTP Server (Port: 3000)  │
                     │  - Helmet Security & CORS Guard   │
                     │  - Session Cookie & Bearer Auth   │
                     │  - Multipart Upload & Range 206   │
                     │  - Realtime Metrics & Telemetry   │
                     └─────────────────┬─────────────────┘
                                       │
        ┌──────────────────────────────┴──────────────────────────────┐
        ▼                                                             ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│ Control Plane (/api/*)       │              │ Data Plane (/v1/*)           │
│ • Admin Authentication       │              │ • API Bearer Token Guard     │
│ • Multi-User RBAC & Quotas   │              │ • Sliding Rate Limiter (429) │
│ • Multi-DB SQL Translator    │              │ • Parameterized Query Engine │
│ • Scheduled Backup Worker    │              │ • Atomic Batch Transaction   │
│ • Webhook Event Dispatcher   │              │ • Realtime SSE Stream Bus    │
│ • Audit & Activity Logs      │              │ • Media Storage (Range 206)  │
└──────────────┬───────────────┘              └──────────────┬───────────────┘
               │                                             │
               ▼                                             ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│ System Metadata Store        │              │ Database Manager Pool        │
│ • data/system/vanilladb.sqlite              │ • Connection Handle Cache    │
│ • Schema migrations & users  │              │ • SQL Safety Sandbox         │
│ • API tokens & audit logs    │              │ • Vector Math & SQL Crypto   │
└──────────────────────────────┘              └──────────────┬───────────────┘
                                                             │
                                                             ▼
                                              ┌──────────────────────────────┐
                                              │ Isolated Tenant Databases    │
                                              │ • data/databases/:id.sqlite  │
                                              │ • WAL Mode & Busy Timeout    │
                                              │ • data/storage/:id/*         │
                                              │ • data/backups/:id/*.sqlite  │
                                              └──────────────────────────────┘
```

---

## 2. Plane Separation: Control vs Data

VanillaDatabase cleanly separates operational control from tenant data traffic:

### Control Plane (`/api/*`)
- Governs administrative operations: database creation/deletion, API token issuance, scheduled jobs, member invitations, backups, and user management.
- Guarded by session cookie authentication (`vdb_session`) with `Argon2id` verification and RBAC checks.
- Backed by the system metadata database (`data/system/vanilladb.sqlite`).

### Data Plane (`/v1/*`)
- High-throughput tenant execution plane for SQL queries, transactional batch executions, and media streaming.
- Guarded by scoped API bearer tokens (`vdb_live_*`, `vdb_test_*`) and sliding-window rate limiters.
- Fully isolated to the target database instance.

---

## 3. Multi-Tenancy & Data Isolation

### Discrete Database Files
Every tenant database created is stored as a dedicated SQLite file:
- Primary database file: `data/databases/db_<nanoid>.sqlite`
- Write-Ahead Log: `data/databases/db_<nanoid>.sqlite-wal`
- Shared Memory: `data/databases/db_<nanoid>.sqlite-shm`

### Isolation Advantages
1. **Absolute Security**: Cross-tenant data leaks via SQL injection or poorly formed `JOIN` clauses are physically impossible across file boundaries.
2. **Per-Tenant Backup & Portability**: Individual databases can be backed up, restored, cloned, or downloaded without locking other databases.
3. **Hard Quota Enforcement**: File sizes can be checked against per-tenant storage caps (`max_size_mb`).

---

## 4. Concurrency & Performance Engine

- **PRAGMA journal_mode = WAL**: Write-Ahead Logging allows concurrent readers and writers without lock contention.
- **PRAGMA busy_timeout = 5000**: When a write lock is active, subsequent read/write requests wait up to 5000ms before returning `SQLITE_BUSY`.
- **Handle Cache Pool (`dbManager`)**: Frequently queried database handles are cached in memory with a 60-second sliding expiration, minimizing OS file open/close overhead.
- **Atomic File Checkpoints**: Backups execute `PRAGMA wal_checkpoint(FULL)` to ensure zero dirty pages remain uncommitted before snapshotting.
