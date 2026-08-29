<p align="center">
  <img src="src/web/assets/logo.svg" alt="VanillaDatabase Logo" width="140" height="140" />
</p>

<h1 align="center">VanillaDatabase (VanillaDB)</h1>

<p align="center">
  <strong>Multi-Tenant SQLite Cloud Engine with Realtime Event Subscriptions, Database-Scoped Media Storage, Multi-Database Importer / Converter, Automated Backups, Webhooks, and AI Vector Search.</strong>
</p>

<p align="center">
  <a href="https://github.com/Elaina2026/VanillaDB/actions"><img src="https://img.shields.io/github/actions/workflow/status/Elaina2026/VanillaDB/ci.yml?branch=main&label=CI%2FCD&logo=github" alt="CI Status" /></a>
  <a href="https://www.npmjs.com/package/@nullex/vanilladb"><img src="https://img.shields.io/npm/v/@nullex/vanilladb?color=blue&logo=npm" alt="npm version" /></a>
  <a href="https://pypi.org/project/vanilladatabase/"><img src="https://img.shields.io/pypi/v/vanilladatabase?color=emerald&logo=pypi" alt="pypi version" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-22%2B-green.svg?logo=node.js" alt="Node Version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-purple.svg" alt="License" /></a>
</p>

<p align="center">
  <a href="#-why-vanilladb">Why VanillaDB?</a> •
  <a href="#-feature-comparison">Comparison</a> •
  <a href="#-key-features">Key Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-quickstart--deployment">Quickstart</a> •
  <a href="#-multi-database-importer--converter">Multi-DB Converter</a> •
  <a href="#-client-sdks">Client SDKs</a> •
  <a href="#-ai-vector-search--fts5">AI Vector & FTS5</a> •
  <a href="wiki/">📚 Wiki Docs</a>
</p>

---

## 💡 Why VanillaDB?

### 1. Eliminating Free Cloud DB Pain Points
- **Zero Cold Starts & Timeouts**: Free cloud databases (Supabase, Neon, PlanetScale) sleep after inactivity, leading to 5–30s wake-up freezes and `ETIMEDOUT` errors. VanillaDB runs local WAL-mode SQLite instances with **0ms cold start**.
- **Ultra-Low Memory Footprint**: Runs in **~35MB – 50MB RAM** instead of hundreds of megabytes.
- **Unified Engine**: Combines **Database (ACID SQL)**, **Realtime SSE Subscriptions**, and **Media Storage (HTTP 206 Streaming)** into a single, self-hosted container.

---

## 📊 Feature Comparison

| Feature | Free Cloud DBs (Neon / Supabase) | Standard PostgreSQL / MySQL | 🚀 VanillaDatabase |
| :--- | :--- | :--- | :--- |
| **Latency & Timeout** | Frequent cold-start timeouts | Connection-pool dependent | **0ms cold start, local SQLite WAL** |
| **RAM Footprint** | N/A (Serverless) | ~300MB – 1GB+ | **~35MB – 50MB RAM** |
| **Multi-Tenancy** | 1–2 DBs per account | Complex isolation | **Infinite isolated databases by ID** |
| **Multi-DB Converter** | Manual SQL conversion | Not supported | **Auto-converts MySQL, Postgres, Mongo, CSV** |
| **Media Storage** | Requires S3 / R2 addon | Not supported | **Built-in Storage + HTTP 206 Streaming** |
| **Realtime Events** | Requires Redis / Socket clusters | Requires extra setup | **Built-in Server-Sent Events (SSE)** |
| **Webhooks** | External workers required | External workers required | **Built-in HMAC-SHA256 Dispatcher** |
| **Monthly Cost** | Paid tiers escalate | High hosting costs | **$0 (Host on any VPS / Home Server)** |

---

## ✨ Key Features

