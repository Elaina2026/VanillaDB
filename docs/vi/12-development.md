# Hướng dẫn Phát triển & Đóng góp Mã nguồn

Tài liệu hướng dẫn dành cho các nhà phát triển muốn tham gia đóng góp mã nguồn, chạy đo lường hiệu năng (benchmark) hoặc mở rộng tính năng cho **VanillaDatabase**.

---

## 1. Quy trình Phát triển Cục bộ

### Thiết lập Môi trường Phát triển
```bash
# Sao chép kho mã nguồn
git clone https://github.com/Elaina2026/VanillaDB.git
cd VanillaDatabase

# Cài đặt các gói phụ thuộc
npm install

# Khởi chạy máy chủ phát triển với chế độ tải lại tự động (hot reload)
npm run dev
```

---

## 2. Kiểm thử Tự động & Kiểm tra Chất lượng Mã nguồn

### Chạy Bộ Kiểm thử Tự động (Vitest)
```bash
npm test
```
Chạy toàn bộ bộ kiểm thử tích hợp nhằm xác minh:
- Quy trình xác thực và khởi tạo tài khoản quản trị ban đầu.
- Thực thi câu lệnh SQL tham số hóa và hộp cát bảo mật an toàn.
- Phân quyền API Token theo phạm vi và giới hạn tần suất gọi API.
- Giao dịch batch nguyên tử kèm cơ chế tự động hoàn tác khi xảy ra lỗi.
- Tải lên tệp media, mã hóa tĩnh AES-256-GCM và phát luồng HTTP 206 Partial Content.
- Tạo bản sao lưu, khôi phục dữ liệu và kiểm tra toàn vẹn checksum SHA-256.
- Bộ phát sự kiện Webhook ký mã hóa HMAC-SHA256.
- Các hàm toán học tính toán vector AI tùy biến.
- Xác thực hai yếu tố (2FA TOTP) và quy trình khôi phục bằng mã dự phòng.

### Kiểm tra Kiểu dữ liệu TypeScript
```bash
npm run typecheck
```

### Đo lường Hiệu năng Thực tế (Benchmark)
```bash
npm run benchmark
```
Thực hiện các bài đo tải với độ đồng thời cao nhằm đánh giá thông lượng xử lý và độ trễ (p50, p95, p99) cho các thao tác chèn đơn lẻ, đọc dữ liệu song song và giao dịch theo lô.
