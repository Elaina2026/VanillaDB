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
  <a href="package.json"><img src="https://img.shields.io/badge/Version-1.3.2-orange.svg" alt="Version 1.3.2" /></a>
</p>

<p align="center">
  <a href="#overview">Overview</a> •
  <a href="README.vi.md">Tiếng Việt (VI)</a> •
  <a href="#key-features">Key Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#quickstart">Quickstart</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#api-reference">API Reference</a> •
  <a href="#client-sdks">SDKs</a> •
  <a href="#comparison">Comparison</a> •
  <a href="#keyboard-shortcuts">Shortcuts</a> •
  <a href="docs/en/Home.md">Full Wiki (EN)</a> •
  <a href="docs/vi/Home.md">Wiki (VI)</a>
</p>

---

## Overview

**VanillaDatabase (VanillaDB)** is a lightweight, self-hosted multi-tenant database server built natively on Node.js 22+ (`node:sqlite`) and Fastify.

Instead of managing separate heavy database servers for every client, project, or internal tool, VanillaDatabase manages **multiple isolated SQLite databases** dynamically on disk. Each database functions as an independent tenant with its own WAL journal, API tokens, media storage, automated backups, webhooks, and live event streams.

### Target Audience & Primary Use Cases
- **Full-Stack & Backend Developers**: Instant multi-tenant backend without provisioning cloud PostgreSQL/MySQL clusters.
- **Discord & Telegram Bot Developers**: Low-overhead persistent storage (~35MB–50MB RAM total server consumption).
- **Internal Tools & SaaS Startups**: Isolate customer data into discrete `.sqlite` files with role-based access control and storage quotas.
- **Edge / Homelab / Single VPS Hosting**: Production-grade ACID relational database with zero cold-starts and self-contained zero-config setup.

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
- 🔐 **Dual-Factor Recovery & 2FA TOTP**: RFC 6238 TOTP authenticator app integration, one-time 6-digit challenge, persistent 8-character backup recovery codes with active/used lifecycle tracking, and dedicated `#/reset-password` recovery flow.
- 💻 **Modern Web Dashboard**: Single-page dashboard built with React 19, Tailwind CSS, Monaco SQL Editor, and TanStack Table.

---

## Architecture

```
                      ┌─────────────────────────────────┐
                      │        HTTP / SSE Clients       │
                      │  (Web Dashboard, SDKs, Scripts) │
                      └────────────────┬────────────────┘
                                       │
                     ┌─────────────────┴─────────────────┐
                     │ Fastify HTTP Server (Port: 3000)  │
                     │  - Helmet Security & CORS Guard   │
                     │  - Session Cookie & Bearer Auth   │
                     │  - Multipart Upload & Range 206   │
                     │  - Realtime Metrics & Telemetry   │
                     └─────────────────┬─────────────────┘
                                       │
        ┌──────────────────────────────┴──────────────────────────────┐
        ▼                                                             ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│ Control Plane (/api/*)       │              │ Data Plane (/v1/*)           │
│ • Admin Authentication       │              │ • API Bearer Token Guard     │
│ • Multi-User RBAC & Quotas   │              │ • Sliding Rate Limiter (429) │
│ • Multi-DB SQL Translator    │              │ • Parameterized Query Engine │
│ • Scheduled Backup Worker    │              │ • Atomic Batch Transaction   │
│ • Webhook Event Dispatcher   │              │ • Realtime SSE Stream Bus    │
│ • Audit & Activity Logs      │              │ • Media Storage (Range 206)  │
└──────────────┬───────────────┘              └──────────────┬───────────────┘
               │                                             │
               ▼                                             ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│ System Metadata Store        │              │ Database Manager Pool        │
│ • data/system/vanilladb.sqlite              │ • Connection Handle Cache    │
│ • Schema migrations & users  │              │ • SQL Safety Sandbox         │
│ • API tokens & audit logs    │              │ • Vector Math & SQL Crypto   │
└──────────────────────────────┘              └──────────────┬───────────────┘
                                                             │
                                                             ▼
                                              ┌──────────────────────────────┐
                                              │ Isolated Tenant Databases    │
                                              │ • data/databases/:id.sqlite  │
                                              │ • WAL Mode & Busy Timeout    │
                                              │ • data/storage/:id/*         │
                                              │ • data/backups/:id/*.sqlite  │
                                              └──────────────────────────────┘
```

---

## Quickstart

### Prerequisites
- **Node.js**: `v22.0.0` or higher (required for native `node:sqlite`).
- **NPM**: `v10.0.0` or higher.
- **Operating System**: Linux, macOS, or Windows.

### Installation

```bash
# 1. Clone repository
git clone https://github.com/Elaina2026/VanillaDB.git
cd VanillaDatabase

# 2. Install dependencies
npm install

# 3. Copy environment template
cp .env.example .env

# 4. Build client and server
npm run build

# 5. Start the server
npm start
```

