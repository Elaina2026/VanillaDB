<p align="center">
  <img src="src/web/assets/logo.svg" alt="VanillaDatabase Logo" width="140" height="140" />
</p>

<h1 align="center">VanillaDatabase (VanillaDB)</h1>

<p align="center">
  <strong>Multi-Tenant SQLite Cloud Engine with Realtime Event Subscriptions, Database-Scoped Media Storage, Automated Backups, Webhooks, and AI Vector Search.</strong>
</p>

<p align="center">
  <a href="https://github.com/Elaina2026/VanillaDB/actions"><img src="https://img.shields.io/github/actions/workflow/status/Elaina2026/VanillaDB/ci.yml?branch=main&label=CI%2FCD&logo=github" alt="CI Status" /></a>
  <a href="https://www.npmjs.com/package/@nullex/vanilladb"><img src="https://img.shields.io/npm/v/@nullex/vanilladb?color=blue&logo=npm" alt="npm version" /></a>
  <a href="https://pypi.org/project/vanilladb/"><img src="https://img.shields.io/pypi/v/vanilladb?color=emerald&logo=pypi" alt="pypi version" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-20%2B-green.svg?logo=node.js" alt="Node Version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-purple.svg" alt="License" /></a>
</p>

<p align="center">
  <a href="#-lý-do-ra-đời--câu-chuyện-dự-án-why-vanilladb">Lý do ra đời</a> •
  <a href="#-bảng-so-sánh-tính-năng-comparison">So sánh</a> •
  <a href="#-tính-năng-nổi-bật-key-features">Tính năng nổi bật</a> •
  <a href="#-kiến-trúc-hệ-thống-architecture">Kiến trúc</a> •
  <a href="#-hướng-dẫn-cài-đặt--triển-khai-từ-a-z-quickstart--deployment">Triển khai A-Z</a> •
  <a href="#-client-sdks-đầy-đủ">Client SDKs</a> •
  <a href="#-ai-vector-search--full-text-search-fts5">AI Vector & FTS5</a> •
  <a href="#-api-reference-toàn-diện">API Reference</a> •
  <a href="#-thư-mục-code-mẫu-examples">Code Mẫu</a>
</p>

---

## 💡 Lý do ra đời & Câu chuyện dự án (Why VanillaDB?)

### 1. Nỗi đau khi sử dụng các dịch vụ Database Miễn Phí (Free Cloud DBs)
Khi phát triển bot Discord, bot Telegram, ứng dụng AI hay các dự án web cá nhân, việc tìm một cơ sở dữ liệu cloud ổn định luôn là bài toán đau đầu:
- **Lỗi Timeout & Cold Start**: Các database miễn phí (Supabase, Neon, PlanetScale, Render, CockroachDB free tier...) thường tự động "ngủ" (pause/sleep) sau vài ngày không có request. Khi bot hoặc web gọi đến, request bị treo từ **5 – 30 giây** để đánh thức database dẫn đến **`ETIMEDOUT`** hoặc **`Connection Terminated`**.
- **Giới hạn khắt khe**: Bị giới hạn số lượng connection pool, giới hạn số request/tháng, và dễ bị khóa tài khoản hoặc mất dữ liệu bất ngờ khi vượt quota.
- **Hệ thống phân mảnh & cồng kềnh**: Khi làm một con bot cần cả **Database (lưu điểm/inventory)**, **Realtime Live Update**, và **Lưu trữ ảnh/video (Media Storage)**, lập trình viên buộc phải ghép nối PostgreSQL + Redis + AWS S3 / Cloudflare R2, cấu hình cực kỳ phức tạp và tốn kém.

### 2. Tận dụng máy chủ sẵn có (Spare VPS Host)
Nhận thấy mình có sẵn một máy chủ (VPS/Host) đang dư dả tài nguyên, tác giả quyết định xây dựng **VanillaDatabase**:
> **Biến sức mạnh siêu tốc, siêu nhẹ của SQLite thuần (`node:sqlite` WAL mode) thành một Nền Tảng Database Cloud hoàn chỉnh**, tự host trên chính server của mình — **Không bao giờ timeout, không có độ trễ kết nối, không tốn chi phí hàng tháng, và tích hợp sẵn mọi công cụ cần thiết trong 1 container duy nhất!**

