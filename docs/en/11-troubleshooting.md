# Troubleshooting & Diagnostic Guide

Common operational errors, diagnostic steps, and frequently asked questions for **VanillaDatabase**.

---

## 1. Frequently Encountered Operational Issues

### 1.1. `SQLITE_BUSY: database is locked` (HTTP 503)
- **Root Cause**: Another transaction is currently holding an exclusive lock during a write or checkpoint.
- **Remediation**:
  - VanillaDatabase enforces a 5,000ms busy timeout (`VDB_SQL_BUSY_TIMEOUT_MS=5000`).
  - Keep transactions concise. Never perform long-running network operations within batch transactions.
  - Verify that WAL mode is active (`PRAGMA journal_mode;` returns `wal`).

### 1.2. Cloudflare 502 Bad Gateway
- **Root Cause**: Cloudflare proxies HTTPS traffic to origin port 443 (which is closed) instead of your backend listening port (e.g. 3000 or 25589).
- **Remediation**:
  - In Cloudflare Dashboard -> **Rules** -> **Origin Rules**, create a rule rewriting destination port to your backend application port.
  - Set SSL/TLS encryption mode to **Flexible** if origin is HTTP, or **Full** if origin has a self-signed certificate.

### 1.3. Browser Stuck on "Loading VanillaDatabase..."
- **Root Cause**: Network latency or unresolved API response preventing the dashboard from hydrating.
- **Remediation**:
  - VanillaDatabase includes a 12-second `AbortController` timeout on `apiRequest` and a 3-second fallback timer in `useAuth`.
  - If still hanging, verify that the backend process is running and reachable via `curl http://localhost:3000/health`.

### 1.4. `Failed to load module script: Expected JavaScript but responded with text/html`
- **Root Cause**: Development uncompiled files are being served instead of the compiled production client bundle.
- **Remediation**:
  - Run `npm run build` to compile the Vite client into `dist/client/`.

### 1.5. Session Cookie Invalidation (`Session revoked due to password or credential change`)
- **Root Cause**: User password was changed or an administrator modified account role/status (VDB-SEC-01).
- **Remediation**:
  - Re-authenticate via `POST /api/auth/login` to obtain a fresh session cookie with the current `token_version`.

### 1.6. `INVALID_TOTP_CODE` during 2FA Login
- **Root Cause**: Clock drift on the authenticator device or code replay attempt within the 90-second window (VDB-SEC-02).
- **Remediation**:
  - Synchronize the system time on your device.
  - Wait for the next 30-second time-step cycle before entering a fresh 6-digit code.

---

## 2. Frequently Asked Questions (FAQ)

### Can VanillaDatabase run on an entry-level 512MB RAM VPS?
Yes. VanillaDatabase consumes approximately 35MB to 50MB of RAM under baseline load and operates efficiently on low-resource instances.

### How does VanillaDatabase handle backups during live write traffic?
The backup engine executes an atomic `PRAGMA wal_checkpoint(FULL)` prior to snapshot capture. Active read and write operations are not blocked.

### Where is all persistent data located on disk?
- Databases: `data/databases/:id.sqlite`
- Media Assets: `data/storage/:databaseId/`
- Backups: `data/backups/:databaseId/`
- System Metadata: `data/system/vanilladb.sqlite`
