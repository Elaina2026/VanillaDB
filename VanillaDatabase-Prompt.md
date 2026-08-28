# VANILLADATABASE — COMPLETE PRODUCTION DATABASE PLATFORM

You are a senior full-stack engineer, database engineer, security engineer, DevOps engineer, and product designer.

Your task is to **design and fully implement a production-ready self-hosted database management platform named `VanillaDatabase`**.

Do NOT create a prototype.

Do NOT create only the frontend.

Do NOT leave placeholder functions.

Do NOT use mock data except inside automated tests.

Do NOT leave TODO comments instead of implementation.

Do NOT stop after scaffolding.

You must build the complete working application from frontend to backend, database engine, authentication, API token system, backup system, SQL editor, database browser, REST API, documentation, Docker deployment, tests, and README.

MPORTANT PROJECT STRUCTURE CHANGE:
Do NOT use a monorepo, npm workspaces, pnpm workspaces, Turborepo, or multiple package.json files.
VanillaDatabase must use exactly ONE root package.json, ONE package-lock.json, and ONE node_modules directory.
Both the React/Vite frontend and Node.js/Fastify backend must live inside the same project and share the same dependency manifest.
Keep the architecture modular through folders and TypeScript modules, not through separate npm packages.

Required structure:

VanillaDatabase/
├─ package.json
├─ src/
│  ├─ server/
│  └─ web/
├─ shared/
├─ data/
├─ public/
├─ Dockerfile
├─ docker-compose.yml
├─ vite.config.ts
├─ tsconfig.json
└─ README.md

There must be NO apps/server/package.json, NO apps/web/package.json, and NO packages/shared/package.json.
If the current repository already contains multiple package manifests from an earlier implementation, consolidate dependencies into the root package.json, update imports/build scripts, verify everything still works, and delete the unnecessary nested package manifests.

The application must actually run after installation.

---

# 1. PRODUCT VISION

VanillaDatabase is a lightweight self-hosted SQLite database platform intended primarily for private/internal applications.

It should provide a developer experience similar to managed database services such as:

* Turso
* Supabase database dashboard
* SQLite browser tools
* lightweight PlanetScale-style database dashboards

But VanillaDatabase must stay focused on **SQLite** and remain extremely simple to deploy.

The main purpose is:

> Run one VanillaDatabase server and allow many internal applications, bots, websites, APIs, and services to create and connect to multiple SQLite databases through secure API tokens.

VanillaDatabase should make SQLite feel like a remotely accessible managed database.

A user should be able to:

1. Open the VanillaDatabase dashboard.
2. Create a database.
3. Create one or multiple API tokens.
4. Copy an API endpoint.
5. Connect an application to that database.
6. Execute SQL remotely.
7. Manage tables visually.
8. Inspect data.
9. Backup or restore the database.
10. Create additional databases whenever needed.

---

# 2. CRITICAL REQUIREMENT: NO RATE LIMIT

VanillaDatabase is primarily an **internal/private database service**.

Therefore:

## DO NOT IMPLEMENT RATE LIMITING.

There must be:

* no token bucket
* no request-per-minute restriction
* no request-per-second restriction
* no per-IP rate limit
* no global API rate limit
* no artificial query quota
* no daily query limit
* no monthly query limit
* no token usage quota
* no database usage quota

Requests should be processed as quickly as the machine and SQLite can safely handle them.

Do not install packages such as:

* express-rate-limit
* @fastify/rate-limit
* rate-limiter-flexible

unless they are completely unused.

Do not secretly add throttling.

However, reasonable safety controls that are NOT rate limits are allowed, such as:

* HTTP maximum body size
* configurable SQL execution timeout
* upload size limit
* maximum pagination result size
* SQLite busy timeout
* connection timeout

These should prevent accidental memory exhaustion, not restrict normal API usage.

Make these limits configurable through environment variables wherever practical.

---

# 3. PROJECT NAME

Product:

`VanillaDatabase`

Short name:

`VanillaDB`

Suggested branding:

VanillaDatabase
Simple SQLite infrastructure.

Alternative tagline:

`SQLite without the management headache.`

The UI should show:

`VanillaDatabase`

not generic names such as:

* Admin Panel
* SQLite Manager
* Database Dashboard

---

# 4. TECHNOLOGY STACK

Use a modern, stable stack.

## Runtime

Use:

* Node.js 24+
* TypeScript
* npm

Do NOT use Bun unless absolutely necessary.

---

# 5. BACKEND STACK

Recommended backend:

* Node.js 24
* TypeScript
* Fastify
* better-sqlite3
* Zod
* Argon2
* Pino
* nanoid
* Vitest

If Fastify introduces unnecessary problems, Express is acceptable, but Fastify is preferred.

Use:

`better-sqlite3`

as the primary SQLite driver.

Reasons:

* simple
* reliable
* fast
* synchronous SQLite access
* transaction support
* prepared statements
* WAL support
* backup API

Do NOT introduce PostgreSQL, MySQL, MongoDB, Redis, Supabase, Firebase, Turso, Prisma Cloud, or an external database dependency.

VanillaDatabase should run entirely by itself.

---

# 6. FRONTEND STACK

Use:

* React
* TypeScript
* Vite
* Tailwind CSS
* shadcn/ui or equivalent accessible component primitives
* Lucide icons
* TanStack Query
* TanStack Table
* React Hook Form
* Zod
* Monaco Editor for SQL

Do not overuse animations.

Do not generate a stereotypical "AI dashboard".

The UI must look intentionally designed by a professional developer.

Avoid:

* giant gradients
* excessive glassmorphism
* random glowing cards
* huge hero sections
* fake analytics
* unnecessary animation
* emoji as UI icons
* rainbow colors everywhere

Use clean application-style UI similar to:

* GitHub
* Linear
* Vercel
* Supabase
* Turso
* Railway

while remaining original.

---

# 7. PROJECT ARCHITECTURE

Use a clean structure similar to:

```text
vanilladatabase/
├─ apps/
│  ├─ server/
│  │  ├─ src/
│  │  │  ├─ api/
│  │  │  ├─ auth/
│  │  │  ├─ database/
│  │  │  ├─ tokens/
│  │  │  ├─ backup/
│  │  │  ├─ middleware/
│  │  │  ├─ services/
│  │  │  ├─ repositories/
│  │  │  ├─ schemas/
│  │  │  ├─ utils/
│  │  │  ├─ config/
│  │  │  └─ index.ts
│  │  └─ tests/
│  │
│  └─ web/
│     ├─ src/
│     │  ├─ components/
│     │  ├─ pages/
│     │  ├─ hooks/
│     │  ├─ api/
│     │  ├─ features/
│     │  ├─ layouts/
│     │  ├─ lib/
│     │  └─ types/
│     └─ public/
│
├─ packages/
│  ├─ shared/
│  └─ config/
│
├─ data/
│  ├─ system/
│  ├─ databases/
│  └─ backups/
│
├─ Dockerfile
├─ docker-compose.yml
├─ .env.example
├─ package.json
└─ README.md
```

A simpler monorepo layout is acceptable if it significantly improves maintainability.

---

# 8. INTERNAL METADATA DATABASE

VanillaDatabase itself should maintain one internal database:

```text
data/system/vanilladb.sqlite
```

This database stores VanillaDatabase metadata only.

Example tables:

```text
users
databases
api_tokens
api_token_permissions
database_backups
query_logs
audit_logs
settings
schema_migrations
```

User-created databases must NOT be stored inside this metadata database.

Each database should be a real standalone SQLite file.

Example:

```text
data/databases/
  db_Ki82jd82.sqlite
  db_Mp921ksA.sqlite
  db_72ksLpq1.sqlite
```

Never use a user-provided filename directly for filesystem access.

Generate an internal immutable database ID.

Store display names/slugs separately.

Prevent path traversal.

---

# 9. DATABASE CREATION

Dashboard must support:

`Create Database`

Fields:

* database name
* optional description

After creation generate:

* database ID
* database slug
* SQLite file
* creation timestamp

Example:

```text
Name:
Discord RPC

Slug:
discord-rpc

ID:
db_01JABCDEF12345
```

File:

```text
data/databases/db_01JABCDEF12345.sqlite
```

Enable recommended SQLite options.

