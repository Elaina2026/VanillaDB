# 06. Security, Tokens & Permissions

Security model, granular Bearer token scopes, rate limiting, and server hardening guidelines.

---

## 1. Dual Authentication Layers

1. **Control Plane (Admin Dashboard & Management API)**:
   - Session Cookies (`vdb_session`) signed via `VDB_SESSION_SECRET`.
   - Administrative passwords hashed with **Argon2id**.
   - Audit trail records every administrative mutation to `metadata.db`.

2. **Data Plane (Client SDKs, Bots, External Applications)**:
   - Bearer Tokens (`vdb_live_...` or `vdb_test_...`).
   - Plaintext tokens shown once at creation; stored hashed with **SHA-256**.

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
