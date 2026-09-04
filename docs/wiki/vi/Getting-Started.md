# Bắt đầu với VanillaDatabase (Getting Started)

Hướng dẫn cài đặt và thiết lập VanillaDatabase cho môi trường cục bộ và máy chủ thực tế (Production).

---

## 1. Yêu cầu hệ thống

- **Node.js**: Phiên bản `v22.0.0` trở lên (bắt buộc để sử dụng thư viện chuẩn `node:sqlite`).
- **NPM**: Phiên bản `v10.0.0` trở lên.
- **RAM tối thiểu**: 512 MB (VanillaDB chỉ tiêu thụ ~35MB–50MB khi chạy thực tế).
- **Hệ điều hành**: Linux (Ubuntu, Debian, Alpine, RHEL), macOS, hoặc Windows.

---

## 2. Cài đặt nhanh trên máy tính hoặc VPS

```bash
# 1. Sao chép kho mã nguồn
git clone https://github.com/Elaina2026/VanillaDB.git
cd VanillaDatabase

# 2. Cài đặt các gói phụ thuộc
npm install

# 3. Tạo tệp cấu hình môi trường
cp .env.example .env

# 4. Biên dịch mã nguồn client và server
npm run build

# 5. Khởi chạy máy chủ sản xuất
npm start
```

Mặc định máy chủ sẽ lắng nghe tại cổng `http://localhost:3000`.

---

## 3. Khởi tạo tài khoản Quản trị viên (Super Admin)

1. Mở trình duyệt và truy cập `http://localhost:3000`.
2. Giao diện chào mừng sẽ hiển thị biểu mẫu thiết lập tài khoản ban đầu:
   - **Tên đăng nhập (Username)**: Tối thiểu 3 ký tự.
   - **Mật khẩu (Password)**: Tối thiểu 6 ký tự.
3. Nhấn **"Khởi tạo Quản trị viên"** để hoàn tất cấu hình.

---

## 4. Các phím tắt nhanh cần nhớ

- `Ctrl + K`: Mở thanh tìm kiếm lệnh và database toàn năng (Command Palette).
- `Ctrl + B`: Mở cửa sổ tạo cơ sở dữ liệu mới.
- `Ctrl + Shift + L`: Đổi ngôn ngữ giữa Tiếng Anh và Tiếng Việt.
- `Alt + 1` .. `Alt + 6`: Chuyển đổi qua lại giữa các trang điều khiển chính.