---

## 📊 Bảng so sánh tính năng (Comparison)

| Tiêu chí | Free Cloud DBs (Neon, Supabase free) | PostgreSQL / MySQL truyền thống | 🚀 VanillaDatabase |
| :--- | :--- | :--- | :--- |
| **Độ trễ & Timeout** | Hay bị Timeout do Cold Start / Sleep | Phụ thuộc cấu hình Connection Pool | **0ms Cold Start, SQLite WAL cục bộ không bao giờ timeout** |
| **Tiêu thụ RAM** | N/A (Serverless giới hạn) | ~300MB – 1GB+ RAM | **Siêu nhẹ (~35MB – 50MB RAM)** |
| **Multi-Tenancy** | Giới hạn 1-2 DB / tài khoản | Khó sao lưu & cô lập từng tenant | **Tạo vô số Database độc lập theo ID/Slug** |
| **Media Storage** | Phải mua thêm S3 / MinIO | Không hỗ trợ | **Tích hợp sẵn Storage + HTTP 206 Range Streaming** |
| **Realtime Event** | Cần WebSocket cluster / Redis PubSub | Phải cài thêm Redis / Socket.IO | **Tích hợp sẵn Server-Sent Events (SSE) theo bảng** |
| **Webhooks** | Cần viết cron worker riêng | Cần dịch vụ ngoài | **Tích hợp sẵn HMAC-SHA256 Dispatcher** |
| **Chi phí** | Dễ phát sinh phí khi vượt mức free | Chi phí duy trì server lớn | **0đ (Tận dụng VPS / Server cá nhân)** |

---

## ✨ Tính năng nổi bật (Key Features)

- 🚀 **Multi-Tenant SQLite Engine**: Mỗi database là một file SQLite độc lập (`WAL Mode` + `Busy Timeout 5000ms` + `PRAGMA foreign_keys = ON`), cô lập hoàn toàn giữa các ứng dụng.
- ⚡ **Realtime Event Stream (SSE)**: Lắng nghe sự kiện live `insert`, `update`, `delete`, `schema` qua Server-Sent Events chuẩn HTTP (`/v1/databases/:id/realtime`).
- 📁 **Database-Scoped Media Storage**: Lưu trữ hình ảnh, video, âm thanh, tài liệu thuộc quyền quản lý của database; hỗ trợ **HTTP 206 Partial Content Range Streaming** xem video mượt mà không load toàn bộ file vào RAM.
- 🔔 **Webhooks Subsystem**: Tự động gửi HTTP POST payload kèm chữ ký bảo mật **HMAC-SHA256** (`X-Vanilla-Signature`) tới Discord Bot, Telegram webhook hoặc Backend Server khi dữ liệu thay đổi.
- 🛡️ **Granular API Tokens & Rate Limiting**: Cấp API Token phân quyền linh hoạt (`read`, `write`, `ddl`, `admin`), giới hạn danh sách bảng truy cập (`allowedTables`, `deniedTables`), và giới hạn tốc độ truy vấn (Rate Limit chống spam/DDoS).
- 🧠 **AI Vector Search & Embeddings**: Tích hợp sẵn hàm toán học vector `vec_cosine_similarity` và `vec_cosine_distance` trong SQL phục vụ RAG / AI Chatbot.
- 🔍 **Full-Text Search (FTS5)**: Hỗ trợ tạo bảng ảo SQLite FTS5 tìm kiếm toàn văn siêu tốc.
- 📦 **Import & Export Đa Định Dạng**: Xuất/nhập dữ liệu trực tiếp dạng **SQL dump**, **CSV**, **JSON**, hoặc nạp trực tiếp file nhị phân **SQLite (.db / .sqlite)** từ Web UI.
- ⏰ **Automated Scheduled Backups**: Worker tự động tạo snapshot định kỳ (`hourly`, `daily`, `weekly`) và dọn dẹp theo thời hạn (`backup_retention`).
- 💻 **Modern Web UI Dashboard**: Bảng điều khiển quản trị trực quan với Schema Designer, Table Data Grid Browser (CRUD trực tiếp), SQL Editor Monaco, Storage Explorer, và Live Event Monitor.

