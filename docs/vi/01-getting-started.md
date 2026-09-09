# Hướng dẫn Khởi động & Cài đặt

Hướng dẫn từng bước cài đặt, cấu hình và vận hành **VanillaDatabase** trên môi trường máy chủ cục bộ và production.

---

## 1. Yêu cầu hệ thống

- **Node.js**: Phiên bản `v22.0.0` trở lên.
- **Trình quản lý gói NPM**: Phiên bản `v10.0.0` trở lên.
- **Bộ nhớ RAM**: Tối thiểu 512MB RAM (mức tiêu thụ tài nguyên thực tế chỉ khoảng 35MB đến 50MB RAM).
- **Ổ đĩa lưu trữ**: Ổ đĩa SSD hoặc NVMe để đạt hiệu năng ghi nhật ký SQLite WAL tối ưu nhất.
- **Hệ điều hành**: Linux (Ubuntu, Debian, Alpine, RHEL), macOS hoặc Windows (x64 / arm64).

---

## 2. Các bước cài đặt nhanh

```bash
# 1. Tải mã nguồn từ GitHub
git clone https://github.com/Elaina2026/VanillaDB.git
cd VanillaDB

# 2. Cài đặt các gói phụ thuộc
npm install

# 3. Tạo tệp cấu hình môi trường
cp .env.example .env

# 4. Biên dịch giao diện frontend và mã nguồn máy chủ
npm run build

# 5. Khởi động máy chủ production
npm start
```

Theo mặc định, máy chủ lắng nghe tại địa chỉ `http://0.0.0.0:3000`.

---

## 3. Khởi tạo tài khoản Super Admin ban đầu

Khi truy cập `http://localhost:3000` lần đầu tiên:
1. Giao diện thiết lập ban đầu sẽ yêu cầu tạo tài khoản **Super Administrator**.
2. Nhập **Tên đăng nhập** (tối thiểu 3 ký tự) và **Mật khẩu** (tối thiểu 6 ký tự).
3. Bấm xác nhận để hệ thống tạo mã băm Argon2id và lưu thông tin vào `data/system/vanilladb.sqlite`.

### Khởi tạo tự động qua biến môi trường (Headless / Docker)
Đối với môi trường tự động hóa CI/CD hoặc Docker, cấu hình trực tiếp trong tệp `.env`:
```env
VDB_ADMIN_USERNAME=VanillaDatabase
VDB_ADMIN_PASSWORD=SuperSecretPassword123!
```
Khi khởi động, nếu hệ thống chưa có tài khoản nào, VanillaDatabase sẽ tự động tạo tài khoản này với vai trò `super_admin`.

### Đặt lại mật khẩu khẩn cấp qua CLI
Trong trường hợp quên mật khẩu quản trị:
```bash
npm run admin:reset <ten_dang_nhap> <mat_khau_moi>
```

---

## 4. Kiểm tra trạng thái hoạt động

Gửi yêu cầu kiểm tra endpoint sức khỏe hệ thống:
```bash
curl -i http://localhost:3000/health
```

Kết quả phản hồi mẫu:
```json
{
  "status": "ok",
  "version": "1.3.2",
  "uptime": 12.45
}
```

Kiểm tra trạng thái xác thực và phiên làm việc:
```bash
curl -i http://localhost:3000/api/auth/status
```
