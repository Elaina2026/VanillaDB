<p align="center">
  <img src="src/web/assets/logo.svg" alt="Logo VanillaDatabase" width="130" height="130" />
</p>

<h1 align="center">VanillaDatabase (VanillaDB) - Tiếng Việt</h1>

<p align="center">
  <strong>Động cơ đám mây SQLite đa khách thuê (Multi-tenant) hiệu năng cao với REST & SQL APIs, luồng sự kiện Server-Sent Events (SSE), phát luồng media phân đoạn (HTTP 206), mã hóa dữ liệu tại chỗ AES-256-GCM, sao lưu tự động, webhooks và hàm toán học AI vector tích hợp.</strong>
</p>

<p align="center">
  <a href="README.md">English README</a> •
  <a href="#tong-quan">Tổng quan</a> •
  <a href="#tinh-nang-chinh">Tính năng chính</a> •
  <a href="#kien-truc-he-thong">Kiến trúc</a> •
  <a href="#cai-dat--khoi-chay-nhanh">Cài đặt nhanh</a> •
  <a href="#bien-moi-truong">Cấu hình</a> •
  <a href="#tai-lieu-api">Tài liệu API</a> •
  <a href="#client-sdks">SDKs</a> •
  <a href="#phim-tat-he-thong">Phím tắt</a> •
  <a href="docs/wiki/vi/Home.md">Tài liệu Wiki Tiếng Việt</a>
</p>

---

## Tổng quan

**VanillaDatabase (VanillaDB)** là máy chủ cơ sở dữ liệu đa khách thuê gọn nhẹ, tự lưu trữ (self-hosted) được xây dựng 100% trên nền tảng native Node.js 22+ (`node:sqlite`) và Fastify.

Thay vì phải duy trì các máy chủ cơ sở dữ liệu nặng nề cho từng ứng dụng hoặc công cụ nội bộ, VanillaDatabase quản lý **nhiều cơ sở dữ liệu SQLite độc lập** ngay trên ổ đĩa. Mỗi database hoạt động như một cụm khách thuê độc lập với nhật ký WAL riêng, mã truy cập API tokens, kho lưu trữ media, sao lưu tự động, webhooks và luồng realtime SSE.

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
- 🔑 **WebAuthn / Passkeys**: Đăng nhập trang quản trị an toàn bằng vân tay, Touch ID hoặc Windows Hello không cần nhập mật khẩu.
- 🌐 **Hỗ trợ đa ngôn ngữ (i18n)**: Chuyển đổi linh hoạt giữa Tiếng Anh và Tiếng Việt toàn diện trên toàn bộ giao diện hệ thống.

---

## Cài đặt & Khởi chạy nhanh

### Yêu cầu hệ thống
- **Node.js**: `v22.0.0` trở lên (bắt buộc để sử dụng `node:sqlite`).
- **NPM**: `v10.0.0` trở lên.
- **Hệ điều hành**: Linux, macOS, hoặc Windows (x64 / arm64).

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

Truy cập trình duyệt tại địa chỉ: **`http://localhost:3000`** để thiết lập tài khoản Super Admin ban đầu.

---

## Phím tắt hệ thống (Keyboard Shortcuts)

| Tổ hợp phím | Chức năng |
| :--- | :--- |
| **`Ctrl + K`** | Mở thanh tìm kiếm lệnh và database nhanh (Command Palette) |
| **`Ctrl + B`** | Mở nhanh cửa sổ tạo cơ sở dữ liệu mới |
| **`Ctrl + Shift + L`** | Chuyển đổi nhanh ngôn ngữ hiển thị (English ↔ Tiếng Việt) |
| **`Ctrl + Shift + T`** | Chuyển đổi nhanh giao diện Sáng / Tối (Light / Dark) |
| **`Alt + 1`** | Đi đến trang Tổng quan hệ thống (Overview) |
| **`Alt + 2`** | Đi đến danh sách Cơ sở dữ liệu (Databases) |
| **`Alt + 3`** | Đi đến Giám sát thời gian thực (Live Telemetry 1s) |
| **`Alt + 4`** | Đi đến Nhật ký hoạt động & Kiểm toán (Activity Logs) |
| **`Alt + 5`** | Đi đến Quản lý người dùng (Users) |
| **`Alt + 6`** | Đi đến Cài đặt hệ thống (Settings) |
| **`Shift + ?`** | Mở bảng tra cứu phím tắt toàn năng |
| **`Ctrl + Enter`** | Thực thi câu lệnh SQL đang soạn thảo trong SQL Console |
| **`Esc`** | Đóng các modal popup hoặc thanh tìm kiếm lệnh |

---

## Client SDKs

### TypeScript / Node.js Client
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
const { rows } = await db.query('SELECT * FROM users WHERE score > ?', [100]);

// Nhận sự kiện thời gian thực
const unsubscribe = db.subscribe((event) => {
  console.log('Sự kiện Realtime:', event);
}, 'users');
```

---

## Bản quyền (License)

Dự án được phát hành theo giấy phép [MIT License](LICENSE).  
Bản quyền (c) 2026 **Elaina2026**.
