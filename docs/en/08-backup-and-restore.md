# Backup, Restore & Automated Scheduling

Technical guide for point-in-time encrypted snapshot backups, checksum validation, point-in-time restore procedures, and background scheduled maintenance in **VanillaDatabase**.

---

## 1. Backup Architecture & Snapshot Workflow

### Snapshot Generation Workflow
When a backup is triggered (manually via Dashboard, Control Plane API, or automated cron scheduler):
1. **WAL Checkpoint**: Executes `PRAGMA wal_checkpoint(FULL)` on the target database, guaranteeing that all uncommitted transactions and journal pages are safely flushed to the primary database file.
2. **AES-256-GCM Envelope Encryption**: The active database is read and written into an encrypted snapshot file stored under `data/backups/:databaseId/backup_<timestamp>_<nanoid>.sqlite`.
3. **SHA-256 Checksum Manifest**: Computes an immutable SHA-256 checksum of the resulting archive and persists metadata in the `database_backups` table.

---

## 2. Point-in-Time Restore Procedure

When restoring a backup via `POST /api/admin/databases/:id/backups/:backupId/restore`:
1. **Checksum Verification**: Validates the snapshot on disk against its recorded SHA-256 hash. If corruption or tampering is detected, the operation aborts immediately.
2. **Safety Snapshot**: Automatically takes a pre-restore backup snapshot of the current state before replacing files.
3. **Connection Eviction**: Closes and removes active SQLite connection handles (`.sqlite`, `-wal`, `-shm`) from the pool.
4. **Decryption & Atomic Overwrite**: Decrypts the backup file directly into the tenant's primary database path.
5. **Post-Restore Integrity Check**: Reopens the restored database and runs `PRAGMA quick_check;`.

---

## 3. Background Automated Schedulers

### 3.1. Backup Scheduler (`backupScheduler.ts`)
Supports per-database or platform-level backup recurring schedules:
- `disabled`: No automated backups.
- `hourly`: Runs every hour.
- `6hours`: Runs every 6 hours.
- `12hours`: Runs every 12 hours.
- `daily`: Runs every 24 hours.
- `weekly`: Runs every 7 days.

### Retention Policy
- Automatically prunes older backups based on the configured retention ceiling (e.g. keep last 7 snapshots) to prevent disk exhaustion.

### 3.2. Background Auto-Maintenance Worker (`maintenanceWorker.ts`)
- Periodically executes `PRAGMA optimize` on active databases to refresh query planner statistics.
- Prunes expired activity and audit logs according to the log retention window.