For example:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
```

Make busy timeout configurable.

Do not turn off durability merely to make benchmarks look good.

---

# 10. DATABASE MANAGEMENT

Users must be able to:

* create database
* rename database
* update description
* inspect database
* duplicate database
* download database
* upload database
* backup database
* restore database
* delete database

Deletion should require confirmation.

Recommended confirmation:

```text
Type the database name to confirm deletion.
```

Deleting a database must cleanly handle:

* SQLite file
* WAL file
* SHM file
* API tokens
* metadata
* scheduled backups

Do not silently leave orphan files.

---

# 11. DATABASE DASHBOARD

Each database page should contain tabs:

```text
Overview
Tables
SQL Editor
Schema
API
Tokens
Backups
Activity
Settings
```

---

# 12. DATABASE OVERVIEW

Display real information such as:

* database name
* ID
* SQLite version
* database file size
* WAL size
* number of tables
* number of indexes
* number of views
* number of triggers
* page count
* page size
* freelist count
* journal mode
* synchronous mode
* database created time
* last accessed time
* last backup
* number of API tokens

Retrieve information using SQLite PRAGMA commands where appropriate.

Do not display fake analytics.

---

# 13. TABLE EXPLORER

Create a visual SQLite table browser.

Left sidebar:

```text
Tables
Views
Indexes
Triggers
```

Selecting a table should display its rows.

Must support:

* pagination
* sorting
* filtering
* column selection
* refresh
* insert row
* edit row
* delete row
* duplicate row
* copy cell
* copy row
* export rows

Do not load millions of records into memory.

Use SQL pagination.

Support configurable page sizes:

```text
25
50
100
250
500
```

---

# 14. CREATE TABLE GUI

Provide a graphical table builder.

Fields:

```text
Column Name
Data Type
Primary Key
Not Null
Unique
Default Value
Auto Increment
Generated
Foreign Key
```

Supported SQLite type categories:

```text
INTEGER
REAL
TEXT
BLOB
NUMERIC
```

Also allow custom SQLite type names because SQLite uses type affinity.

Example table:

```text
users

id INTEGER PRIMARY KEY AUTOINCREMENT
username TEXT NOT NULL UNIQUE
avatar TEXT
created_at INTEGER NOT NULL
```

Generate valid SQL before applying the schema.

Allow user to preview SQL.

---

# 15. ALTER TABLE

Support common schema modifications.

Examples:

* rename table
* rename column
* add column
* drop column where supported
* change indexes
* recreate table safely when SQLite requires it

For operations SQLite cannot directly perform, use the safe migration approach:

1. BEGIN TRANSACTION
2. create temporary table
3. copy data
4. drop old table
5. rename new table
6. restore indexes/triggers
7. COMMIT

Backup before destructive schema migrations.

Rollback if any step fails.

---

# 16. INDEX MANAGEMENT

Allow users to:

* inspect indexes
* create index
* create unique index
* delete index

UI fields:

```text
Index Name
Table
Columns
Unique
WHERE expression
```

Support SQLite partial indexes.

---

# 17. FOREIGN KEYS

Display:

```sql
PRAGMA foreign_key_list(...)
```

Allow creation of foreign key relationships.

Options should include:

```text
ON DELETE
NO ACTION
RESTRICT
SET NULL
SET DEFAULT
CASCADE

ON UPDATE
NO ACTION
RESTRICT
SET NULL
SET DEFAULT
CASCADE
```

---

# 18. VIEWS

Support:

* list views
* inspect view SQL
* create view
* update/recreate view
* delete view

---

# 19. TRIGGERS

Support:

* list triggers
* inspect trigger SQL
* create trigger
* edit/recreate trigger
* delete trigger

---

# 20. SQL EDITOR

Implement a high-quality SQL console using Monaco Editor.

Features:

* SQLite syntax highlighting
* execute query
* execute selected SQL
* execute multiple statements
* query history
* clear editor
* save useful queries locally
* keyboard shortcut
* copy results
* download results
* execution duration
* affected row count
* last insert row ID
* errors with readable messages

Keyboard shortcut:

```text
Ctrl + Enter
```

to execute.

Result viewer should handle:

* rows
* columns
* NULL
* BLOB
* numbers
* long text

Do not convert all values to strings unnecessarily.

---

# 21. MULTIPLE SQL STATEMENTS

Support:

```sql
BEGIN;

CREATE TABLE example (
    id INTEGER PRIMARY KEY,
    name TEXT
);

INSERT INTO example(name)
VALUES ('VanillaDatabase');

COMMIT;
```

Provide transaction-aware execution.

Do not naively split SQL using:

```text
query.split(";")
```

because semicolons can appear in strings/triggers.

Use SQLite-compatible statement parsing/execution.

---

# 22. EXPLAIN QUERY PLAN

Add:

`Explain Query`

which runs:

```sql
EXPLAIN QUERY PLAN ...
```

Display results clearly.

This should help developers diagnose missing indexes and slow queries.

---

# 23. API SYSTEM

Every database should automatically have an API endpoint.

Example:

```text
https://database.example.com/v1/databases/{databaseId}
```

Database page should clearly show:

```text
Database ID
API Base URL
```

---

# 24. API TOKENS

Users must be able to create **unlimited API tokens** for each database.

There is no artificial maximum.

Examples:

```text
Production Bot
Development
Website Backend
Backup Script
Testing
```

Token fields:

```text
name
description
permissions
expiration
created_at
last_used_at
revoked_at
```

Expiration should be optional.

Example:

```text
Never expires
1 day
7 days
30 days
90 days
Custom date
```

---

# 25. TOKEN FORMAT

Create recognizable token prefixes.

Example:

```text
vdb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Possible prefixes:

```text
vdb_live_
vdb_test_
```

Generate tokens using cryptographically secure random bytes.

Use sufficient entropy.

For example at least 256 bits.

Never use:

```text
Math.random()
```

for token generation.

---

# 26. TOKEN STORAGE SECURITY

CRITICAL:

Never store complete API tokens in plaintext.

When creating token:

1. generate token
2. display it ONCE
3. securely hash the secret
4. store token prefix / identifier separately
5. store only the secure hash
6. optionally store last few characters for UI identification

Recommended:

Argon2id

or a cryptographically secure token hashing design.

UI example:

```text
Production
vdb_live_9k2f••••••••••Q7Bx
Created 27 Aug 2026
Last used 2 minutes ago
```

After creation show:

```text
Copy this token now.
For security reasons, VanillaDatabase cannot display it again.
```

---

# 27. TOKEN PERMISSIONS

Tokens should support permissions.

At minimum:

```text
database:read
database:write
database:ddl
database:admin
```

Meanings:

### database:read

Allow:

```sql
SELECT
EXPLAIN
```

and safe read-only PRAGMA operations.

### database:write

Allow:

```text
INSERT
UPDATE
DELETE
REPLACE
```

### database:ddl

Allow schema modifications such as:

```text
CREATE
ALTER
DROP
CREATE INDEX
DROP INDEX
```

### database:admin

Full database API permission.

Admin dashboard users can have unrestricted local database control.

---

# 28. OPTIONAL TABLE-LEVEL TOKEN PERMISSIONS

Design token permission architecture so it can support:

```text
allowed tables
denied tables
```

Example:

```text
Token:
website-public

Permissions:
READ

Tables:
posts
comments
users_public
```

Do not overcomplicate the first version if this compromises reliability, but structure code so table-level restrictions can be added cleanly.

Prefer implementing it if practical.

---

# 29. TOKEN MANAGEMENT UI

Tokens page:

```text
Tokens

+ Create Token

Production Bot
Read + Write
Never expires
Last used 5 seconds ago

Website
Read Only
Never expires
Last used 3 hours ago

Development
Admin
Expires Sep 30
Never used
```

Actions:

* copy token metadata
* rename
* update permissions
* revoke
* delete

Never expose token secret again.

---

# 30. EXTERNAL QUERY API

Provide a raw SQL API.

Example:

```http
POST /v1/databases/:databaseId/query
Authorization: Bearer vdb_live_xxxxx
Content-Type: application/json
```

Request:

```json
{
  "sql": "SELECT * FROM users WHERE id = ?",
  "params": [123]
}
```

Response:

```json
{
  "success": true,
  "data": {
    "columns": [
      "id",
      "username"
    ],
    "rows": [
      {
        "id": 123,
        "username": "nullex"
      }
    ],
    "rowCount": 1,
    "durationMs": 0.84
  }
}
```

---

# 31. NAMED PARAMETERS

Support SQLite named parameters.

Example:

```json
{
  "sql": "SELECT * FROM users WHERE username = @username",
  "params": {
    "username": "nullex"
  }
}
```

Also support positional parameters:

```json
{
  "sql": "SELECT * FROM users WHERE id = ?",
  "params": [10]
}
```

Always use prepared statements for parameterized queries.

---

# 32. WRITE QUERY RESPONSE

For:

