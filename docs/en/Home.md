# VanillaDatabase Documentation Wiki (English)

Welcome to the comprehensive technical documentation for **VanillaDatabase (VanillaDB)**.

---

## 📚 Table of Contents

1. [**Getting Started & Production Setup**](01-getting-started.md)
   - System requirements, installation steps, environment variables, first-time Super Admin bootstrap.
2. [**Architecture & Engine Design**](02-architecture.md)
   - Multi-tenant SQLite architecture, WAL mode, connection caching, Control Plane vs Data Plane separation.
3. [**Database Management & SQL Engine**](03-database-engine.md)
   - Schema management, parameterized queries, batch transactions, custom vector math & native crypto functions.
4. [**Data Plane & REST API Reference**](04-api-reference.md)
   - Detailed specification for SQL, batch, table CRUD, file storage, and query plan explain endpoints.
5. [**Authentication, RBAC & 2FA**](05-authentication-rbac-2fa.md)
   - User roles, quotas, API bearer tokens, sliding rate limiting, RFC 6238 TOTP, backup codes lifecycle, and dual recovery.
6. [**Realtime Event Streaming (SSE) & Webhooks**](06-realtime-and-webhooks.md)
   - Server-Sent Events, webhook event dispatcher, HMAC-SHA256 signatures, Slack & Discord embeds.
7. [**Media Storage & HTTP 206 Streaming**](07-storage-and-streaming.md)
   - File uploads, AES-256-GCM data-at-rest encryption, partial content range streaming.
8. [**Backup, Restore & Automated Scheduling**](08-backup-and-restore.md)
   - Snapshot creation, checksum integrity verification, point-in-time restore, background cron scheduling.
9. [**Multi-Database Dialect Importer & Converter**](09-migration-and-converter.md)
   - Migrating from MySQL, PostgreSQL, MongoDB / NDJSON, CSV, and SQLite binary files.
10. [**Deployment & Production Hardening**](10-deployment.md)
    - Systemd service configuration, Nginx reverse proxy with SSL, Docker Compose.
11. [**Troubleshooting & FAQ**](11-troubleshooting.md)
    - Common error codes, database busy resolution, port conflicts, permissions.
12. [**Development & Contributing**](12-development.md)
    - Codebase tour, running tests, benchmarks, and PR guidelines.

---

## 💡 Practical Code Examples

- [cURL API Integration Examples](../examples/curl.md)
- [Node.js & TypeScript SDK Examples](../examples/nodejs.md)

---

## 🌐 Language Options

- 🇻🇳 **[Tài liệu Tiếng Việt (Vietnamese Documentation)](../vi/Home.md)**
- 📖 **[Central Documentation Hub](../README.md)**
