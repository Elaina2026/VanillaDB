# 07. AI Vector Search, FTS5 & Maintenance

Vector similarity search, SQLite Full-Text Search (FTS5), B-Tree defragmentation, WAL checkpointing, and automated backups.

---

## 1. Native AI Vector Search

Custom mathematical functions registered in the SQLite engine:
- `vec_cosine_similarity(vec1, vec2)`: Returns cosine similarity score between `0.0` and `1.0` (`1.0` = identical).
- `vec_cosine_distance(vec1, vec2)`: Returns cosine distance (`0.0` = identical).

### SQL Semantic Query Example:
```sql
SELECT id, title, content,
       vec_cosine_similarity(embedding, '[0.012, -0.421, 0.198, 0.087]') as score
FROM knowledge_base
WHERE score >= 0.75
ORDER BY score DESC
LIMIT 5;
```

---

## 2. Full-Text Search (FTS5)

```sql
-- Create virtual FTS5 table
CREATE VIRTUAL TABLE articles_fts USING fts5(title, content, tokenize='unicode61');

-- Search keywords
SELECT * FROM articles_fts WHERE articles_fts MATCH 'SQLite OR VanillaDatabase';
```

---

## 3. Native SQL Crypto Functions

VanillaDatabase exposes built-in cryptography functions inside SQL statements:
- `encrypt_aes(data, [passphrase])`: Encrypts value using AES-256-GCM. Returns hex cipher string.
- `decrypt_aes(hexCipher, [passphrase])`: Decrypts hex cipher string back to UTF-8 text.
- `hash_sha256(data)`: Generates SHA-256 hex digest.
- `hash_hmac(data, secret)`: Generates HMAC-SHA256 signature.

```sql
-- Encrypt confidential data
INSERT INTO user_secrets (user_id, token_data) VALUES (1, encrypt_aes('ghp_secretTokenHere'));

-- Decrypt on read
SELECT user_id, decrypt_aes(token_data) AS token_plain FROM user_secrets;
```

---

## 4. Database Maintenance

Execute maintenance commands from the Web UI or API:

1. **`VACUUM`**: Reclaims unused disk space and rebuilds B-Tree structures.
2. **`PRAGMA wal_checkpoint(TRUNCATE)`**: Flushes WAL log entries to the main `.db` file and truncates the WAL file to 0 bytes.
3. **`PRAGMA integrity_check`**: Verifies B-Tree page allocation and index integrity.
4. **Visual Query Profiler (`EXPLAIN QUERY PLAN`)**: Detects full table scans and recommends optimal index strategies.

---

## 4. Automated Scheduled Backups

The `backupScheduler` worker generates `.snap` snapshot archives stored in `./data/backups/`:
- **Intervals**: `hourly`, `daily`, `weekly`.
- **Retention**: Automatically deletes snapshots older than retention limits.
- **1-Click Restore**: Restores any historical snapshot instantly via Web UI.