Open your browser at **`http://localhost:3000`** to set up your primary Super Administrator account.

---

## Configuration

All configuration is managed via environment variables or `.env`:

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `NODE_ENV` | No | `development` | Runtime environment (`production` / `development`) |
| `VDB_HOST` | No | `0.0.0.0` | Host IP address to bind |
| `VDB_PORT` | No | `3000` | Port for incoming HTTP requests |
| `VDB_DATA_DIR` | No | `./data` | Directory where SQLite databases and backups reside |
| `VDB_SESSION_SECRET` | No | *Auto-generated* | Secret for signing session cookies (min 32 chars) |
| `VDB_MASTER_KEY` | No | *Auto-generated* | Master key for AES-256-GCM data-at-rest encryption |
| `VDB_ADMIN_USERNAME` | No | `null` | Optional admin username to bootstrap on first run |
| `VDB_ADMIN_PASSWORD` | No | `null` | Optional admin password to bootstrap on first run |
| `VDB_TRUST_PROXY` | No | `false` | Enable client IP extraction behind reverse proxies |
| `VDB_CORS_ORIGINS` | No | `*` | Allowed CORS origins (comma-separated) |
| `VDB_SQL_BUSY_TIMEOUT_MS`| No | `5000` | SQLite busy timeout retry in milliseconds |
| `VDB_MAX_REQUEST_BODY_MB`| No | `10` | Maximum JSON request body size in MB |
| `VDB_MAX_IMPORT_MB` | No | `1024` | Maximum file upload size for database imports |
| `VDB_MAX_QUERY_ROWS` | No | `100000` | Max rows returned per query execution |
| `VDB_QUERY_TIMEOUT_MS`| No | `0` | Query timeout limit in milliseconds (0 = disabled) |
| `VDB_LOG_LEVEL` | No | `info` | Logging level (`debug`, `info`, `warn`, `error`) |

---

## API Reference

All Data Plane requests (`/v1/...`) require an API Bearer token in the `Authorization` header: `Bearer vdb_live_...` or query parameter `?token=vdb_live_...`.

### 1. Parameterized SQL Query
- **Endpoint**: `POST /v1/databases/:databaseId/query`
- **Permissions**: `database:read` or `database:write`
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

### 2. Atomic Batch Transaction
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

### 3. Realtime SSE Stream
- **Endpoint**: `GET /v1/databases/:databaseId/realtime?table=users`
- **Permissions**: `database:read`
- **Response**: `text/event-stream` stream delivering real-time table mutations (`insert`, `update`, `delete`, `schema`).

### 4. Media Storage & HTTP 206 Streaming
- **Upload File**: `POST /v1/databases/:databaseId/files` (Multipart form-data)
- **List Files**: `GET /v1/databases/:databaseId/files`
- **Stream Media**: `GET /v1/files/:fileId/view` (Supports `Range: bytes=0-1048575` headers)
- **Delete File**: `DELETE /v1/databases/:databaseId/files/:fileId`

---

## Client SDKs

### TypeScript / Node.js
```bash
npm install @nullex/vanilladb
```

```typescript
import { VanillaDatabase } from '@nullex/vanilladb';

const db = new VanillaDatabase({
  url: 'http://localhost:3000/v1/databases/db_your_database_id',
  token: 'vdb_live_your_token_here'
});

// Parameterized SQL query
const { rows } = await db.query('SELECT * FROM users WHERE score > ?', [50]);

// Realtime SSE event subscription
const unsubscribe = db.subscribe((event) => {
  console.log('Realtime event:', event);
}, 'users');
```

---

## Keyboard Shortcuts

| Shortcut | Description |
| :--- | :--- |
| **`Ctrl + K`** | Open Command Palette / Universal search |
| **`Ctrl + B`** | Open Create Database modal |
| **`Ctrl + Shift + L`** | Toggle interface language (English / Vietnamese) |
| **`Alt + T`** *(or `Ctrl + Shift + T`)* | Toggle theme (Light / Dark) |
| **`Alt + 1` .. `Alt + 6`** | Navigate to Overview, Telemetry, Databases, Activity, Users, Settings |
| **`1 .. 9`** | Switch between Database Detail tabs |
| **`Shift + ?`** | Open Keyboard Shortcuts reference modal |
| **`Ctrl + Enter`** | Execute active query in SQL Console |
| **`Esc`** | Close active modals or Command Palette |

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

---

## Documentation Hub

Explore the full in-depth documentation modules:
- 📖 **[English Wiki](docs/en/Home.md)**
- 🇻🇳 **[Tài liệu Tiếng Việt](docs/vi/Home.md)**
- 💡 **[Practical Code Examples](docs/README.md#code-integration-examples)**

---

## License

This project is licensed under the [MIT License](LICENSE).  
Copyright (c) 2026 **Elaina2026**.
