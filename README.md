<p align="center">
  <img src="src/web/assets/logo.svg" alt="VanillaDatabase Logo" width="130" height="130" />
</p>

<h1 align="center">VanillaDatabase (VanillaDB)</h1>

<p align="center">
  <strong>High-performance, multi-tenant SQLite cloud engine with REST & SQL APIs, live Server-Sent Events (SSE), database-scoped media streaming (HTTP 206), AES-256-GCM data-at-rest encryption, automated backup snapshots, webhooks, and AI vector math functions.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-22%2B-green.svg?logo=node.js" alt="Node.js 22+" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.8-blue.svg?logo=typescript" alt="TypeScript" /></a>
  <a href="https://fastify.dev/"><img src="https://img.shields.io/badge/Fastify-5.2-black.svg?logo=fastify" alt="Fastify" /></a>
  <a href="https://www.sqlite.org/"><img src="https://img.shields.io/badge/SQLite-node:sqlite%20(WAL)-003B57.svg?logo=sqlite" alt="SQLite" /></a>
</p>

<p align="center">
  <a href="#overview">Overview</a> •
  <a href="README.vi.md">Tiếng Việt</a> •
  <a href="#why-this-project-exists">Why This Project Exists</a> •
  <a href="#key-features">Key Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#installation--quickstart">Quickstart</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#api-documentation">API Documentation</a> •
  <a href="#client-sdks">Client SDKs</a> •
  <a href="#comparison">Comparison</a> •
  <a href="docs/wiki/Home.md">Wiki Docs (EN)</a> •
  <a href="docs/wiki/vi/Home.md">Wiki Docs (VI)</a>
</p>

---

## Overview

**VanillaDatabase (VanillaDB)** is a lightweight, self-hosted multi-tenant database server built entirely on native Node.js 22+ (`node:sqlite`) and Fastify.

Instead of managing separate heavy database servers for every client or internal tool, VanillaDatabase manages **multiple isolated SQLite databases** dynamically on disk. Each database functions as an independent tenant with its own WAL journal, API tokens, media storage, automated backups, webhooks, and live event streams.

### Target Audience & Primary Use Cases
- **Full-Stack & Backend Developers**: Instant multi-tenant backend without provisioning cloud PostgreSQL/MySQL clusters.
- **Discord & Telegram Bot Developers**: Low-overhead persistent storage (~35MB–50MB RAM total server consumption).
- **Internal Tools & SaaS Startups**: Isolate customer data into discrete `.sqlite` files with role-based access control and storage quotas.
- **Edge / Homelab / Single VPS Hosting**: Production-grade ACID relational database with zero cold-starts and self-contained zero-config setup.

---

## Why This Project Exists

Traditional managed cloud databases (such as free tiers on Supabase, Neon, or PlanetScale) introduce several friction points for smaller apps and bots:
1. **Cold-start latency and sleep timeouts**: Inactivity causes instances to pause, yielding 5–30s delays or connection timeouts on incoming webhook calls.
2. **High memory footprint**: Running MySQL or PostgreSQL servers consumes 300MB–1GB+ of baseline RAM.
3. **Database limits**: Managed services frequently cap accounts to 1 or 2 databases per project.
4. **Scattered infrastructure**: Developers must wire external S3 storage for files, Redis for pub/sub realtime events, and cron daemons for backups.

### Architectural Philosophy
- **Native stdlib SQLite**: Uses Node.js 22 native synchronous SQLite bindings (`node:sqlite`) with `WAL` mode, high-concurrency read pools, and 5000ms busy timeout.
- **Data Locality & Independence**: Every database is a standalone `.sqlite` file on disk under `data/databases/`. Backups, migrations, and clones are simple file operations.
- **Unified Surface**: Database SQL engine, Table CRUD REST APIs, File Storage with HTTP 206 Partial Content Range streaming, Webhooks, and SSE event streaming in a single runtime.

---

## Key Features

