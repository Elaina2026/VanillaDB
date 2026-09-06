# Media Storage & HTTP 206 Partial Streaming

VanillaDatabase includes a built-in media storage subsystem partitioned per tenant database with transparent authenticated encryption and video streaming capabilities.

---

## 1. Storage Architecture

- Files are stored on disk under: `data/storage/:databaseId/file_<nanoid>.<ext>`
- Metadata (file ID, size, MIME type, SHA-256 checksum, custom JSON metadata) is recorded in the central metadata database `files` table.
- **Path Traversal Protection**: All paths are sanitized with `path.basename()` and verified against `data/storage` root boundaries.

---

## 2. AES-256-GCM Data-at-Rest Encryption

Every file uploaded to VanillaDatabase is automatically encrypted before being written to disk:
- **Envelope Format**: `[VENC(4B)][SALT(16B)][IV(12B)][TAG(16B)][CIPHERTEXT]`
- Encryption key derived from system master key via PBKDF2 (100,000 rounds).
- Even if physical storage drives or volumes are inspected directly, raw file contents and media cannot be read without the master encryption key.

---

## 3. HTTP 206 Partial Content Range Streaming

When streaming video (`.mp4`, `.webm`) or audio (`.mp3`, `.wav`) files, modern browsers send `Range` headers to seek through tracks:
```http
GET /v1/files/file_abc123/view HTTP/1.1
Range: bytes=1048576-2097151
Authorization: Bearer vdb_live_...
```

VanillaDatabase handles range requests transparently:
1. Validates token permission and range boundaries.
2. Decrypts the requested segment on the fly.
3. Responds with `HTTP 206 Partial Content`:
```http
HTTP/1.1 206 Partial Content
Content-Range: bytes 1048576-2097151/15728640
Accept-Ranges: bytes
Content-Length: 1048576
Content-Type: video/mp4
```

This allows HTML `<video>` and `<audio>` players to scrub seamlessly across media files.
