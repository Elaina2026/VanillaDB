<p align="center">
  <img src="public/logo.svg" alt="VanillaDatabase Logo" width="120" height="120" />
</p>

<h1 align="center">VanillaDatabase (VanillaDB) — Tiếng Việt</h1>

<p align="center">
  <strong>Nền tảng SQLite Cloud đa người dùng cấp doanh nghiệp: API REST & SQL hiệu năng cao, Server-Sent Events (SSE) realtime, phát luồng Media theo phân đoạn (HTTP 206), mã hóa dữ liệu tĩnh AES-256-GCM, sao lưu tự động và tích hợp hàm toán học AI Vector bản địa.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/Gi%E1%BA%A5y%20ph%C3%A9p-MIT-0969da.svg?style=flat-square" alt="Giấy phép: MIT" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-22%2B-22c55e.svg?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 22+" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.8-3178c6.svg?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="https://fastify.dev/"><img src="https://img.shields.io/badge/Fastify-5.2-000000.svg?style=flat-square&logo=fastify&logoColor=white" alt="Fastify" /></a>
  <a href="https://github.com/WiseLibs/better-sqlite3"><img src="https://img.shields.io/badge/SQLite-better--sqlite3%20(WAL)-003b57.svg?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite" /></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Phi%C3%AAn%20b%E1%BA%A3n-1.3.2-ea580c.svg?style=flat-square" alt="Phiên bản 1.3.2" /></a>
  <a href="tests/"><img src="https://img.shields.io/badge/Ki%E1%BB%83m%20th%E1%BB%AD-94%20v%C6%B0%E1%BB%A3t%20qua-22c55e.svg?style=flat-square" alt="94 bài kiểm thử vượt qua" /></a>
</p>

<p align="center">
  <strong>[ <a href="#tổng-quan">Tổng quan</a> ]</strong> &bull;
  <strong>[ <a href="README.md">English Version</a> ]</strong> &bull;
  <strong>[ <a href="#kiến-trúc-hệ-thống">Kiến trúc</a> ]</strong> &bull;
  <strong>[ <a href="#tính-năng-cốt-lõi">Tính năng cốt lõi</a> ]</strong> &bull;
  <strong>[ <a href="#khởi-động-nhanh">Khởi động nhanh</a> ]</strong> &bull;
  <strong>[ <a href="SECURITY.vi.md">Chính sách Bảo mật</a> ]</strong> &bull;
  <strong>[ <a href="#tham-chiếu-api">Tham chiếu API</a> ]</strong> &bull;
  <strong>[ <a href="#hệ-thống-phím-tắt">Phím tắt</a> ]</strong> &bull;
  <strong>[ <a href="docs/README.md">Bộ tài liệu kỹ thuật</a> ]</strong>
</p>

---

## <img src="https://api.iconify.design/lucide:info.svg?color=%230969da" width="22" height="22" align="center" /> Tổng quan

**VanillaDatabase (VanillaDB)** là nền tảng quản trị cơ sở dữ liệu SQLite đám mây đa người dùng (Multi-tenant), tự lưu trữ (self-hosted), nhẹ và tối ưu hóa cao được xây dựng trên nền Node.js 22+ và Fastify.

Thay vì phải duy trì các cụm cơ sở dữ liệu cồng kềnh cho từng khách hàng, dự án nhỏ hoặc microservices, VanillaDatabase tự động khởi tạo và điều phối các **cơ sở dữ liệu SQLite độc lập** trực tiếp trên ổ đĩa. Mỗi cơ sở dữ liệu tenant vận hành như một thực thể lưu trữ riêng biệt với tệp nhật ký WAL, khóa API token phân quyền, bản sao lưu mã hóa, kho lưu trữ media, webhook bất đồng bộ và luồng dữ liệu thời gian thực.

> [!NOTE]
> **Cam kết cô lập:** Tất cả cơ sở dữ liệu tenant được cô lập hoàn toàn tại đường dẫn `data/databases/:id.sqlite`. Siêu dữ liệu hệ thống (metadata) được phân vùng độc lập tại `data/system/vanilladb.sqlite`.