- 🚀 **Multi-Tenant SQLite Engine**: Spawn unlimited isolated databases by ID (`db_<nanoid>`). Automatic WAL mode, busy timeout retry, foreign key constraints, and 60-second handle caching.
- 🔐 **Data-at-Rest Encryption (AES-256-GCM)**: Authenticated envelope encryption (`VENC` signature, PBKDF2 derived keys) for database backup files and database-scoped media assets.
- 👥 **Multi-User RBAC & Quotas**: Three-tier role hierarchy (`super_admin`, `admin`, `user`) with database quantity quotas (`max_databases`) and per-user request rate limits (`rate_limit_per_minute`).
- 🛡️ **Scoped API Tokens & Rate Limiting**: Generate tokens (`vdb_live_*`, `vdb_test_*`) with granular permissions (`database:read`, `database:write`, `database:ddl`, `database:admin`), allowed/denied table restrictions, token expiration, and per-token sliding window rate limiting.
- ⚡ **Realtime Event Streaming (SSE)**: Built-in Server-Sent Events stream (`/v1/databases/:id/realtime`) dispatching table mutations (`insert`, `update`, `delete`, `schema`) to frontend clients and SDKs.
- 📁 **Database-Scoped Media Storage**: Upload images, audio, and video files with transparent decryption and **HTTP 206 Partial Content Range Streaming** for audio/video scrub playback.
- 🔄 **Multi-Dialect Database Importer & Converter**: Auto-converts dumps from **MySQL** (`AUTO_INCREMENT`, backticks, inline keys), **PostgreSQL** (`SERIAL`, `COPY FROM stdin`), **MongoDB / NDJSON / JSON** (schema inference), **CSV**, and binary **SQLite** (`.db`/`.sqlite`).
- 🧠 **AI Vector Math & SQL Crypto Helpers**: Native SQLite custom functions: `vec_cosine_similarity()`, `vec_cosine_distance()`, `encrypt_aes()`, `decrypt_aes()`, `hash_sha256()`, and `hash_hmac()`.
- 📊 **Visual Query Profiler & Telemetry**: Analyze `EXPLAIN QUERY PLAN` outputs for full table scan detection, view system health telemetry (CPU, RAM, QPS, Latency, Network I/O), and inspect 24-hour request metrics.
- 🔔 **Webhooks Engine**: Asynchronous HTTP POST event dispatcher with HMAC-SHA256 signature verification (`X-Vanilla-Signature`), customizable event filters, and native Discord/Slack embed formatting.
- ⏰ **Automated Scheduled Backups**: Background cron scheduler supporting hourly, 6-hour, 12-hour, daily, and weekly automated encrypted snapshots with retention cleanup.
- 💻 **Modern Web Dashboard**: Single-page dashboard built with React 19, Tailwind CSS, Monaco SQL Editor, and TanStack Table.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Clients / SDKs / Web UI                           │
│        (Browser Dashboard, TypeScript SDK, Python SDK, Bots)            │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
  ┌─────────────────────────────┐         ┌─────────────────────────────┐
  │ Control Plane (/api)        │         │ Data Plane (/v1)            │
  │ • Fastify Admin Session Auth│         │ • API Bearer Token Guard    │
  │ • Multi-User RBAC & Quotas  │         │ • Token Rate Limiter (429)  │
  │ • Database & Token Manager  │         │ • Parameterized SQL Engine  │
  │ • Multi-DB SQL Translator   │         │ • Atomic Batch Transaction  │
  │ • Scheduled Backup Worker   │         │ • Realtime SSE Stream Bus   │
  │ • Webhook Event Dispatcher  │         │ • Media Storage (Range 206) │
  └──────────────┬──────────────┘         └──────────────┬──────────────┘
                 │                                       │
                 ▼                                       ▼
  ┌─────────────────────────────┐         ┌─────────────────────────────┐
  │ Metadata & Activity Store   │         │ Isolated Tenant Databases   │
  │ • data/system/vanilladb.db  │         │ • data/databases/:id.db     │
  │ • data/backups/:id/*.sqlite │         │ • data/storage/:id/*        │
  └─────────────────────────────┘         └─────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime** | Node.js 22+ | Native synchronous SQLite engine (`node:sqlite`) & ES modules |
| **Language** | TypeScript 5.8 | Type safety across server, client, and shared interfaces |
| **Backend Framework** | Fastify 5.2 | High-throughput HTTP server with plugin architecture |
| **Database Engine** | SQLite (WAL mode) | Embedded ACID relational storage per tenant |
| **Frontend Framework** | React 19 | Reactive Single Page Application for the Web Dashboard |
| **Build Tool** | Vite 6.2 | Client bundling and lightning-fast HMR development |
| **Styling** | Tailwind CSS 3.4 | Modern utility-first interface design |
| **SQL Editor** | Monaco Editor | In-browser SQL query authoring with syntax highlighting |
| **Data Tables** | TanStack Table v8 | Virtualized table data browsing and manipulation |
| **Password Hashing** | Argon2id | Secure CPU/memory-hard administrator and user authentication |
| **Validation** | Zod 3.24 | Strict runtime schema parsing for API payloads |
| **Testing** | Vitest 3.0 | Comprehensive unit and integration test runner |

---

## Project Structure

```text
VanillaDatabase/
├── src/
│   ├── server/                      # Control Plane & Data Plane Backend
│   │   ├── api/                     # Fastify Route Controllers
│   │   │   ├── admin.ts             # Admin database, table, token, backup routes
│   │   │   ├── auth.ts              # Session login, setup, password routes
│   │   │   ├── data.ts              # Public Data Plane (/v1) SQL, REST, media routes
│   │   │   └── system.ts            # Settings, telemetry, system metrics routes
│   │   ├── config/                  # Environment variable configuration loader
│   │   ├── db/
│   │   │   ├── manager.ts           # SQLite multi-handle lifecycle & validation
│   │   │   └── metadata.ts          # System metadata DB & migration runner
│   │   ├── middleware/              # Authentication & token permission guards
│   │   ├── services/                # Business logic services
│   │   │   ├── activity.ts          # Request & audit logging
│   │   │   ├── auth.ts              # User management & session cookie logic
│   │   │   ├── backup.ts            # Encrypted backup & restore procedures
│   │   │   ├── backupScheduler.ts   # Automated recurring backup cron worker
│   │   │   ├── database.ts          # Database CRUD, overview stats, query explain
│   │   │   ├── realtime.ts          # SSE EventEmitter pub/sub stream bus
│   │   │   ├── storage.ts           # Media file storage & directory manager
│   │   │   ├── system.ts            # System status, CPU/RAM metrics collection
│   │   │   ├── tokens.ts            # API token generation, hashing & rate limiting
│   │   │   └── webhook.ts           # HMAC-SHA256 signed webhook dispatcher
│   │   ├── utils/                   # Crypto, logger, SQL translator helpers
│   │   ├── benchmark.ts             # Performance stress testing suite
│   │   ├── cli.ts                   # Admin password reset CLI tool
│   │   └── index.ts                 # Server entrypoint & Fastify server builder
│   └── web/                         # React 19 Frontend Web Dashboard
│       ├── api/                     # Dashboard API client
│       ├── components/              # Modals, charts, data grids, UI components
│       ├── layouts/                 # Dashboard shell & navigation layout
│       ├── pages/                   # Overview, Databases, Telemetry, Users, Settings
│       └── main.tsx                 # Client bootstrap entrypoint
├── shared/                          # Shared TypeScript types & client SDK
├── tests/                           # Vitest integration test suite
├── wiki/                            # In-depth technical documentation suite
├── .env.example                     # Environment template configuration
└── package.json                     # NPM dependencies and scripts
```

---

## Requirements

- **Node.js**: `v22.0.0` or higher (required for native `node:sqlite` support).
- **NPM**: `v10.0.0` or higher.
- **Operating System**: Linux, macOS, or Windows (x64 / arm64).

---

## Installation & Quickstart

### 1. Local Setup

```bash
# Clone the repository
git clone <repository-url>
cd VanillaDatabase

# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Build client and server
npm run build

# Start the server
npm start
```

Open your browser at **`http://localhost:3000`** to set up your primary Super Administrator account.

---

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Runs backend (`tsx watch`) and frontend (`vite`) concurrently |
| `npm run dev:server` | Runs backend server only with hot reload |
| `npm run dev:web` | Runs Vite frontend development server only |
| `npm run build` | Builds frontend client (`vite build`) and server (`tsc`) |
| `npm start` | Starts production server from `dist/src/server/index.js` |
| `npm test` | Executes full automated Vitest test suite |
| `npm run typecheck` | Type-checks server and client code without emitting files |
| `npm run admin:reset` | Resets or creates admin user via CLI (`node dist/src/server/cli.js <user> <pass>`) |
| `npm run benchmark` | Runs high-throughput query and insert benchmark suite |

---

## Configuration

All configuration is managed via environment variables or the `.env` file:

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `NODE_ENV` | No | `development` | Runtime mode (`production` or `development`) |
| `VDB_HOST` | No | `0.0.0.0` | Host IP address to bind server |
| `VDB_PORT` | No | `3000` | Port to listen for incoming HTTP connections |
| `VDB_DATA_DIR` | No | `./data` | Directory where SQLite databases and backups reside |
| `VDB_SESSION_SECRET` | No | *Auto-generated* | Secret key for signing admin session cookies |
| `VDB_MASTER_KEY` | No | *Auto-generated* | Master key for AES-256-GCM data-at-rest encryption |
| `VDB_ADMIN_USERNAME` | No | `null` | Optional admin username to bootstrap on first run |
| `VDB_ADMIN_PASSWORD` | No | `null` | Optional admin password to bootstrap on first run |
| `VDB_TRUST_PROXY` | No | `false` | Enable client IP parsing behind reverse proxies |
| `VDB_CORS_ORIGINS` | No | `*` | Allowed CORS origins (comma-separated) |
| `VDB_SQL_BUSY_TIMEOUT_MS` | No | `5000` | SQLite busy timeout before returning SQLITE_BUSY |
| `VDB_MAX_REQUEST_BODY_MB` | No | `10` | Maximum JSON request body size in MB |
| `VDB_MAX_IMPORT_MB` | No | `1024` | Maximum file upload size for database imports |
| `VDB_MAX_QUERY_ROWS` | No | `100000` | Max rows returned per query execution |
| `VDB_QUERY_TIMEOUT_MS` | No | `0` | Query timeout limit in milliseconds (0 = none) |
| `VDB_LOG_LEVEL` | No | `info` | Logging verbosity (`debug`, `info`, `warn`, `error`) |
| `VDB_LOG_SQL` | No | `false` | Log all executed SQL queries to terminal |

---

## API Documentation

### Public Data Plane (`/v1`)
All Data Plane requests require an API Bearer token in the `Authorization` header: `Bearer vdb_live_...` or query parameter `?token=vdb_live_...`.

#### 1. Execute SQL Query
- **Endpoint**: `POST /v1/databases/:databaseId/query`
- **Permissions**: `database:read` (for SELECT/PRAGMA/EXPLAIN), `database:write` / `database:ddl` (for INSERT/UPDATE/DELETE/CREATE)
- **Request Body**:
```json
{
  "sql": "SELECT id, username, score FROM users WHERE score >= ? ORDER BY score DESC LIMIT ?",
  "params": [100, 10]
}
```
- **Response**:
```json
{
  "success": true,
  "data": {
    "columns": ["id", "username", "score"],
    "rows": [
      { "id": 1, "username": "alice", "score": 250 }
    ],
    "rowCount": 1,
    "durationMs": 0.42
  }
}
```

#### 2. Atomic Batch Transaction
- **Endpoint**: `POST /v1/databases/:databaseId/batch`
- **Permissions**: `database:write`
- **Request Body**:
```json
{
  "transaction": true,
  "statements": [
    { "sql": "UPDATE accounts SET balance = balance - ? WHERE id = ?", "params": [50, "acc_1"] },
    { "sql": "UPDATE accounts SET balance = balance + ? WHERE id = ?", "params": [50, "acc_2"] }
  ]
}
```

#### 3. Realtime SSE Stream
- **Endpoint**: `GET /v1/databases/:databaseId/realtime?table=users`
- **Permissions**: `database:read`
- **Response**: `text/event-stream` feed emitting live `insert`, `update`, `delete`, and `schema` events.

#### 4. Media Storage & Streaming
- **Upload File**: `POST /v1/databases/:databaseId/files` (Multipart form-data)
- **List Files**: `GET /v1/databases/:databaseId/files`
- **Stream / View File (HTTP 206 Range)**: `GET /v1/files/:fileId/view` (Supports `Range: bytes=0-1048575` headers)
- **Delete File**: `DELETE /v1/databases/:databaseId/files/:fileId`

---

## Client SDKs

### TypeScript / JavaScript SDK (`shared/client.ts`)

```typescript
import { VanillaDatabase } from './shared/client.js';

const db = new VanillaDatabase({
  url: 'http://localhost:3000/v1/databases/db_your_database_id',
  token: 'vdb_live_your_token_here'
});

// 1. Parameterized Query
const result = await db.query('SELECT * FROM users WHERE score > ?', [50]);

// 2. Table CRUD Builder
await db.from('users').insert({ username: 'alice', score: 100 });
const rows = await db.from('users').select({ limit: 10, orderBy: 'score', order: 'DESC' });
await db.from('users').update({ values: { score: 120 }, where: { username: 'alice' } });

// 3. Realtime Subscription
const unsubscribe = db.subscribe((event) => {
  console.log('Realtime event:', event);
}, 'users');
```

---

## Comparison

| Feature | VanillaDatabase | SQLite (Direct) | PocketBase | Supabase (Cloud) |
| :--- | :--- | :--- | :--- | :--- |
| **Architecture** | Multi-Tenant SQLite Server | Embedded C Library | Single Embedded DB (Go) | Managed PostgreSQL Cluster |
| **Multi-Tenancy** | Unlimited dynamic databases | Single DB file | Single DB file | Multi-instance / Organization |
| **Cold Starts** | **0ms (Local WAL)** | 0ms | 0ms | 5s – 30s (Free tier sleep) |
| **RAM Usage** | **~35MB – 50MB** | Process memory | ~30MB – 60MB | ~500MB – 1GB+ |
| **Data Encryption** | Built-in AES-256-GCM at-rest | Requires SQLite extensions | OS level | Managed cloud encryption |
| **Media Storage** | Built-in HTTP 206 Streaming | None | Built-in disk storage | S3-compatible cloud storage |
| **Realtime** | Built-in SSE bus | None | Built-in SSE | PostgreSQL Realtime (WAL) |

### When to use VanillaDatabase
- When building SaaS, bots, microservices, or internal tools needing isolated relational databases per tenant.
- When hosting on resource-constrained servers (512MB–1GB RAM VPS) where PostgreSQL or MySQL overhead is unacceptable.
- When requiring zero-timeout, zero-cold-start local database responses with built-in media streaming and webhooks.

### When not to use VanillaDatabase
- When requiring distributed multi-region write replication across geographically separate master nodes.
- When table sizes exceed several terabytes requiring distributed database sharding.

---

## Security Policy

VanillaDatabase implements defense-in-depth protections:
- **Argon2id** password hashing with high memory cost parameters.
- **SHA-256 token hashing** (raw API token secrets are never stored in plaintext).
- **SQL Sandboxing**: `ATTACH DATABASE`, `DETACH DATABASE`, `load_extension()`, and dangerous PRAGMAs are strictly blocked.
- **Path Traversal Guards**: Strict resolution checks prevent directory traversal outside `data/storage` or `data/databases`.
- **AES-256-GCM Encryption**: Backup files and media uploads are encrypted with PBKDF2 derived keys.

To report security vulnerabilities, review [SECURITY.md](SECURITY.md).

---

## License

This project is licensed under the [MIT License](LICENSE).  
Copyright (c) 2026 **Elaina2026**.
