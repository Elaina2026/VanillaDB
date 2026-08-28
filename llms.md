# LLMS.txt - VanillaDatabase AI & Agent Reference Guide

> VanillaDatabase (VanillaDB) is a multi-tenant, zero-configuration SQLite cloud database engine featuring real-time event streaming (SSE), database-scoped media storage with HTTP 206 range streaming, granular API token permissions, HMAC-SHA256 webhooks, and automated scheduled backups.

---

## 1. System Overview & Core Capabilities

- **Architecture**: Multi-tenant SQLite (WAL mode, busy timeout, query cache).
- **Protocol**: HTTP/1.1 JSON REST API & Server-Sent Events (SSE).
- **Authentication**:
  - **Data Plane (`/v1/*`)**: Bearer API Tokens (`Authorization: Bearer vdb_live_...`).
  - **Control Plane (`/api/admin/*`)**: Admin Cookie Session or Admin Credentials.
- **Key Features**:
  1. Parameterized Raw SQL Queries (`/v1/databases/:id/query`)
  2. Atomic Batch Transactions (`/v1/databases/:id/batch`)
  3. Realtime Server-Sent Events (`/v1/databases/:id/realtime`)
  4. Media File Storage with HTTP 206 Range Streaming (`/v1/databases/:id/files` & `/v1/files/:fileId/view`)
  5. Webhooks with HMAC-SHA256 signatures (`X-Vanilla-Signature`)
  6. Import & Export (SQL dumps, CSV, JSON, raw SQLite binary files)
  7. Automated Periodic Backups with Retention Pruning

---

## 2. API Endpoints for AI / LLM Agents

### 2.1. Parameterized SQL Execution
- **Endpoint**: `POST /v1/databases/:databaseId/query`
- **Headers**:
  ```http
  Authorization: Bearer <API_TOKEN>
  Content-Type: application/json
  ```
- **Payload Schema**:
  ```json
  {
    "sql": "SELECT * FROM users WHERE status = ? LIMIT 10",
    "params": ["active"]
  }
  ```
- **Response Schema**:
  ```json
  {
    "success": true,
    "data": {
      "columns": ["id", "username", "status"],
      "rows": [
        {"id": 1, "username": "alice", "status": "active"}
      ],
      "rowCount": 1,
      "changes": 0,
      "lastInsertRowid": 0,
      "durationMs": 0.42
    }
  }
  ```

---

### 2.2. Atomic Batch Transactions
- **Endpoint**: `POST /v1/databases/:databaseId/batch`
- **Payload Schema**:
  ```json
  {
    "transaction": true,
    "statements": [
      {
        "sql": "INSERT INTO orders (user_id, total) VALUES (?, ?)",
        "params": [1, 99.5]
      },
      {
        "sql": "UPDATE accounts SET balance = balance - ? WHERE id = ?",
        "params": [99.5, 1]
      }
    ]
  }
  ```
- **Response Schema**:
  ```json
  {
    "success": true,
    "data": {
      "results": [
        {"changes": 1, "lastInsertRowid": 10},
        {"changes": 1, "lastInsertRowid": 1}
      ],
      "totalDurationMs": 1.1
    }
  }
  ```

---

### 2.3. Realtime SSE Live Events
- **Endpoint**: `GET /v1/databases/:databaseId/realtime?token=<TOKEN>&table=<OPTIONAL_TABLE>`
- **Event Types**: `insert`, `update`, `delete`, `schema`, `ping`
- **Stream Format**: Standard Server-Sent Events (`text/event-stream`).

---

### 2.4. Media Storage (Upload, Stream, List)
- **List Files**: `GET /v1/databases/:databaseId/files`
- **Upload File**: `POST /v1/databases/:databaseId/files` (Multipart `file` field)
- **Range Stream**: `GET /v1/files/:fileId/view` (Supports `Range: bytes=start-end`, returns HTTP 206)

---

## 3. Official Client SDK Implementations

### 3.1. TypeScript / Node.js
```typescript
import { VanillaDatabase } from '@nullex/vanilladb';

const db = new VanillaDatabase({
  url: 'http://localhost:3000/v1/databases/db_xxx',
  token: 'vdb_live_xxx'
});

// Query
const res = await db.query('SELECT * FROM items WHERE price < ?', [50]);

// Batch Transaction
await db.batch([
  { sql: 'INSERT INTO items (name, price) VALUES (?, ?)', params: ['Item A', 25] }
], true);

// Realtime Stream
const unsubscribe = db.subscribe((event) => {
  console.log('Realtime event:', event);
}, 'items');
```

### 3.2. Python
```python
from vanilladb import VanillaDatabase

db = VanillaDatabase(
    url="http://localhost:3000/v1/databases/db_xxx",
    token="vdb_live_xxx"
)

# Query
data = db.query("SELECT * FROM items WHERE price < ?", [50])
print(data["rows"])

# Batch
db.batch([
    {"sql": "INSERT INTO items (name, price) VALUES (?, ?)", "params": ["Item A", 25]}
], transaction=True)
```

---

## 4. Tech Stack & Packages / Dependencies

### 4.1. Core Server & Backend (Node.js 22+)
- `fastify` (^5.2.1): High-performance HTTP server framework.
- `@fastify/cors` (^10.1.0): Cross-Origin Resource Sharing middleware.
- `@fastify/helmet` (^13.0.1): HTTP security headers guard.
- `@fastify/cookie` (^11.0.2): Cookie session management.
- `@fastify/multipart` (^9.0.3): Streaming file upload parser.
- `@fastify/static` (^8.1.1): Static file serving for SPA dashboard.
- `node:sqlite`: Native Node.js experimental SQLite engine with WAL mode.
- `argon2` (^0.41.1): Secure password hashing for admin credentials.
- `zod` (^3.24.2): Type-safe request payload validation.
- `nanoid` (^5.1.3): Compact collision-resistant ID generation.
- `pino` (^9.6.0) & `pino-pretty`: Structured logging with request tracing.
- `csv-parse` & `csv-stringify`: CSV format import/export streaming.
- `dotenv` (^16.4.7): Environment variable configuration.

### 4.2. Frontend Web Dashboard (SPA)
- `react` (^19.2.8) & `react-dom` (^19.2.8): Modern React component framework.
- `@tanstack/react-query` (^5.67.1): Server-state management & data synchronization.
- `@tanstack/react-table` (^8.21.2): Headless data grid for database row browser.
- `@monaco-editor/react` (^4.7.0): In-browser SQL Editor with syntax highlighting.
- `lucide-react` (^1.16.0): UI icon library.
- `tailwindcss` (^3.4.17): Utility-first CSS styling.
- `clsx` & `tailwind-merge`: Dynamic Tailwind class names composition.
- `react-hook-form` (^7.54.2): Form state validation.

### 4.3. Official Client Packages
- **Node.js / TypeScript**: `@nullex/vanilladb` (or `shared/client.ts`)
- **Python**: `vanilladb` (`requests>=2.28.0`)

---

## 5. SQLite Syntax & Sandboxing Constraints

- **Allowed Dialect**: Standard SQLite 3 SQL (`CREATE TABLE`, `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `INDEX`, `TRIGGER`, `VIEW`, `WITH RECURSIVE`, `JSON functions`).
- **Sandbox Security Guards**:
  - `ATTACH DATABASE` and `DETACH DATABASE` are strictly blocked.
  - File system / OS command extensions are disabled.
  - Foreign keys are enforced (`PRAGMA foreign_keys = ON`).
  - Strict parameter binding recommended with `?` or named parameters to prevent SQL injection.
