# VanillaDatabase — Comprehensive System Architecture & Engineering Specification

> **Version:** 1.3.4  
> **Status:** Production Reference  
> **Target Audience:** Systems Architects, Security Engineers, Core Developers, and Platform Operators

---

## Table of Contents

1. [Executive Summary & Architectural Tenets](#1-executive-summary--architectural-tenets)
2. [High-Level System Topology](#2-high-level-system-topology)
3. [Plane Separation: Control Plane vs. Data Plane](#3-plane-separation-control-plane-vs-data-plane)
4. [Multi-Tenant Physical Storage Isolation](#4-multi-tenant-physical-storage-isolation)
5. [Database Engine & Concurrency Architecture](#5-database-engine--concurrency-architecture)
   - 5.1 [Write-Ahead Logging (WAL) Engine](#51-write-ahead-logging-wal-engine)
   - 5.2 [SQLite Sandboxing & SQL Safety](#52-sqlite-sandboxing--sql-safety)
   - 5.3 [Extended Mathematical & Cryptographic Scalar Functions](#53-extended-mathematical--cryptographic-scalar-functions)
   - 5.4 [Full-Text Search (FTS5) Engine](#54-full-text-search-fts5-engine)
6. [Multi-Node Cluster Architecture & Host Sharding](#6-multi-node-cluster-architecture--host-sharding)
   - 6.1 [Gateway Routing & Spillover Controller](#61-gateway-routing--spillover-controller)
   - 6.2 [Inter-Node Authentication & Constant-Time Verification](#62-inter-node-authentication--constant-time-verification)
   - 6.3 [Transparent Proxying & Zero-Downtime Migration](#63-transparent-proxying--zero-downtime-migration)
7. [Security Architecture & Guardrails](#7-security-architecture--guardrails)
   - 7.1 [VDB-SEC-01: Session Revocation Architecture](#71-vdb-sec-01-session-revocation-architecture)
   - 7.2 [VDB-SEC-02: TOTP 2FA Replay Protection (RFC 6238)](#72-vdb-sec-02-totp-2fa-replay-protection-rfc-6238)
   - 7.3 [VDB-SEC-03: RFC 6750 Query Token Prohibition & Ephemeral Tickets](#73-vdb-sec-03-rfc-6750-query-token-prohibition--ephemeral-tickets)
   - 7.4 [SSRF Prevention on Outbound Webhooks](#74-ssrf-prevention-on-outbound-webhooks)
   - 7.5 [Active Content & Media Isolation](#75-active-content--media-isolation)
   - 7.6 [Internal Binary Avatar Pipeline](#76-internal-binary-avatar-pipeline)
8. [Task Automation & Schedules Execution Pipeline](#8-task-automation--schedules-execution-pipeline)
   - 8.1 [5-Part Cron & Simple Interval Parser](#81-5-part-cron--simple-interval-parser)
   - 8.2 [Multi-Task Chaining Engine](#82-multi-task-chaining-engine)
9. [Realtime Event Streaming (SSE) & Webhook Dispatcher](#9-realtime-event-streaming-sse--webhook-dispatcher)
10. [Frontend Architecture & UX Design System](#10-frontend-architecture--ux-design-system)
    - 10.1 [Pterodactyl-Style Categorized Navigation](#101-pterodactyl-style-categorized-navigation)
    - 10.2 [Database Activity Timeline Stream](#102-database-activity-timeline-stream)
    - 10.3 [Unified Statistical Dashboard](#103-unified-statistical-dashboard)
    - 10.4 [Keyboard Navigation & Zen Mode Engine](#104-keyboard-navigation--zen-mode-engine)
11. [Request Lifecycle & Data Flow Sequence Diagrams](#11-request-lifecycle--data-flow-sequence-diagrams)

---

## 1. Executive Summary & Architectural Tenets

**VanillaDatabase (VanillaDB)** is a lightweight, high-density, multi-tenant SQLite cloud platform built on Node.js 22+ and Fastify 5.2. Instead of operating monolithic relational database instances (e.g., PostgreSQL or MySQL clusters) that consume significant memory per idle tenant, VanillaDatabase dynamically provisions and orchestrates **isolated SQLite database binaries** on disk.

### Core Architectural Tenets:
1. **Physical Filesystem Partitioning over Logical Namespacing:** Tenants do not share tables or schemas. Every tenant database is a physically distinct SQLite database file (`.sqlite`) on disk with dedicated WAL journals and memory locks.
2. **Minimal Dependencies & Native First:** The backend leverages native Fastify plugins, Node.js stdlib `crypto`, `fs`, `stream`, and `better-sqlite3`. No external message brokers (Kafka/RabbitMQ) or heavy ORMs are required.
3. **Data-at-Rest Hardware Encryption:** Databases, backups, and media files support AES-256-GCM encryption with SHA-256 authenticated integrity checksums.
4. **RFC-Compliant Security by Default:** Strict session revocation (VDB-SEC-01), RFC 6238 monotonic TOTP time-step tracking (VDB-SEC-02), and RFC 6750 query token prohibition with 60-second single-use tickets (VDB-SEC-03).
5. **Horizontal Host Sharding:** Transparent Gateway proxying allows distributing tenant databases across multiple storage nodes without altering client-facing URLs or SDK client code.

---

## 2. High-Level System Topology

```
                                  +---------------------------------------+
                                  |         HTTP / SSE Clients            |
                                  |   (Web UI, SDKs, AI Agents, CLI)      |
                                  +-------------------+-------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |    Fastify API Gateway (Port: 3000)   |
                                  | - Strict Helmet CSP & CORS Firewall   |
                                  | - L7 Sliding Window Rate Limiter      |
                                  | - Inter-Node Host Sharding Router     |
                                  +---------+-------------------+---------+
                                            |                   |
                     +----------------------+                   +----------------------+
                     | (Local Storage)                                  | (Proxy / Tunnel)
                     v                                                  v
+----------------------------------------+          +----------------------------------------+
| Primary Host Node (Local)              |          | Remote Worker Storage Node 1           |
| - Metadata DB: data/metadata.sqlite    |          | - Node Cluster Agent (/api/internal/*) |
| - Users, Roles, API Tokens, Jobs       |          | - Tenant DBs: data/databases/:id.sqlite|
| - Local Tenant DBs: data/databases/*   |          | - Encrypted Media: data/storage/:id/*  |
| - Avatars: data/storage/avatars/*      |          | - Encrypted Backups: data/backups/*    |
| - Ephemeral Ticket Store (In-Memory)   |          | - Local SQLite WAL Engine & Hooks      |
+----------------------------------------+          +----------------------------------------+
```

---

## 3. Plane Separation: Control Plane vs. Data Plane

VanillaDatabase enforces strict architectural separation between administrative operations (Control Plane) and database operational workloads (Data Plane):

```
                        +----------------------------------------+
                        |           Fastify Application          |
                        +-------------------+--------------------+
                                            |
                    +-----------------------+-----------------------+
                    |                                               |
                    v                                               v
+---------------------------------------+       +---------------------------------------+
| Control Plane (/api/*)                |       | Data Plane (/v1/*)                    |
|---------------------------------------|       |---------------------------------------|
| - Authentication (/api/auth/*)        |       | - Parameterized Query (/v1/databases/ |
| - User Management & RBAC Quotas       |       |   :id/query)                          |
| - Database Lifecycle (Create/Drop)    |       | - Multi-Statement Script (/v1/exec)   |
| - Job Scheduler & Task Pipeline       |       | - Atomic Transactions (/v1/batch)     |
| - Backup & Restore Engine             |       | - Realtime SSE (/v1/realtime)         |
| - Webhook Dispatcher & Audit Logs     |       | - Media Storage & Streaming (/v1/files|
| - Cluster Node Management & Telemetry |       |   /:id/view - HTTP 206)               |
| - Ephemeral Tickets (/v1/tickets)     |       | - Ephemeral Ticket Consumption        |
+-------------------+-------------------+       +-------------------+-------------------+
                    |                                               |
                    v                                               v
+---------------------------------------+       +---------------------------------------+
| System Metadata Catalog               |       | Tenant SQLite Database Manager        |
| - data/metadata.sqlite                |       | - LRU Database Connection Cache Pool  |
| - Shared across Control Plane         |       | - Sandboxed Statement Execution       |
+---------------------------------------+       +---------------------------------------+
```

---

## 4. Multi-Tenant Physical Storage Isolation

Unlike systems that partition tenant data via `WHERE tenant_id = ?` clauses inside a shared database table, VanillaDatabase provides **physical disk isolation**:

| Entity | Filesystem Location | Security & Isolation Mechanism |
| :--- | :--- | :--- |
| **System Catalog** | `data/metadata.sqlite` | Isolated system database. Contains user credentials (Argon2id), roles, quotas, session revocation tokens, database ownership, scheduled jobs, webhooks, and audit logs. |
| **Tenant Databases** | `data/databases/:databaseId.sqlite` | Physically distinct SQLite database binary per tenant. Each has its own WAL file (`:id.sqlite-wal`) and shared memory index (`:id.sqlite-shm`). |
| **Encrypted Media Storage** | `data/storage/databases/:databaseId/*` | Database-scoped media assets. Stored with AES-256-GCM encryption at rest. |
| **User Avatars** | `data/storage/avatars/:userId.<ext>` | System-level binary assets. Strictly segregated from tenant database quotas and protected by magic-byte validation. |
| **Encrypted Backups** | `data/backups/:databaseId/*.sqlite.venc` | Full database snapshots encrypted with AES-256-GCM. Accompanied by SHA-256 checksums and metadata manifests. |

---

## 5. Database Engine & Concurrency Architecture

### 5.1 Write-Ahead Logging (WAL) Engine
Every tenant database is opened via `better-sqlite3` and initialized with optimized PRAGMAs:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA cache_size = -2000; -- 2MB in-memory page cache
```

- **Concurrency Characteristics:** Readers do not block writers, and writers do not block readers. Multiple concurrent reader threads execute simultaneously while writes queue sequentially through SQLite's internal write lock with a 5000ms busy retry timeout.
- **Auto-Checkpointing:** SQLite flushes WAL pages to the main database file automatically when the WAL exceeds 1000 pages, or when invoked manually via `wal_checkpoint` maintenance tasks.

### 5.2 SQLite Sandboxing & SQL Safety
To prevent privilege escalation and arbitrary host execution:
1. **Disabled Binary Extensions:** `load_extension` is permanently disabled in the SQLite engine configuration.
2. **Forbidden Commands:** `ATTACH DATABASE` and `DETACH DATABASE` statements are rejected at the AST/regex parsing layer to prevent crossing tenant boundaries.
3. **Mutating CTE Write-Bypass Prevention (`isReadOnlySql`):** Common Table Expressions (`WITH ... SELECT`) can embed write operations (`INSERT INTO ... RETURNING *`). The safety analyzer strips SQL comments and verifies that queries starting with `WITH` do not contain mutating keywords (`INSERT`, `UPDATE`, `DELETE`, `REPLACE`).
4. **Mutating PRAGMA Segregation:** Read tokens (`database:read`) can execute diagnostic PRAGMAs (`PRAGMA table_info`, `PRAGMA index_list`), but are strictly barred from modifying PRAGMAs (`PRAGMA user_version = ...`, `auto_vacuum`, `optimize`, `wal_checkpoint`), which require `database:write` or `database:admin`.

### 5.3 Extended Mathematical & Cryptographic Scalar Functions
The engine registers native C/JavaScript scalar functions directly into each tenant SQLite handle:
- `cosine_similarity(vecA, vecB)`: Computes cosine similarity between two JSON vector arrays.
- `l2_distance(vecA, vecB)`: Calculates Euclidean distance for embeddings.
- `vector_dot(vecA, vecB)`: Fast vector dot product.
- `regexp(pattern, text)`: Native regular expression matcher.
- `argon2_verify(hash, plain)`: In-database password verification.

### 5.4 Full-Text Search (FTS5) Engine
VanillaDatabase supports native SQLite FTS5 virtual tables with tokenizers (`unicode61`, `porter`, `ascii`, `trigram`) and automated synchronization triggers on `AFTER INSERT`, `AFTER UPDATE`, and `AFTER DELETE`.

---

## 6. Multi-Node Cluster Architecture & Host Sharding

VanillaDatabase supports distributing tenant databases across multiple storage host nodes while maintaining a single client endpoint:

```
                                  +-----------------------------+
                                  |     Gateway Node (Port 3000)|
                                  +--------------+--------------+
                                                 |
                       +-------------------------+-------------------------+
                       |                                                   |
                       v                                                   v
        +-----------------------------+                     +-----------------------------+
        | Local Node (Node ID: local) |                     | Worker Node (Node ID: w-01) |
        | - Disk Space: 92% (High)    |                     | - Disk Space: 24% (Normal)  |
        | - Databases: db_1, db_2     |                     | - Databases: db_3, db_4     |
        +-----------------------------+                     +-----------------------------+
                       |                                                   ^
                       +=====[ Zero-Downtime Migration Stream ]============+
```

### 6.1 Gateway Routing & Spillover Controller
- When creating a new database, the Gateway inspects node disk utilization.
- If the primary host exceeds the spillover threshold (`spillover_threshold_percent: 85%` or free disk space `< 5GB`), the database is automatically provisioned on the least utilized active remote worker node.

### 6.2 Inter-Node Authentication & Constant-Time Verification
All communications between Gateway and Worker nodes utilize an internal cluster secret header:
```http
x-cluster-secret: <VDB_CLUSTER_SECRET>
```
To mitigate timing-attack side-channel leaks, incoming secrets are normalized into fixed 32-byte SHA-256 hashes and compared via `crypto.timingSafeEqual` in `safeCompareSecret()`.

### 6.3 Transparent Proxying & Zero-Downtime Migration
- **Transparent Proxying:** If a client sends a query to the Gateway for `db_3` (hosted on `w-01`), the Gateway proxies the HTTP request, multipart upload stream, or SSE event pipe over HTTP to `http://<worker_ip>:<worker_port>` with internal cluster authorization.
- **Zero-Downtime Migration:** Databases can be migrated across nodes live without data loss. The source node pauses mutations, checkpoints the WAL buffer to disk (`PRAGMA wal_checkpoint(TRUNCATE)`), streams the encrypted SQLite binary snapshot to the target node, and updates `databases.node_id` atomically in the central catalog.

---

## 7. Security Architecture & Guardrails

### 7.1 VDB-SEC-01: Session Revocation Architecture
Session cookies use signed HMAC payloads in the format:
```
${userId}:${username}:${role}:${expiresAt}:${tokenVersion}
```
Whenever a user changes their password, enables/disables 2FA, or an administrator deactivates an account, `token_version` in the `users` table increments monotonically. Any cookie with a stale `tokenVersion` is rejected immediately with `401 Unauthorized`.

### 7.2 VDB-SEC-02: TOTP 2FA Replay Protection (RFC 6238)
Standard TOTP allows a 30-second window (often extended to 90 seconds for clock drift). VanillaDatabase tracks `last_totp_step = Math.floor(Date.now() / 30000)` in the `users` table:
- Once a TOTP code is verified for step $T$, any subsequent attempt with step $t \le T$ is immediately rejected with `400 TOTP_CODE_REPLAYED`.

### 7.3 VDB-SEC-03: RFC 6750 Query Token Prohibition & Ephemeral Tickets
Per RFC 6750 Section 2.3, bearer tokens in query strings leak across proxy logs, browser histories, and Referer headers:
1. **Total Prohibition:** API tokens in query strings (`?token=...`) are rejected across all endpoints with `401 QUERY_TOKEN_NOT_PERMITTED`.
2. **Ephemeral Ticket Exchange:** For environments where custom HTTP headers cannot be supplied (HTML `<video>`, `<img>`, `EventSource` SSE):
   - Client calls `POST /v1/databases/:databaseId/tickets` with `Authorization: Bearer <token>`.
   - Gateway returns a single-use ticket: `vdb_ticket_<random>`.
   - The ticket expires in 60 seconds, is bound strictly to the specified database and route, and is deleted from memory upon first use.

```
Client                        VanillaDatabase Gateway
  |                                      |
  |-- 1. POST /v1/databases/:id/tickets ->| (with Bearer Token in Header)
  |<- 2. { ticket: "vdb_ticket_xyz" } ----| (Valid for 60 seconds, single-use)
  |                                      |
  |-- 3. GET /v1/files/:id/view?ticket=--| (Consumed & deleted from memory)
  |<- 4. 200 OK (Binary stream) ---------|
```

### 7.4 SSRF Prevention on Outbound Webhooks
The webhook engine resolves target hostnames before dispatching HTTP POST events. Requests are rejected if they resolve to:
- Loopback addresses (`127.0.0.0/8`, `::1`).
- RFC 1918 private IPv4 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
- Link-local and cloud metadata endpoints (`169.254.169.254`).

### 7.5 Active Content & Media Isolation
Files uploaded to media storage undergo MIME verification:
- SVG (`image/svg+xml`) and HTML (`text/html`) are served with:
  ```http
  Content-Disposition: attachment; filename="..."
  Content-Security-Policy: default-src 'none'; sandbox
  X-Content-Type-Options: nosniff
  ```
  This prevents Stored Cross-Site Scripting (XSS) attacks on the application origin.

### 7.6 Internal Binary Avatar Pipeline
- Avatars are streamed through temporary files, validated using image magic bytes (PNG: `89 50 4E 47`, JPEG: `FF D8 FF`, WebP: `52 49 46 46`), and moved to `data/storage/avatars/:userId.<ext>`.
- Avatars are served with `X-Content-Type-Options: nosniff` and `Cross-Origin-Resource-Policy: cross-origin`.
- Avatar storage is tracked as a system asset and is strictly excluded from tenant database quotas (`max_storage_mb`).

---

## 8. Task Automation & Schedules Execution Pipeline

VanillaDatabase features a task pipeline engine inspired by Pterodactyl's panel design, replacing generic cron jobs with multi-step workflows.

### 8.1 5-Part Cron & Simple Interval Parser
The dependency-free cron parser supports 5 fields:
`[Minute] [Hour] [Day of Month] [Month] [Day of Week]`

It supports:
- Wildcards (`*`), numbers (`5`), step values (`*/15`), ranges (`1-5`), and lists (`0,30`).
- Simple Interval Builder: Generates equivalent 5-part cron syntax automatically based on Day, Hour, and Minute intervals.

### 8.2 Multi-Task Chaining Engine
A single Schedule executes an ordered array of `ScheduleTaskRecord` objects:

```
Schedule Trigger (Cron Match or Manual Trigger)
  |
  +---> Task #1: run_maintenance (action: 'wal_checkpoint')
  |       | (delay: 0s, continue_on_failure: false)
  |
  +---> Task #2: send_command (SQL: 'DELETE FROM audit_logs WHERE ...')
  |       | (delay: 10s, continue_on_failure: true)
  |
  +---> Task #3: create_backup (action: 'scheduled')
  |       | (delay: 30s, continue_on_failure: false)
  |
  +---> Task #4: trigger_webhook (payload: '{ "status": "completed" }')
```

**Supported Actions:**
1. `send_command`: Executes parameterized or multi-statement SQL.
2. `run_maintenance`: Executes SQLite maintenance (`wal_checkpoint`, `vacuum`, `optimize`, `reindex`).
3. `create_backup`: Creates point-in-time encrypted snapshot backups.
4. `trigger_webhook`: Dispatches an external webhook notification for monitoring.
5. `export_data`: Generates a full disaster recovery data dump.

---

## 9. Realtime Event Streaming (SSE) & Webhook Dispatcher

### Server-Sent Events (SSE) Bus
Clients connect via `GET /v1/databases/:databaseId/realtime?ticket=<vdb_ticket>`:
- The server registers an SQLite update hook on the tenant handle.
- Changes are pushed as SSE events:
  - `event: insert`
  - `event: update`
  - `event: delete`
  - `event: schema`
- Keep-alive heartbeat pings are dispatched every 15 seconds.

### Webhook Dispatcher
When a table mutation occurs:
1. Active webhooks matching the database and table are loaded from `data/metadata.sqlite`.
2. A payload containing changed columns, operation type, and timestamp is generated.
3. An HMAC-SHA256 signature is calculated using the webhook secret:
   ```http
   X-VanillaDB-Signature: sha256=<hex_digest>
   X-VanillaDB-Event: insert
   ```
4. Delivery is performed with exponential backoff retries and recorded in `webhook_logs`.

---

## 10. Frontend Architecture & UX Design System

The frontend is built with React 19, Vite, Tailwind CSS v4, Lucide icons, and React Query.

### 10.1 Pterodactyl-Style Categorized Navigation
The database management interface is divided into 3 categorized sections:

- **TỔNG QUAN / OVERVIEW:**
  - `overview`: Dashboard (System diagnostics, Pragmas, B-Tree matrix, 24h timeline).
  - `editor`: Truy vấn SQL / SQL Editor (Console with Split View & Visual Builder).
  - `activity`: Hoạt động / Activity (Timeline audit stream).
  - `settings`: Cài đặt / Settings (Name, description, disk quotas).
  - `api`: Hỗ trợ & API / Support & API (Quick start snippets & SDK documentation).
- **QUẢN LÝ / MANAGEMENT:**
  - `tables`: Bảng dữ liệu / Tables (Data browser, pagination, inline editor).
  - `storage`: Lưu trữ tệp / File Storage (Media assets, range streaming, drag & drop).
  - `jobs`: Lịch trình / Schedules (5-part cron automation pipeline).
  - `webhooks`: Webhooks (Event dispatchers).
  - `backups`: Sao lưu / Backups (Encrypted snapshots, 1-click restore).
  - `members`: Thành viên / Members (Collaborator invitations & RBAC).
- **CÔNG CỤ / TOOLS:**
  - `schema`: Cấu trúc & ERD / Schema & ERD (Interactive relationship canvas).
  - `import-export`: Nhập & Xuất / Import & Export (SQL, CSV, JSON, multi-engine converter).
  - `tokens`: Khóa API / API Tokens (Granular scoped access keys).

### 10.2 Database Activity Timeline Stream
The Activity view provides a visual audit stream matching modern operations consoles:
- Filter search by username or action type.
- Continuous vertical timeline guide line with circular node dots grouped by day ("Today", "Yesterday", and exact date strings).
- Event cards with color-coded action pills (`schedule delete`, `schedule create`, `backup create`, `console query`, `file uploaded`), exact time, client IP, failure markers, and quick copy buttons.
- Floating bottom player controls bar with pause/resume live polling, manual refresh with spin indicator, and live event counter.

### 10.3 Unified Statistical Dashboard
All metrics are unified within the primary Dashboard tab:
- **24-Hour Request Operations Timeline Area Chart:** Interactive SVG chart displaying SELECT, INSERT, UPDATE, DELETE, and DDL distribution.
- **Physical Disk Breakdown:** Visual comparative bar showing Main Database Binary vs. Write-Ahead Log (WAL) buffer.
- **B-Tree Page Allocation Grid:** Interactive matrix of active pages vs. free freelist pages.
- **SQLite Engine Diagnostics:** Live PRAGMA inspection and one-click maintenance triggers.

### 10.4 Keyboard Navigation & Zen Mode Engine
- **F11 / Esc:** Toggles Zen Mode in the SQL Editor (pure dark, high-contrast, distraction-free).
- **Number Keys 1..9:** Instant 1-tap switching across core database tabs.
- **Ctrl + Shift + B:** Creates an instant backup snapshot.
- **Ctrl + Shift + D:** Opens the Clone/Branch database modal.
- **Alt + M:** Runs an engine integrity check (`PRAGMA integrity_check`).
- **Slash (`/`):** Focuses the table filter/search input.

---

## 11. Request Lifecycle & Data Flow Sequence Diagrams

### Diagram 1: Parameterized Query Execution (Data Plane)

```
Client                  Fastify Gateway          Auth Guard         Database Manager       SQLite Handle
  |                            |                     |                     |                     |
  |--- POST /v1/db/query ----->|                     |                     |                     |
  |    (Bearer Token)          |--- verifyToken() -->|                     |                     |
  |                            |<- token validated --|                     |                     |
  |                            |                                           |                     |
  |                            |--- getDatabaseHandle(databaseId) -------->|                     |
  |                            |                                           |--- open WAL db ---->|
  |                            |<- handle returned ------------------------|                     |
  |                            |                                                                 |
  |                            |--- validateSqlSafety(sql) ------------------------------------->|
  |                            |--- prepare(sql).all(params) ----------------------------------->|
  |                            |<-- { rows, durationMs } ----------------------------------------|
  |<-- 200 OK (JSON Data) -----|
```

### Diagram 2: Ephemeral Ticket Issuance & Streaming File View

```
Client                  Fastify Gateway          Ticket Service       Storage Service      Filesystem
  |                            |                       |                     |                  |
  |--- POST /v1/db/tickets --->|                       |                     |                  |
  |    (Bearer Auth)           |--- issueTicket() ---->|                     |                  |
  |                            |    (60s TTL, single)  |                     |                  |
  |<-- { ticket: "vdb_xyz" } --|                       |                     |                  |
  |                            |                       |                     |                  |
  |--- GET /v1/files/:id/view -|                       |                     |                  |
  |    ?ticket=vdb_xyz         |--- consumeTicket() -->|                     |                  |
  |                            |<-- ticket valid (del)-|                     |                  |
  |                            |                                             |                  |
  |                            |--- getStoragePath(dbId, filename) --------->|                  |
  |                            |                                             |--- fs.statSync ->|
  |                            |<-- filePath returned -----------------------|                  |
  |<-- 206 Partial Content ----| (Stream chunks with Range header support) -------------------->|
```

### Diagram 3: Distributed Host Sharding Proxy Flow

```
Client                  Gateway Node             Cluster Router        Remote Worker Node   Worker DB
  |                            |                       |                       |                |
  |--- POST /v1/db_3/query --->|                       |                       |                |
  |                            |--- resolveNode(db_3)->|                       |                |
  |                            |<-- node: "worker-01" -|                       |                |
  |                            |                                               |                |
  |                            |--- Proxy HTTP Request (with x-cluster-secret) >|                |
  |                            |                                               |--- execute --->|
  |                            |<-- 200 OK (Results from worker) --------------|<-- results ----|
  |<-- 200 OK (Proxied Res) ---|
```

---

*VanillaDatabase Core Engineering Architecture Specification &bull; Licensed under MIT &bull; 2026*
