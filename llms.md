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

### 2.5. Vector Math & Embeddings Functions (AI / RAG)
VanillaDatabase includes native SQLite scalar functions for vector similarity:
- `vec_cosine_similarity(vec1_json, vec2_json)`: Returns cosine similarity score between 0.0 and 1.0 (1.0 = identical direction).
- `vec_cosine_distance(vec1_json, vec2_json)`: Returns cosine distance (0.0 = identical).

Example RAG Query:
```sql
SELECT id, title, content,
       vec_cosine_similarity(embedding, '[0.012, 0.421, -0.198]') as similarity
FROM documents
ORDER BY similarity DESC
LIMIT 5;
```

---

### 2.6. Full-Text Search (FTS5) Support
Create full-text search virtual tables directly via SQL:
```sql
CREATE VIRTUAL TABLE articles_fts USING fts5(title, content, tokenize='unicode61');
INSERT INTO articles_fts (title, content) VALUES ('SQLite Engine', 'VanillaDatabase is super fast');
SELECT * FROM articles_fts WHERE articles_fts MATCH 'VanillaDatabase';
```

---

## 3. Official Client SDK Reference & Full Code Examples

### 3.1. Installation & Environment Configuration
```bash
# Node.js / TypeScript
npm install @elaina2026/vanilladb

# Python
pip install vanilladb
```

Environment Variables required by client apps:
```env
VANILLA_DB_URL=http://localhost:3000/v1/databases/db_your_database_id
VANILLA_DB_TOKEN=vdb_live_your_api_token_here
```

---

### 3.2. TypeScript / Node.js SDK Complete API

```typescript
import { VanillaDatabase } from '@elaina2026/vanilladb';

// 1. Initialization
const db = new VanillaDatabase({
  url: process.env.VANILLA_DB_URL!, // e.g. 'http://localhost:3000/v1/databases/db_123'
  token: process.env.VANILLA_DB_TOKEN! // e.g. 'vdb_live_abc123'
});

// 2. Parameterized SQL Query (SELECT, INSERT, UPDATE, DELETE)
interface User {
  id: number;
  username: string;
  score: number;
}
const result = await db.query<User>(
  'SELECT id, username, score FROM users WHERE score >= ? ORDER BY score DESC LIMIT ?',
  [100, 10]
);
console.log('Returned rows:', result.rows); // Array of typed objects
console.log('Columns:', result.columns);
console.log('Execution time ms:', result.durationMs);

// 3. Atomic Batch Transaction
const batchResult = await db.batch([
  { sql: 'INSERT INTO users (username, score) VALUES (?, ?)', params: ['alice', 250] },
  { sql: 'INSERT INTO logs (action, timestamp) VALUES (?, ?)', params: ['user_created', Date.now()] },
  { sql: 'UPDATE stats SET total_users = total_users + 1 WHERE id = 1' }
], true); // true = execute in atomic BEGIN IMMEDIATE transaction
console.log('Batch results:', batchResult.results);

// 4. Realtime SSE Live Events Subscription
// Listen to all tables, or pass a table name as 2nd parameter
const unsubscribe = db.subscribe((event) => {
  console.log('Event Type:', event.type); // 'insert' | 'update' | 'delete' | 'schema'
  console.log('Target Table:', event.table);
  console.log('Payload Data:', event.data);
  console.log('Timestamp:', event.timestamp);
}, 'users');

// Stop listening when no longer needed
// unsubscribe();

// 5. Media & File Storage (Upload, List, Stream Range 206)
// Upload Blob or Buffer
import fs from 'node:fs';
const imageBuffer = fs.readFileSync('./avatar.png');
const uploadedFile = await db.uploadFile(imageBuffer, 'avatar.png', 'image/png');
console.log('Uploaded File ID:', uploadedFile.id);
console.log('Direct Stream URL:', db.getFileUrl(uploadedFile.id));

// List all files in this database
const allFiles = await db.listFiles();
console.log('Stored files:', allFiles);
```

---

### 3.3. Python SDK Complete API

```python
import os
from vanilladb import VanillaDatabase

# 1. Initialization
db = VanillaDatabase(
    url=os.getenv("VANILLA_DB_URL", "http://localhost:3000/v1/databases/db_123"),
    token=os.getenv("VANILLA_DB_TOKEN", "vdb_live_abc123")
)

# 2. Parameterized Query
result = db.query(
    "SELECT id, username, score FROM users WHERE score >= ? LIMIT ?",
    [100, 10]
)
print("Rows:", result["rows"])
print("Columns:", result["columns"])
print("Changes:", result["changes"])

# 3. Atomic Batch Transaction
batch_res = db.batch([
    {"sql": "INSERT INTO users (username, score) VALUES (?, ?)", "params": ["bob", 300]},
    {"sql": "INSERT INTO logs (action) VALUES (?)", "params": ["user_registered"]}
], transaction=True)
print("Batch results:", batch_res["results"])

# 4. Media Storage (Upload from file path or bytes)
uploaded = db.upload_file("avatar.png", filename="user_bob.png", content_type="image/png")
print("File ID:", uploaded["id"])
print("Streaming URL (HTTP 206):", db.get_file_url(uploaded["id"]))

# List stored files
files = db.list_files()
print("Files in database:", files)
```

---

### 3.4. AI Agent System Prompt Template
When configuring an AI Coding Agent (e.g. Claude, GPT-4, Cursor, AutoGPT) to interact with VanillaDB, inject this snippet into the agent's prompt:

```markdown
You have access to a VanillaDatabase SQLite Cloud instance.
Connect using the official client:
- Node.js: `import { VanillaDatabase } from '@elaina2026/vanilladb'`
- Python: `from vanilladb import VanillaDatabase`
Rules:
1. Always use parameterized queries (`?`) to avoid SQL injection.
2. For multi-step modifications, use `db.batch([...], transaction=True)` to ensure atomicity.
3. Media files uploaded via `db.uploadFile` return IDs that can be streamed with HTTP 206 range requests via `db.getFileUrl(fileId)`.
4. Realtime mutations can be observed using `db.subscribe(callback, tableName)`.
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
- **Node.js / TypeScript**: `@elaina2026/vanilladb` (or `shared/client.ts`)
- **Python**: `vanilladb` (`requests>=2.28.0`)

---

## 5. SQLite Syntax & Sandboxing Constraints

- **Allowed Dialect**: Standard SQLite 3 SQL (`CREATE TABLE`, `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `INDEX`, `TRIGGER`, `VIEW`, `WITH RECURSIVE`, `JSON functions`).
- **Sandbox Security Guards**:
  - `ATTACH DATABASE` and `DETACH DATABASE` are strictly blocked.
  - File system / OS command extensions are disabled.
  - Foreign keys are enforced (`PRAGMA foreign_keys = ON`).
  - Strict parameter binding recommended with `?` or named parameters to prevent SQL injection.