---

## <img src="https://api.iconify.design/lucide:cpu.svg?color=%230969da" width="22" height="22" align="center" /> Kiến trúc hệ thống

```
                       +-----------------------------------+
                       |      Tầng Khách HTTP / SSE        |
                       |  (Bảng điều khiển, SDKs, Scripts) |
                       +-----------------+-----------------+
                                         |
                                         v
                       +-----------------------------------+
                       |    Máy chủ Fastify (Cổng: 3000)   |
                       |   - Lá chắn Helmet & CSP nghiêm   |
                       |   - Xác thực Chữ ký HMAC & Token  |
                       |   - Giới hạn tốc độ & Chặn SSRF   |
                       +-----------------+-----------------+
                                         |
         +-------------------------------+-------------------------------+
         |                               |                               |
         v                               v                               v
+-----------------+             +-----------------+             +-----------------+
|   Control Plane |             |   Data Plane    |             |   Media Storage |
|  /api/admin/*   |             |   /v1/databases |             |  /v1/databases/ |
|  /api/auth/*    |             |   /:id/query    |             |  :id/storage    |
+--------+--------+             +--------+--------+             +--------+--------+
         |                               |                               |
         v                               v                               v
+-----------------+             +-----------------+             +-----------------+
| System Metadata |             |  Tenant Engine  |             |  Kho Media Mã hóa|
| (better-sqlite3)|             | (Pooled Handles)|             |  (AES-256-GCM)  |
| - Users & Roles |             | - Chế độ WAL    |             | - HTTP 206      |
| - Thành viên DB |             | - AI Vector Math|             | - Tua phát mượt |
| - Tokens & Logs |             | - Khóa ngoại FK |             | - Chặn rò rỉ    |
+-----------------+             +-----------------+             +-----------------+
```

---

## <img src="https://api.iconify.design/lucide:zap.svg?color=%230969da" width="22" height="22" align="center" /> Tính năng cốt lõi

### <img src="https://api.iconify.design/lucide:database.svg?color=%23003b57" width="20" height="20" align="center" /> <img src="https://img.shields.io/badge/%C4%90%E1%BB%98NG%20C%C6%A0-SQLite%20WAL-003b57?style=flat-square&logo=sqlite&logoColor=white" height="20" alt="Động cơ" /> Điều phối Động cơ SQLite Đa người thuê
- Tự động sinh cơ sở dữ liệu SQLite biệt lập theo định danh nanoid (`db_<nanoid>`).
- Kích hoạt chế độ Write-Ahead Logging (WAL), cơ chế thử lại khi bận (busy-timeout retry), ràng buộc khóa ngoại (foreign keys) và lưu bộ nhớ đệm kết nối.
- Đăng ký sẵn các hàm toán học khoảng cách và tương đồng AI vector: `vec_cosine_similarity()`, `vec_cosine_distance()`.
- Tích hợp hàm mật mã trực tiếp trong câu lệnh SQL: `encrypt_aes()`, `decrypt_aes()`, `hash_sha256()`, `hash_hmac()`.