```sql
INSERT INTO users(username)
VALUES (?)
```

return:

```json
{
  "success": true,
  "data": {
    "changes": 1,
    "lastInsertRowid": 42,
    "durationMs": 0.61
  }
}
```

---

# 33. BATCH API

Support batch operations.

Example:

```http
POST /v1/databases/:databaseId/batch
```

```json
{
  "transaction": true,
  "statements": [
    {
      "sql": "INSERT INTO users(username) VALUES (?)",
      "params": ["alice"]
    },
    {
      "sql": "INSERT INTO users(username) VALUES (?)",
      "params": ["bob"]
    }
  ]
}
```

If:

```text
transaction = true
```

run the entire batch inside one SQLite transaction.

If any statement fails:

ROLLBACK.

Return which statement caused the error.

---

# 34. TRANSACTION API

Where practical provide transaction-safe batch requests rather than pretending HTTP connections can safely preserve arbitrary transactions forever.

Do NOT implement fragile indefinitely-open HTTP database transactions.

Recommended pattern:

```text
POST /batch
transaction: true
```

which executes everything atomically on the server.

---

# 35. REST TABLE API

In addition to raw SQL API, implement an optional easy table API.

Examples:

```http
GET /v1/databases/:databaseId/tables/users/rows

POST /v1/databases/:databaseId/tables/users/rows

PATCH /v1/databases/:databaseId/tables/users/rows

DELETE /v1/databases/:databaseId/tables/users/rows
```

This API must internally use safe prepared statements.

Never concatenate untrusted values directly into SQL.

Validate table and column identifiers against actual SQLite schema.

---

# 36. TABLE READ API

Example:

```http
GET /v1/databases/db_xyz/tables/users/rows?limit=100&offset=0
```

Support:

```text
limit
offset
orderBy
order
```

Optional filtering can be implemented with a structured safe syntax.

Avoid building an unnecessarily complex SQL query language.

Raw SQL API already exists for advanced operations.

---

# 37. JAVASCRIPT CONNECTION EXAMPLE

The UI should automatically generate examples.

Example:

```javascript
const response = await fetch(
  "https://database.example.com/v1/databases/db_xyz/query",
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.VANILLA_DB_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sql: "SELECT * FROM users WHERE id = ?",
      params: [1]
    })
  }
);

const result = await response.json();

console.log(result);
```

---

# 38. NODE.JS CLIENT EXAMPLE

Provide:

```javascript
const VANILLA_DATABASE_URL =
  process.env.VANILLA_DATABASE_URL;

const VANILLA_DATABASE_TOKEN =
  process.env.VANILLA_DATABASE_TOKEN;

async function query(sql, params = []) {
  const response = await fetch(
    `${VANILLA_DATABASE_URL}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VANILLA_DATABASE_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        sql,
        params
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `VanillaDatabase request failed: ${response.status}`
    );
  }

  return response.json();
}
```

---

# 39. CURL EXAMPLE

Generate examples such as:

```bash
curl -X POST \
  "https://database.example.com/v1/databases/db_xyz/query" \
  -H "Authorization: Bearer $VANILLA_DATABASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT * FROM users LIMIT ?",
    "params": [10]
  }'
```

---

# 40. TOKEN SECURITY FOR RAW SQL

Raw SQL APIs can be dangerous.

Implement permission enforcement correctly.

Read-only tokens must NOT be able to bypass permissions using:

```text
WITH ...
PRAGMA ...
ATTACH DATABASE
DETACH DATABASE
VACUUM INTO
writable_schema
```

Do not rely solely on:

```text
sql.trim().startsWith("SELECT")
```

because that is insecure.

Use multiple defense layers.

For read-only access, where practical:

* open SQLite in readonly mode
* enforce query-only mode
* validate statements
* block dangerous filesystem-affecting SQLite commands

Example:

```sql
PRAGMA query_only = ON;
```

Do not allow API tokens to access arbitrary filesystem paths.

---

# 41. SQLITE FILE SANDBOXING

This is critical.

API SQL must never be able to escape the database directory.

Block or securely handle commands capable of accessing arbitrary files.

Particularly inspect:

```text
ATTACH DATABASE
DETACH DATABASE
VACUUM INTO
load_extension
PRAGMA writable_schema
```

Do NOT enable SQLite extension loading through remote API.

Admin UI can support more powerful operations, but never allow arbitrary filesystem traversal.

---

# 42. AUTHENTICATION

VanillaDatabase dashboard itself must be protected.

Implement admin authentication.

At minimum:

```text
username
password
```

Password storage:

Argon2id.

Never plaintext.

Use secure sessions.

Recommended:

* HttpOnly cookies
* Secure cookie in HTTPS production
* SameSite=Lax or Strict
* CSRF-safe design
* session expiration

Do NOT store authentication tokens in localStorage if avoidable.

---

# 43. FIRST RUN SETUP

If no admin account exists, present:

```text
Welcome to VanillaDatabase

Create your administrator account.
```

Fields:

```text
Username
Password
Confirm Password
```

Require reasonable password length.

Do not require arbitrary complex password rules.

Alternatively allow bootstrapping via environment variables:

```env
VDB_ADMIN_USERNAME=
VDB_ADMIN_PASSWORD=
```

After setup, do not continuously reset the password from environment variables unless explicitly designed for it.

---

# 44. DASHBOARD HOME

Main page should show:

```text
VanillaDatabase

Databases
```

Cards/list should include:

* database name
* description
* size
* tables
* last activity
* creation time

Buttons:

```text
Create Database
```

Provide search.

Provide compact/list view.

Do not create fake graphs just to fill empty space.

---

# 45. NAVIGATION

Example sidebar:

```text
VanillaDatabase

Overview
Databases
Activity
Backups
Settings

Documentation
```

When inside database:

```text
Overview
Tables
SQL Editor
Schema
API
Tokens
Backups
Activity
Settings
```

---

# 46. DARK MODE

Support:

* light
* dark
* system

Persist preference.

Design both themes properly.

Avoid pure black everywhere.

---

# 47. RESPONSIVE DESIGN

Desktop is the primary target.

But dashboard must remain usable on:

* laptop
* tablet
* phone

Data tables can horizontally scroll.

Sidebar should collapse on mobile.

---

# 48. BACKUP SYSTEM

VanillaDatabase must provide proper SQLite backups.

Support:

```text
manual backup
scheduled backup
restore
download backup
delete backup
```

Use a SQLite-safe backup mechanism.

Do NOT simply copy an active WAL database file without handling WAL consistency.

Prefer:

* SQLite backup API
* better-sqlite3 backup()
* or another correct SQLite-consistent approach

---

# 49. BACKUP STORAGE

Example:

```text
data/backups/{databaseId}/
```

Files:

```text
2026-08-27T07-30-00Z.sqlite
2026-08-27T12-00-00Z.sqlite
```

Metadata:

```text
backup_id
database_id
filename
size
created_at
type
status
checksum
```

---

# 50. SCHEDULED BACKUPS

Support schedules such as:

```text
Disabled
Every hour
Every 6 hours
Every 12 hours
Daily
Weekly
```

Allow retention:

```text
Keep last 5
Keep last 10
Keep last 30
Keep last 100
Unlimited
```

Scheduled backup should operate inside the VanillaDatabase server without requiring external cron.

Prevent overlapping backup jobs.

---

# 51. RESTORE

Before restoring:

1. verify backup exists
2. verify backup appears to be a SQLite database
3. create safety backup of current database
4. close database connection safely
5. restore selected backup
6. reopen database
7. run health check
8. rollback restore if verification fails

Show confirmation.

---

# 52. DATABASE INTEGRITY

Provide maintenance actions:

```text
Quick Check
Integrity Check
Optimize
Checkpoint WAL
Vacuum
Analyze
```

Commands:

```sql
PRAGMA quick_check;
PRAGMA integrity_check;
PRAGMA optimize;
PRAGMA wal_checkpoint;
VACUUM;
ANALYZE;
```

Warn before expensive operations.

---

# 53. WAL MANAGEMENT

VanillaDatabase must understand SQLite WAL mode properly.

Use:

```sql
PRAGMA journal_mode = WAL;
```

where appropriate.

Expose WAL information.

Provide optional manual:

```text
WAL Checkpoint
```

using:

```sql
PRAGMA wal_checkpoint(PASSIVE);
PRAGMA wal_checkpoint(FULL);
PRAGMA wal_checkpoint(TRUNCATE);
```

Do not constantly force checkpoints after every query.

---

# 54. CONCURRENCY

SQLite allows many readers but limited concurrent writers.

Design around this fact instead of pretending SQLite is PostgreSQL.

Requirements:

* WAL mode
* busy_timeout
* prepared statements
* transactions
* short write transactions
* avoid holding transactions unnecessarily
* avoid opening/closing databases for every single query where possible
* manage database handles safely

Implement a database connection/handle manager.

Possible concept:

```text
DatabaseManager
  Map<databaseId, DatabaseHandle>