---

## 🏛️ Kiến trúc hệ thống (Architecture)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Clients / SDKs / Web UI                           │
│     (@nullex/vanilladb, Python vanilladb, Discord Bot, Telegram Bot)    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
  ┌─────────────────────────────┐         ┌─────────────────────────────┐
  │ Control Plane (/api/admin)  │         │ Data Plane (/v1/databases)  │
  │ • Fastify Admin API Auth    │         │ • API Bearer Token Guard    │
  │ • Database & Token Manager  │         │ • Token Rate Limiter (429)  │
  │ • Scheduled Backup Worker   │         │ • Parameterized SQL Engine  │
  │ • Webhook Event Dispatcher  │         │ • Atomic Batch Transaction  │
  │ • Import / Export Engine    │         │ • Realtime SSE Stream Bus   │
  └──────────────┬──────────────┘         │ • Media Storage (Range 206) │
                 │                        └──────────────┬──────────────┘
                 ▼                                       ▼
  ┌─────────────────────────────┐         ┌─────────────────────────────┐
  │ Metadata & Activity Store   │         │ Isolated Tenant Databases   │
  │ • metadata.db (Admin/Tokens)│         │ • data/databases/:id.db     │
  │ • data/backups/*.snap       │         │ • data/storage/:id/*        │
  └─────────────────────────────┘         └─────────────────────────────┘
```

---

## 🚀 Hướng dẫn cài đặt & Triển khai từ A-Z (Quickstart & Deployment)

### Cách 1: Triển khai nhanh bằng Docker Compose (Khuyên dùng)

Tạo file `docker-compose.yml`:

```yaml
services:
  vanilladb:
    image: node:22-alpine
    container_name: vanilladb
    restart: unless-stopped
    working_dir: /app
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - HOST=0.0.0.0
      - VDB_DATA_DIR=/app/data
      - VDB_SESSION_SECRET=super_secret_session_key_change_me_in_prod
      - VDB_ADMIN_USERNAME=VanillaDatabase
      - VDB_ADMIN_PASSWORD=change_this_password_123!
    volumes:
      - ./data:/app/data
    command: >
      sh -c "npm install -g vanilladb && vanilladb start"
```

Khởi chạy container:
```bash
docker compose up -d
```

Truy cập Dashboard tại: **`http://localhost:3000`** (hoặc IP máy chủ của bạn).

---

### Cách 2: Triển khai từ mã nguồn (Node.js 20+)

```bash
# 1. Clone repository
git clone https://github.com/Elaina2026/VanillaDB.git
cd VanillaDB

# 2. Cài đặt dependencies
npm install

# 3. Tạo file cấu hình môi trường
cp .env.example .env

# 4. Build giao diện Web UI và Server
npm run build

# 5. Khởi chạy Production Server
npm start
```

---

### Cách 3: Cấu hình Nginx Reverse Proxy & SSL (HTTPS) cho VPS

Nếu bạn chạy trên VPS có domain:

```nginx
server {
    server_name db.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Cấu hình cho Server-Sent Events (SSE Realtime)
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        proxy_read_timeout 24h;
    }
}
```

---

## 📦 Client SDKs Đầy Đủ

### 1. TypeScript / Node.js SDK (`@nullex/vanilladb`)

> ⚠️ **Lưu ý về tài khoản**: Gói npm chính thức được phát hành dưới scope `@nullex/vanilladb` (tài khoản npm của **Elaina2026**). Người dùng có username `nullex` trên GitHub không liên quan đến tác giả dự án này.

**Cài đặt:**
```bash
npm install @nullex/vanilladb
```

**Sử dụng:**
```typescript
import { VanillaDatabase } from '@nullex/vanilladb';
import fs from 'node:fs';

const db = new VanillaDatabase({
  url: 'http://localhost:3000/v1/databases/db_discord_bot',
  token: 'vdb_live_your_api_token_here'
});

// 1. Parameterized SQL Query (SELECT / INSERT / UPDATE / DELETE)
interface User {
  id: number;
  username: string;
  coins: number;
}
const { rows } = await db.query<User>(
  'SELECT id, username, coins FROM users WHERE coins >= ? ORDER BY coins DESC LIMIT ?',
  [100, 10]
);
console.log('Top Users:', rows);

// 2. Atomic Batch Transaction (ACID)
await db.batch([
  { sql: 'UPDATE users SET coins = coins - ? WHERE id = ?', params: [50, 1] },
  { sql: 'UPDATE users SET coins = coins + ? WHERE id = ?', params: [50, 2] },
  { sql: 'INSERT INTO transfers (from_id, to_id, amount) VALUES (?, ?, ?)', params: [1, 2, 50] }
], true);

// 3. Realtime SSE Live Events Subscription
const unsubscribe = db.subscribe((event) => {
  console.log(`[Live Event] Type: ${event.type} | Table: ${event.table}`, event.data);
}, 'users');

// 4. Media Storage (Upload & Streaming Range 206)
const imageBuffer = fs.readFileSync('./avatar.png');
const file = await db.uploadFile(imageBuffer, 'avatar.png', 'image/png');
console.log('File ID:', file.id);
console.log('Stream URL:', db.getFileUrl(file.id));

// Liệt kê danh sách file trong database
const files = await db.listFiles();
```

---

### 2. Python SDK (`vanilladb`)

**Cài đặt:**
```bash
pip install vanilladb
```

**Sử dụng:**
```python
from vanilladb import VanillaDatabase

db = VanillaDatabase(
    url="http://localhost:3000/v1/databases/db_telegram_bot",
    token="vdb_live_your_api_token_here"
)

# 1. Parameterized Query
res = db.query("SELECT * FROM telegram_users WHERE chat_id = ?", [123456789])
print("User Data:", res["rows"])

# 2. Batch Execution
db.batch([
    {"sql": "INSERT INTO telegram_users (chat_id, username) VALUES (?, ?)", "params": [12345, "alice"]},
    {"sql": "INSERT INTO logs (event) VALUES (?)", "params": ["user_joined"]}
], transaction=True)

# 3. Media Storage Upload
file_info = db.upload_file("video.mp4", filename="intro.mp4", content_type="video/mp4")
print("File Streaming URL:", db.get_file_url(file_info["id"]))
```

---

## 🧠 AI Vector Search & Full-Text Search (FTS5)

### 1. Vector Cosine Similarity (Native Embeddings Search)
VanillaDatabase tích hợp sẵn các hàm tính toán vector trong nhân SQLite, cực kỳ hữu ích cho các ứng dụng **RAG / AI Chatbot**:
- `vec_cosine_similarity(vec1, vec2)`: Điểm tương đồng Cosine (0.0 đến 1.0; 1.0 là khớp hoàn toàn).
- `vec_cosine_distance(vec1, vec2)`: Khoảng cách Cosine (0.0 là giống nhau hoàn toàn).

```sql
-- Tìm 5 tài liệu liên quan nhất theo vector embedding:
SELECT id, title, content,
       vec_cosine_similarity(embedding, '[0.012, 0.421, -0.198, 0.087]') as score
FROM document_embeddings
WHERE score > 0.75
ORDER BY score DESC
LIMIT 5;
```

### 2. Full-Text Search (FTS5)
Tạo bảng ảo SQLite FTS5 để tìm kiếm văn bản tiếng Việt / tiếng Anh có dấu cực nhanh:
```sql
-- Tạo bảng ảo FTS5
CREATE VIRTUAL TABLE articles_fts USING fts5(title, content, tokenize='unicode61');

-- Thêm dữ liệu
INSERT INTO articles_fts (title, content) VALUES ('Hướng dẫn VanillaDB', 'SQLite Cloud Engine siêu nhẹ và ổn định');

-- Tìm kiếm toàn văn
SELECT * FROM articles_fts WHERE articles_fts MATCH 'SQLite OR VanillaDB';
```

---

## 📡 API Reference Toàn Diện

### 1. Data Plane APIs (Xác thực bằng `Authorization: Bearer <API_TOKEN>`)

| Phương thức | Endpoint | Mô tả |
| :--- | :--- | :--- |
| `POST` | `/v1/databases/:id/query` | Thực thi câu lệnh SQL có tham số (`sql`, `params`) |
| `POST` | `/v1/databases/:id/batch` | Chạy nhiều câu lệnh SQL trong Atomic Transaction (`transaction: true`) |
| `GET` | `/v1/databases/:id/realtime` | Server-Sent Events (SSE) stream nhận live events (`insert`, `update`, `delete`, `schema`) |
| `GET` | `/v1/databases/:id/files` | Danh sách files media thuộc database |
| `POST` | `/v1/databases/:id/files` | Tải lên file media mới (Multipart form-data field: `file`) |
| `GET` | `/v1/files/:fileId/view` | Xem & stream file media (**HTTP 206 Partial Content Range**) |

---

### 2. Control Plane APIs (Quản trị Admin)

| Phương thức | Endpoint | Mô tả |
| :--- | :--- | :--- |
| `POST` | `/api/auth/setup` / `/login` | Khởi tạo tài khoản Admin & đăng nhập quản trị |
| `GET` / `POST` | `/api/admin/databases` | Lấy danh sách hoặc tạo database mới |
| `GET` / `POST` | `/api/admin/databases/:id/tokens` | Cấp API Token phân quyền & cấu hình Rate Limit |
| `GET` / `POST` | `/api/admin/databases/:id/webhooks` | Cấu hình URL Webhook push sự kiện HMAC-SHA256 |
| `GET` | `/api/admin/databases/:id/export` | Xuất dữ liệu ra file `.sql`, `.csv`, `.json` |
| `POST` | `/api/admin/databases/:id/import` | Nạp file `.sql`, `.sqlite`, `.db`, `.csv` trực tiếp vào database |
| `POST` | `/api/admin/databases/:id/backups` | Tạo snapshot sao lưu tức thì hoặc khôi phục snapshot |

---

## 💡 Thư mục Code Mẫu (Examples)

Dự án có sẵn mã nguồn mẫu chạy thực tế trong thư mục [`examples/`](examples/):
- 🤖 **[`examples/discord-bot-nodejs`](examples/discord-bot-nodejs/)**: Bot Discord hoàn chỉnh quản lý Level, EXP, Daily claim bằng Transaction và lắng nghe Realtime SSE.
- 📱 **[`examples/telegram-bot-python`](examples/telegram-bot-python/)**: Bot Telegram lưu trữ thông tin người dùng và tự động đẩy ảnh media gửi từ Telegram vào VanillaDB Media Storage.
- 🌐 **[`examples/nextjs-crud-app`](examples/nextjs-crud-app/)**: Fullstack Next.js App sử dụng API Route kết nối qua `@nullex/vanilladb`.

---

## 🧪 Kiểm thử (Testing)

Dự án đi kèm bộ kiểm thử tự động toàn diện kiểm tra mọi tính năng:
```bash
npm test
```
*Kết quả: 16/16 test suites đạt 100% (Authentication, DDL, DML, Batch Transactions, Sandboxing, Backup/Restore, Media Storage 206, Webhooks, SSE Realtime, AI Vector Math, Token Rate Limiting).*

---

## 📄 Giấy phép (License)

Dự án được phát hành mã nguồn mở theo giấy phép [MIT License](LICENSE).  
Copyright (c) 2026 **Elaina2026**.