- 🚀 **Multi-Tenant SQLite Engine**: Isolated SQLite database per tenant (`WAL Mode`, `5000ms Busy Timeout`, `Foreign Keys ON`).
- 🔐 **Data-at-Rest Encryption (AES-256-GCM)**: Automatic authenticated encryption for backups and media storage with PBKDF2 derived keys, plus SQL helper functions (`encrypt_aes`, `decrypt_aes`, `hash_sha256`, `hash_hmac`).
- 👥 **Multi-User RBAC & Quotas**: Role-based access control (`super_admin`, `admin`, `user`), per-user database quotas, and request rate limiting.
- 🔄 **Multi-Database Importer & Converter**: Auto-translates dumps from **MySQL**, **PostgreSQL**, **MongoDB (JSON/NDJSON)**, **CSV**, and **SQLite (.db)** into SQLite schemas and transactions.
- ⚡ **Realtime Event Stream (SSE)**: Live event feed (`insert`, `update`, `delete`, `schema`) over standard HTTP at `/v1/databases/:id/realtime`.
- 📁 **Database-Scoped Media Storage**: Direct file storage with **HTTP 206 Partial Content Range Streaming** (with transparent decryption) for audio and video playback.
- 🛠️ **Database Maintenance**: Run `VACUUM`, `PRAGMA wal_checkpoint(TRUNCATE)`, `PRAGMA integrity_check`, and `REINDEX` directly from dashboard.
- 🔀 **1-Click Database Branching / Cloning**: Duplicate databases instantly for dev or staging testing.
- 📊 **Visual Query Profiler & Telemetry**: Analyze `EXPLAIN QUERY PLAN` outputs and inspect real-time interactive charts (CPU, RAM, Disk, QPS, Latency, Network I/O).
- 🔔 **Webhooks Subsystem**: HMAC-SHA256 signed HTTP POST notifications dispatched upon data mutations.
- 🛡️ **Granular Bearer Tokens & Rate Limiting**: Scoped permissions (`read`, `write`, `ddl`, `admin`), table whitelisting/blacklisting, and token rate limiting.
- 🧠 **AI Vector Search & Embeddings**: Native `vec_cosine_similarity` and `vec_cosine_distance` SQL functions for RAG / AI agents.
- 🔍 **Full-Text Search (FTS5)**: Fast keyword search across Vietnamese and English Unicode text.
- ⏰ **Automated Scheduled Backups**: Hourly, daily, and weekly encrypted snapshots with retention cleanup.
- 💻 **Modern Web Dashboard**: Monaco SQL Editor, Table Data Grid Browser, User Management, Storage Explorer, and System Telemetry.

---