```

Capabilities:

* lazy open
* reuse connections
* idle close
* safe close
* restore lock
* delete lock
* backup lock

Do not create uncontrolled thousands of SQLite handles.

---

# 55. MULTIPLE DATABASES

This is one of the most important VanillaDatabase features.

One VanillaDatabase process must support many SQLite databases.

For example:

```text
Discord RPC
Discord Bot
Website
Analytics
Minecraft Plugin
Development
Testing
```

Each has:

* unique ID
* independent SQLite file
* independent API tokens
* independent backups
* independent activity
* independent schema

There should be no arbitrary hard-coded number of databases.

Capacity is limited only by system resources.

---

# 56. IMPORT EXISTING SQLITE DATABASE

Allow uploading:

```text
.sqlite
.sqlite3
.db
```

Validate the file.

Do not trust extension alone.

Check SQLite file signature where appropriate.

Prevent zip bombs/path traversal if compressed imports are ever added.

Generate a VanillaDatabase ID and move/copy imported DB into controlled storage.

Never execute uploaded files.

---

# 57. EXPORT

Allow:

* download SQLite file
* SQL dump
* CSV export
* JSON export

For table export:

```text
CSV
JSON
```

For complete database:

```text
SQLite File
SQL Dump
```

Stream large exports when practical.

Do not hold multi-gigabyte exports entirely in RAM.

---

# 58. CSV IMPORT

Allow importing CSV into:

* existing table
* new table

Provide mapping:

```text
CSV column -> database column
```

Options:

```text
first row is header
delimiter
encoding
NULL handling
```

Use transaction around batch import.

Use prepared statements.

---

# 59. JSON IMPORT

Optionally support JSON array import.

Example:

```json
[
  {
    "username": "alice",
    "score": 100
  },
  {
    "username": "bob",
    "score": 200
  }
]
```

Use prepared statements and a transaction.

---

# 60. API DOCUMENTATION PAGE

Each database should have automatically generated API instructions.

Show:

```text
Database ID
Base URL
Authentication
Query endpoint
Batch endpoint
Table API
Examples
```

Languages:

```text
cURL
JavaScript
Node.js
Python
```

Never place an actual hidden token inside examples after the create-token modal closes.

Use:

```text
VANILLA_DATABASE_TOKEN
```

placeholder.

---

# 61. ERROR RESPONSE FORMAT

Use consistent errors.

Example:

```json
{
  "success": false,
  "error": {
    "code": "SQLITE_CONSTRAINT_UNIQUE",
    "message": "UNIQUE constraint failed: users.username",
    "requestId": "req_xxxxx"
  }
}
```

Do not leak:

* server filesystem paths
* stack traces
* environment variables
* secrets

during production.

Development mode may provide more debug information.

---

# 62. REQUEST IDS

Generate request IDs.

Example:

```text
req_01JDF...
```

Return:

```http
X-Request-ID
```

Include request ID in logs and API errors.

---

# 63. LOGGING

Use structured logging.

Recommended:

Pino.

Log:

* startup
* shutdown
* authentication events
* database creation
* database deletion
* backup
* restore
* token creation
* token revocation
* failed API authentication
* important errors

Do not log:

* passwords
* complete API tokens
* session secrets
* authorization headers
* full database content

---

# 64. QUERY ACTIVITY

Store lightweight activity information.

Example:

```text
database
token
operation
duration
status
timestamp
```

Avoid permanently logging full SQL including potentially sensitive values unless explicitly enabled.

Recommended default:

Store:

```text
query type
duration
rows
status
token id
```

Optional environment setting:

```env
VDB_LOG_SQL=false
```

If enabled, redact bound parameter values by default.

---

# 65. ACTIVITY PAGE

Display:

```text
Time
Database
Token
Operation
Duration
Status
```

Filters:

```text
Database
Token
Success/Error
Operation
Date
```

Pagination required.

---

# 66. TOKEN LAST USED

When an API token is used:

update:

```text
last_used_at
```

Do not synchronously write this metadata for every single API request if that becomes an unnecessary bottleneck.

Throttle internal last-used metadata persistence independently, for example update once every several seconds/minutes per token.

IMPORTANT:

This is internal metadata optimization.

It must NOT rate-limit API requests.

---

# 67. HEALTH ENDPOINT

Implement:

```http
GET /health
```

Example:

```json
{
  "status": "ok",
  "service": "VanillaDatabase",
  "version": "1.0.0",
  "sqlite": "3.x.x",
  "uptime": 123456
}
```

Do not expose secrets.

Optionally:

```http
GET /health/ready
GET /health/live
```

---

# 68. SERVER STATUS

Settings/System page can show:

* VanillaDatabase version
* Node.js version
* SQLite version
* OS
* uptime
* database count
* total database storage
* backup storage size
* memory usage

Do not expose this endpoint publicly without dashboard authentication.

---

# 69. STORAGE

Storage directory should be configurable.

Example:

```env
VDB_DATA_DIR=/app/data
```

Structure:

```text
/app/data/
├─ system/
├─ databases/
├─ backups/
└─ temp/
```

Use atomic filesystem operations where relevant.

---

# 70. SAFE SHUTDOWN

Implement graceful shutdown.

On:

```text
SIGTERM
SIGINT
```

VanillaDatabase should:

1. stop accepting new requests
2. allow active request completion
3. stop scheduled jobs
4. checkpoint/close SQLite handles appropriately
5. close metadata DB
6. exit cleanly

Do not corrupt active databases during server restart.

---

# 71. SECURITY HEADERS

Use sensible HTTP security headers.

Examples:

* CSP
* X-Content-Type-Options
* Referrer-Policy
* frame protections

If using Helmet-equivalent middleware configure it correctly.

Do not break Monaco/editor assets with an invalid CSP.

---

# 72. CORS

CORS must be configurable.

Environment:

```env
VDB_CORS_ORIGINS=
```

Examples:

```text
https://example.com,https://app.example.com
```

For private deployment optionally allow:

```text
*
```

but do not silently enable unrestricted credentialed CORS.

Dashboard should work normally when frontend and backend share the same origin.

---

# 73. REVERSE PROXY SUPPORT

VanillaDatabase should work behind:

* Cloudflare Tunnel
* Cloudflare Proxy
* Nginx
* Caddy
* Traefik

Environment:

```env
VDB_TRUST_PROXY=true
```

Correctly identify protocol behind reverse proxy.

Do not force HTTP redirects that cause proxy loops.

---

# 74. HTTPS

VanillaDatabase itself does not need to implement TLS if deployed behind a reverse proxy.

Document recommended setup:

```text
Internet
   ↓
Cloudflare / Nginx / Caddy
   ↓ HTTPS termination
VanillaDatabase :3000
```

Warn users that API tokens should not be transmitted over public plain HTTP.

---

# 75. CONFIGURATION

Create `.env.example`.

Include:

```env
NODE_ENV=production

VDB_HOST=0.0.0.0
VDB_PORT=3000

VDB_DATA_DIR=./data

VDB_SESSION_SECRET=

VDB_TRUST_PROXY=false

VDB_CORS_ORIGINS=

VDB_SQL_BUSY_TIMEOUT_MS=5000

VDB_MAX_REQUEST_BODY_MB=10
VDB_MAX_IMPORT_MB=1024

VDB_QUERY_TIMEOUT_MS=0

VDB_LOG_LEVEL=info
VDB_LOG_SQL=false
```

If:

```text
VDB_QUERY_TIMEOUT_MS=0
```

means no artificial SQL timeout.

Again:

Do NOT implement rate limiting.

---

# 76. SECRET VALIDATION

Production startup should validate security-critical configuration.

For example, reject obviously insecure session secrets such as:

```text
changeme
password
123456
```

If no session secret exists:

generate one and safely persist it inside the data directory if that improves first-run usability.

Do not regenerate the session secret after every restart.

---

# 77. SETTINGS PAGE

Sections:

```text
General
Security
Database Defaults
Backups
Storage
System
```

General:

```text
Instance Name
Base URL
```

Database defaults:

```text
Journal Mode
Busy Timeout
Synchronous
Foreign Keys
```

Do not allow unsafe configuration without warning.

---

# 78. DATABASE SETTINGS

Database settings:

```text
Name
Description

