# Architecture & Engine Design

Technical specification of the internal architecture, connection pooling, concurrency model, and multi-tenant data isolation mechanisms in **VanillaDatabase**.

---

## 1. High-Level System Topology

```
                       +-----------------------------------+
                       |        HTTP / SSE Clients         |
                       |  (Web Dashboard, SDKs, Scripts)   |
                       +-----------------+-----------------+
                                         |
                                         v
                       +-----------------------------------+
                       | Fastify HTTP Server (Port: 3000)  |
                       |  - Helmet Security & CORS Guard   |
                       |  - Session Cookie & Bearer Auth   |
                       |  - Multipart Upload & Range 206   |
                       |  - Realtime Metrics & Telemetry   |
                       +-----------------+-----------------+
                                         |
        +--------------------------------+--------------------------------+
        |                                                                 |
        v                                                                 v
+------------------------------+                  +------------------------------+
| Control Plane (/api/*)       |                  | Data Plane (/v1/*)           |
| - Admin Authentication       |                  | - API Bearer Token Guard     |
| - Multi-User RBAC & Quotas   |                  | - Sliding Rate Limiter (429) |
| - Multi-DB SQL Translator    |                  | - Parameterized Query Engine |
| - Scheduled Backup Worker    |                  | - Atomic Batch Transaction   |
| - Webhook Event Dispatcher   |                  | - Realtime SSE Stream Bus    |
| - Audit & Activity Logs      |                  | - Media Storage (Range 206)  |
+--------------+---------------+                  +--------------+---------------+
               |                                                 |
               v                                                 v
+------------------------------+                  +------------------------------+
| System Metadata Store        |                  | Database Manager Pool        |
| - data/system/vanilladb.sqlite                  | - Connection Handle Cache    |
| - Schema migrations & users  |                  | - SQL Safety Sandbox         |
| - API tokens & audit logs    |                  | - Vector Math & SQL Crypto   |
+------------------------------+                  +--------------+---------------+
                                                                 |
                                                                 v
                                                  +------------------------------+
                                                  | Isolated Tenant Databases    |
                                                  | - data/databases/:id.sqlite  |
                                                  | - WAL Mode & Busy Timeout    |
                                                  | - data/storage/:id/*         |
                                                  | - data/backups/:id/*.sqlite  |
                                                  +------------------------------+
```

---

## 2. Multi-Tenant Storage Isolation

VanillaDatabase enforces strict physical separation between system state and tenant data:

| Component | Storage Path | Isolation Guarantee |
| :--- | :--- | :--- |
| **System Metadata** | `data/system/vanilladb.sqlite` | Contains users, session tracking (`token_version`), API tokens, database registry, webhooks, and audit trails. |
| **Tenant Databases** | `data/databases/:id.sqlite` | Individual SQLite database per tenant with dedicated WAL journal and shared-memory (`-shm`) index. |
| **Media Assets** | `data/storage/:databaseId/*` | Database-partitioned AES-256-GCM encrypted media files. |
| **Encrypted Backups** | `data/backups/:databaseId/*` | Encrypted snapshot archives (`.sqlite.venc`) with SHA-256 checksum manifests. |

---

## 3. Database Manager & Concurrency Model

### Write-Ahead Logging (WAL Mode)
Every database is initialized with:
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```
- **Concurrent Readers & Writer**: Multiple read connections execute simultaneously without blocking incoming write operations.
- **Handle Cache**: The database connection pool (`DatabaseManager`) maintains active database handles in memory. Handles idle for more than 5 minutes are closed to minimize file descriptor consumption.

### Query Safety Engine
All public queries run through `DatabaseManager.validateSqlSafety()` before compilation:
- **Blocked Operations**: `ATTACH DATABASE`, `DETACH DATABASE`, `load_extension()`, and `PRAGMA writable_schema`.
- **Prepared Statements**: Metadata queries exclusively utilize parameterized bindings.

---

## 4. Control Plane vs Data Plane Separation

### Control Plane (`/api/*`)
- Accessible only to authenticated platform users and administrators.
- Handles user provisioning, database creation/cloning, system diagnostics, and audit log exports.
- Governed by HMAC session cookies (`vdb_session`) with `token_version` invalidation.

### Data Plane (`/v1/*`)
- High-performance, low-overhead public interface for application traffic.
- Authenticated via scoped API tokens (`vdb_live_*`, `vdb_test_*`).
- Enforces sliding-window rate limits and per-table access controls.
