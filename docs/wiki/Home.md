# VanillaDatabase Documentation Wiki

Welcome to the comprehensive technical documentation for **VanillaDatabase (VanillaDB)**.

---

## 📚 Table of Contents

1. [**Getting Started & Production Setup**](Getting-Started.md)
   - System requirements, installation, environment variables, first-time Super Admin bootstrap.
2. [**Architecture & Engine Design**](Architecture.md)
   - Multi-tenant SQLite architecture, WAL mode, memory caching, Control vs Data planes.
3. [**Database Management & SQL Engine**](Database.md)
   - Schema management, parameterized queries, batch transactions, custom vector math & crypto functions.
4. [**Data Plane & REST API Reference**](API.md)
   - Detailed specification for SQL, batch, table CRUD, file storage, and query explain endpoints.
5. [**Authentication, RBAC & Permissions**](Authentication.md)
   - User roles, quotas, API bearer tokens, rate limiting, and permission matrices.
6. [**Realtime Event Streaming (SSE) & Webhooks**](Realtime-and-Webhooks.md)
   - Server-Sent Events, webhook event dispatcher, HMAC-SHA256 signatures, Slack & Discord embeds.
7. [**Media Storage & HTTP 206 Streaming**](Storage-and-Streaming.md)
   - File uploads, AES-256-GCM data-at-rest encryption, partial content range streaming.
8. [**Backup, Restore & Automated Scheduling**](Backup-and-Restore.md)
   - Snapshot creation, checksum integrity verification, point-in-time restore, background cron scheduling.
9. [**Multi-Database Dialect Importer & Converter**](Import-and-Export.md)
   - Migrating from MySQL, PostgreSQL, MongoDB / NDJSON, CSV, and SQLite binary files.
10. [**Deployment & Production Hardening**](Deployment.md)
    - Systemd service configuration, Nginx reverse proxy with SSL, Docker Compose.
11. [**Troubleshooting & FAQ**](Troubleshooting.md)
    - Common error codes, database busy resolution, port conflicts, permissions.
12. [**Development & Contributing**](Development.md)
    - Codebase tour, running tests, benchmarks, and PR guidelines.
