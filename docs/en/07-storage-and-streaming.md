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