Journal mode
Synchronous mode
Foreign keys
Busy timeout

Backup schedule
Backup retention

Danger Zone
```

Danger zone:

```text
Vacuum Database
Reset WAL
Delete Database
```

---

# 79. API TOKEN UX

After token creation show a clear modal:

```text
API token created

vdb_live_xxxxxxxxxxxxxxxxxxxxxxxx

Copy this token now.
You won't be able to see it again.
```

Buttons:

```text
Copy Token
Copy Environment Variables
Done
```

Environment example:

```env
VANILLA_DATABASE_URL=https://db.example.com/v1/databases/db_xyz
VANILLA_DATABASE_TOKEN=vdb_live_xxxxx
```

---

# 80. API PAGE UX

Display:

```text
Connection

Database URL
https://db.example.com/v1/databases/db_xyz

Authentication
Bearer Token
```

Then examples.

Make integration extremely easy for beginner developers.

---

# 81. OPTIONAL VANILLADB SDK

If the main application is fully completed first, create a lightweight JavaScript SDK.

Package:

```text
@vanilladb/client
```

Example:

```javascript
import { VanillaDatabase } from "@vanilladb/client";

const db = new VanillaDatabase({
  url: process.env.VANILLA_DATABASE_URL,
  token: process.env.VANILLA_DATABASE_TOKEN
});

const users = await db.query(
  "SELECT * FROM users WHERE active = ?",
  [1]
);
```

Methods:

```text
query()
batch()
```

Do not build an ORM.

Keep SDK extremely small.

The REST API must work without the SDK.

---

# 82. SQL RESULT SERIALIZATION

Correctly handle:

```text
NULL
INTEGER
REAL
TEXT
BLOB
BigInt
```

Since JavaScript JSON cannot directly serialize BigInt safely, create a defined serialization strategy.

Do not crash when SQLite returns large integers.

Document the behavior.

For BLOB values consider:

```json
{
  "$type": "blob",
  "encoding": "base64",
  "data": "..."
}
```

or another explicit representation.

Do not silently destroy data types.

---

# 83. LARGE RESULT SETS

Protect memory without introducing rate limits.

Do not let:

```sql
SELECT * FROM giant_table
```

accidentally load a multi-gigabyte database into Node.js memory through the visual UI.

For Table Editor, always paginate.

For raw API queries, support a configurable response-row safety setting if necessary.

It should be configurable and ideally disabled or very high for trusted deployments.

This is a memory-safety feature, NOT rate limiting.

If implemented:

```env
VDB_MAX_QUERY_ROWS=100000
```

and:

```text
0 = unlimited
```

---

# 84. DATABASE LOCK ERRORS

Convert SQLite busy/locked errors into useful API responses.

Example:

```json
{
  "success": false,
  "error": {
    "code": "DATABASE_BUSY",
    "message": "Database is currently busy. Retry the operation.",
    "requestId": "req_x"
  }
}
```

Do not crash the server.

---

# 85. TRANSACTIONS

Use transactions for:

* batch writes
* CSV import
* JSON import
* schema changes
* metadata changes involving multiple records

Use better-sqlite3 transaction APIs where appropriate.

Avoid transactions that remain open across HTTP requests.

---

# 86. DATABASE MIGRATIONS

VanillaDatabase's own metadata database requires migrations.

Create migration system.

Example:

```text
001_initial.sql
002_token_permissions.sql
003_backup_schedule.sql
```

Track applied migrations.

Migrations should execute automatically during startup.

Create backup before destructive internal migrations.

---

# 87. SCHEMA INSPECTOR

Use SQLite system tables and PRAGMA APIs.

Inspect:

```sql
sqlite_schema
```

and:

```text
PRAGMA table_info
PRAGMA table_xinfo
PRAGMA index_list
PRAGMA index_info
PRAGMA foreign_key_list
```

Do not maintain duplicate fake schema metadata that can become inconsistent with SQLite.

SQLite itself is the schema source of truth.

---

# 88. SEARCH

Database table search should support:

```text
table name search
column search
```

Table data filtering should use structured conditions.

Example:

```text
username contains "nullex"
```

Translate safely into bound SQL parameters.

---

# 89. SQL HISTORY

Store SQL editor history locally or in the metadata DB.

Do not store sensitive bound values unless user opts in.

Fields:

```text
database
query
timestamp
duration
success
```

Limit retained history reasonably through configurable retention.

This is storage retention, not API rate limiting.

---

# 90. AUDIT LOG

Audit important dashboard actions:

```text
login
logout
database.create
database.delete
database.restore
database.import
token.create
token.revoke
token.delete
settings.update
```

Record:

```text
timestamp
user
action
resource
result
requestId
```

Never record secrets.

---

# 91. NO HIDDEN TELEMETRY

VanillaDatabase must have:

* no analytics SaaS
* no external telemetry
* no tracking
* no advertising
* no external error reporting by default

Do not send:

* database names
* queries
* user information
* usage metrics

to third parties.

Everything stays local.

---

# 92. NO CLOUD DEPENDENCY

VanillaDatabase must work fully offline on a private LAN.

It must not require:

* Supabase
* Firebase
* Turso
* PlanetScale
* Redis Cloud
* Auth0
* Clerk
* Sentry
* external CDN

Bundle application dependencies normally through the build.

Fonts should preferably use system/local fonts instead of requiring Google Fonts.

---

# 93. PERFORMANCE

Optimize for practical internal workloads.

Do not prematurely create complicated microservices.

This should remain one deployable application.

Use:

```text
SQLite
WAL
prepared statements
transactions
indexes
streaming where practical
pagination
connection reuse
```

Avoid:

```text
N+1 metadata queries
unbounded JSON serialization
reading full database files into memory
opening a new SQLite handle unnecessarily
```

---

# 94. DATABASE HANDLE CACHE

Implement something similar to:

```typescript
class DatabaseManager {
  open(databaseId)
  get(databaseId)
  close(databaseId)
  closeAll()
  backup(databaseId)
  restore(databaseId)
  checkpoint(databaseId)
}
```

Requirements:

* validate database ID
* resolve controlled filesystem path
* lazy open
* configure PRAGMAs
* cache active handles
* handle errors
* safe close
* concurrency-aware backup/restore

---

# 95. DATABASE FILE SECURITY

Never implement:

```typescript
path.join(DATA_DIR, req.params.filename)
```

with untrusted raw filenames.

Resolve databases only through metadata ID.

Example:

```text
request db_xyz
   ↓
metadata lookup
   ↓
internal generated filename
   ↓
validated data directory path
```

Verify resolved path stays inside configured database directory.

---

# 96. FILE DOWNLOAD

Database download endpoint must require dashboard authentication.

Do not expose arbitrary:

```text
/download?path=
```

APIs.

Only allow database IDs and backup IDs owned by VanillaDatabase.

Use correct download headers.

---

# 97. IMPORT SAFETY

Before replacing an existing database:

* verify uploaded file
* create backup
* close handles
* atomic replacement where practical
* restore on failure
* reopen
* integrity check

Never overwrite current database halfway through an upload.

---

# 98. TESTING

Write real automated tests.

Use:

* Vitest
* Fastify inject/Supertest equivalent

Tests should include:

### Authentication

* login success
* login failure
* protected route
* logout

### Database

* create
* rename
* query
* delete

### Tokens

* create token
* token authenticates
* invalid token rejected
* revoked token rejected
* expired token rejected

### Permissions

* read token can SELECT
* read token cannot INSERT
* read token cannot DROP
* write token can write
* restricted commands are blocked

### Query

* positional parameters
* named parameters
* SQL error
* unique constraint
* transaction rollback
* batch

### Backup

* create backup
* modify database
* restore backup
* verify restored data

### Security

* path traversal attempt
* invalid database ID
* ATTACH attempt
* unauthorized file access

---

# 99. FRONTEND TESTING

At minimum test critical frontend behavior.

Prefer:

* Vitest
* React Testing Library

Optional:

* Playwright

Important user flows:

```text
login
create database
open SQL editor
create token
run query
browse table
backup database
```

---

# 100. TYPESCRIPT QUALITY

Use strict TypeScript.

Enable:

```json
{
  "strict": true
}
```

Avoid:

```typescript
any
```

unless absolutely unavoidable.

Use shared API types where practical.

Validate all incoming API payloads.

Never trust TypeScript types at runtime.

---

# 101. INPUT VALIDATION

Use Zod or framework JSON schemas.

Validate:

* UUID/database IDs
* names
* token IDs
* SQL payload
* pagination
* file metadata
* settings

Return proper HTTP status codes.

---

# 102. HTTP STATUS CODES

Examples:

```text
200 success
201 created
204 deleted
400 invalid request
401 unauthenticated
403 forbidden
404 not found
409 conflict
413 payload too large
422 invalid data
500 unexpected server error
503 database temporarily busy
```

Use them consistently.

---

# 103. API VERSIONING

Use:

```text
/v1/
```

for public database API.

Dashboard/internal control API may use:

```text
/api/
```

or:

```text
/api/admin/
```

Keep external database API stable.

---

# 104. OPENAPI

Generate OpenAPI documentation if practical.

Expose protected documentation page such as:

```text
/docs
```

or provide integrated application docs.

Do not expose administrative actions without authentication.

---

# 105. DOCKER

Create production Dockerfile.

Requirements:

* Node.js 24 compatible
* production build
* minimal image where practical
* persistent `/app/data`
* no source dev server
* proper signal handling
* non-root user where possible

Example volume:

```yaml
volumes:
  - ./data:/app/data
