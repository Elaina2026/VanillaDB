# Database Management & SQL Engine

This document details SQL operations, custom SQL functions, schema inspection, and batch transactions in **VanillaDatabase**.

---

## 1. Database Operations

### Creating a Database
Databases can be created via Dashboard or Admin API:
- ID format: `db_<nanoid(16)>` (e.g. `db_abc1234567890xyz`)
- Slug format: Unique URL-safe identifier (e.g. `production-db`)

### 1-Click Database Branching / Cloning
VanillaDatabase supports instantaneous database cloning:
- Performs an atomic `PRAGMA wal_checkpoint(FULL)` on the source database.
- Copies the file to a new tenant instance.
- Creates new metadata entries and allows safe staging / branch testing without affecting production data.

### Database Maintenance Operations
The following operations can be run directly via API (`POST /api/admin/databases/:id/maintenance`) or dashboard:
1. `integrity_check`: Performs a full consistency check across B-Trees, page allocation, and indexes.
2. `quick_check`: Fast health check skipping index verification.
3. `wal_checkpoint`: Executes `PRAGMA wal_checkpoint(TRUNCATE)` to flush WAL writes into the main file and reset WAL size to 0 bytes.
4. `vacuum`: Defragments database pages, releases free pages back to disk OS, and optimizes page layout.
5. `reindex`: Rebuilds all database indexes.
6. `optimize`: Analyzes schema tables and updates SQLite query planner statistics.

---

## 2. Custom SQL Functions (Native Extensions)

VanillaDatabase injects several native custom functions into every SQLite instance:

### AI Vector Math (Embeddings & RAG)
Ideal for storing vector embeddings in standard JSON string columns:

```sql
-- Calculate cosine similarity between two vector embedding arrays (1.0 = identical, 0.0 = orthogonal)
SELECT id, title,
       vec_cosine_similarity(embedding, '[0.012, 0.421, -0.198, 0.087]') as similarity
FROM document_embeddings
WHERE similarity > 0.75
ORDER BY similarity DESC
LIMIT 5;

-- Calculate cosine distance (0.0 = identical, 2.0 = opposite)
SELECT id, vec_cosine_distance(embedding, '[0.1, 0.2, 0.3]') as dist
FROM items
ORDER BY dist ASC;
```

### In-Database AES-256-GCM Crypto Helpers
Encrypt sensitive column data directly in SQL:

```sql
-- Encrypt string using system master key
SELECT encrypt_aes('user_ssn_123456') as encrypted_ssn;

-- Encrypt with custom passphrase
SELECT encrypt_aes('user_secret_data', 'MyCustomSecretKey') as enc;

-- Decrypt back to UTF-8 plaintext
SELECT decrypt_aes(enc, 'MyCustomSecretKey') as decrypted_data;
```

### Cryptographic Hashes
```sql
-- SHA-256 Hash
SELECT hash_sha256('password_or_token') as digest;

-- HMAC-SHA256
SELECT hash_hmac('payload_string', 'secret_key') as signature;
```

---

## 3. Query Profiling & EXPLAIN QUERY PLAN

VanillaDatabase provides automated query plan analysis via `POST /api/admin/databases/:id/explain`:

```sql
EXPLAIN QUERY PLAN SELECT * FROM orders WHERE customer_id = 42;
```

The server inspects the query plan output and generates warnings:
- **Full Table Scan Warning**: Detected when SQLite executes `SCAN TABLE`. Recommends specific columns to index.
- **Index Search Confirmation**: Detected when SQLite executes `SEARCH TABLE ... USING INDEX`.
