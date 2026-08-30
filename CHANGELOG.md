# Changelog

All notable changes to **VanillaDatabase** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-08-30

### Added
- **Multi-Tenant SQLite Engine**: Native `node:sqlite` management with WAL mode, busy timeout, and connection pooling.
- **Control Plane & Data Plane**: Clear separation between admin management (`/api/*`) and public data plane (`/v1/*`).
- **Data-at-Rest Encryption (AES-256-GCM)**: Authenticated encryption for backups, media files, and SQL crypto helper functions (`encrypt_aes`, `decrypt_aes`, `hash_sha256`, `hash_hmac`).
- **Multi-User RBAC & Quotas**: 3-tier user roles (`super_admin`, `admin`, `user`), database quantity caps (`max_databases`), and per-user rate limiting.
- **Granular API Tokens**: Scoped permissions (`database:read`, `database:write`, `database:ddl`, `database:admin`), table whitelist/blacklist, expiration, and sliding-window rate limiting.
- **Realtime SSE Streams**: Server-Sent Events bus emitting live table mutations (`insert`, `update`, `delete`, `schema`).
- **Media Storage & Range 206 Streaming**: Transparent decryption and HTTP 206 Partial Content Range streaming for video/audio scrub playback.
- **Multi-Dialect Database Importer / Converter**: Ingests dumps from MySQL, PostgreSQL, MongoDB / NDJSON, CSV, and SQLite binary files with schema inference.
- **AI Vector Search**: Custom `vec_cosine_similarity` and `vec_cosine_distance` functions for RAG embeddings.
- **Automated Scheduled Backups**: Background cron scheduler for periodic snapshots with retention cleanup.
- **Webhooks Subsystem**: HMAC-SHA256 signed event notifications with native Discord and Slack embed formatting.
- **React 19 Web Dashboard**: Monaco SQL Editor, Table Data Grid Browser, Telemetry, and User Management.
