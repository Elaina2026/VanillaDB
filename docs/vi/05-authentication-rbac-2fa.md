# Xác thực, Phân quyền RBAC & Bảo mật 2FA

Đặc tả toàn diện về các vai trò hệ thống, quyền hạn cơ sở dữ liệu, mã token phân quyền, cơ chế thu hồi phiên làm việc tức thì (`VDB-SEC-01`), chống phát lại mã TOTP (`VDB-SEC-02`) và quy trình phục hồi tài khoản 2FA.

---

## 1. Phân quyền RBAC & Thành viên Cơ sở Dữ liệu

### 1.1. Các Vai trò Hệ thống (System Roles)
VanillaDatabase phân định ba cấp độ vai trò trên toàn hệ thống:

| Vai trò | Phạm vi & Quyền hạn | Hạn ngạch & Tốc độ truy vấn |
| :--- | :--- | :--- |
| `super_admin` | Toàn quyền quản trị hệ thống: tạo/sửa/xóa người dùng, đổi cấu hình nền tảng, truy cập mọi database, xem nhật ký kiểm toán và số liệu viễn trắc. | Không giới hạn hạn ngạch; bỏ qua bộ lọc giới hạn tốc độ. |
| `admin` | Quản trị mọi database của các tenant, xem giám sát hệ thống và nhật ký hoạt động. Không thể sửa hay xóa tài khoản người dùng khác. | Áp dụng theo cấu hình hệ thống chung. |
| `user` | Cô lập tuyệt đối: chỉ xem và quản trị các database do chính mình sở hữu (`owner_id`) hoặc được mời tham gia với tư cách thành viên. | Giới hạn theo `max_databases` (mặc định 2) và `rate_limit_per_minute` (mặc định 180). |

### 1.2. Vai trò Thành viên trong Từng Database
Mỗi database hỗ trợ chia sẻ quyền hạn làm việc nhóm:
- **`owner`**: Chủ sở hữu, toàn quyền xóa database, nhân bản, tạo token, mời thành viên và phục hồi bản sao lưu.
- **`admin`**: Cấu hình database, quản lý thành viên, thực hiện bảo trì và tạo token.
- **`editor`**: Đọc, ghi dữ liệu, thay đổi cấu trúc bảng DDL và quản lý tệp tin media.
- **`viewer`**: Chỉ có quyền đọc bảng, xem schema và phát luồng media.

---

## 2. Quản lý Phiên & Thu hồi Tức thì (VDB-SEC-01)

### Băm Mật khẩu Argon2id
Mật khẩu người dùng được bảo vệ bằng thuật toán `Argon2id`:
- Dung lượng bộ nhớ: 64 MB (65,536 KB)
- Số vòng lặp: 3 vòng
- Luồng tính toán: 4 luồng song song

### Đánh Phiên bản Token & Thu hồi Phiên Ngay Lập tức
Cookie phiên `vdb_session` chứa cấu trúc payload xác thực chữ ký HMAC-SHA256:
```
cookieValue = `${userId}.${username}.${role}.${expiresAt}.${tokenVersion}.${signature}`
```
- **Tự động Thu hồi**: Khi người dùng đổi mật khẩu (`POST /api/auth/change-password`) hoặc bị quản trị viên vô hiệu hóa, hệ thống cập nhật `token_version = token_version + 1`.
- **Chốt chặn Middleware**: `requireAdminAuth` và `requireTokenPermission` đối chiếu `tokenVersion` trên cookie với cơ sở dữ liệu. Nếu không khớp, từ chối ngay lập tức với mã `401 Unauthorized` (`Session revoked due to password or credential change`).

---

## 3. Khóa API Token Phân quyền Tinh gọn

API Token cho phép ứng dụng bên ngoài, dịch vụ tự động hóa và bot kết nối an toàn mà không cần dùng cookie người dùng.

### Định danh Token & An toàn Lưu trữ
- **Token Hoạt động**: Tiền tố `vdb_live_<hex(64)>`.
- **Token Kiểm thử**: Tiền tố `vdb_test_<hex(64)>`.
- **Nguyên tắc Không rò rỉ**: Mã token thô chỉ hiển thị một lần duy nhất lúc tạo. Cơ sở dữ liệu chỉ lưu bản băm SHA-256 (`token_hash`).

### Bảng Phân quyền Token
| Quyền hạn | Khả năng thực thi | Câu lệnh SQL cho phép |
| :--- | :--- | :--- |
| `database:read` | Đọc dữ liệu và nhận sự kiện realtime | `SELECT`, `EXPLAIN`, luồng SSE, xem tệp |
| `database:write`| Thay đổi dữ liệu và ghi media | `INSERT`, `UPDATE`, `DELETE`, tải/xóa tệp |
| `database:ddl`  | Thay đổi cấu trúc bảng | `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, `CREATE INDEX` |
| `database:admin`| Toàn quyền quản trị cơ sở dữ liệu | Toàn bộ các quyền đọc, ghi, DDL và quản lý token |

### Giới hạn Truy cập Theo Bảng
- **`allowed_tables`**: Danh sách bảng cho phép. Truy vấn vào bảng ngoài danh sách này bị từ chối ngay (`403 FORBIDDEN`).
- **`denied_tables`**: Danh sách bảng cấm. Mọi truy vấn vào bảng trong danh sách này đều bị chặn đứng.

---

## 4. Xác thực Hai lớp (2FA) & Phục hồi Tài khoản (VDB-SEC-02)

VanillaDatabase tích hợp chuẩn xác thực 2FA Time-Based One-Time Passwords (TOTP) theo RFC 6238:

### 4.1. Chống Phát lại Mã TOTP (RFC 6238 Mục 5.2)
- Bộ máy xác thực (`verifyTotpCode`) theo dõi trường `last_totp_step` trong database.
- Dù mã OTP 6 số còn nằm trong khoảng thời gian trôi dạt 90 giây (+/- 1 bước), hành vi gửi lại mã có `candidateStep <= last_totp_step` đều bị từ chối triệt để.

### 4.2. Mã Phục hồi Dự phòng (Backup Codes)
- Khi kích hoạt 2FA (`POST /api/auth/2fa/activate`), máy chủ cấp **6 mã phục hồi dự phòng** (định dạng `XXXX-XXXX`).
- Mỗi mã dự phòng chỉ dùng được một lần duy nhất. Khi sử dụng để đăng nhập hoặc đặt lại mật khẩu, mã được đánh dấu đã cháy kèm thời gian sử dụng.

### 4.3. Quy trình Phục hồi Khẩn cấp
Người dùng bị mất thiết bị xác thực có thể truy cập `#/reset-password` để lấy lại tài khoản thông qua:
1. Mã TOTP 6 số từ ứng dụng xác thực (nếu vẫn còn thiết bị).
2. Một trong các mã dự phòng 8 ký tự chưa từng sử dụng.
