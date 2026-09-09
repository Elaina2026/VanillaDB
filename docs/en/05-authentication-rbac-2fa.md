# Authentication, RBAC & 2FA Security

Comprehensive specification of system roles, database permissions, scoped API tokens, session revocation (`VDB-SEC-01`), TOTP replay prevention (`VDB-SEC-02`), and two-factor recovery.

---

## 1. Multi-User RBAC & Database Membership

### 1.1. System Roles
VanillaDatabase enforces a hierarchical three-tier platform role model:

| Role | Scope & Permissions | Quotas & Throttling |
| :--- | :--- | :--- |
| `super_admin` | Global platform administration: manage all users, edit platform settings, provision/delete any database, inspect telemetry and audit logs. | Unrestricted quotas; bypasses per-user rate limiters. |
| `admin` | Database management across all tenants, view system metrics and activity logs. Cannot modify or delete other user accounts. | Subject to global configuration defaults. |
| `user` | Isolated access: can only view and manage databases they own (`owner_id`) or have been explicitly invited to as a database member. | Restricted by `max_databases` (default 2) and `rate_limit_per_minute` (default 180). |

### 1.2. Database-Level Membership Roles
Within each tenant database, fine-grained collaboration roles apply:
- **`owner`**: Full ownership rights, database deletion, cloning, token generation, member invitations, and backup restoration.
- **`admin`**: Database configuration, member invitations, maintenance operations, and token generation.
- **`editor`**: Read, write, DDL, table modifications, and media asset management.
- **`viewer`**: Strictly read-only access to query tables, inspect schema, and stream media.

---

## 2. Session Management & Revocation (VDB-SEC-01)

### Password Hashing
All user passwords are encrypted using `Argon2id`:
- Memory cost: 64 MB (65,536 KB)
- Time cost: 3 iterations
- Parallelism: 4 threads

### Session Token Versioning & Instant Invalidation
The session cookie `vdb_session` uses an HMAC-SHA256 authenticated payload:
```
cookieValue = `${userId}.${username}.${role}.${expiresAt}.${tokenVersion}.${signature}`
```
- **Automatic Revocation**: Whenever a user changes their password (`POST /api/auth/change-password`) or is disabled by an administrator, the database increments `token_version = token_version + 1`.
- **Middleware Check**: `requireAdminAuth` and `requireTokenPermission` compare the cookie's `tokenVersion` against the database record. Mismatched cookies are rejected immediately with `401 Unauthorized` (`Session revoked due to password or credential change`).

---

## 3. Scoped API Tokens

API tokens authenticate external applications, automated microservices, and scripts without using user session cookies.

### Token Types & Storage Security
- **Live Tokens**: Prefixed with `vdb_live_<hex(64)>`.
- **Test Tokens**: Prefixed with `vdb_test_<hex(64)>`.
- **Zero-Leak Storage**: Plaintext tokens are displayed to the user once upon creation. Only the SHA-256 hash (`token_hash`) is stored in the database.

### Granular Permission Scopes
| Permission | Capabilities | Allowed SQL Operations |
| :--- | :--- | :--- |
| `database:read` | Read-only queries and stream consumption | `SELECT`, `EXPLAIN`, SSE stream, read files |
| `database:write`| Data mutation and media asset writes | `INSERT`, `UPDATE`, `DELETE`, upload/delete files |
| `database:ddl`  | Schema alterations | `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, `CREATE INDEX` |
| `database:admin`| Full database administration | All read, write, DDL, and token operations |

### Table-Level Access Restrictions
- **`allowed_tables`**: Optional allowlist. Queries targeting tables not in this list are rejected (`403 FORBIDDEN`).
- **`denied_tables`**: Optional denylist. Any query referencing tables in this list is blocked immediately.

---

## 4. Two-Factor Authentication (2FA) & Recovery (VDB-SEC-02)

VanillaDatabase implements Two-Factor Authentication using RFC 6238 Time-Based One-Time Passwords (TOTP):

### 4.1. TOTP Replay Prevention (RFC 6238 Section 5.2)
- The verification engine (`verifyTotpCode`) tracks `last_totp_step` in the database.
- Even if a 6-digit OTP code is technically within the +/- 1 time-step drift tolerance window (90 seconds), any attempt to replay a code with `candidateStep <= last_totp_step` is strictly rejected.

### 4.2. Backup Recovery Codes
- Upon activating 2FA (`POST /api/auth/2fa/activate`), the server issues **6 cryptographically random backup recovery codes** (formatted as `XXXX-XXXX`).
- Each backup code is single-use. When verified via `/api/auth/login/2fa` or `/api/auth/recovery/reset-password`, the code is atomically marked as used with a timestamp, preventing reuse.

### 4.3. Account Recovery Workflow
If an authenticator device is lost, users can navigate to `#/reset-password` and recover their account using either:
1. Dynamic 6-digit TOTP code (if still accessible).
2. Unused 8-character Backup Recovery Code.
