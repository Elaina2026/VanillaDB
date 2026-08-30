# Troubleshooting & FAQ

Common errors, diagnostics, and operational questions for **VanillaDatabase**.

---

## 1. Frequently Encountered Errors

### 1. `SQLITE_BUSY: database is locked` (HTTP 503)
- **Cause**: Another write transaction is currently committing or holding an exclusive lock.
- **Solution**: VanillaDatabase defaults to a `5000ms` busy timeout (`VDB_SQL_BUSY_TIMEOUT_MS`). Ensure transactions are short and do not run blocking network calls inside atomic batch blocks.

### 2. `ATTACH DATABASE is forbidden for security reasons` (HTTP 400)
- **Cause**: An SQL query attempted to execute `ATTACH DATABASE`.
- **Solution**: For multi-tenancy security, databases cannot access adjacent database files.

### 3. `Requested range not satisfiable` (HTTP 416)
- **Cause**: Browser requested a byte range beyond the file's total length.
- **Solution**: Check the file's actual size in the dashboard storage explorer.

### 4. `RATE_LIMIT_EXCEEDED` (HTTP 429)
- **Cause**: The API token or user exceeded their configured requests per minute quota.
- **Solution**: Increase the token rate limit in the token management panel or throttle client request frequency.

---

## 2. FAQ

#### Q: Can I run VanillaDatabase on an inexpensive 512MB VPS?
**A**: Yes. VanillaDatabase runs on native Node.js 22 with an ultra-lightweight footprint (~35MB–50MB RAM).

#### Q: How does VanillaDatabase handle backups during live writes?
**A**: The backup service automatically executes `PRAGMA wal_checkpoint(FULL)` before taking a point-in-time snapshot, ensuring clean data consistency.

#### Q: Where are my files and databases stored?
**A**: All tenant databases reside at `data/databases/`, media files at `data/storage/`, backups at `data/backups/`, and system metadata at `data/system/vanilladb.sqlite`.
