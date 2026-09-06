# Backup, Restore & Automated Scheduling

VanillaDatabase provides point-in-time encrypted snapshot backups, checksum validation, and automated recurring background backup workers.

---

## 1. Backup Process & Encryption

### Snapshot Creation
When a backup is triggered (manually or via scheduler):
1. **WAL Flush**: Executes `PRAGMA wal_checkpoint(FULL)` on the target database to guarantee all uncommitted and journaled pages are written into the primary database file.
2. **AES-256-GCM Encryption**: The database file is read and written into an encrypted snapshot file stored at `data/backups/:databaseId/backup_<timestamp>_<nanoid>.sqlite`.
3. **Integrity Checksum**: Computes an immutable SHA-256 checksum of the snapshot file and records it in `database_backups` table.

---

## 2. Restore Procedure

Restoring a backup (`POST /api/admin/databases/:id/backups/:backupId/restore`):
1. **Checksum Verification**: Verifies the snapshot on disk matches its recorded SHA-256 checksum. If tampered, the restore is aborted.
2. **Safety Snapshot**: Automatically takes a `system` backup snapshot of the current state before overwriting.
3. **Handle Eviction**: Closes and unlinks active SQLite connection handles (`.sqlite`, `-wal`, `-shm`).
4. **Decryption & Atomic Replacement**: Decrypts the backup file into the active database path.
5. **Post-Restore Health Check**: Reopens the database and runs `PRAGMA quick_check;`. If any corruption is detected, the operation raises an error.

---

## 3. Automated Backup Scheduler

VanillaDatabase includes a background cron worker (`src/server/services/backupScheduler.ts`):

### Configurable Schedules
- `disabled`: No automated backups.
- `hourly`: Runs every hour.
- `6hours`: Runs every 6 hours.
- `12hours`: Runs every 12 hours.
- `daily`: Runs once every 24 hours.
- `weekly`: Runs once every 7 days.

### Retention Cleanup
- Configurable retention limit (`backup_retention` in settings, e.g. keep last 7 backups).
- Automatically deletes older backup files from disk and metadata store to conserve disk space.
