# 05. SDKs & API Reference

Complete API reference and SDK guides for TypeScript and Python.

---

## 1. Unified API Architecture

All Data Plane operations route through a single database Base URL:
```
https://<domain>/v1/databases/:databaseId
```
Authenticated using Bearer tokens: `Authorization: Bearer <API_TOKEN>`.

---

## 2. Core Endpoints

### 1. Parameterized SQL Query
- `POST /v1/databases/:id/query`
```json
{
  "sql": "SELECT id, username, score FROM users WHERE score >= ? LIMIT ?",
  "params": [100, 10]
}
```

### 2. Atomic Batch Transaction
- `POST /v1/databases/:id/batch`
```json
{
  "transaction": true,
  "statements": [
    { "sql": "UPDATE users SET balance = balance - ? WHERE id = ?", "params": [50, 1] },
    { "sql": "UPDATE users SET balance = balance + ? WHERE id = ?", "params": [50, 2] }
  ]
}
```

### 3. Fluent Table CRUD
- `GET /v1/databases/:id/tables/:table/rows?limit=50&offset=0&orderBy=id&order=DESC`
- `POST /v1/databases/:id/tables/:table/rows` (Body: `{ "username": "elaina" }`)
- `DELETE /v1/databases/:id/tables/:table/rows?id=1`

---

## 3. TypeScript SDK (`@nullex/vanilladb`)

```typescript
import { VanillaDatabase } from '@nullex/vanilladb';

const db = new VanillaDatabase({
  url: 'https://db.yourdomain.com/v1/databases/db_production',
  token: 'vdb_live_your_token'
});

// SQL Query
const { rows } = await db.query('SELECT * FROM users WHERE active = ?', [1]);

// Table Query Builder
const users = await db.from('users').select({ limit: 10, orderBy: 'score', order: 'DESC' });
await db.from('users').insert({ username: 'elaina', score: 100 });
await db.from('users').delete({ id: 5 });

// AI Vector Search
const matches = await db.vectorSearch({
  table: 'articles',
  vectorColumn: 'embedding',
  vector: [0.012, 0.421, -0.198],
  limit: 5,
  threshold: 0.75
});
```

---

## 4. Python SDK (`vanilladatabase`)

```python
from vanilladb import VanillaDatabase

db = VanillaDatabase(
    url="https://db.yourdomain.com/v1/databases/db_production",
    token="vdb_live_your_token"
)

# SQL Query
res = db.query("SELECT * FROM products WHERE price < ?", [50])

# Table CRUD
db.table("products").insert({"name": "Wand", "price": 15})
items = db.table("products").select(limit=20, order_by="price", order="ASC")

# AI Vector Search
similar = db.vector_search(
    table="documents",
    vector_column="embedding",
    vector=[0.1, 0.5, -0.2],
    limit=5,
    threshold=0.8
)
```
