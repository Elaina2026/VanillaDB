# Media Storage & HTTP 206 Streaming

Technical specification of database-scoped media storage, AES-256-GCM envelope encryption, path traversal defenses, and HTTP 206 Partial Content streaming in **VanillaDatabase**.

---

## 1. Storage Architecture & Partitioning

VanillaDatabase manages media assets partitioned strictly by tenant database:
- **Storage Location**: `data/storage/:databaseId/file_<nanoid>.<ext>`
- **Metadata Registry**: Central `files` table records `id`, `database_id`, `original_name`, `mime_type`, `size_bytes`, and `checksum`.
- **Path Traversal Protection**: File paths are strictly validated to prevent directory traversal (`../`). All lookups assert that resolved paths remain within `data/storage/:databaseId/`.

---

## 2. AES-256-GCM Envelope Encryption

Files stored on disk are encrypted before filesystem persistence:

```
+-----------+-----------+----------+-----------+----------------------+
| Header    | Salt      | IV/Nonce | Auth Tag  | Ciphertext Payload   |
| "VENC"    | 16 Bytes  | 12 Bytes | 16 Bytes  | Encrypted File Bytes |
| (4 Bytes) | (PBKDF2)  | (GCM)    | (GCM MAC) | (Variable Length)    |
+-----------+-----------+----------+-----------+----------------------+
```

- **Key Derivation**: PBKDF2-SHA256 with 100,000 iterations derives an ephemeral key from `VDB_MASTER_KEY` and the unique per-file salt.
- **Authenticated Decryption**: AES-256-GCM verifies ciphertext integrity before delivering data to the client, preventing tampering.

---

## 3. HTTP 206 Partial Content Range Streaming

When modern clients stream audio (`.mp3`, `.wav`) or video (`.mp4`, `.webm`) files, browsers issue HTTP `Range` request headers to seek:

```http
GET /v1/databases/:databaseId/storage/:fileId HTTP/1.1
Authorization: Bearer vdb_live_...
Range: bytes=1048576-2097151
```

### Server Handling
1. Validates the authorization token and ensures range boundaries fall within total file size.
2. Streams the requested byte slice with transparent decryption.
3. Responds with `HTTP 206 Partial Content`:

```http
HTTP/1.1 206 Partial Content
Accept-Ranges: bytes
Content-Range: bytes 1048576-2097151/15728640
Content-Length: 1048576
Content-Type: video/mp4
Content-Security-Policy: default-src 'none'; sandbox
X-Content-Type-Options: nosniff
```

This architecture enables seamless scrubbing and playback in web audio and video players.

---

## 4. File Upload & Foreign Key Validation

Technical specification of upload verification, error envelopes, and distributed cluster integrity:
- **Foreign Key Constraint**: The `files` metadata table strictly enforces `FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE`.
- **Pre-flight Parent Validation**: Before writing or streaming file bytes to disk, the server validates that `databaseId` exists in the metadata catalog. If the database does not exist, the API responds immediately with HTTP `404 Not Found` (`DATABASE_NOT_FOUND`) with the standard envelope `{ success: false, error: { code: 'DATABASE_NOT_FOUND', message: '...' } }`.
- **Worker Node Auto-Registration**: On distributed storage nodes hosting tenant databases directly on disk (`data/databases/:databaseId.sqlite`), existing database instances are auto-registered into the local metadata catalog to guarantee foreign key integrity for cluster proxy uploads.
- **Orphan File Cleanup Guarantee**: If file saving or database record insertion encounters any error, encrypted file artifacts on disk are immediately unlinked (`fs.unlinkSync`), guaranteeing zero orphaned disk files.
- **Metadata Normalization**: Optional metadata payloads are normalized to `NULL` when empty or whitespace-only.

---

## 5. Active Content Security & Isolation

- **MIME Allowlist & Forced Download**: Only safe static formats (`image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/avif`, `audio/*`, `video/*`) are served inline. Active and potentially executable formats (`image/svg+xml`, `text/html`, XML, PDF, scripts) strictly enforce `Content-Disposition: attachment; filename="..."` and `Content-Security-Policy: sandbox; default-src 'none'`.
- **MIME Normalization**: The server determines MIME types based on file extension and format verification rather than client headers.
- **Security Headers**: All file preview endpoints enforce `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`, and `Referrer-Policy: no-referrer`.
- **One-Time Tickets & Token Deprecation**: Direct API tokens in query strings (`?token=...`) on streaming routes are deprecated and scheduled for complete removal in **v1.3.4**, returning `Deprecation: true` response headers. For embedding in `<img src="...">`, `<audio src="...">`, `<video src="...">`, or `EventSource`, applications should request an ephemeral one-time ticket via `POST /v1/databases/:id/tickets` and pass `?ticket=vdb_ticket_...` (valid 60 seconds, single-use). All non-streaming routes reject query tokens with HTTP 401 `QUERY_TOKEN_NOT_PERMITTED`.

---

## 6. User Avatar Binary Storage Pipeline

- **Endpoint**: `POST /api/auth/profile/avatar` (multipart/form-data).
- **Size Limit**: 10 MB (`AVATAR_MAX_BYTES`). Uploads exceeding this threshold are immediately rejected with HTTP 413 `FILE_TOO_LARGE`.
- **Format Verification**: Client `Content-Type` headers and file extensions are ignored. File binaries are inspected directly for magic byte signatures (`image/png`, `image/jpeg`, `image/webp`). Disallowed formats (e.g. SVG, HTML, executable binaries) return HTTP 415 `UNSUPPORTED_MEDIA_TYPE`.
- **On-Disk Persistence**: Binary files are written atomically to `data/storage/avatars/:userId.<ext>` using temporary files and atomic rename. Previous avatars for the user are automatically purged.
- **Serving Endpoint**: `GET /api/auth/avatar/:userId` serves the raw image with `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, and `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`.
- **Deletion**: `DELETE /api/auth/profile/avatar` removes avatar files from disk and nullifies the database record.
- **Storage Accounting**: User avatars are stored at system level (`data/storage/avatars/`) and are strictly separate from tenant database quotas (`max_storage_mb`).
- **Single-Gateway Architecture**: Avatar files persist to local disk storage on the standalone gateway instance; no distributed multi-gateway shared storage is required.
- **Legacy Compatibility**: Accounts with legacy `avatar_url` values (`https://...` or `data:image/...`) continue to render seamlessly. `PUT /api/auth/profile` prohibits new external URLs/data URIs to prevent third-party tracking pixels.


