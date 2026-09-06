# Database Management & SQL Engine

This document details SQL operations, custom SQL functions, schema inspection, branching, and batch transactions in **VanillaDatabase**.

---

## 1. Database Operations

### Creating a Database
Databases can be created via Dashboard or Admin API:
- ID format: `db_<nanoid(16)>` (e.g. `db_pMI8Tn-5MvVgh9-1`)
- Slug format: Unique URL-safe identifier (e.g. `production-store-db`)

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

### Cryptographic SQL Functions (Native Crypto)
- `encrypt_aes(plaintext, key)`: Encrypts a string using authenticated AES-256-GCM.
- `decrypt_aes(ciphertext, key)`: Decrypts an AES-256-GCM encrypted string.
- `hash_sha256(data)`: Computes a standard SHA-256 hex digest.
- `hash_hmac(data, secret)`: Computes an HMAC-SHA256 digest.

---

## 3. SQL Safety Sandbox

To preserve multi-tenant safety and server stability, the engine strictly rejects dangerous SQL constructs:
- **`ATTACH DATABASE` & `DETACH DATABASE`**: Strictly forbidden to prevent accessing sibling tenant files.
- **`load_extension()`**: Forbidden to prevent running arbitrary native binary shared libraries.
- **Dangerous PRAGMAs**: Direct modification of `data_version`, `journal_mode`, or `foreign_keys` is guarded.
