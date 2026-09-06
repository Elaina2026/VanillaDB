# Xác thực, Phân quyền RBAC & Bảo mật 2FA

Tài liệu này bao gồm các cấp bậc vai trò người dùng, cơ chế xác thực phiên đăng nhập trên Dashboard, mã API Bearer Token, phân quyền chi tiết, giới hạn tần suất cửa sổ trượt và xác thực hai yếu tố (2FA).

---

## 1. Kiểm soát Truy cập Dựa trên Vai trò (RBAC Đa Người dùng)

VanillaDatabase hỗ trợ ba cấp bậc vai trò người dùng theo thứ bậc:

| Vai trò (Role) | Quyền hạn & Năng lực Hệ thống |
| :--- | :--- |
| **`super_admin`** | Toàn quyền kiểm soát hệ thống: tạo/quản lý người dùng, chỉnh sửa cài đặt hệ thống, truy cập tất cả database, không giới hạn hạn mức quota, bỏ qua giới hạn rate limit. |
| **`admin`** | Quản trị toàn bộ database khách thuê, xem số liệu telemetry, quản lý sao lưu và webhook, xem danh sách người dùng. Không có quyền tạo hoặc xóa người dùng khác. |
| **`user`** | Truy cập và quản trị **duy nhất** các database do tài khoản sở hữu (`owner_id`) hoặc được chia sẻ qua danh sách thành viên. Bị áp dụng hạn mức số lượng database (`max_databases`) và giới hạn tần suất (`rate_limit_per_minute`). |

---

## 2. Xác thực Phiên làm việc trên Dashboard (Session Auth)

- **Thuật toán băm**: Băm mật khẩu bằng `Argon2id` (chi phí bộ nhớ: 64MB, số vòng lặp thời gian: 3, mức độ song song: 4).
- **Cookie phiên**: Cookie `vdb_session` được cấp phát khi đăng nhập với các cờ `HttpOnly`, `SameSite: Lax`, và `Secure` (trên môi trường production).
- **Chữ ký phiên**: Dữ liệu phiên được ký mật mã học bằng HMAC-SHA256 (`userId:username:role:expiresAt`). Cookie phiên tự động hết hạn sau **7 ngày**.

---

## 3. Mã API Bearer Token Phân quyền Chi tiết

API Token cho phép các ứng dụng bên ngoài, hệ thống microservices và bot tương tác an toàn với các database khách thuê.

### Phân loại & Tiền tố Token
- **Live Tokens**: `vdb_live_<hex(64)>`
- **Test Tokens**: `vdb_test_<hex(64)>`

### Danh mục Quyền hạn của Token
Mỗi token có thể được gán một hoặc nhiều quyền sau:

| Quyền hạn | Mô tả | Câu lệnh SQL / Endpoint Cho phép |
| :--- | :--- | :--- |
| `database:read` | Quyền chỉ đọc dữ liệu | `SELECT`, `PRAGMA table_info`, `EXPLAIN`, xem danh sách/nội dung file, kênh SSE |
| `database:write`| Quyền ghi dữ liệu | `INSERT`, `UPDATE`, `DELETE`, tải lên/xóa file, thực thi giao dịch batch |
| `database:ddl`  | Thay đổi cấu trúc bảng | `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, `CREATE INDEX` |
| `database:admin`| Toàn quyền quản trị database | Toàn bộ chức năng đọc, ghi, sửa cấu trúc DDL và bảo trì |

### Kiểm soát Truy cập Cấp độ Bảng (Table-Level Access Control)
- **`allowed_tables`**: Danh sách trắng (whitelist) tùy chọn. Token **chỉ có thể** truy vấn hoặc sửa đổi các bảng nằm trong danh sách này.
- **`denied_tables`**: Danh sách đen (blacklist) tùy chọn. Mọi truy vấn nhắm vào các bảng này đều bị từ chối ngay lập tức.

### Giới hạn Tần suất Cửa sổ Trượt (Sliding-Window Rate Limiting)
- Có thể cấu hình theo từng token (ví dụ: `rate_limit: 100` yêu cầu/phút).
- Được thực thi bằng bộ đếm trong bộ nhớ RAM. Nếu vượt quá giới hạn, máy chủ trả về mã lỗi `HTTP 429 Too Many Requests` kèm tiêu đề thời gian thử lại cụ thể.

---

## 4. Xác thực Hai Yếu tố (2FA) & Khôi phục Tài khoản

VanillaDatabase tích hợp giải pháp xác thực hai yếu tố chuẩn doanh nghiệp dựa trên chuẩn RFC 6238 TOTP:

### Quy trình Kích hoạt
1. `POST /api/auth/2fa/setup`: Tạo khóa bí mật base32 tương thích chuẩn RFC 6238 và tạo mã QR dạng SVG data URI.
2. `POST /api/auth/2fa/activate`: Yêu cầu xác minh mật khẩu hiện tại và mã TOTP 6 chữ số hợp lệ. Sau khi kích hoạt thành công, hệ thống tự động sinh 6 mã dự phòng bảo mật (`XXXX-XXXX`).

### Vòng đời của Mã Dự phòng (Backup Codes)
- Mã dự phòng được lưu trữ kèm trạng thái sử dụng: `[{ code, used: boolean, used_at?: number }]`.
- Phân biệt rõ ràng giữa mã còn hiệu lực (active) và mã đã sử dụng (burned) trên giao diện Cài đặt.
- Người dùng có thể ẩn/hiện, sao chép, tải về máy hoặc tạo lại bộ mã mới (`POST /api/auth/2fa/regenerate-backup-codes`) sau khi xác nhận mật khẩu.

### Khôi phục Tài khoản Kép (Dual-Factor Recovery)
Khi mất thiết bị xác thực, tài khoản có thể được khôi phục qua `POST /api/auth/recovery/reset-password`:
- **Cách 1 (TOTP)**: Xác minh danh tính bằng mã 6 chữ số từ ứng dụng xác thực.
- **Cách 2 (Mã dự phòng)**: Xác thực và vô hiệu hóa vĩnh viễn một mã dự phòng dùng một lần. Việc so sánh mã được thực hiện bằng hàm `crypto.timingSafeEqual` nhằm loại bỏ hoàn toàn nguy cơ tấn công kênh kề (timing attack).