```

---

# 106. DOCKER COMPOSE

Create:

```yaml
services:
  vanilladatabase:
    build: .
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      NODE_ENV: production
      VDB_HOST: 0.0.0.0
      VDB_PORT: 3000
```

Use environment file.

---

# 107. NON-DOCKER DEPLOYMENT

Must also support:

```bash
npm install
npm run build
npm run start
```

Development:

```bash
npm run dev
```

---

# 108. NPM SCRIPTS

Provide:

```json
{
  "scripts": {
    "dev": "...",
    "build": "...",
    "start": "...",
    "test": "...",
    "test:watch": "...",
    "lint": "...",
    "typecheck": "..."
  }
}
```

Running:

```bash
npm run build
```

must actually succeed before considering project completed.

---

# 109. README

Write a professional README.

Include:

```text
What is VanillaDatabase?
Features
Architecture
Requirements
Quick Start
Docker
Environment Variables
Creating a Database
Creating an API Token
Connecting from Node.js
Query API
Batch API
Backup
Reverse Proxy
Cloudflare Tunnel
Security Recommendations
Troubleshooting
SQLite Concurrency
Data Directory
Updating VanillaDatabase
```

Provide real commands.

---

# 110. CLOUDFLARE TUNNEL DOCUMENTATION

Include optional example:

```bash
cloudflared tunnel --url http://localhost:3000
```

Explain that persistent production deployments should use a named Cloudflare Tunnel.

Do not make Cloudflare mandatory.

---

# 111. API USAGE ENV

README example:

```env
VANILLA_DATABASE_URL=https://db.example.com/v1/databases/db_xyz
VANILLA_DATABASE_TOKEN=vdb_live_xxxxxxxxx
```

---

# 112. CLIENT RETRY GUIDANCE

Because SQLite can occasionally return busy states under heavy concurrent writes, client docs may recommend retrying transient:

```text
DATABASE_BUSY
```

using small exponential backoff.

VanillaDatabase itself must still NOT rate-limit clients.

---

# 113. UI DESIGN DETAILS

Use a professional application shell.

Suggested desktop layout:

```text
┌───────────────────────────────────────────────────────────┐
│ VanillaDatabase                          Search   User     │
├───────────────┬───────────────────────────────────────────┤
│ Overview      │                                           │
│ Databases     │          Main content                     │
│ Activity      │                                           │
│ Backups       │                                           │
│ Settings      │                                           │
│               │                                           │
│ Documentation │                                           │
└───────────────┴───────────────────────────────────────────┘
```

Database screen:

```text
Discord RPC

Overview | Tables | SQL Editor | Schema | API | Tokens | Backups
```

Use clean spacing.

Use subtle borders.

Do not over-round every component.

Use approximately:

```text
6-10px
```

radius for normal controls rather than huge pill shapes everywhere.

---

# 114. TABLE EDITOR DESIGN

Example:

```text
users                                           + Add Row

Search   Filter   Sort   Columns          Refresh

┌────┬──────────┬─────────────────────┬──────────────┐
│ id │ username │ created_at          │ active       │
├────┼──────────┼─────────────────────┼──────────────┤
│ 1  │ nullex   │ 2026-08-27 12:00   │ 1            │
│ 2  │ elaina   │ 2026-08-27 12:01   │ 1            │
└────┴──────────┴─────────────────────┴──────────────┘

1-50 of 8,321                         < 1 2 3 4 5 >
```

---

# 115. SQL EDITOR DESIGN

Layout:

```text
SQL Editor

[ editor                                       ]
[                                              ]
[ SELECT * FROM users LIMIT 100;               ]
[                                              ]

Run     Explain     Format     Clear

Results  |  Messages

Query executed in 1.21 ms
100 rows
```

Use Monaco.

Keyboard shortcut displayed subtly.

---

# 116. TOKEN SCREEN DESIGN

Example:

```text
API Tokens                                      + Create Token

Production Bot
vdb_live_4J82••••••••Yk21
Read / Write
Never expires
Last used 4 seconds ago

Development
vdb_test_Uk82••••••••92Kd
Admin
Expires Sep 30
Last used yesterday
```

---

# 117. EMPTY STATES

Create useful empty states.

For a new database:

```text
This database has no tables yet.

Create your first table or open the SQL Editor.

[Create Table] [Open SQL Editor]
```

Do not use filler illustrations unless they improve the interface.

---

# 118. ERROR STATES

Frontend must handle:

* network error
* unauthorized
* database deleted
* query failed
* database locked
* invalid token
* backup failed
* upload failed

Provide readable error messages.

Do not expose raw JavaScript stack traces to users.

---

# 119. LOADING STATES

Use:

* skeletons
* button loading state
* disabled duplicate submissions

Do not block the entire dashboard for small operations.

---

# 120. CONFIRMATION DIALOGS

Require confirmation for:

```text
delete database
delete table
delete backup
revoke token
restore backup
VACUUM where appropriate
```

Use stronger confirmation for database deletion.

---

# 121. ACCESSIBILITY

Include:

* proper labels
* focus states
* keyboard navigation
* semantic HTML
* dialogs with focus trapping
* adequate contrast
* icon tooltips

Do not make important actions icon-only without labels/tooltips.

---

# 122. DATABASE DUPLICATION

Support:

`Duplicate Database`

Process:

1. safe snapshot
2. create new database ID
3. copy snapshot
4. initialize metadata
5. create no API tokens automatically unless explicitly selected

Never duplicate token secrets.

---

# 123. DATABASE CLONING API

Admin dashboard backend may expose:

```text
POST /api/admin/databases/:id/clone
```

Token-authenticated external applications should not be allowed to clone/delete database unless using explicit database admin management permissions.

Keep data-plane and control-plane APIs separate.

---

# 124. CONTROL PLANE VS DATA PLANE

Architect the application conceptually as:

### Control Plane

Dashboard operations:

* databases
* tokens
* backups
* settings

Authentication:

admin session.

### Data Plane

Application database API:

```text
/v1/databases/:id/query
/v1/databases/:id/batch
```

Authentication:

API token.

Keep these authorization systems clearly separated.

---

# 125. NO AUTOMATIC PUBLIC DATABASE ACCESS

Creating a database must NOT make it anonymously public.

Default:

```text
no token = no API access
```

Require API token for every external database request.

---

# 126. TOKEN REVOCATION

Revocation should take effect immediately or within a very short in-memory cache TTL.

Do not allow revoked tokens to continue working for hours.

If token verification is cached, invalidate cache on:

```text
revoke
delete
permission change
```

---

# 127. CACHE

Do not introduce Redis.

Simple in-process caches are acceptable for:

* database metadata
* token verification
* database handles

Provide bounded cache behavior.

Avoid memory leaks.

---

# 128. MEMORY LEAK PREVENTION

Be careful with:

* SQLite handles
* prepared statement caches
* timers
* backup schedules
* token caches
* listeners
* upload streams

Do not create an interval per database if a single scheduler can manage all jobs.

Clean up resources when database is deleted.

---

# 129. SCHEDULER

Implement one central backup scheduler.

For example:

```text
BackupScheduler
```

Periodically identifies backups due.

Do not create thousands of separate `setInterval()` calls.

---

# 130. SQLITE FEATURES

Do not unnecessarily disable valid SQLite functionality for dashboard administrators.

Support normal SQLite functionality including:

* transactions
* CTE
* recursive CTE
* window functions
* views
* triggers
* indexes
* foreign keys
* generated columns
* JSON functions when compiled into SQLite
* RETURNING
* UPSERT
* FTS when SQLite build supports it

Do not claim features that the bundled SQLite version does not provide.

Display SQLite version.

---

# 131. FTS

If available through the SQLite build, allow users to create virtual tables such as:

```sql
CREATE VIRTUAL TABLE documents
USING fts5(content);
```

Do not attempt to recreate SQLite FTS in JavaScript.

---

# 132. EXTENSIONS

Do NOT expose arbitrary:

```text
load_extension()
```

through remote public token API.

This can become a severe security issue.

If extension loading is ever implemented later, make it explicit admin-only and disabled by default.

For the initial implementation:

KEEP EXTENSION LOADING DISABLED.

---

# 133. PRAGMA SECURITY

Not every PRAGMA is safe remotely.

Create an allow/deny strategy for token-authenticated SQL.

Read-only introspection may include safe commands such as:

```text
table_info
table_xinfo
index_list
index_info
foreign_key_list
journal_mode read
page_count
page_size
```

Dangerous PRAGMA operations should require high privilege or dashboard admin.

---

# 134. DO NOT FAKE DISTRIBUTED SQLITE

VanillaDatabase is a self-hosted SQLite server.

Do NOT falsely claim:

* global replication
* multi-region writes
* distributed consensus
* edge replication

unless those systems are actually implemented.

The goal is a reliable single-server internal database platform.

---

# 135. OPTIONAL FUTURE ARCHITECTURE

Structure code so future versions could add:

```text
replication
read replicas
S3/R2 backup destinations
multiple admin accounts
projects/workspaces
database encryption
WebSocket change streams
SDKs
```

But do NOT sacrifice the completeness of the current version for future abstractions.

---

# 136. DATABASE ENCRYPTION

Standard SQLite does not provide transparent database encryption.

Do NOT claim databases are encrypted at rest unless using a real implementation such as SQLCipher.

For VanillaDatabase v1:

filesystem permissions + secure server deployment are sufficient.

Mention optional SQLCipher support as future work only.

---

# 137. FILE PERMISSIONS

Where supported by OS:

create data files with restrictive permissions.

Do not make database files world-writable.

Docker volume documentation should warn users to protect the data directory.

---

# 138. ADMIN ACCOUNT RECOVERY

Provide documented recovery mechanism.

Example CLI:

```bash
npm run admin:reset-password
```

or:

```bash
node dist/cli.js admin reset-password
```

It should operate locally on the server.

Do not implement insecure remote password-reset links without an email system.

---

# 139. CLI

A minimal admin CLI is useful.

Commands could include:

```text
vanilladb admin reset-password
vanilladb database list
vanilladb database integrity <id>
vanilladb version
```

Only implement after core application is complete.

---

# 140. VERSIONING

Expose application version from package metadata.

Display:

```text
VanillaDatabase v1.0.0
```

Do not hardcode different versions across files.

---

# 141. BUILD REQUIREMENT

Before saying the project is complete, actually run:

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build
```

