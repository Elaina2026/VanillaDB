# Multi-Database Dialect Importer & Converter

VanillaDatabase features a built-in multi-dialect SQL and document translator that automatically ingests dumps from other database systems and converts them into SQLite.

---

## 1. Supported Formats & Conversions

### 1. MySQL Dumps (`.sql`, `.dump`)
- Strips backticks (`` `users` `` $\rightarrow$ `"users"`).
- Translates `AUTO_INCREMENT` to `INTEGER PRIMARY KEY AUTOINCREMENT`.
- Maps MySQL column types (`VARCHAR`, `TINYINT`, `DATETIME`, `JSON`, `ENUM`) to standard SQLite storage affinities (`TEXT`, `INTEGER`, `REAL`, `BLOB`).
- Strips MySQL table options (`ENGINE=InnoDB`, `DEFAULT CHARSET=utf8mb4`, `COLLATE=...`).
- Extracts inline `KEY` and `INDEX` definitions into separate `CREATE INDEX` statements.

### 2. PostgreSQL Dumps (`.sql`, `.dump`)
- Translates `SERIAL` and `BIGSERIAL` $\rightarrow$ `INTEGER PRIMARY KEY AUTOINCREMENT`.
- Removes schema prefixes (`"public"."users"` $\rightarrow$ `"users"`).
- Maps PostgreSQL types (`BYTEA`, `TIMESTAMPTZ`, `JSONB`, `UUID`, `CITEXT`, `FLOAT8`) to SQLite types.
- Translates `COPY table (col1, col2) FROM stdin; ... \.` blocks into atomic `INSERT INTO` batches.

### 3. MongoDB & NDJSON / JSON (`.json`, `.ndjson`, `.jsonl`)
- Automatically samples records to infer column data types (`INTEGER`, `REAL`, `TEXT`).
- Generates `CREATE TABLE` DDL and inserts all records in an atomic batch.

### 4. CSV Files (`.csv`)
- Parses headers and inserts rows into existing tables or auto-creates a table.

### 5. SQLite Binary Databases (`.sqlite`, `.db`)
- Directly replaces the tenant database binary after checking the `SQLite format 3` header signature.

---

## 2. Exporting Data

Databases can be exported via `GET /api/admin/databases/:id/export?format=<format>`:
- **`sql`**: Generates a standard SQL dump with `CREATE TABLE` and `INSERT INTO` statements wrapped in a transaction.
- **`sqlite` / `db`**: Flushes the WAL journal (`PRAGMA wal_checkpoint(PASSIVE)`) and downloads the raw `.sqlite` binary file.
- **`json`**: Exports rows as a JSON array.
- **`csv`**: Exports rows as CSV with comma delimiters and escaped quotes.
