# VanillaDatabase Documentation Wiki (English)

Welcome to the technical documentation wiki for **VanillaDatabase (VanillaDB)**.

---

## Navigation & Language Options

- **Documentation Hub**: [Central Hub](../README.md)
- **Vietnamese Version**: [Tài liệu Tiếng Việt](../vi/Home.md)
- **Source Repository**: [GitHub Repository](https://github.com/Elaina2026/VanillaDB)

---

## Table of Contents

### [MODULE 01] Getting Started & Setup
- File: [01-getting-started.md](01-getting-started.md)
- Topics: System prerequisites, environment configuration, first-time Super Admin initialization, CLI admin reset commands, quick health probe.

### [MODULE 02] Architecture & Engine Design
- File: [02-architecture.md](02-architecture.md)
- Topics: Multi-tenant SQLite architecture, Write-Ahead Logging (WAL mode), Control Plane vs Data Plane separation, handle caching, and memory footprint.

### [MODULE 03] Database Management & SQL Engine
- File: [03-database-engine.md](03-database-engine.md)
- Topics: Database creation and lifecycle, schema inspection, parameterized query execution, batch transactions, AI vector math functions, and cryptographic SQL helpers.

### [MODULE 04] Data Plane & REST API Reference
- File: [04-api-reference.md](04-api-reference.md)
- Topics: Detailed HTTP specifications for `/v1/databases/:id/query`, `/exec`, `/batch`, `/tables`, `/schema`, `/realtime`, and `/storage`.

### [MODULE 05] Authentication, RBAC & 2FA Security
- File: [05-authentication-rbac-2fa.md](05-authentication-rbac-2fa.md)
- Topics: System roles (`super_admin`, `admin`, `user`), database membership (`owner`, `admin`, `editor`, `viewer`), API bearer tokens, session revocation (`VDB-SEC-01`), TOTP replay prevention (`VDB-SEC-02`), and backup recovery codes.

### [MODULE 06] Realtime Event Streaming (SSE) & Webhooks
- File: [06-realtime-and-webhooks.md](06-realtime-and-webhooks.md)
- Topics: Server-Sent Events client connection, table mutation event payloads, asynchronous webhook dispatcher, HMAC-SHA256 request signing, and SSRF prevention.

### [MODULE 07] Media Storage & HTTP 206 Streaming
- File: [07-storage-and-streaming.md](07-storage-and-streaming.md)
- Topics: Database-scoped media storage, transparent AES-256-GCM chunked encryption, and HTTP 206 Partial Content range streaming for audio/video scrub playback.

### [MODULE 08] Backup, Restore & Automated Scheduling
- File: [08-backup-and-restore.md](08-backup-and-restore.md)
- Topics: Instant snapshot generation, SHA-256 checksum verification, point-in-time database restoration, and background scheduled maintenance worker.

### [MODULE 09] Multi-Database Dialect Importer & Converter
- File: [09-migration-and-converter.md](09-migration-and-converter.md)
- Topics: Migrating data from MySQL, PostgreSQL, MongoDB / NDJSON, CSV, and native binary SQLite databases.

### [MODULE 10] Production Deployment & Cloudflare Operations
- File: [10-deployment.md](10-deployment.md)
- Topics: Production deployment guidelines, systemd service setup, Cloudflare SSL Flexible + Origin Rules port rewriting, Docker Compose, and zero-downtime upgrades.

### [MODULE 11] Troubleshooting & Diagnostic Guide
- File: [11-troubleshooting.md](11-troubleshooting.md)
- Topics: Resolving `SQLITE_BUSY` lock contention, MIME type issues, memory management, session troubleshooting, and recovery procedures.

### [MODULE 12] Development & Contributing Guidelines
- File: [12-development.md](12-development.md)
- Topics: Local environment setup, test suite execution (Vitest 94/94), build verification, architectural coding standards, and PR workflows.

---

## Practical Code Examples

- [cURL API Integration Examples](../examples/curl.md)
- [Node.js & TypeScript SDK Examples](../examples/nodejs.md)