Fix every error found.

Do not simply tell me:

```text
"The project should compile."
```

Actually compile it.

---

# 142. RUNTIME VERIFICATION

Start the application.

Verify:

```text
GET /health
```

works.

Verify frontend loads.

Verify login works.

Create a real test database.

Create table:

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
);
```

Insert:

```sql
INSERT INTO users(username, created_at)
VALUES ('nullex', unixepoch());
```

Select it.

Create an API token.

Execute the SELECT through the actual HTTP API.

Create backup.

Modify data.

Restore backup.

Verify restored result.

Do not consider the implementation complete until this works.

---

# 143. SECURITY VERIFICATION

Test at minimum:

### Invalid token

Must return:

```text
401
```

### Revoked token

Must return:

```text
401
```

or appropriate auth failure.

### Read-only token

This:

```sql
SELECT * FROM users;
```

must work.

This:

```sql
DELETE FROM users;
```

must fail.

### ATTACH attack

Example:

```sql
ATTACH DATABASE '/etc/passwd' AS test;
```

must fail safely.

### Path traversal

Requests such as:

```text
../../system/vanilladb.sqlite
```

must not access arbitrary files.

---

# 144. PERFORMANCE VERIFICATION

Create a benchmark script, but do NOT optimize irresponsibly just for benchmark numbers.

Test:

```text
simple SELECT
prepared SELECT
single INSERT
transaction batch INSERT
parallel reads
mixed read/write
```

Output useful latency stats:

```text
requests
success
errors
average
p50
p95
p99
throughput
```

Do not add rate limiting during benchmark.

---

# 145. README SQLITE LIMITATIONS

Clearly explain:

SQLite performs extremely well for many internal applications, but:

* one database has limited concurrent writers
* extremely high write concurrency may require PostgreSQL or distributed systems
* VanillaDatabase does not turn SQLite into a distributed multi-writer database

Do not hide SQLite limitations.

---

# 146. IMPORTANT DESIGN PHILOSOPHY

VanillaDatabase should be:

```text
simple
fast
private
self-hosted
predictable
easy to backup
easy to connect
easy to debug
```

Avoid unnecessary enterprise complexity.

Do not implement:

* Kubernetes requirement
* Redis requirement
* Kafka
* message brokers
* microservices
* service mesh
* external authentication SaaS

This is a lightweight internal database platform.

---

# 147. CODE QUALITY

Every major feature should have a clear service/module.

Avoid giant files such as:

```text
server.ts with 5,000 lines
```

Separate concerns.

Example:

```text
TokenService
DatabaseService
DatabaseManager
BackupService
AuthService
QueryService
AuditService
SchedulerService
```

Avoid abstraction for abstraction's sake.

---

# 148. COMMENTS

Use comments only when they explain:

* security reasoning
* SQLite behavior
* tricky concurrency
* non-obvious design decisions

Do not fill every function with obvious AI-generated comments.

The code should look like a professional developer wrote it.

---

# 149. NO AI-GENERATED VISUAL STYLE

The frontend must avoid typical auto-generated dashboard patterns.

Do not use copy such as:

```text
Welcome back 👋
Manage your powerful databases effortlessly!
Unlock the power of your data!
```

Use concise product language.

Example:

```text
Databases

Create and manage SQLite databases.
```

---

# 150. README EXAMPLE QUICK START

The final README should make initial installation roughly this easy:

```bash
git clone <repository>
cd vanilladatabase

cp .env.example .env

npm install
npm run build
npm start
```

Then:

```text
http://localhost:3000
```

First-run setup creates admin account.

---

# 151. DOCKER QUICK START

Example:

```bash
docker compose up -d --build
```

Persistent storage:

```text
./data
```

Restart:

```bash
docker compose restart
```

Logs:

```bash
docker compose logs -f
```

---

# 152. BACKUP BEFORE UPDATE

README should recommend:

```text
Create a VanillaDatabase backup before upgrading.
```

Metadata migrations run automatically.

---

# 153. USER EXPERIENCE GOAL

A new developer should be able to go from:

```text
nothing
```

to:

```text
database created
API token created
Node.js application connected
```

within a few minutes.

Do not require them to understand SQLite filesystem internals.

---

# 154. DEFAULT DATABASE CONNECTION FLOW

The expected user experience is:

### Step 1

Create:

```text
DiscordBot
```

### Step 2

VanillaDatabase gives:

```text
Database ID:
db_abc123

Database URL:
https://db.example.com/v1/databases/db_abc123
```

### Step 3

Create:

```text
Production Bot Token
```

permissions:

```text
Read
Write
DDL
```

### Step 4

Receive:

```text
vdb_live_xxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Step 5

Application sends:

```http
POST /query
Authorization: Bearer vdb_live_xxx
```

### Step 6

Database responds.

This workflow must be polished.

---

# 155. IMPORTANT: DO NOT IMPLEMENT RATE LIMIT

This requirement is intentionally repeated because coding assistants frequently add it automatically.

VanillaDatabase must have:

```text
NO RATE LIMIT
```

Do not add:

```text
100 requests/minute
1000 requests/hour
10 queries/sec
token quotas
IP throttles
429 due to request count
```

The user owns the server and decides how much traffic to send.

Resource usage is naturally limited by:

```text
CPU
RAM
disk
SQLite
network
```

not SaaS quotas.

---

# 156. OPTIONAL PROTECTION AGAINST ACCIDENTAL OVERLOAD

These may exist if configurable:

```env
VDB_MAX_REQUEST_BODY_MB=
VDB_MAX_IMPORT_MB=
VDB_MAX_QUERY_ROWS=
VDB_QUERY_TIMEOUT_MS=
```

Every such limit should support:

```text
0 = unlimited
```

where technically safe.

Again, these are resource-safety settings, not request-rate limits.

---

# 157. API TOKEN COUNT

