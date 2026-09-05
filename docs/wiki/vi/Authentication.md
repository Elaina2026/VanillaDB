# Xác thực, Phân quyền RBAC & Bảo mật 2FA

Tài liệu chi tiết về phân quyền người dùng, xác thực phiên đăng nhập, API tokens, bảo mật 2FA và khôi phục mật khẩu 2 lớp.

---

## 1. Phân quyền người dùng (Role-Based Access Control)

VanillaDatabase hỗ trợ 3 cấp bậc người dùng:

| Vai trò | Quyền hạn & Khả năng |
| :--- | :--- |
| **`super_admin`** | Toàn quyền kiểm soát hệ thống: quản lý người dùng, chỉnh sửa cài đặt, truy cập mọi database, không giới hạn hạn mức (quotas) hay tần suất (rate limits). |
| **`admin`** | Quản lý toàn bộ cơ sở dữ liệu tenant, theo dõi telemetry, quản lý sao lưu và webhooks, xem danh sách người dùng. Không thể tạo hoặc xóa người dùng khác. |
| **`user`** | Chỉ truy cập và quản lý các cơ sở dữ liệu do tài khoản sở hữu (`owner_id`) hoặc được mời tham gia (`database_members`). Chịu hạn mức số lượng database (`max_databases`) và giới hạn tốc độ gọi API (`rate_limit_per_minute`). |

---

## 2. Xác thực phiên làm việc Web (Dashboard Sessions)

- **Thuật toán băm mật khẩu**: `Argon2id` (bảo vệ chống tấn công GPU/ASIC brute-force, tham số: 64MB memory, 3 iterations, 4 parallelism).
- **Cookie phiên**: `vdb_session` với các cờ bảo mật cao `HttpOnly`, `SameSite: Lax`, và `Secure` (khi bật production).
- **Chữ ký phiên**: Ký mật mã HMAC-SHA256 (`userId:username:role:expiresAt`). Cookie tự động hết hạn sau **7 ngày**.

---

## 3. Mã truy cập API Scoped Tokens

Mã API tokens cho phép ứng dụng bên ngoài, microservices và bot kết nối đến database của từng tenant một cách an toàn.

### Tiền tố phân loại
- **Production Tokens**: `vdb_live_<hex(64)>`
- **Testing Tokens**: `vdb_test_<hex(64)>`

### Ma trận quyền hạn Token
Mỗi token có thể gán một hoặc nhiều quyền:

| Quyền hạn | Mô tả | Câu lệnh SQL / Endpoints cho phép |
| :--- | :--- | :--- |
| `database:read` | Quyền chỉ đọc | `SELECT`, `PRAGMA table_info`, `EXPLAIN`, xem/tải tệp media, luồng SSE |
| `database:write`| Quyền ghi dữ liệu | `INSERT`, `UPDATE`, `DELETE`, tải lên/xóa tệp media, batch giao dịch |
| `database:ddl`  | Thay đổi cấu trúc bảng | `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, `CREATE INDEX` |
| `database:admin`| Quản trị toàn diện | Toàn quyền đọc, ghi, DDL và cấu hình database |

### Giới hạn bảng truy cập
- **`allowed_tables`**: Danh sách trắng (whitelist). Token chỉ được phép truy vấn các bảng trong danh sách này.
- **`denied_tables`**: Danh sách đen (blacklist). Mọi truy vấn vào các bảng này bị từ chối ngay lập tức.

---

## 4. Bảo mật 2 lớp (2FA) & Khôi phục tài khoản

Hệ thống tích hợp xác thực 2 lớp chuẩn RFC 6238 TOTP:

### Quy trình kích hoạt
1. `POST /api/auth/2fa/setup`: Tạo khóa bí mật base32 và mã QR dạng SVG data URL.
2. `POST /api/auth/2fa/activate`: Yêu cầu xác nhận mật khẩu hiện tại và mã xác thực 6 số từ ứng dụng Authenticator. Khi thành công, hệ thống sinh 6 mã dự phòng (`XXXX-XXXX`).

### Quản lý vòng đời mã dự phòng (Backup Codes)
- Lưu trữ kèm trạng thái sử dụng: `[{ code, used: boolean, used_at?: number }]`.
- Phân biệt rõ ràng mã đang hoạt động (active) và mã đã dùng (burned) trên giao diện Cài đặt.
- Hỗ trợ xem/ẩn mã, sao chép, tải về file văn bản và tạo bộ mã mới (`POST /api/auth/2fa/regenerate-backup-codes`) có xác thực mật khẩu.

### Khôi phục tài khoản 2 cơ chế (Dual-Factor Recovery)
Khi mất thiết bị xác thực, người dùng có thể khôi phục qua màn hình `#/reset-password`:
- **Cơ chế 1 (Mã 6 số TOTP)**: Nhập mã hiện tại từ Authenticator.
- **Cơ chế 2 (Mã dự phòng)**: Sử dụng mã `XXXX-XXXX`. Mã sau khi sử dụng sẽ bị đốt (burned) vĩnh viễn. Việc so khớp sử dụng `crypto.timingSafeEqual` nhằm triệt tiêu hoàn toàn tấn công timing attack.
