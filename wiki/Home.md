# Home

VanillaDatabase (VanillaDB) is a self-hosted, multi-tenant SQLite cloud database engine featuring built-in REST API, Realtime Server-Sent Events (SSE), database-scoped media storage with HTTP 206 Partial Content range streaming, multi-database schema/data importer (MySQL, PostgreSQL, MongoDB, CSV), AES-256-GCM data-at-rest encryption, and native AI vector cosine similarity search.

---

## 🚀 Core Technical Highlights

- **0ms Cold Starts**: Zero sleep timeouts compared to free-tier cloud databases (Supabase, Neon, PlanetScale).
- **Ultra-Low Memory**: Operates reliably within **~35MB – 50MB RAM**.
- **Physical Multi-Tenancy**: Isolated database instances stored in dedicated `.db` files (`WAL mode`, `5000ms busy timeout`, `Foreign Keys ON`).
- **REST & Atomic Batch SQL**: Parameterized queries and ACID transaction batches over standard HTTP.
- **Data-at-Rest Encryption (AES-256-GCM)**: Automatic encryption for backup snapshots and media uploads using PBKDF2 derived keys (100,000 iterations). Built-in SQL crypto helper functions (`encrypt_aes`, `decrypt_aes`, `hash_sha256`, `hash_hmac`).
- **Multi-User RBAC & Quotas**: Role hierarchy (`super_admin`, `admin`, `user`), per-user database limits, and rate limit quotas.
- **Media Storage & Range 206 Streaming**: Direct file uploads with seekable HTTP 206 streaming and on-the-fly decryption.
- **Realtime Event Streams**: Instant change feeds (`insert`, `update`, `delete`, `schema`) dispatched over HTTP SSE.
- **HMAC-SHA256 Webhooks**: Signed webhook notifications sent upon data mutations.
- **AI Vector Search**: Native `vec_cosine_similarity` and `vec_cosine_distance` functions in SQLite.
- **Full-Text Search (FTS5)**: Fast keyword searches with `unicode61` tokenizer.
- **Automated Scheduled Backups**: WAL snapshot creation (hourly, daily, weekly) with retention policies and 1-click restore.
- **Web Dashboard**: Monaco SQL editor, table data grid browser, query profiler, user manager, storage manager, and real-time telemetry metrics.

---

## 📚 Documentation Index

1. [[01. Getting Started & Setup|01-Getting-Started-and-Setup]]
2. [[02. Migration & Import Guides|02-Migration-and-Import-Guides]]
3. [[03. Realtime SSE & Webhooks|03-Realtime-SSE-and-Webhooks]]
4. [[04. Storage & Media Streaming (Range 206)|04-Storage-and-Media-Streaming]]
5. [[05. SDKs & API Reference|05-SDKs-and-API-Reference]]
6. [[06. Security, Tokens & RBAC|06-Security-and-Permissions]]
7. [[07. AI Vector Search, FTS5 & Maintenance|07-AI-Vector-Search-and-Maintenance]]
