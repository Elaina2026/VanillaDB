<p align="center">
  <img src="src/web/assets/logo.svg" alt="Logo VanillaDatabase" width="130" height="130" />
</p>

<h1 align="center">VanillaDatabase (VanillaDB) - Tiếng Việt</h1>

<p align="center">
  <strong>Động cơ đám mây SQLite đa khách thuê (Multi-tenant) hiệu năng cao với REST & SQL APIs, luồng sự kiện Server-Sent Events (SSE), phát luồng media phân đoạn (HTTP 206), mã hóa dữ liệu tại chỗ AES-256-GCM, sao lưu tự động, webhooks và hàm toán học AI vector tích hợp.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/Gi%E1%BA%A5y%20ph%C3%A9p-MIT-blue.svg" alt="Giấy phép: MIT" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-22%2B-green.svg?logo=node.js" alt="Node.js 22+" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.8-blue.svg?logo=typescript" alt="TypeScript" /></a>
  <a href="https://fastify.dev/"><img src="https://img.shields.io/badge/Fastify-5.2-black.svg?logo=fastify" alt="Fastify" /></a>
  <a href="https://www.sqlite.org/"><img src="https://img.shields.io/badge/SQLite-node:sqlite%20(WAL)-003B57.svg?logo=sqlite" alt="SQLite" /></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Phi%C3%AAn%20b%E1%BA%A3n-1.3.2-orange.svg" alt="Phiên bản 1.3.2" /></a>
</p>

<p align="center">
  <a href="#tong-quan">Tổng quan</a> •
  <a href="README.md">English (EN)</a> •
  <a href="#tinh-nang-chinh">Tính năng chính</a> •
  <a href="#kien-truc-he-thong">Kiến trúc</a> •
  <a href="#cai-dat--khoi-chay-nhanh">Cài đặt nhanh</a> •
  <a href="#cau-hinh-bien-moi-truong">Cấu hình</a> •
  <a href="#tham-chieu-api">Tham chiếu API</a> •
  <a href="#client-sdks">SDKs</a> •
  <a href="#so-sanh">So sánh</a> •
  <a href="#phim-tat-he-thong">Phím tắt</a> •
  <a href="docs/vi/Home.md">Wiki Tiếng Việt</a> •
  <a href="docs/en/Home.md">Full Wiki (EN)</a>
</p>

---

## Tổng quan

**VanillaDatabase (VanillaDB)** là máy chủ cơ sở dữ liệu đa khách thuê gọn nhẹ, tự lưu trữ (self-hosted) được xây dựng trực tiếp trên nền tảng native Node.js 22+ (`node:sqlite`) và Fastify.

Thay vì phải duy trì các máy chủ cơ sở dữ liệu nặng nề cho từng ứng dụng hoặc công cụ nội bộ, VanillaDatabase quản lý **nhiều cơ sở dữ liệu SQLite độc lập** ngay trên ổ đĩa. Mỗi database hoạt động như một cụm khách thuê riêng với nhật ký WAL độc lập, mã truy cập API tokens, kho lưu trữ media, sao lưu tự động, webhooks và luồng realtime SSE.

### Đối tượng sử dụng chính
- **Nhà phát triển Full-Stack & Backend**: Thiết lập ngay backend đa khách thuê mà không cần cấu hình cụm PostgreSQL/MySQL phức tạp.
- **Lập trình viên Discord & Telegram Bot**: Lưu trữ dữ liệu bền vững với mức chiếm dụng RAM cực thấp (~35MB–50MB RAM toàn hệ thống).
- **Công cụ nội bộ & SaaS Startups**: Phân tách dữ liệu từng khách hàng thành các file `.sqlite` độc lập với kiểm soát quyền hạn và hạn mức ổ đĩa.
- **Edge / Homelab / Máy chủ VPS cấu hình thấp**: Cơ sở dữ liệu quan hệ chuẩn ACID với 0ms cold-start và không cần cài đặt thêm phần mềm phụ trợ.

---

## Tính năng chính

