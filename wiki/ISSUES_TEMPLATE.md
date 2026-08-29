# VanillaDatabase Production Issues & Roadmap

This document contains standardized technical issues ready to be submitted to [https://github.com/Elaina2026/VanillaDB/issues](https://github.com/Elaina2026/VanillaDB/issues).

---

## Issue 1: [Feature] S3-compatible remote backup storage target

- **Title**: `[FEAT] Add S3/R2 remote backup target for automated snapshots`
- **Labels**: `enhancement`, `backend`, `security`
- **Body**:
```markdown
### Problem Statement
Automated snapshots (`.snap`) are written exclusively to local disk at `./data/backups/`. In the event of catastrophic host disk failure, snapshots are lost alongside the active database instances.

### Proposed Implementation
Add an optional S3-compatible remote upload worker:
- Environment configuration:
  - `VDB_BACKUP_S3_ENABLED=true`
  - `VDB_BACKUP_S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com`
  - `VDB_BACKUP_S3_BUCKET=vanilladb-backups`
  - `VDB_BACKUP_S3_ACCESS_KEY_ID=...`
  - `VDB_BACKUP_S3_SECRET_ACCESS_KEY=...`
- Trigger upload directly upon completion of `createSnapshot()` in `src/server/services/backup.ts`.
- Retain local AES-256-GCM data-at-rest encryption before streaming the archive.
- Apply snapshot retention rules to remote bucket objects.

### Considered Alternatives
External host-level cron with `rclone` or `aws-cli`. Built-in worker provides unified error logging and dashboard telemetry.
```

---

## Issue 2: [Bug Report] Realtime SSE reconnection on reverse proxy reload

- **Title**: `[BUG] Realtime SSE client drops connection silently when upstream Nginx worker reloads`
- **Labels**: `bug`, `realtime`, `network`
- **Body**:
```markdown
### Problem Description
When running behind an Nginx reverse proxy or Cloudflare tunnel, reloading the proxy worker terminates the Server-Sent Events stream (`/v1/databases/:id/realtime`), but client SDKs fail to trigger an immediate reconnect.

### Steps to Reproduce
1. Establish a realtime subscription using `@nullex/vanilladb` via `db.subscribe()`.
2. Reload the reverse proxy worker (`sudo nginx -s reload`).
3. Client remains idle without emitting a disconnect event until the operating system TCP keepalive times out (15+ minutes).

### Expected Behavior
Client SDK should evaluate the 20-second server ping heartbeat. If no event or ping arrives within 30 seconds, close the socket and initiate exponential backoff reconnection (1s, 2s, 4s, up to 30s).

### Deployment Environment
- Nginx Reverse Proxy (proxy_buffering off)
- `@nullex/vanilladb` v1.3.0 / Node.js 22
```

---

## Issue 3: [Performance] Prepared Statement Handle Cache

- **Title**: `[PERF] Cache prepared statements across parameterized query executions`
- **Labels**: `enhancement`, `performance`, `database`
- **Body**:
```markdown
### Problem Statement
`POST /v1/databases/:id/query` currently prepares SQL statements on every incoming request. For high-throughput key-value queries (e.g. `SELECT * FROM users WHERE id = ?`), preparation accounts for 0.2ms – 0.4ms overhead per call.

### Proposed Implementation
- Maintain an LRU statement cache per active tenant database instance.
- Automatically invalidate cached statement handles when DDL statements execute (`CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`).
```

---

## Issue 4: [Feature] Instant Database Branching / Cloning API Endpoint

- **Title**: `[FEAT] Expose Data Plane API endpoint for ephemeral database branching`
- **Labels**: `enhancement`, `api`
- **Body**:
```markdown
### Problem Statement
Database cloning is currently restricted to the Web dashboard admin UI. CI/CD test runners require an API endpoint to generate isolated ephemeral test databases and destroy them after test suites complete.

### Proposed Implementation
- Endpoint: `POST /v1/databases/:id/branch` (Requires `database:admin` token permission).
- Payload: `{ "target_slug": "db_test_pr_123", "auto_destroy_hours": 2 }`.
- Creates a point-in-time copy using SQLite Online Backup API.
```
