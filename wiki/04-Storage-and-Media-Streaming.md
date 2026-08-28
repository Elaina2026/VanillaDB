# 04. Storage & Media Streaming

Architecture and endpoints for database-scoped file storage and HTTP 206 Partial Content Range streaming.

---

## 1. Overview
Media files reside on disk isolated per tenant database:
```
./data/storage/:databaseId/:fileId
```
File metadata (MIME type, original name, size, upload timestamp) is indexed inside `metadata.db`.

### Highlights:
- Native HTTP 206 Range streaming for video/audio seek operations.
- Zero external S3 dependencies.
- Token-authenticated access control.

---

## 2. API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/v1/databases/:id/files` | List files in database |
| `POST` | `/v1/databases/:id/files` | Upload media file (Multipart `file`) |
| `DELETE` | `/v1/databases/:id/files/:fileId` | Delete file from disk & metadata |
| `GET` | `/v1/files/:fileId/view` | Stream or download file (**HTTP 206 Partial Content**) |

---

## 3. TypeScript SDK File Operations

```typescript
import { VanillaDatabase } from '@nullex/vanilladb';
import fs from 'fs';

const db = new VanillaDatabase({
  url: 'https://db.yourdomain.com/v1/databases/db_production',
  token: 'vdb_live_token'
});

// Upload
const buffer = fs.readFileSync('./video.mp4');
const file = await db.uploadFile(buffer, 'video.mp4', 'video/mp4');

// Stream URL
const url = db.getFileUrl(file.id);
console.log('Stream URL:', url);
```

---

## 4. Python SDK File Operations

```python
from vanilladb import VanillaDatabase

db = VanillaDatabase(
    url="https://db.yourdomain.com/v1/databases/db_production",
    token="vdb_live_token"
)

# Upload from path
uploaded = db.upload_file("avatar.png", filename="avatar.png", content_type="image/png")

# Get view/stream URL
print(db.get_file_url(uploaded["id"]))

# List & Delete
files = db.list_files()
db.delete_file(uploaded["id"])
```
