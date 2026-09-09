# Multi-Database Dialect Importer & Converter

Technical guide for ingesting and converting database dumps from MySQL, PostgreSQL, MongoDB / NDJSON, CSV, and native binary SQLite databases into **VanillaDatabase**.

---

## 1. Supported Formats & Conversion Pipeline

VanillaDatabase incorporates an in-engine SQL dialect translator (`src/server/utils/sqlTranslator.ts`) to ingest external database schemas and data files without third-party ETL tools.

### 1.1. MySQL Dumps (`.sql`, `.dump`)
- Replaces backtick quotes with standard SQLite identifier quotes.
- Converts `AUTO_INCREMENT` column definitions to `INTEGER PRIMARY KEY AUTOINCREMENT`.
- Maps MySQL specific datatypes (`VARCHAR`, `TINYINT`, `DATETIME`, `JSON`, `ENUM`) to standard SQLite storage affinities (`TEXT`, `INTEGER`, `REAL`, `BLOB`).
- Strips unsupported storage options (`ENGINE=InnoDB`, `DEFAULT CHARSET=utf8mb4`, `COLLATE=...`).
- Extracts inline `KEY` and `INDEX` clauses into standalone `CREATE INDEX` statements.

### 1.2. PostgreSQL Dumps (`.sql`, `.dump`)
- Converts `SERIAL` and `BIGSERIAL` to `INTEGER PRIMARY KEY AUTOINCREMENT`.
- Strips PostgreSQL schema namespace prefixes (e.g. `"public"."users"` -> `"users"`).
- Normalizes PostgreSQL types (`BYTEA`, `TIMESTAMPTZ`, `JSONB`, `UUID`, `CITEXT`, `FLOAT8`).
- Parses PostgreSQL `COPY table (col1, col2) FROM stdin; ... \.` data blocks and transforms them into atomic `INSERT INTO` batches.

### 1.3. MongoDB, JSON & NDJSON (`.json`, `.ndjson`, `.jsonl`)
- Samples input documents to automatically infer schema columns and storage types (`INTEGER`, `REAL`, `TEXT`).
- Generates a matching `CREATE TABLE` DDL and streams document records in transactional batches.

### 1.4. CSV Spreadsheets (`.csv`)
- Parses header row and inserts records into specified target tables or infers a new table schema.

### 1.5. Native Binary SQLite Databases (`.sqlite`, `.db`)
- Directly loads native binary databases after verifying the `SQLite format 3` 16-byte magic header signature.

---

## 2. Export Formats

Tenant databases can be exported via `GET /api/admin/databases/:id/export?format=<format>`:
- **`sql`**: Generates a standard SQL dump containing DDL statements and `INSERT INTO` records wrapped in a transaction.
- **`sqlite` / `db`**: Flushes the active WAL journal via `PRAGMA wal_checkpoint(PASSIVE)` and streams the raw binary file.
- **`json`**: Exports table data formatted as an array of JSON objects.
- **`csv`**: Exports table rows formatted as CSV with standard RFC 4180 escaping.
