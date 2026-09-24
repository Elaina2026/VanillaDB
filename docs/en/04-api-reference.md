# Data Plane & REST API Reference

Technical reference for the Data Plane (`/v1`) HTTP endpoints in **VanillaDatabase**: executing SQL queries, transactional batches, table CRUD, live Server-Sent Events, and database-scoped media streaming.

---

## 1. Authentication & Standard Headers

All Data Plane endpoints require authentication via Bearer API Token or active session cookie:

```http
Authorization: Bearer vdb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

For media streaming in browser `<audio>`, `<img>`, or `<video>` tags, the token can also be supplied via URL query parameter:
```http
GET /v1/databases/:databaseId/storage/:fileId?token=vdb_live_...
```

---

## 2. API Endpoints Specification

| Method | Path | Description | Minimum Scope |
| :--- | :--- | :--- | :--- |
| `POST` | `/v1/databases/:databaseId/query` | Execute parameterized SQL read/write query | `database:read` or `database:write` |
| `POST` | `/v1/databases/:databaseId/exec` | Execute single-statement SQL mutation | `database:write` |
| `POST` | `/v1/databases/:databaseId/batch` | Execute atomic multi-statement transaction | `database:write` |
| `GET` | `/v1/databases/:databaseId/tables/:table/rows` | Select table rows with pagination & sorting | `database:read` |
| `POST` | `/v1/databases/:databaseId/tables/:table/rows` | Insert a new record into table | `database:write` |
| `PUT` | `/v1/databases/:databaseId/tables/:table/rows` | Update table row(s) with condition | `database:write` |
| `DELETE`| `/v1/databases/:databaseId/tables/:table/rows` | Delete table row(s) by condition | `database:write` |
| `GET` | `/v1/databases/:databaseId/schema` | Inspect database tables and columns | `database:read` |
| `GET` | `/v1/databases/:databaseId/realtime` | Server-Sent Events live mutation bus | `database:read` |
| `GET` | `/v1/databases/:databaseId/files` | List uploaded media files | `database:read` |
| `POST` | `/v1/databases/:databaseId/files` | Upload media asset (multipart/form-data) | `database:write` |
| `GET` | `/v1/databases/:databaseId/storage/:fileId` | Stream media asset (HTTP 206 Range) | `database:read` |
| `DELETE`| `/v1/databases/:databaseId/files/:fileId` | Delete media asset from storage | `database:write` |

---

## 3. Detailed Request & Response Formats

### 3.1. Execute SQL Query
- **POST** `/v1/databases/:databaseId/query`

**Request Payload:**
```json
{
  "sql": "SELECT id, username, status, score FROM users WHERE score >= ? ORDER BY score DESC LIMIT ?;",
  "params": [100, 10]
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "columns": ["id", "username", "status", "score"],
    "rows": [
      { "id": 1, "username": "alice", "status": "active", "score": 250 },
      { "id": 4, "username": "bob", "status": "active", "score": 180 }
    ],
    "rowCount": 2,
    "durationMs": 0.38
  }
}
```

---

### 3.2. Atomic Transaction Batch
- **POST** `/v1/databases/:databaseId/batch`

**Request Payload:**
```json
{
  "transaction": true,
  "statements": [
    {
      "sql": "UPDATE accounts SET balance = balance - ? WHERE id = ?;",
      "params": [50, "acc_alice"]
    },
    {
      "sql": "UPDATE accounts SET balance = balance + ? WHERE id = ?;",
      "params": [50, "acc_bob"]
    }
  ]
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "results": [
      { "changes": 1, "lastInsertRowid": 0 },
      { "changes": 1, "lastInsertRowid": 0 }
    ],
    "durationMs": 0.72
  }
}
```

---

### 3.3. Realtime Mutation Stream (SSE)
- **GET** `/v1/databases/:databaseId/realtime`

**Stream Headers:**
```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Dispatched Event Payload:**
```json
data: {"event":"insert","table":"orders","databaseId":"db_123","timestamp":1788854400000,"data":{"id":842,"total":49.99,"status":"paid"}}

data: {"event":"delete","table":"sessions","databaseId":"db_123","timestamp":1788854405000,"data":{"id":"sess_abc"}}
```

---

### 3.4. Standard Error Envelope

When an operation fails (validation, syntax error, or permission denial), VanillaDatabase returns a structured error object:

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Token lacks required permission: database:write"
  }
}
```

Common Error Codes:
- `UNAUTHORIZED`: Missing or invalid Bearer token / session cookie.
- `FORBIDDEN`: Token lacks permission scope or table is in denylist.
- `RATE_LIMIT_EXCEEDED`: Sliding window request quota exhausted (HTTP 429).
- `SQLITE_ERROR`: SQL syntax error, table not found, or constraint violation.
- `PAYLOAD_TOO_LARGE`: Request body exceeded configured MB ceiling (HTTP 413).

---

## 4. Multi-Node Cluster & Host Management Endpoints

All Cluster Admin endpoints require authenticated session cookie with `super_admin` or `admin` role.

### 4.1. Cluster Health & Hardware Telemetry
- **GET** `/api/admin/cluster/status`

**Response Payload:**
```json
{
  "success": true,
  "data": {
    "totalNodes": 3,
    "healthyNodes": 3,
    "totalClusterDiskBytes": 1073741824000,
    "freeClusterDiskBytes": 644245094400,
    "usedClusterDiskPercent": 40,
    "spilloverActive": false,
    "localNodeFull": false,
    "nodes": [
      {
        "id": "local",
        "name": "Primary Gateway",
        "base_url": "http://127.0.0.1:3000",
        "status": "healthy",
        "is_local": true,
        "cpu_percent": 12,
        "ram_percent": 34,
        "disk_total_bytes": 21474836480,
        "disk_free_bytes": 16106127360,
        "disk_used_percent": 25,
        "network_rate_bps": 45020,
        "database_count": 8,
        "last_heartbeat_at": 1788854400000
      }
    ]
  }
}
```

### 4.2. Register Worker Storage Node
- **POST** `/api/admin/cluster/nodes`

```json
{
  "name": "Storage-Node-Frankfurt-01",
  "baseUrl": "http://192.168.1.102:3000",
  "authToken": "optional_custom_secret_key"
}
```

### 4.3. Trigger Cluster Heartbeat Poll
- **POST** `/api/admin/cluster/poll`

Pings `/api/internal/node/stats` across all registered nodes concurrently using `Promise.allSettled` and refreshes hardware metrics in system cache.

### 4.4. Migrate Database Instance
- **POST** `/api/admin/cluster/migrate`

```json
{
  "databaseId": "db_BIcZhxUYK83SMS2r",
  "targetNodeId": "node_frankfurt_01"
}
```

Streams point-in-time consistent SQLite snapshot generated by `VACUUM INTO`, validates cryptographic integrity on target, updates metadata location record, and unlinks source files.

