# Changelog

All notable changes to **VanillaDatabase** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.4] - 2026-10-11

### Security
- **Complete Prohibition of Query String Tokens (RFC 6750)**: Permanently blocked `?token=...` across all endpoints, including GET streaming and media routes (`/realtime`, `/v1/files/:id/view`, `/v1/databases/:id/storage/:name`). Any request passing `?token=` is immediately rejected with HTTP 401 `QUERY_TOKEN_NOT_PERMITTED`.
- **Client SDK Ephemeral Ticket Auto-Provisioning**: Updated TypeScript SDK (`@nullex/vanilladb`) `subscribe()` to automatically acquire single-use 60s tickets (`vdb_ticket_*`) via `createTicket()` before establishing EventSource connections, ensuring master API tokens never leak into URLs. Added `getFileUrlWithTicket()` across TypeScript and Python SDKs.

## [1.3.3] - 2026-10-11

### Security
- **Query String Token Restrictions (RFC 6750)**: Prohibited `?token=...` on all data write and query routes (`/query`, `/batch`, `/exec`), rejecting requests with HTTP 401 `QUERY_TOKEN_NOT_PERMITTED` to eliminate token leakage via browser history, proxy logs, and `Referer` headers.
- **One-Time Tickets (VDB-SEC-03)**: Added `POST /v1/databases/:databaseId/tickets` issuing short-lived (60-second TTL), single-use tickets (`?ticket=vdb_ticket_...`) scoped strictly to a database and route for SSE streams (`EventSource`) and media tags. Emitted `Deprecation: true` and `Warning: 299` headers on legacy query token links with scheduled removal in **v1.3.4**. Redacted both `token` and `ticket` parameters in request logging.
- **Internal Binary Avatar Storage Pipeline**: Added `POST /api/auth/profile/avatar` (multipart, 10MB limit, strict binary magic byte validation for PNG, JPEG, WebP) persisting binary files to `data/storage/avatars/`. Served via `GET /api/auth/avatar/:userId` with `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, and cache headers. Added `DELETE /api/auth/profile/avatar`. Disallowed new external URLs and data URIs on `PUT /profile` (`EXTERNAL_AVATAR_DISALLOWED`) to eliminate third-party tracking pixels and database bloat.
- **Active File Content Isolation**: Enforced strict MIME allowlists, `Content-Disposition: attachment`, and `Content-Security-Policy: sandbox; default-src 'none'` for non-inline formats (SVG, XML, HTML, PDF).
- **Cluster Secret Comparison**: Transitioned cluster secret verification to fixed-length SHA-256 timing-safe evaluation (`safeCompareSecret`) with IP brute-force lockout.
- **External Link Hardening**: Enforced `rel="noopener noreferrer"` across all external browser window links (`target="_blank"`).
- **Reliable Cleanup Logging**: Replaced silent error swallowing on file unlinks with structured logging ignoring `ENOENT` while capturing operational errors (`removeFileQuiet`).

### Changed
- **Breaking Change for Custom Curl Scripts**: Scripts passing `?token=...` directly into `POST /query`, `POST /exec`, or `POST /batch` will receive HTTP 401 `QUERY_TOKEN_NOT_PERMITTED`. Clients must migrate to `-H "Authorization: Bearer <token>"`.
- **Query Token Removal Milestone**: Legacy query tokens on streaming endpoints (`/realtime`, `/view`, `/storage/`) will be completely prohibited starting in release **v1.3.4**.
- **System-Level Avatar Storage**: Avatar binary files are tracked under system assets (`data/storage/avatars/`), excluded from tenant database storage limits (`max_storage_mb`), and stored on the standalone Single-Gateway instance.
- **Frontend Avatar Architecture**: Replaced base64 data URIs and external URL inputs in `SettingsPage.tsx` with binary file selection, drag-and-drop, instant object URL preview, size/MIME validation, and avatar removal. Standardized all avatar rendering across `DashboardLayout`, `UsersPage`, `UserDashboardPage`, `UserAuditDrawer`, and `DatabaseDetailPage` using `UserAvatar` with fallback initials.

## [1.3.1] - 2026-08-30

### Fixed
- Fixed Cross-Origin-Opener-Policy (COOP) and Origin-Agent-Cluster browser console warnings when hosting VanillaDatabase directly on IP addresses / non-HTTPS origins.
- Configured Helmet security headers with `crossOriginOpenerPolicy: false` and `originAgentCluster: false` to allow seamless HTTP/IP dashboard access without browser isolation conflicts.

## [1.3.0] - 2026-08-30

### Changed
- Bumped core platform engine version to `1.3.0` across server health endpoints, web UI telemetry headers, and packages.
- Synchronized client SDK versions for npm (`@nullex/vanilladb`) and PyPI (`vanilladb`).

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