Allow effectively unlimited API tokens.

Do NOT use:

```text
max 5
max 10
max 100
```

No product plan tiers.

No billing.

No subscription logic.

No premium functionality.

No licensing server.

VanillaDatabase is private self-hosted software.

---

# 158. DATABASE COUNT

Allow effectively unlimited databases.

Do not implement:

```text
Free: 3 databases
Pro: 100 databases
```

There is no SaaS billing model.

---

# 159. BACKUP COUNT

Backup retention is chosen by the administrator.

Do not impose paid-plan style limitations.

Storage capacity is the administrator's responsibility.

---

# 160. COMPLETE FEATURE CHECKLIST

Before completion verify all of these:

## Authentication

* [ ] first-run setup
* [ ] login
* [ ] logout
* [ ] session security
* [ ] Argon2 password hashing

## Databases

* [ ] create
* [ ] rename
* [ ] delete
* [ ] duplicate
* [ ] import
* [ ] export
* [ ] multiple databases

## SQLite

* [ ] WAL
* [ ] busy timeout
* [ ] foreign keys
* [ ] transactions
* [ ] prepared statements
* [ ] integrity check
* [ ] vacuum
* [ ] optimize
* [ ] analyze

## Schema

* [ ] tables
* [ ] columns
* [ ] indexes
* [ ] foreign keys
* [ ] views
* [ ] triggers

## Data

* [ ] browse
* [ ] insert
* [ ] update
* [ ] delete
* [ ] pagination
* [ ] filtering
* [ ] sorting

## SQL

* [ ] Monaco editor
* [ ] execute SQL
* [ ] execute selection
* [ ] multiple statements
* [ ] history
* [ ] explain query plan
* [ ] query duration

## API

* [ ] query endpoint
* [ ] parameters
* [ ] batch
* [ ] transactional batch
* [ ] REST table API
* [ ] consistent errors

## Tokens

* [ ] unlimited tokens
* [ ] secure random generation
* [ ] hash token secret
* [ ] display once
* [ ] read permission
* [ ] write permission
* [ ] DDL permission
* [ ] admin permission
* [ ] revoke
* [ ] expiration
* [ ] last used

## Security

* [ ] filesystem sandbox
* [ ] ATTACH blocked remotely
* [ ] extension loading disabled
* [ ] path traversal protection
* [ ] HTTP security headers
* [ ] safe cookies
* [ ] no secrets in logs

## Backups

* [ ] manual
* [ ] scheduled
* [ ] retention
* [ ] restore
* [ ] download
* [ ] safe SQLite backup

## Dashboard

* [ ] responsive
* [ ] light mode
* [ ] dark mode
* [ ] database overview
* [ ] table editor
* [ ] SQL editor
* [ ] token manager
* [ ] backups
* [ ] activity
* [ ] settings

## Deployment

* [ ] `.env.example`
* [ ] Dockerfile
* [ ] docker-compose
* [ ] graceful shutdown
* [ ] persistent volume
* [ ] README

## Quality

* [ ] typecheck passes
* [ ] lint passes
* [ ] tests pass
* [ ] production build passes
* [ ] runtime tested

## Rate Limiting

* [ ] NO rate limiting exists anywhere

---

# 161. IMPLEMENTATION ORDER

Do not jump randomly between features.

Implement in this order:

## Phase 1 — Foundation

1. project structure
2. TypeScript configuration
3. environment configuration
4. logging
5. metadata SQLite database
6. migration system
7. authentication

## Phase 2 — Database Engine

8. database manager
9. create/delete database
10. database handle lifecycle
11. WAL configuration
12. schema inspection
13. SQL execution
14. transactions

## Phase 3 — API Security

15. token generation
16. token hashing
17. token authentication
18. token permissions
19. query API
20. batch API
21. SQL sandbox protections

## Phase 4 — Management

22. backups
23. restore
24. import
25. export
26. maintenance operations
27. activity logs

## Phase 5 — Frontend

28. login/setup
29. dashboard shell
30. database list
31. overview
32. table browser
33. table editor
34. schema editor
35. Monaco SQL editor
36. API page
37. token manager
38. backups
39. settings
40. activity

## Phase 6 — Deployment

41. Docker
42. README
43. examples
44. tests
45. runtime verification

Complete each phase before moving forward.

---

# 162. WHEN YOU FIND A BUG

Do NOT work around bugs with placeholder code.

Investigate the actual root cause.

When fixing:

1. understand error
2. inspect affected architecture
3. implement proper fix
4. test regression
5. rerun typecheck
6. rerun tests

Do not disable TypeScript checks simply to compile.

Do not use:

```typescript
// @ts-ignore
```

unless there is an extremely strong technical reason.

---

# 163. DO NOT DELETE FEATURES TO FIX BUILD

If something fails to compile, fix it.

Do NOT solve errors by silently removing:

* authentication
* tokens
* backups
* SQL editor
* schema browser
* APIs

A green build with missing functionality is not completion.

---

# 164. DO NOT STOP EARLY

Do not finish with messages like:

```text
I've created the foundation.
You can implement the rest later.
```

or:

```text
The remaining features follow the same pattern.
```

or:

```text
Due to complexity, here is the architecture.
```

You are responsible for implementing the whole project.

Continue until the application works.

---

# 165. EXISTING PROJECT RULE

If this repository already contains files:

FIRST inspect the entire relevant codebase.

Understand:

* current architecture
* package manager
* existing frontend
* existing backend
* current database code
* environment configuration
* errors

Do not unnecessarily destroy working code.

Refactor where appropriate.

If the repository is empty, initialize it.

---

# 166. FINAL VERIFICATION

After implementation perform this complete sequence:

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build
```

Then launch production build.

Verify:

```text
/health
dashboard
authentication
database creation
SQL query
API token
remote API query
backup
restore
database deletion
```

Inspect terminal for:

```text
uncaught exception
unhandled rejection
memory leak warnings
SQLite busy loop
missing files
404 assets
frontend console errors
```

Fix all discovered problems.

---

# 167. FINAL RESPONSE FORMAT

Only after the system is working, provide:

```text
VanillaDatabase implementation completed.

Architecture:
...

Implemented:
...

API:
...

Security:
...

Storage:
...

Run:
...

Default URL:
...

Tests:
...

Known SQLite limitations:
...
```

Do not claim a feature was implemented unless the actual code exists.

---

# 168. MOST IMPORTANT RULES

These rules override convenience:

1. Build a REAL working application.
2. Use REAL SQLite databases.
3. Support MULTIPLE independent SQLite databases.
4. Support MULTIPLE API tokens per database.
5. API tokens must be securely generated and stored.
6. Provide raw SQL and batch APIs.
7. Provide visual database management.
8. Implement safe backup and restore.
9. Use WAL and sensible SQLite concurrency behavior.
10. Prevent filesystem escape through remote SQL.
11. Never expose secrets.
12. No external cloud dependency.
13. No fake data in production.
14. No unfinished TODO implementation.
15. No SaaS pricing.
16. No artificial database limits.
17. No artificial token limits.
18. NO RATE LIMIT.
19. Actually run tests and builds.
20. Do not stop until VanillaDatabase is usable end-to-end.

---

# FINAL PRODUCT GOAL

The final experience should feel like this:

```text
VanillaDatabase
        │
        ├── Discord Bot
        │      ├── discord-bot.sqlite
        │      ├── Production Token
        │      └── Development Token
        │
        ├── Discord RPC
        │      ├── discord-rpc.sqlite
        │      ├── Server 1 Token
        │      ├── Server 2 Token
        │      └── Development Token
        │
        ├── Website
        │      ├── website.sqlite
        │      └── Backend Token
        │
        └── Minecraft
               ├── minecraft.sqlite
               └── Plugin Token
```

Every application connects using:

```text
Database URL
+
API Token
```

Example:

```env
VANILLA_DATABASE_URL=https://db.example.com/v1/databases/db_01JXYZ
VANILLA_DATABASE_TOKEN=vdb_live_xxxxxxxxxxxxxxxxxxxxxxxxx
```

Application:

```javascript
const response = await fetch(
  `${process.env.VANILLA_DATABASE_URL}/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VANILLA_DATABASE_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sql: `
        SELECT *
        FROM users
        WHERE discord_id = ?
      `,
      params: ["123456789"]
    })
  }
);

const data = await response.json();
```

This should be the core VanillaDatabase philosophy:

> **Create database → create token → copy URL → connect application → done.**

Build VanillaDatabase as something I can genuinely deploy on my own Node.js server/VPS and use as the central database service for my internal projects instead of relying on a third-party managed SQLite provider.
