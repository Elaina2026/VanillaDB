# vanilladatabase

Official Python client SDK for **VanillaDatabase (VanillaDB)** — Zero-configuration, multi-tenant SQLite Cloud Database Engine with Realtime Server-Sent Events (SSE), Media Storage (HTTP 206 Byte-Range Streaming), AI Vector Cosine Similarity Search, Atomic Batch Transactions, and Table CRUD Query Builders.

[![PyPI version](https://img.shields.io/pypi/v/vanilladatabase.svg?color=blue)](https://pypi.org/project/vanilladatabase/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 📦 Installation

```bash
pip install vanilladatabase
```

---

## ⚡ Quick Start

```python
import os
from vanilladb import VanillaDatabase

# 1. Initialize with Unified Database Base URL & Master API Token
db = VanillaDatabase(
    url=os.getenv("VANILLA_DB_URL", "http://localhost:3000/v1/databases/db_your_database_id"),
    token=os.getenv("VANILLA_DB_TOKEN", "vdb_live_your_api_token_here")
)
```

---

## 📖 Feature Reference

### 1. Fluent Table CRUD Query Builder

Perform operations without writing raw SQL statements:

```python
# 🟢 Insert row
insert_res = db.table("users").insert({
    "username": "elaina",
    "score": 100
})
print("Inserted ID:", insert_res.get("lastInsertRowid"))

# 🔍 Select rows with filtering, ordering, pagination
result = db.table("users").select(
    limit=10,
    offset=0,
    order_by="score",
    order="DESC"
)
print("Top Users:", result["rows"])

# 🟡 Update row(s)
db.table("users").update(
    where={"id": 1},         # Condition (WHERE)
    values={"score": 250}    # Fields to update (SET)
)

# 🔴 Delete row(s)
db.table("users").delete({"id": 1})
```

---

### 2. Parameterized SQL Execution

Execute any SQLite SQL statement safely using parameterized binding:

```python
# Parameterized SELECT query
query_res = db.query(
    "SELECT id, username, score FROM users WHERE score >= ? ORDER BY score DESC LIMIT ?",
    [50, 10]
)

print("Rows:", query_res["rows"])
print("Duration:", f"{query_res['durationMs']}ms")
```

---

### 3. ACID Atomic Batch Transactions

Execute multiple statements atomically in a single network round-trip. If any statement fails, the entire transaction rolls back:

```python
batch_result = db.batch([
    {
        "sql": "UPDATE accounts SET balance = balance - ? WHERE id = ?",
        "params": [50.0, 1]
    },
    {
        "sql": "UPDATE accounts SET balance = balance + ? WHERE id = ?",
        "params": [50.0, 2]
    },
    {
        "sql": "INSERT INTO audit_logs (event, timestamp) VALUES (?, ?)",
        "params": ["transfer_completed", 1700000000]
    }
], transaction=True) # transaction=True guarantees ACID atomicity

print("Total Duration:", f"{batch_result['totalDurationMs']}ms")
```

---

### 4. AI Vector Search (Cosine Similarity & RAG)

VanillaDatabase includes native SQLite scalar functions for vector similarity matching:

```python
matches = db.vector_search(
    table="document_embeddings",
    vector_column="embedding",
    vector=[0.012, 0.421, -0.198, 0.087], # Vector embedding list
    limit=5,
    threshold=0.75                        # Minimum similarity score (0.0 to 1.0)
)

for doc in matches:
    print(f"Doc #{doc['id']} - Similarity: {doc['similarity']}")
```

---

### 5. Realtime Server-Sent Events (SSE)

Subscribe to real-time table mutations (`insert`, `update`, `delete`, `schema`):

```python
def handle_event(event):
    print(f"[Realtime {event.get('type')}] Table: {event.get('table')}", event.get("data"))

# Blocking subscription loop (runs in current thread or daemon thread)
# db.subscribe(handle_event, table="users")
```

---

### 6. Scoped Media Storage & HTTP 206 Streaming

Upload, stream, and delete media files tied directly to your database instance:

```python
# Upload local file
file_record = db.upload_file(
    file_path="./video.mp4",
    filename="video.mp4",
    content_type="video/mp4"
)
print("File ID:", file_record["id"])

# Get streaming URL (Supports HTTP 206 Partial Content Range)
stream_url = db.get_file_url(file_record["id"])
print("Streaming URL:", stream_url)

# Delete file
db.delete_file(file_record["id"])
```

---

## 🛡️ Production & Reliability Best Practices

1. **Timeout Setting**: Set appropriate client timeouts (`30s` to `60s`) for background workers or sweep tasks.
2. **Indexing**: Always create composite indexes on columns queried frequently (e.g. `CREATE INDEX IF NOT EXISTS idx_users_status_created ON users(status, created_at);`).
3. **Keep-Alive**: Reuse requests sessions for HTTP Keep-Alive socket connection pooling.

---

## 📄 License

MIT © [VanillaDatabase](https://github.com/Elaina2026/VanillaDB)