## 🏛️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Clients / SDKs / Web UI                           │
│     (@nullex/vanilladb, Python vanilladb, Discord Bot, Telegram Bot)    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
  ┌─────────────────────────────┐         ┌─────────────────────────────┐
  │ Control Plane (/api/admin)  │         │ Data Plane (/v1/databases)  │
  │ • Fastify Admin Auth        │         │ • API Bearer Token Guard    │
  │ • Database & Token Manager  │         │ • Token Rate Limiter (429)  │
  │ • Multi-DB SQL Translator   │         │ • Parameterized SQL Engine  │
  │ • Scheduled Backup Worker   │         │ • Atomic Batch Transaction  │
  │ • Webhook Event Dispatcher  │         │ • Realtime SSE Stream Bus   │
  │ • Activity & Audit Logger   │         │ • Media Storage (Range 206) │
  └──────────────┬──────────────┘         └──────────────┬──────────────┘
                 │                                       │
                 ▼                                       ▼
  ┌─────────────────────────────┐         ┌─────────────────────────────┐
  │ Metadata & Activity Store   │         │ Isolated Tenant Databases   │
  │ • metadata.db (Admin/Tokens)│         │ • data/databases/:id.db     │
  │ • data/backups/*.snap       │         │ • data/storage/:id/*        │
  └─────────────────────────────┘         └─────────────────────────────┘
```

---

## 🚀 Quickstart & Deployment

### 1. Docker Compose (Recommended)

Create `docker-compose.yml`:
```yaml
services:
  vanilladb:
    image: node:22-alpine
    container_name: vanilladb
    restart: unless-stopped
    working_dir: /app
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - VDB_PORT=3000
      - VDB_HOST=0.0.0.0
      - VDB_DATA_DIR=/app/data
      - VDB_SESSION_SECRET=super_secret_key_change_me_in_prod_at_least_32_chars
      - VDB_ADMIN_USERNAME=VanillaDatabase
      - VDB_ADMIN_PASSWORD=change_this_password_123!
    volumes:
      - ./data:/app/data
    command: >
      sh -c "npm install -g vanilladb && vanilladb start"
```

Start container:
```bash
docker compose up -d
```
Access dashboard at **`http://localhost:3000`**.

---

### 2. Local Node.js Setup (Node.js 22+)

```bash
git clone https://github.com/Elaina2026/VanillaDB.git
cd VanillaDB
npm install
cp .env.example .env
npm run build
npm start
```

---

### 3. Nginx Reverse Proxy with SSL (Zero Timeout)

```nginx
server {
    server_name db.yourdomain.com;

    client_max_body_size 1024M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable buffering for SSE Realtime and Range 206 Streaming
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        proxy_read_timeout 24h;
        proxy_send_timeout 24h;
    }
}
```

Issue SSL with Certbot:
```bash
sudo certbot --nginx -d db.yourdomain.com
```

---

## 🔄 Multi-Database Importer / Converter

### Supported Formats:
1. **MySQL Dump (`.sql`, `.dump`)**: Strips backticks, converts `AUTO_INCREMENT` $\rightarrow$ `AUTOINCREMENT`, removes `ENGINE=InnoDB`, `DEFAULT CHARSET`, comments, and extracts inline `KEY` definitions into standalone `CREATE INDEX`.
2. **PostgreSQL Dump (`.sql`, `.dump`)**: Converts `SERIAL` / `BIGSERIAL` $\rightarrow$ `INTEGER PRIMARY KEY AUTOINCREMENT`, strips `public.` schema prefixes, and translates `COPY table FROM stdin` blocks into standard `INSERT INTO` statements.
3. **MongoDB / JSON / NDJSON (`.json`, `.ndjson`, `.jsonl`)**: Automatically infers column types (`INTEGER`, `REAL`, `TEXT`), generates table DDL, and inserts records in an atomic transaction.
4. **CSV Tables (`.csv`)**: Ingests into existing tables or auto-creates tables from headers.
5. **SQLite Binary (`.sqlite`, `.db`)**: Direct binary database replacement.

---

## 📦 Client SDKs

### TypeScript / Node.js SDK (`@nullex/vanilladb`)

```bash
npm install @nullex/vanilladb
```

```typescript
import { VanillaDatabase } from '@nullex/vanilladb';

const db = new VanillaDatabase({
  url: 'https://db.yourdomain.com/v1/databases/db_production',
  token: 'vdb_live_your_token'
});

// 1. Parameterized SQL Query
interface User { id: number; username: string; coins: number; }
const { rows } = await db.query<User>(
  'SELECT id, username, coins FROM users WHERE coins >= ? ORDER BY coins DESC LIMIT ?',
  [100, 10]
);

// 2. Table CRUD Builder
const users = await db.from('users').select({ limit: 10, orderBy: 'coins', order: 'DESC' });
await db.from('users').insert({ username: 'elaina', coins: 500 });
await db.from('users').delete({ id: 1 });

// 3. Batch Transaction
await db.batch([
  { sql: 'UPDATE users SET coins = coins - ? WHERE id = ?', params: [50, 1] },
  { sql: 'UPDATE users SET coins = coins + ? WHERE id = ?', params: [50, 2] }
], true);

// 4. Realtime SSE Subscription
const unsubscribe = db.subscribe((event) => {
  console.log(`[Event] ${event.type}:`, event.data);
}, 'users');

// 5. Media Storage
const file = await db.uploadFile(imageBuffer, 'avatar.png', 'image/png');
console.log('Stream URL:', db.getFileUrl(file.id));
```

---

### Python SDK (`vanilladatabase`)

```bash
pip install vanilladatabase
```

```python
from vanilladb import VanillaDatabase

db = VanillaDatabase(
    url="https://db.yourdomain.com/v1/databases/db_production",
    token="vdb_live_your_token"
)

# Query
users = db.query("SELECT * FROM users WHERE score >= ?", [100])

# Table CRUD
db.table("users").insert({"username": "elaina", "score": 250})
rows = db.table("users").select(limit=10, order_by="score", order="DESC")

# Media Storage
uploaded = db.upload_file("avatar.png", filename="avatar.png", content_type="image/png")
print("Streaming URL:", db.get_file_url(uploaded["id"]))
```

---

## 🧠 AI Vector Search & FTS5

```sql
-- AI Vector Cosine Similarity Search
SELECT id, title, content,
       vec_cosine_similarity(embedding, '[0.012, 0.421, -0.198, 0.087]') as score
FROM document_embeddings
WHERE score > 0.75
ORDER BY score DESC
LIMIT 5;

-- Full-Text Search (FTS5)
CREATE VIRTUAL TABLE articles_fts USING fts5(title, content, tokenize='unicode61');
SELECT * FROM articles_fts WHERE articles_fts MATCH 'SQLite OR VanillaDB';
```

---

## 📚 Complete Wiki Documentation Suite

Detailed technical guides available in [`wiki/`](wiki/):

1. 📖 [**Getting Started & Production Setup**](wiki/01-Getting-Started-and-Setup.md)
2. 🔄 [**Migration & Import Guides**](wiki/02-Migration-and-Import-Guides.md)
3. ⚡ [**Realtime SSE & Webhooks**](wiki/03-Realtime-SSE-and-Webhooks.md)
4. 📁 [**Storage & Media Streaming (Range 206)**](wiki/04-Storage-and-Media-Streaming.md)
5. 📦 [**SDKs & API Reference**](wiki/05-SDKs-and-API-Reference.md)
6. 🛡️ [**Security, Tokens & Permissions**](wiki/06-Security-and-Permissions.md)
7. 🧠 [**AI Vector Search, FTS5 & Maintenance**](wiki/07-AI-Vector-Search-and-Maintenance.md)

---

## 🧪 Testing

```bash
npm test
```
*100% test coverage across Authentication, Batch Transactions, Sandboxing, Backup/Restore, Media Storage Range 206, Webhooks, SSE Realtime, AI Vector Math, and Multi-DB Dialect Converters.*

---

## 📄 License

Open-source under the [MIT License](LICENSE).  
Copyright (c) 2026 **Elaina2026**.
