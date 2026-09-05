# Authentication, RBAC & Permissions

This document covers user roles, dashboard session authentication, API tokens, granular permissions, and sliding-window rate limiting.

---

## 1. Multi-User RBAC (Role-Based Access Control)

VanillaDatabase supports three hierarchical user roles:

| Role | Permissions & Capabilities |
| :--- | :--- |
| **`super_admin`** | Full system control: create/manage users, edit system settings, access all databases, unrestricted quotas, rate limit bypass. |
| **`admin`** | Manage all tenant databases, view telemetry, manage backups and webhooks, inspect users list. Cannot create or delete other users. |
| **`user`** | Access and manage **only** databases owned by their account (`owner_id`). Subject to quota limits (`max_databases`) and rate limiting (`rate_limit_per_minute`). |

---

## 2. Dashboard Session Authentication

- **Algorithm**: `Argon2id` password hashing (memory cost: 64MB, time cost: 3 iterations, parallelism: 4).
- **Session Cookie**: `vdb_session` cookie issued upon login with `HttpOnly`, `SameSite: Lax`, and `Secure` (in production).
- **Session Signature**: Cryptographically signed HMAC-SHA256 payload (`userId:username:role:expiresAt`). Session cookies expire automatically after **7 days**.

---

## 3. Scoped API Tokens

API tokens allow external applications, microservices, and bots to interact with tenant databases securely.

### Token Types & Prefix
- **Live Tokens**: `vdb_live_<hex(64)>`
- **Test Tokens**: `vdb_test_<hex(64)>`

### Granular Token Permissions
Each token can be assigned one or more permissions:

| Permission | Description | Allowed SQL / Endpoints |
| :--- | :--- | :--- |
| `database:read` | Read-only access | `SELECT`, `PRAGMA table_info`, `EXPLAIN`, list/view files, SSE stream |
| `database:write`| Write access | `INSERT`, `UPDATE`, `DELETE`, upload/delete files, execute batch |
| `database:ddl`  | Schema modifications | `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, `CREATE INDEX` |
| `database:admin`| Full database administration | All read, write, DDL, and management functions |

### Table-Level Access Control
- **`allowed_tables`**: Optional whitelist. The token can **only** query or modify tables in this array.
- **`denied_tables`**: Optional blacklist. Queries targeting tables in this array are rejected immediately.

### Sliding-Window Rate Limiting
- Configurable per-token (e.g. `rate_limit: 100` req/minute).
- Enforced using an in-memory bucket map. Exceeding the rate limit returns `HTTP 429 Too Many Requests` with a clear retry timeout header.

---

## 4. Two-Factor Authentication (2FA) & Recovery

VanillaDatabase features enterprise-grade two-factor authentication based on RFC 6238 TOTP:

### Activation Flow
1. `POST /api/auth/2fa/setup`: Generates an RFC 6238 compliant base32 secret and an SVG QR data URI.
2. `POST /api/auth/2fa/activate`: Requires account password verification and a valid 6-digit TOTP code. Upon success, generates 6 cryptographically secure backup codes (`XXXX-XXXX`).

### Backup Codes Lifecycle
- Backup codes are stored with usage state: `[{ code, used: boolean, used_at?: number }]`.
- Active vs burned codes are distinguished in the Settings dashboard.
- Users can view, hide, copy, download, or regenerate backup codes (`POST /api/auth/2fa/regenerate-backup-codes`) using password confirmation.

### Dual-Factor Account Recovery
If an authenticator device is lost, accounts can be recovered via `POST /api/auth/recovery/reset-password`:
- **Method 1 (TOTP)**: Validates identity using the 6-digit authenticator code.
- **Method 2 (Backup Code)**: Validates and permanently burns an active single-use backup code. Comparisons use `crypto.timingSafeEqual` to eliminate timing attack vectors.
