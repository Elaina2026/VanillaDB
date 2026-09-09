# Database Management & SQL Engine

Technical specification of database operations, custom SQL functions, schema inspection, branching, and batch transactions in **VanillaDatabase**.

---

## 1. Database Lifecycle & Operations

### Creation & Identification
Databases can be created via the Dashboard or Control Plane API:
- **ID format**: `db_<nanoid(16)>` (e.g. `db_pMI8Tn-5MvVgh9-1`).
- **Slug format**: Unique, URL-safe alphanumeric identifier (e.g. `production-store-db`).
- **Owner ID**: Bound to the creating user's ID for RBAC isolation and quota calculation.

### 1-Click Database Branching & Cloning
VanillaDatabase supports instantaneous database cloning for development and staging:
1. Executes `PRAGMA wal_checkpoint(FULL)` on the source database to ensure complete data consistency.
2. Performs an atomic filesystem copy of the source `.sqlite` file to a new target tenant.
3. Provisions fresh metadata records for the new tenant. Staging and production branches remain isolated.

### Maintenance Commands
The following administrative operations can be invoked via `POST /api/admin/databases/:id/maintenance`:
- `integrity_check`: Runs `PRAGMA integrity_check` across B-Trees, page allocations, and indexes.
- `quick_check`: Rapid check skipping auxiliary index scans.
- `wal_checkpoint`: Executes `PRAGMA wal_checkpoint(TRUNCATE)` to flush WAL writes into the main file and reset WAL size to 0 bytes.
- `vacuum`: Defragments database pages and releases unallocated blocks back to the operating system.
- `reindex`: Reconstructs all database indexes.
- `optimize`: Analyzes schema statistics and tunes SQLite query planner estimates.

---

## 2. Custom SQL Functions (Native Extensions)

Every tenant SQLite instance is registered with custom functions at initialization:

### AI Vector Math Functions
Compute vector embeddings stored as JSON string arrays without external vector extensions:

```sql
-- Cosine similarity calculation (1.0 = identical, 0.0 = orthogonal)
SELECT id, title,
       vec_cosine_similarity(embedding, '[0.012, 0.421, -0.198, 0.087]') as similarity
FROM document_embeddings
WHERE similarity > 0.75
ORDER BY similarity DESC
LIMIT 5;

-- Cosine distance calculation (0.0 = identical, 2.0 = opposite)
SELECT id, vec_cosine_distance(embedding, '[0.1, 0.2, 0.3]') as dist
FROM items
ORDER BY dist ASC;
```

### Cryptographic SQL Functions
Execute encryption and hashing directly inside SQL statements:

```sql
-- Encrypt sensitive values using AES-256-GCM
SELECT id, encrypt_aes(ssn_plaintext, 'encryption_key_here') as ssn_encrypted
FROM customer_records;

-- Decrypt encrypted ciphertext
SELECT id, decrypt_aes(ssn_encrypted, 'encryption_key_here') as ssn_plaintext
FROM customer_records;

-- Compute SHA-256 hex digest
SELECT hash_sha256('input_string_to_hash');

-- Compute HMAC-SHA256 digest
SELECT hash_hmac('data_payload', 'signing_secret');
```

---

## 3. Atomic Batch Transactions

The Data Plane provides atomic multi-statement execution via `/v1/databases/:id/batch`:

```json
{
  "transaction": true,
  "statements": [
    {
      "sql": "UPDATE bank_accounts SET balance = balance - 100 WHERE id = ?;",
      "params": ["acc_alice"]
    },
    {
      "sql": "UPDATE bank_accounts SET balance = balance + 100 WHERE id = ?;",
      "params": ["acc_bob"]
    }
  ]
}
```

If any statement in the batch fails (e.g. constraint violation or syntax error), the entire batch transaction is rolled back immediately, guaranteeing database consistency.
