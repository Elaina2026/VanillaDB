# 06. Security, Tokens & Permissions

Security model, granular Bearer token scopes, rate limiting, and server hardening guidelines.

---

## 1. Multi-Tier Security Architecture

1. **Control Plane (Admin Dashboard & Management API)**:
   - Session Cookies (`vdb_session`) signed via `VDB_SESSION_SECRET`.
   - Administrative passwords hashed with **Argon2id**.
   - Role-Based Access Control (RBAC): `super_admin`, `admin`, `user`.
   - Per-user database limits and request rate limits.
   - Audit trail records administrative actions in `metadata.db`.

2. **Data Plane (Client SDKs, Bots, External Applications)**:
   - Bearer Tokens (`vdb_live_...` or `vdb_test_...`).
   - Plaintext tokens shown once at creation; stored hashed with **SHA-256**.
   - Per-token rate limiting and table whitelisting/blacklisting.

3. **Data-at-Rest Encryption (AES-256-GCM)**:
   - Master encryption key (`VDB_MASTER_KEY` / `VDB_ENCRYPTION_KEY`) with PBKDF2 derivation (100,000 iterations).
   - Backup snapshots (`.snap`) and media storage files automatically encrypted on disk with custom binary envelope `[VENC][SALT][IV][TAG][CIPHERTEXT]`.
   - Native SQL functions for column-level encryption: `encrypt_aes()`, `decrypt_aes()`, `hash_sha256()`, `hash_hmac()`.

---

## 2. Token Scopes & Permissions

| Permission | Description |
| :--- | :--- |
| `database:read` | Read queries (`SELECT`, schema inspection, SSE stream, media viewing). |
| `database:write` | Write mutations (`INSERT`, `UPDATE`, `DELETE`, batch transactions, file uploads). |
| `database:ddl` | Schema migrations (`CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, `INDEX`). |
| `database:admin` | Full operational control on the database. |

---

## 3. Table-Level Access & Rate Limiting

- **`allowedTables`**: Whitelist granting access only to specified tables.
- **`deniedTables`**: Blacklist rejecting access to sensitive tables.
- **Rate Limiting**: Sliding-window limiter in memory. Exceeding limits returns HTTP `429 Too Many Requests`.

---

## 4. Query Sandboxing & Hardening

VanillaDatabase disallows destructive primitives:
- `ATTACH DATABASE` / `DETACH DATABASE`
- `load_extension()`
- `PRAGMA writable_schema`
- `VACUUM INTO`
- Arbitrary unapproved PRAGMA statements.
