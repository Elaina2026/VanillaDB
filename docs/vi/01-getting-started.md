# Bắt đầu & Thiết lập Môi trường Production

Tài liệu này hướng dẫn từng bước cài đặt, cấu hình và vận hành **VanillaDatabase** trên môi trường phát triển cục bộ và máy chủ production.

---

## 1. Yêu cầu Hệ thống

- **Node.js**: Phiên bản `v22.0.0` trở lên (bắt buộc để hỗ trợ module gốc `node:sqlite`).
- **NPM**: Phiên bản `v10.0.0` trở lên.
- **Bộ nhớ RAM**: Khuyến nghị tối thiểu 512MB RAM (VanillaDB chỉ tiêu thụ cơ bản ~35MB–50MB).
- **Ổ đĩa lưu trữ**: Ổ đĩa SSD hoặc NVMe giúp tối ưu hóa hiệu năng ghi nhật ký SQLite WAL.
- **Hệ điều hành**: Linux (Ubuntu, Debian, Alpine, RHEL, CentOS), macOS hoặc Windows (x64 / arm64).

---

## 2. Các bước Cài đặt

### Lựa chọn A: Cài đặt Cục bộ hoặc Máy chủ VPS

```bash
# 1. Sao chép kho mã nguồn
git clone https://github.com/Elaina2026/VanillaDB.git
cd VanillaDatabase

# 2. Cài đặt các gói phụ thuộc
npm install

# 3. Tạo tệp cấu hình môi trường
cp .env.example .env

# 4. Biên dịch giao diện frontend và máy chủ backend
npm run build

# 5. Khởi chạy máy chủ production
npm start
```

Theo mặc định, máy chủ lắng nghe tại địa chỉ `0.0.0.0:3000`.

---

## 3. Khởi tạo Ban đầu & Cấu hình Tài khoản Super Admin

Khi truy cập `http://localhost:3000` lần đầu tiên:
1. Trình cài đặt tự động hiển thị biểu mẫu tạo tài khoản **Super Administrator** ban đầu.
2. Nhập **Tên người dùng** (tối thiểu 3 ký tự) và **Mật khẩu** (tối thiểu 6 ký tự).
3. Nhấp **"Khởi tạo Super Admin"** để tạo mã băm Argon2id và lưu trữ an toàn vào `data/system/vanilladb.sqlite`.

### Tự động Khởi tạo qua Biến Môi trường (Headless Mode)
Dành cho quy trình CI/CD tự động và triển khai Docker, bạn có thể chỉ định tài khoản quản trị trực tiếp:
```env
VDB_ADMIN_USERNAME=VanillaDatabase
VDB_ADMIN_PASSWORD=SuperSecretPassword123!
```
Khi khởi động, nếu hệ thống chưa có tài khoản quản trị viên nào, VanillaDatabase sẽ tự động tạo tài khoản với quyền `super_admin`.

### Đặt lại Mật khẩu Khẩn cấp qua CLI
Trong trường hợp quên hoặc mất mật khẩu quản trị viên:
```bash
# Đặt lại mật khẩu trực tiếp vào cơ sở dữ liệu metadata SQLite qua CLI
node dist/src/server/cli.js <username> <new_password>
```

---

## 4. Bảng Biến Môi trường Cốt lõi

| Tên biến | Giá trị mặc định | Mục đích & Mô tả |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | Đặt thành `production` để kích hoạt chế độ bảo mật nghiêm ngặt, lọc lỗi chi tiết và bật bộ đệm cache |
| `VDB_PORT` | `3000` | Cổng lắng nghe lưu lượng HTTP |
| `VDB_HOST` | `0.0.0.0` | Địa chỉ mạng liên kết (network interface) |
| `VDB_DATA_DIR` | `./data` | Thư mục lưu trữ gốc cho database, file sao lưu và tệp tin media |
| `VDB_SESSION_SECRET` | *Tự động sinh* | Chuỗi hex 64 ký tự dùng để ký cookie phiên đăng nhập |
| `VDB_MASTER_KEY` | *Tự động sinh* | Khóa mã hóa chủ cho thuật toán AES-256-GCM bảo vệ dữ liệu tĩnh |
| `VDB_TRUST_PROXY` | `false` | Bật khi triển khai phía sau Reverse Proxy (Nginx, Cloudflare) |
| `VDB_SQL_BUSY_TIMEOUT_MS` | `5000` | Thời gian chờ tối đa (ms) khi tệp SQLite bị khóa trước khi báo lỗi `SQLITE_BUSY` |
