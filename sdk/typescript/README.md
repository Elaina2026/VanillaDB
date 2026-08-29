# @nullex/vanilladb

Official TypeScript & Node.js client SDK for **VanillaDatabase (VanillaDB)** — Zero-configuration, multi-tenant SQLite Cloud Database Engine with Realtime Server-Sent Events (SSE), Media Storage (HTTP 206 Byte-Range Streaming), AI Vector Cosine Similarity Search, Atomic Batch Transactions, and Table CRUD Builders.

[![npm version](https://img.shields.io/npm/v/@nullex/vanilladb.svg?color=blue)](https://www.npmjs.com/package/@nullex/vanilladb)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📦 Installation

```bash
npm install @nullex/vanilladb
```

---

## ⚡ Quick Start

```typescript
import { VanillaDatabase } from '@nullex/vanilladb';

// 1. Initialize with Unified Database Base URL & Master API Token
const db = new VanillaDatabase({
  url: process.env.VANILLA_DB_URL || 'http://localhost:3000/v1/databases/db_your_database_id',
  token: process.env.VANILLA_DB_TOKEN || 'vdb_live_your_api_token_here',
});
```

---

## 📖 Feature Reference

### 1. Fluent Table CRUD Query Builder

Perform type-safe CRUD operations without writing raw SQL statements:

```typescript
interface User {
  id?: number;
  username: string;
  score: number;
  created_at?: number;
}

// 🟢 Insert row
const insertRes = await db.from<User>('users').insert({
  username: 'elaina',
  score: 100,
});
console.log('Inserted Row ID:', insertRes.lastInsertRowid);

// 🔍 Select rows with filtering, ordering, pagination
const { rows, rowCount } = await db.from<User>('users').select({
  limit: 10,
  offset: 0,
  orderBy: 'score',
  order: 'DESC',
});
console.log(`Fetched ${rowCount} users:`, rows);

// 🟡 Update row(s)
await db.from<User>('users').update(
  { id: 1 },              // Target condition (WHERE)
  { score: 250 }          // Fields to update (SET)
);

// 🔴 Delete row(s)
await db.from<User>('users').delete({ id: 1 });
```

---

### 2. Parameterized SQL Execution with Generics

Execute any SQLite SQL statement safely using parameterized binding:

```typescript
// Parameterized SELECT with typed generic response
const result = await db.query<User>(
  'SELECT id, username, score FROM users WHERE score >= ? ORDER BY score DESC LIMIT ?',
  [50, 10]
);

console.log('Results:', result.rows);
console.log('Execution Time:', `${result.durationMs}ms`);
```

---

### 3. ACID Atomic Batch Transactions

Execute multiple statements atomically in a single network round-trip. If any statement fails, the entire batch automatically rolls back:

```typescript
const batchResult = await db.batch([
  {
    sql: 'UPDATE accounts SET balance = balance - ? WHERE id = ?',
    params: [50.0, 1],
  },
  {
    sql: 'UPDATE accounts SET balance = balance + ? WHERE id = ?',
    params: [50.0, 2],
  },
  {
    sql: 'INSERT INTO audit_logs (event, timestamp) VALUES (?, ?)',
    params: ['transfer_completed', Date.now()],
  },
], true); // true = run in single ACID transaction

console.log('Batch duration:', `${batchResult.totalDurationMs}ms`);
```

---

### 4. AI Vector Search (Cosine Similarity & RAG)

VanillaDatabase includes native SQLite scalar functions for vector similarity matching:

```typescript
const matches = await db.vectorSearch({
  table: 'document_embeddings',
  vectorColumn: 'embedding',
  vector: [0.012, 0.421, -0.198, 0.087], // Embedding vector
  limit: 5,
  threshold: 0.75,                      // Minimum similarity score (0.0 to 1.0)
});

for (const match of matches) {
  console.log(`Document #${match.id} (Score: ${match.similarity})`);
}
```

---

### 5. Realtime Server-Sent Events (SSE)

Subscribe to real-time table mutations (`insert`, `update`, `delete`, `schema`):

```typescript
// Subscribe to all mutations or filter by specific table
const unsubscribe = db.subscribe((event) => {
  console.log(`[Realtime ${event.type}] Table: ${event.table}`, event.data);
}, 'users');

// Later: stop listening
// unsubscribe();
```

---

### 6. Scoped Media File Storage & HTTP 206 Streaming

Upload, retrieve, and delete media files tied directly to your database instance:

```typescript
import fs from 'node:fs';

// Upload file buffer
const buffer = fs.readFileSync('./video.mp4');
const fileRecord = await db.uploadFile(buffer, 'video.mp4', 'video/mp4');
console.log('File ID:', fileRecord.id);

// Get streaming URL (Supports HTTP 206 Partial Content Range for Video/Audio)
const streamUrl = db.getFileUrl(fileRecord.id);
console.log('Stream URL:', streamUrl);

// Delete file
await db.deleteFile(fileRecord.id);
```

---

## 🛡️ Production & Reliability Best Practices

1. **Timeout Setting**: For heavy queries or background sweep tasks, ensure appropriate timeout settings on your HTTP client.
2. **Indexing**: Always create composite indexes on columns queried frequently (e.g. `CREATE INDEX IF NOT EXISTS idx_users_status_created ON users(status, created_at);`).
3. **Keep-Alive**: Reuse connections using standard HTTP Keep-Alive sockets.

---

## 📄 License

MIT © [VanillaDatabase](https://github.com/Elaina2026/VanillaDB)