### <img src="https://api.iconify.design/lucide:shield-check.svg?color=%2310b981" width="20" height="20" align="center" /> <img src="https://img.shields.io/badge/B%E1%BA%A2O%20M%E1%BA%ACT-OWASP%20Hardened-10b981?style=flat-square&logo=securityscorecard&logoColor=white" height="20" alt="Bảo mật" /> Phòng thủ Chiều sâu & Chuẩn Mật mã OWASP
- **Thu hồi phiên làm việc tức thì (VDB-SEC-01):** Chữ ký HMAC của session cookie ràng buộc chặt chẽ với `token_version` của người dùng. Mọi hành vi đổi mật khẩu hoặc vô hiệu hóa tài khoản từ admin sẽ hủy hiệu lực của phiên cũ ngay lập tức trên toàn bộ thiết bị.
- **Chống phát lại mã TOTP 2FA (VDB-SEC-02):** Lưu vết bước thời gian đơn điệu (`last_totp_step`) tuân thủ nghiêm ngặt chuẩn RFC 6238 Mục 5.2. Mã xác thực 6 số không thể bị sử dụng lại lần thứ hai trong cùng cửa sổ trôi dạt 90 giây.
- **Tường lửa Chặn SSRF:** Webhook gửi ra ngoài chặn hoàn toàn dải mạng riêng tư (RFC 1918), địa chỉ loopback (`127.0.0.0/8`), link-local và điểm cuối siêu dữ liệu đám mây (`169.254.169.254`).
- **Mã hóa Dữ liệu Tĩnh (Data-at-Rest):** Mã hóa phong bì AES-256-GCM kèm tiêu đề xác thực (`VENC` signature, PBKDF2 salt, 128-bit authentication tag).
- **Cách ly Hộp cát Engine:** Các lệnh nguy hiểm như `ATTACH DATABASE`, `DETACH DATABASE` và nạp module nhị phân `load_extension` bị vô hiệu hóa vĩnh viễn ở tầng lõi.

### <img src="https://api.iconify.design/lucide:users.svg?color=%236366f1" width="20" height="20" align="center" /> <img src="https://img.shields.io/badge/PH%C3%82N%20QUY%E1%BB%80N-RBAC%20Quotas-6366f1?style=flat-square&logo=auth0&logoColor=white" height="20" alt="Phân quyền" /> Phân quyền Đa cấp độ & Hạn ngạch Quota
- Ba vai trò hệ thống: `super_admin`, `admin`, `user`.
- Bốn vai trò trong từng cơ sở dữ liệu: `owner`, `admin`, `editor`, `viewer`.
- Kiểm soát hạn mức số lượng cơ sở dữ liệu (`max_databases`) và giới hạn tốc độ truy vấn theo người dùng (`rate_limit_per_minute`).
- Tự đăng ký tài khoản với chính sách cấp phát hạn mức tự động.

### <img src="https://api.iconify.design/lucide:key.svg?color=%23000000" width="20" height="20" align="center" /> <img src="https://img.shields.io/badge/API-REST%20%26%20SQL-000000?style=flat-square&logo=fastify&logoColor=white" height="20" alt="API" /> Khóa Token Phân quyền Tinh gọn
- Sinh khóa API token với tiền tố `vdb_live_*` hoặc `vdb_test_*`.
- Phạm vi quyền hạn chi tiết: `database:read`, `database:write`, `database:ddl`, `database:admin`.
- Danh sách bảng cho phép (allowlist) và chặn truy cập (denylist).
- Không bao giờ lưu token thô; cơ sở dữ liệu chỉ lưu bản băm SHA-256.

### <img src="https://api.iconify.design/lucide:radio.svg?color=%233b82f6" width="20" height="20" align="center" /> <img src="https://img.shields.io/badge/REALTIME-SSE%20Stream-3b82f6?style=flat-square&logo=socketdotio&logoColor=white" height="20" alt="Realtime" /> Phát Sự kiện SSE & Webhooks Bất đồng bộ
- Luồng Server-Sent Events tại `/v1/databases/:id/realtime` phát đi các thay đổi dữ liệu bảng (`insert`, `update`, `delete`, `schema`).
- Hệ thống webhook gửi sự kiện bất đồng bộ kèm chữ ký bảo mật HMAC-SHA256 (`X-Vanilla-Signature`), tự động thử lại khi lỗi và định dạng sẵn thông báo Discord/Slack.