- 🚀 **Động cơ SQLite Đa Khách Thuê**: Tạo không giới hạn database độc lập theo ID (`db_<nanoid>`). Tự động bật chế độ WAL, cơ chế thử lại busy timeout, ràng buộc khóa ngoại Foreign Keys và cache kết nối 60 giây.
- 🔐 **Mã hóa dữ liệu tại chỗ (AES-256-GCM)**: Mã hóa phong bì xác thực (chữ ký `VENC`, khóa dẫn xuất PBKDF2) bảo vệ file sao lưu và các tệp nhị phân media.
- 👥 **Phân quyền RBAC & Hạn ngạch tài nguyên**: 3 cấp bậc người dùng (`super_admin`, `admin`, `user`) với giới hạn số lượng database tạo được (`max_databases`) và giới hạn tần suất gọi API (`rate_limit_per_minute`).
- 🛡️ **Mã API Token có phạm vi & Giới hạn tốc độ**: Tạo token (`vdb_live_*`, `vdb_test_*`) với quyền hạn chi tiết (`database:read`, `database:write`, `database:ddl`, `database:admin`), lọc danh sách bảng cho phép/chặn, thời gian hết hạn và thuật toán sliding-window rate limit.
- ⚡ **Luồng sự kiện thời gian thực (SSE)**: Tích hợp Server-Sent Events (`/v1/databases/:id/realtime`) truyền trực tiếp các thay đổi dữ liệu (`insert`, `update`, `delete`, `schema`) về frontend và SDK.
- 📁 **Kho lưu trữ Media theo Database**: Tải lên hình ảnh, âm thanh, video với giải mã trong suốt và **phát luồng HTTP 206 Partial Content Range Streaming** cho trình phát đa phương tiện.
- 🔄 **Bộ chuyển đổi & Nạp dữ liệu đa hệ quản trị**: Tự động chuyển đổi các bản xuất từ **MySQL**, **PostgreSQL**, **MongoDB / NDJSON**, **CSV** và tệp nhị phân **SQLite** (`.db`/`.sqlite`).
- 🧠 **Hàm tính toán AI Vector & Mật mã học**: Tích hợp sẵn trong câu lệnh SQL: `vec_cosine_similarity()`, `vec_cosine_distance()`, `encrypt_aes()`, `decrypt_aes()`, `hash_sha256()` và `hash_hmac()`.
- 📊 **Phân tích truy vấn trực quan & Telemetry**: Phân tích `EXPLAIN QUERY PLAN` phát hiện quét toàn bảng (Full Table Scan), biểu đồ giám sát tài nguyên (CPU, RAM, QPS, độ trễ, lưu lượng mạng) cập nhật thời gian thực 1 giây.
- 🔔 **Hệ thống Webhooks**: Tự động phát sự kiện POST bất đồng bộ kèm chữ ký xác thực HMAC-SHA256 (`X-Vanilla-Signature`), tùy biến lọc bảng và định dạng thông báo riêng cho Discord/Telegram/Slack.
- ⏰ **Tác vụ định kỳ (Cron Jobs)**: Lên lịch hẹn giờ chạy câu lệnh SQL định kỳ dọn dẹp, bảo trì hoặc sao lưu dữ liệu tự động ngay trong SQLite.
- 🔐 **Bảo mật 2FA & Khôi phục 2 lớp (Dual-Factor Recovery)**: Tích hợp mã OTP ứng dụng xác thực RFC 6238, cơ chế thử thách đăng nhập 6 số, 6 mã dự phòng (backup codes) theo dõi trạng thái active/used và trang khôi phục mật khẩu riêng biệt `#/reset-password`.
- 💻 **Giao diện Web Hiện đại**: Xây dựng trên React 19, Tailwind CSS, Monaco SQL Editor và TanStack Table v8.

---

## Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Clients / SDKs / Web UI                           │
│        (Browser Dashboard, TypeScript SDK, Python SDK, Bots)            │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
  ┌─────────────────────────────┐         ┌─────────────────────────────┐
  │ Control Plane (/api)        │         │ Data Plane (/v1)            │
  │ • Fastify Admin Session Auth│         │ • API Bearer Token Guard    │
  │ • Multi-User RBAC & Quotas  │         │ • Token Rate Limiter (429)  │
  │ • Database & Token Manager  │         │ • Parameterized SQL Engine  │
  │ • Multi-DB SQL Translator   │         │ • Atomic Batch Transaction  │
  │ • Scheduled Backup Worker   │         │ • Realtime SSE Stream Bus   │
  │ • Webhook Event Dispatcher  │         │ • Media Storage (Range 206) │
  └──────────────┬──────────────┘         └──────────────┬──────────────┘
                 │                                       │
                 ▼                                       ▼
  ┌─────────────────────────────┐         ┌─────────────────────────────┐
  │ Metadata & Activity Store   │         │ Isolated Tenant Databases   │
  │ • data/system/vanilladb.db  │         │ • data/databases/:id.db     │
  │ • data/backups/:id/*.sqlite │         │ • data/storage/:id/*        │
  └─────────────────────────────┘         └─────────────────────────────┘
```

---

## Cài đặt & Khởi chạy nhanh

### Yêu cầu hệ thống
- **Node.js**: `v22.0.0` trở lên (bắt buộc để sử dụng `node:sqlite`).
- **NPM**: `v10.0.0` trở lên.
- **Hệ điều hành**: Linux, macOS, hoặc Windows.

### Các bước cài đặt

```bash
# 1. Tải mã nguồn về máy
git clone https://github.com/Elaina2026/VanillaDB.git
cd VanillaDatabase

# 2. Cài đặt các thư viện phụ thuộc
npm install

# 3. Tạo file cấu hình môi trường
cp .env.example .env

# 4. Đóng gói mã nguồn (Build)
npm run build

# 5. Khởi chạy máy chủ
npm start
```

Mở trình duyệt tại địa chỉ **`http://localhost:3000`** để tạo tài khoản Super Administrator ban đầu.

---

## Cấu hình biến môi trường

Quản lý thông qua file `.env`:

| Biến môi trường | Bắt buộc | Mặc định | Ý nghĩa & Mô tả |
| :--- | :---: | :---: | :--- |
| `NODE_ENV` | Không | `development` | Môi trường chạy (`production` / `development`) |
| `VDB_HOST` | Không | `0.0.0.0` | Địa chỉ IP máy chủ lắng nghe |
| `VDB_PORT` | Không | `3000` | Cổng HTTP kết nối |
| `VDB_DATA_DIR` | Không | `./data` | Thư mục lưu trữ toàn bộ database và file sao lưu |
| `VDB_SESSION_SECRET` | Không | *Tự sinh* | Khóa bí mật ký cookie phiên làm việc (tối thiểu 32 ký tự) |
| `VDB_MASTER_KEY` | Không | *Tự sinh* | Khóa chủ mã hóa dữ liệu tại chỗ AES-256-GCM |
| `VDB_ADMIN_USERNAME` | Không | `null` | Tên đăng nhập admin tự tạo lần đầu chạy |
| `VDB_ADMIN_PASSWORD` | Không | `null` | Mật khẩu admin tự tạo lần đầu chạy |
| `VDB_TRUST_PROXY` | Không | `false` | Bật nhận diện IP qua header sau Reverse Proxy |
| `VDB_CORS_ORIGINS` | Không | `*` | Danh sách domain cho phép CORS (ngăn cách dấu phẩy) |
| `VDB_SQL_BUSY_TIMEOUT_MS`| Không | `5000`| Thời gian chờ thử lại khóa SQLite (milliseconds) |
| `VDB_MAX_REQUEST_BODY_MB`| Không | `10` | Kích thước tối đa của body JSON request (MB) |
| `VDB_MAX_IMPORT_MB` | Không | `1024` | Giới hạn dung lượng tải lên file database import (MB) |
| `VDB_MAX_QUERY_ROWS` | Không | `100000`| Giới hạn số dòng tối đa trả về trong một truy vấn |
| `VDB_QUERY_TIMEOUT_MS`| Không | `0` | Giới hạn thời gian truy vấn SQL (0 = không giới hạn) |
| `VDB_LOG_LEVEL` | Không | `info` | Mức độ chi tiết log (`debug`, `info`, `warn`, `error`) |

---

## Tham chiếu API

Mọi yêu cầu đến Data Plane (`/v1/...`) yêu cầu mã xác thực API Bearer token trong header: `Authorization: Bearer vdb_live_...` hoặc query parameter `?token=vdb_live_...`.

### 1. Truy vấn SQL có tham số hóa (Parameterized Query)
- **Endpoint**: `POST /v1/databases/:databaseId/query`
- **Quyền yêu cầu**: `database:read` hoặc `database:write`
- **Body**:
```json
{
  "sql": "SELECT id, username, score FROM users WHERE score >= ? ORDER BY score DESC LIMIT ?",
  "params": [100, 10]
}
```
- **Kết quả trả về**:
```json
{
  "success": true,
  "data": {
    "columns": ["id", "username", "score"],
    "rows": [
      { "id": 1, "username": "alice", "score": 250 }
    ],
    "rowCount": 1,
    "durationMs": 0.42
  }
}
```

### 2. Giao dịch Batch nguyên tử (Atomic Batch Transaction)
- **Endpoint**: `POST /v1/databases/:databaseId/batch`
- **Quyền yêu cầu**: `database:write`
- **Body**:
```json
{
  "transaction": true,
  "statements": [
    { "sql": "UPDATE accounts SET balance = balance - ? WHERE id = ?", "params": [50, "acc_1"] },
    { "sql": "UPDATE accounts SET balance = balance + ? WHERE id = ?", "params": [50, "acc_2"] }
  ]
}
```

### 3. Luồng sự kiện Realtime SSE
- **Endpoint**: `GET /v1/databases/:databaseId/realtime?table=users`
- **Quyền yêu cầu**: `database:read`
- **Mô tả**: Luồng `text/event-stream` truyền trực tiếp các sự kiện biến đổi dữ liệu (`insert`, `update`, `delete`, `schema`).

### 4. Kho lưu trữ Media & Phát luồng HTTP 206
- **Tải lên tệp**: `POST /v1/databases/:databaseId/files` (Multipart form-data)
- **Danh sách tệp**: `GET /v1/databases/:databaseId/files`
- **Phát luồng Video/Audio**: `GET /v1/files/:fileId/view` (Hỗ trợ header `Range: bytes=...`)
- **Xóa tệp**: `DELETE /v1/databases/:databaseId/files/:fileId`

---

## Client SDKs

### TypeScript / Node.js
```bash
npm install @nullex/vanilladb
```

```typescript
import { VanillaDatabase } from '@nullex/vanilladb';

const db = new VanillaDatabase({
  url: 'http://localhost:3000/v1/databases/db_your_database_id',
  token: 'vdb_live_your_token_here'
});

// Chạy truy vấn SQL với tham số
const { rows } = await db.query('SELECT * FROM users WHERE score > ?', [50]);

// Nhận sự kiện thời gian thực
const unsubscribe = db.subscribe((event) => {
  console.log('Sự kiện Realtime:', event);
}, 'users');
```

---

## Phím tắt hệ thống

| Phím tắt | Mô tả chức năng |
| :--- | :--- |
| **`Ctrl + K`** | Mở thanh tìm kiếm lệnh và database nhanh (Command Palette) |
| **`Ctrl + B`** | Mở nhanh cửa sổ tạo cơ sở dữ liệu mới |
| **`Ctrl + Shift + L`** | Chuyển đổi nhanh ngôn ngữ hiển thị (English ↔ Tiếng Việt) |
| **`Alt + T`** *(hoặc `Ctrl + Shift + T`)* | Chuyển đổi nhanh giao diện Sáng / Tối (Light / Dark) |
| **`Alt + 1` .. `Alt + 6`** | Chuyển nhanh qua lại giữa Overview, Telemetry, Databases, Activity, Users, Settings |
| **`1 .. 9`** | Chuyển nhanh giữa 9 tab chi tiết của database |
| **`Shift + ?`** | Mở bảng tra cứu phím tắt toàn năng |
| **`Ctrl + Enter`** | Thực thi câu lệnh SQL đang soạn thảo trong SQL Console |
| **`Esc`** | Đóng các modal popup hoặc thanh tìm kiếm lệnh |

---

## So sánh với các giải pháp khác

| Tiêu chí | VanillaDatabase | SQLite (Thuần) | PocketBase | Supabase (Cloud) |
| :--- | :--- | :--- | :--- | :--- |
| **Kiến trúc** | Máy chủ SQLite Đa Khách Thuê | Thư viện nhúng C | Database nhúng đơn lẻ (Go) | Cụm PostgreSQL quản lý |
| **Đa khách thuê** | Vô hạn database động | 1 file DB duy nhất | 1 file DB duy nhất | Đa instance / Tổ chức |
| **Cold Starts** | **0ms (Local WAL)** | 0ms | 0ms | 5s – 30s (Free tier tạm nghỉ) |
| **Mức tiêu thụ RAM**| **~35MB – 50MB** | Bộ nhớ tiến trình | ~30MB – 60MB | ~500MB – 1GB+ |
| **Mã hóa dữ liệu** | Tích hợp sẵn AES-256-GCM | Cần extension ngoài | Mức hệ điều hành | Mã hóa đám mây |
| **Kho Media** | Phát luồng HTTP 206 tích hợp | Không có | Lưu trữ đĩa tích hợp | Kho S3 tương thích |
| **Realtime** | Bus SSE tích hợp sẵn | Không có | SSE tích hợp sẵn | PostgreSQL Realtime (WAL) |

---

## Hệ thống tài liệu (Documentation Hub)

Xem chi tiết từng mô-đun kỹ thuật:
- 📖 **[Tài liệu Wiki Tiếng Việt](docs/vi/Home.md)**
- 🌐 **[English Documentation Wiki](docs/en/Home.md)**
- 💡 **[Ví dụ mẫu code tích hợp thực tế](docs/README.md#code-integration-examples)**

---

## Giấy phép (License)

Dự án được phát hành theo giấy phép [MIT License](LICENSE).  
Bản quyền (c) 2026 **Elaina2026**.
