# 02. Migration & Import Guides

Complete migration guide for importing relational dumps and semi-structured documents into VanillaDatabase.

---

## 1. Multi-Dialect Converter Engine

VanillaDatabase includes a built-in AST/regex dialect converter (`SqlTranslator`) that parses and transforms foreign SQL and document exports directly into SQLite-compatible schemas and transactions.

---

## 2. PostgreSQL to VanillaDatabase

### Step 1: Export from PostgreSQL
```bash
pg_dump --no-owner --no-acl -U postgres -d my_database -f postgres_dump.sql
```

### Step 2: Ingest into VanillaDatabase
1. In Web UI: Click **Create Database** ➔ Drag and drop `postgres_dump.sql` into **Initialize with Dump / File**.
2. Automated translation rules:
   - `SERIAL` / `BIGSERIAL` ➔ `INTEGER PRIMARY KEY AUTOINCREMENT`
   - `JSONB`, `BYTEA`, `UUID`, `TIMESTAMPTZ` ➔ `TEXT` / `BLOB`
   - Strips schema prefixes (`public.users` ➔ `users`) and administrative statements (`SET search_path`, `OWNER TO`).
   - Converts `COPY table (cols) FROM stdin; ... \.` data blocks into standard `INSERT INTO` statements.

---

## 3. MySQL / MariaDB to VanillaDatabase

### Step 1: Export from MySQL
```bash
mysqldump -u root -p --compatible=ansi --skip-extended-insert --compact my_database > mysql_dump.sql
```

### Step 2: Ingest into VanillaDatabase
1. Automated translation rules:
   - Backticks (`` `table` ``) ➔ Double quotes (`"table"`).
   - `AUTO_INCREMENT` ➔ `INTEGER PRIMARY KEY AUTOINCREMENT`.
   - `TINYINT(1)` / `BOOLEAN` ➔ `INTEGER`.
   - `VARCHAR`, `LONGTEXT`, `DATETIME` ➔ `TEXT`.
   - Strips `/*!40101 ... */` conditional comments, `ENGINE=InnoDB`, and character sets.
   - Extracts inline `KEY / INDEX` definitions into standalone `CREATE INDEX` statements.

---

## 4. MongoDB / JSON / NDJSON Ingestion

### Step 1: Export Collection
```bash
mongoexport --db my_app --collection users --out users.json --jsonArray
```
Or line-delimited JSON (NDJSON):
```bash
mongoexport --db my_app --collection logs --out logs.ndjson
```

### Step 2: Import into VanillaDatabase
1. Upload file in **Import / Export** modal or during database creation.
2. Ingestion pipeline:
   - Samples documents to infer data types (`INTEGER`, `REAL`, `TEXT`).
   - Generates `CREATE TABLE IF NOT EXISTS "tableName" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, ...);`.
   - Serializes nested sub-objects and arrays into JSON strings.
   - Inserts all rows within an atomic transaction.

---

## 5. CSV Table Import

1. Upload `.csv` file.
2. If table is unspecified, schema creates automatically from header columns.
3. If table exists, rows insert directly via parameterized batch statements.