### <img src="https://api.iconify.design/lucide:hard-drive.svg?color=%238b5cf6" width="20" height="20" align="center" /> <img src="https://img.shields.io/badge/L%C6%AFU%20TR%E1%BB%AE-HTTP%20206-8b5cf6?style=flat-square&logo=ipfs&logoColor=white" height="20" alt="Lưu trữ" /> Kho Lưu trữ Media & Phát luồng HTTP 206
- Lưu trữ tệp tin theo phạm vi cơ sở dữ liệu với cơ chế mã hóa khối trong suốt.
- Hỗ trợ tiêu đề `Range` của HTTP 206 Partial Content cho phép nghe nhạc, xem video mượt mà, hỗ trợ tua đến từng vị trí bất kỳ.

### <img src="https://api.iconify.design/lucide:layout.svg?color=%233178c6" width="20" height="20" align="center" /> <img src="https://img.shields.io/badge/GIAO%20DI%E1%BB%86N-React%2019-3178c6?style=flat-square&logo=react&logoColor=white" height="20" alt="Giao diện" /> Bảng điều khiển Quản trị & Ma trận Phím tắt Song ngữ
- Giao diện quản trị hiện đại, mượt mà được xây dựng bằng React 19, Tailwind CSS v4, Lucide icons và trình soạn thảo Monaco SQL Editor.
- Hỗ trợ song ngữ toàn diện (Tiếng Việt & English) trên tất cả các trang, thông báo và modal.
- Hệ thống phím tắt tích hợp: Vim chords (`G+D`, `G+I`), thu gọn sidebar (`Ctrl+\`), thao tác soạn thảo SQL (`Ctrl+Enter`, `Ctrl+E`, `Ctrl+S`, `Alt+Up/Down`, `F11`) và duyệt bảng dữ liệu (`Alt+I`, `Alt+R`, `[`, `]`, `/`, `Del`).

---

## <img src="https://api.iconify.design/lucide:rocket.svg?color=%230969da" width="22" height="22" align="center" /> Khởi động nhanh

### Yêu cầu môi trường
- Node.js phiên bản 22.0.0 trở lên
- Trình quản lý gói npm 10.0.0 trở lên

### 1. Sao chép mã nguồn & Cài đặt
```bash
git clone https://github.com/Elaina2026/VanillaDB.git
cd VanillaDB
npm install
```

### 2. Thiết lập biến môi trường
```bash
cp .env.example .env
```

Kiểm tra cấu hình các biến cơ bản trong file `.env`:
```env
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
VDB_MASTER_KEY=nhap_chuoi_hex_ngau_nhien_dai_64_ky_tu
VDB_SESSION_SECRET=nhap_chuoi_hex_ngau_nhien_dai_64_ky_tu
VDB_CORS_ORIGINS=http://localhost:3000
```

### 3. Biên dịch & Vận hành
```bash
# Biên dịch giao diện frontend và mã nguồn máy chủ
npm run build

# Khởi động máy chủ môi trường production
npm start
```

Dành cho nhà phát triển (hỗ trợ hot-reload):
```bash
npm run dev
```

Truy cập bảng điều khiển quản trị web tại địa chỉ: `http://localhost:3000`.

---

## <img src="https://api.iconify.design/lucide:sliders.svg?color=%230969da" width="22" height="22" align="center" /> Bảng tham chiếu cấu hình

| Biến môi trường | Kiểu dữ liệu | Mặc định | Mô tả chi tiết |
| :--- | :--- | :--- | :--- |
| `PORT` | số | `3000` | Cổng lắng nghe kết nối HTTP |
| `HOST` | chuỗi | `0.0.0.0` | Địa chỉ mạng ràng buộc |
| `NODE_ENV` | chuỗi | `development` | Môi trường thực thi (`development`, `production`, `test`) |
| `VDB_MASTER_KEY` | chuỗi | Tự sinh | Khóa 256-bit dùng cho mã hóa cơ sở dữ liệu và tệp lưu trữ |
| `VDB_SESSION_SECRET` | chuỗi | Tự sinh | Khóa HMAC ký phiên đăng nhập và mã token tạm thời |
| `VDB_CORS_ORIGINS` | chuỗi | `*` | Tên miền cho phép kết nối CORS (ngăn cách bằng dấu phẩy) |
| `VDB_DATA_DIR` | chuỗi | `./data` | Thư mục lưu trữ tệp cơ sở dữ liệu SQLite, backup và media |
| `VDB_MAX_REQUEST_SIZE_MB` | số | `10` | Kích thước gói tin HTTP tối đa cho truy vấn SQL và nhập dữ liệu |
| `VDB_STORAGE_MAX_FILE_SIZE_MB` | số | `100` | Kích thước tệp tin tối đa khi tải media lên hệ thống |
| `VDB_STORAGE_ENCRYPTION` | boolean | `true` | Kích hoạt mã hóa AES-256-GCM cho tệp media lưu trữ |
| `VDB_DEFAULT_USER_MAX_DATABASES` | số | `2` | Số lượng cơ sở dữ liệu tối đa cấp cho tài khoản mới đăng ký |
| `VDB_DEFAULT_USER_RATE_LIMIT` | số | `180` | Hạn mức yêu cầu tối đa mỗi phút cho người dùng thông thường |

---

## <img src="https://api.iconify.design/lucide:shield-check.svg?color=%2310b981" width="22" height="22" align="center" /> Chính sách Bảo mật & Mô hình An ninh

VanillaDatabase tuân thủ chặt chẽ mô hình an ninh zero-trust phòng thủ chiều sâu. Để tra cứu quy trình công bố lỗ hổng có trách nhiệm, phiên bản được hỗ trợ, cam kết thời gian phản hồi (SLA) và cơ chế cô lập hộp cát động cơ:

- **Tài liệu Chính sách Bảo mật Tiếng Việt:** [SECURITY.vi.md](SECURITY.vi.md)
- **English Security Policy:** [SECURITY.md](SECURITY.md)

---

## <img src="https://api.iconify.design/lucide:terminal.svg?color=%230969da" width="22" height="22" align="center" /> Tham chiếu API

### Tầng Dữ liệu Data Plane (Thao tác trên Database Tenant)

Tất cả các điểm cuối Data Plane yêu cầu xác thực qua Bearer Token (`Authorization: Bearer vdb_live_...`) hoặc cookie phiên hợp lệ.

```bash
# Thực thi truy vấn đọc dữ liệu (SELECT)
POST /v1/databases/:databaseId/query
Content-Type: application/json

{
  "sql": "SELECT id, username, email FROM users WHERE status = ? LIMIT 10;",
  "params": ["active"]
}
```

```bash
# Thực thi truy vấn thay đổi dữ liệu (INSERT, UPDATE, DELETE)
POST /v1/databases/:databaseId/exec
Content-Type: application/json

{
  "sql": "UPDATE users SET status = ? WHERE id = ?;",
  "params": ["verified", "usr_123"]
}
```

```bash
# Thực thi lô giao dịch nguyên tử (Batch Transaction)
POST /v1/databases/:databaseId/batch
Content-Type: application/json

{
  "transaction": true,
  "statements": [
    { "sql": "UPDATE accounts SET balance = balance - 100 WHERE id = ?;", "params": ["acc_a"] },
    { "sql": "UPDATE accounts SET balance = balance + 100 WHERE id = ?;", "params": ["acc_b"] }
  ]
}
```

```bash
# Kết nối luồng sự kiện Realtime SSE
GET /v1/databases/:databaseId/realtime
Accept: text/event-stream
```

```bash
# Phát luồng tệp tin Media có phân đoạn
GET /v1/databases/:databaseId/storage/:fileId
Range: bytes=0-1048575
```

### Tầng Điều khiển Control Plane (Quản trị & Bảo mật)

| Giao thức | Điểm cuối | Quyền truy cập | Mục đích |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Công khai | Đăng ký tài khoản người dùng mới |
| `POST` | `/api/auth/login` | Công khai | Đăng nhập và sinh cookie phiên |
| `POST` | `/api/auth/login/2fa` | Công khai | Xác thực bước 2FA bằng TOTP hoặc mã dự phòng |
| `POST` | `/api/auth/change-password` | Đã xác thực | Đổi mật khẩu kèm tự động hủy phiên cũ |
| `GET` | `/api/admin/databases` | Đã xác thực | Liệt kê các database được phép truy cập |
| `POST` | `/api/admin/databases` | Đã xác thực | Tạo cơ sở dữ liệu tenant mới |
| `POST` | `/api/admin/databases/:id/clone` | Admin / Owner | Nhân bản database phục vụ thử nghiệm/staging |
| `POST` | `/api/admin/databases/:id/backups` | Admin / Owner | Kích hoạt tạo bản sao lưu mã hóa tức thì |
| `POST` | `/api/admin/databases/:id/maintenance` | Admin / Owner | Thực thi `integrity_check`, `vacuum`, `optimize` |
| `GET` | `/api/system/status` | Super Admin | Giám sát CPU, RAM và dung lượng ổ đĩa máy chủ |

---

## <img src="https://api.iconify.design/lucide:keyboard.svg?color=%230969da" width="22" height="22" align="center" /> Hệ thống phím tắt

VanillaDatabase trang bị bảng phím tắt tiện lợi hỗ trợ thao tác nhanh trên toàn bộ hệ thống:

| Ngữ cảnh | Phím tắt | Thao tác (Tiếng Việt) | Action (English) |
| :--- | :--- | :--- | :--- |
| **Toàn hệ thống** | `Ctrl + K` | Mở thanh tìm kiếm lệnh nhanh | Open Command Palette |
| **Toàn hệ thống** | `Ctrl + B` | Mở cửa sổ tạo cơ sở dữ liệu mới | Open Create Database modal |
| **Toàn hệ thống** | `Ctrl + \` | Thu gọn / Mở rộng Sidebar điều hướng | Toggle desktop sidebar collapse |
| **Toàn hệ thống** | `G` rồi `D` | Về danh sách Database (Vim chord) | Navigate to Databases (Vim chord) |
| **Toàn hệ thống** | `G` rồi `I` | Mở Hộp thư thông báo (Vim chord) | Navigate to Inbox (Vim chord) |
| **Toàn hệ thống** | `Ctrl + Shift + L` | Chuyển đổi ngôn ngữ (EN / VI) | Toggle language (EN / VI) |
| **Toàn hệ thống** | `Alt + T` | Chuyển đổi giao diện Sáng / Tối | Toggle theme (Light / Dark) |
| **Toàn hệ thống** | `Shift + ?` | Mở trang tra cứu phím tắt | Open Shortcuts reference page |
| **Chi tiết DB** | `1` .. `9` | Chuyển nhanh qua lại các tab Database | Switch database detail tabs |
| **SQL Console** | `Ctrl + Enter` | Thực thi câu lệnh SQL đang soạn | Execute SQL statement |
| **SQL Console** | `Ctrl + E` | Phân tích kế hoạch truy vấn EXPLAIN | Analyze EXPLAIN query plan |
| **SQL Console** | `Ctrl + S` | Tải kết quả truy vấn ra file CSV | Export query results to CSV |
| **SQL Console** | `Alt + Up / Down` | Duyệt lịch sử câu lệnh SQL đã chạy | Browse query execution history |
| **SQL Console** | `Ctrl + /` | Bật/tắt comment dòng lệnh SQL (`--`) | Toggle SQL line comment (`--`) |
| **SQL Console** | `F11` / `Esc` | Bật/tắt chế độ toàn màn hình Zen Mode | Toggle Fullscreen Zen Mode |
| **Trình duyệt bảng** | `Alt + I` | Mở modal chèn dòng dữ liệu mới | Open Insert Row modal |
| **Trình duyệt bảng** | `Alt + R` | Tải lại dữ liệu bảng và schema | Refresh table rows and schema |
| **Trình duyệt bảng** | `[` / `]` | Lùi trang / Tiến trang dữ liệu | Previous / Next page |
| **Trình duyệt bảng** | `/` | Nhảy nhanh vào ô tìm kiếm bảng | Focus table search input |
| **Trình duyệt bảng** | `Del` | Xóa các dòng dữ liệu đang chọn | Bulk delete selected rows |
| **Tác vụ Database** | `Ctrl + Shift + B` | Tạo bản sao lưu tức thì | Create instant backup snapshot |
| **Tác vụ Database** | `Ctrl + Shift + D` | Mở modal nhân bản Database | Open Clone Database modal |
| **Tác vụ Database** | `Alt + M` | Chạy kiểm tra toàn vẹn CSDL | Run `PRAGMA integrity_check` |

---

## <img src="https://api.iconify.design/lucide:check-circle.svg?color=%2310b981" width="22" height="22" align="center" /> Kiểm thử & Đảm bảo chất lượng

Toàn bộ hệ thống kiểm thử vận hành tự động qua Vitest với kiểm chứng đầu-cuối:

```bash
# Chạy toàn bộ 94 bài kiểm thử tích hợp & đơn vị
npm test

# Kiểm tra kiểu dữ liệu TypeScript
npm run typecheck

# Chạy kiểm thử đo điểm hiệu năng
npm run benchmark
```

Toàn bộ 94 bài kiểm thử xác minh:
- Phân quyền RBAC đa người dùng, hạn mức tài khoản phụ và chặn vượt ngưỡng.
- Kích hoạt 2FA TOTP, vòng đời 6 mã dự phòng và thách thức đăng nhập.
- Thu hồi phiên làm việc tức thì khi thay đổi mật khẩu (VDB-SEC-01).
- Chống phát lại mã TOTP đơn điệu tuân thủ RFC 6238 (VDB-SEC-02).
- Mã hóa phong bì AES-256-GCM và dẫn xuất khóa an toàn PBKDF2.
- Trình dịch phương ngữ SQL từ MySQL, PostgreSQL, CSV và NDJSON sang SQLite.
- Giao dịch hàng loạt đảm bảo an toàn rollback khi xảy ra lỗi.
- Phát luồng âm thanh và video phân đoạn HTTP 206 Partial Content.

---

## <img src="https://api.iconify.design/lucide:book-open.svg?color=%230969da" width="22" height="22" align="center" /> Bộ tài liệu chuyên sâu

Truy cập các tài liệu học phần chuyên sâu tại:

- **Trung tâm tài liệu**: [docs/README.md](docs/README.md)
- **Tài liệu Tiếng Việt**:
  - [01. Hướng dẫn khởi động](docs/vi/01-getting-started.md)
  - [02. Kiến trúc & Thiết kế](docs/vi/02-architecture.md)
  - [03. Động cơ cơ sở dữ liệu](docs/vi/03-database-engine.md)
  - [04. Tham chiếu REST & SQL API](docs/vi/04-api-reference.md)
  - [05. Phân quyền RBAC & 2FA](docs/vi/05-authentication-rbac-2fa.md)
  - [06. Sự kiện Realtime & Webhooks](docs/vi/06-realtime-and-webhooks.md)
  - [07. Kho lưu trữ Media & Phát luồng](docs/vi/07-storage-and-streaming.md)
  - [08. Sao lưu & Bảo trì định kỳ](docs/vi/08-backup-and-restore.md)
  - [09. Chuyển đổi & Nhập dữ liệu](docs/vi/09-migration-and-converter.md)
  - [10. Vận hành Production](docs/vi/10-deployment.md)
  - [11. Khắc phục sự cố thường gặp](docs/vi/11-troubleshooting.md)
  - [12. Hướng dẫn phát triển mã nguồn](docs/vi/12-development.md)

---

## <img src="https://api.iconify.design/lucide:file-text.svg?color=%230969da" width="22" height="22" align="center" /> Giấy phép mã nguồn

VanillaDatabase là phần mềm nguồn mở được cấp phép theo các điều khoản của [Giấy phép MIT](LICENSE).
