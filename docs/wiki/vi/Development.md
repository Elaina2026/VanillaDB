# Hướng dẫn Phát triển & Đóng góp (Development & Contributing)

Hướng dẫn dành cho lập trình viên muốn tham gia đóng góp, chạy bộ kiểm thử hoặc đo benchmark hiệu năng của **VanillaDatabase**.

---

## 1. Quy trình phát triển cục bộ

### Khởi tạo môi trường
```bash
# Clone kho mã nguồn
git clone https://github.com/Elaina2026/VanillaDB.git
cd VanillaDatabase

# Cài đặt các thư viện
npm install

# Khởi chạy server và web kèm hot-reload
npm run dev
```

---

## 2. Kiểm thử tự động & Đảm bảo chất lượng

### Chạy bộ kiểm thử tự động (Vitest)
```bash
npm test
```
Bộ kiểm thử tự động kiểm tra toàn diện 75 tiêu chí:
- Xác thực đăng nhập & khởi tạo quản trị viên
- Thực thi SQL tham số hóa & cơ chế hộp cát bảo mật (SQL Sandbox)
- Phân quyền token theo phạm vi & giới hạn tần suất (Rate limiting)
- Giao dịch batch atomic với khả năng rollback tự động
- Tải lên tệp, mã hóa AES-256-GCM tại chỗ & phát luồng HTTP 206
- Tạo bản sao lưu, khôi phục dữ liệu & đối chiếu checksum SHA-256
- Phát sự kiện Webhook có chữ ký xác thực HMAC-SHA256
- Các hàm toán học tính toán AI Vector mở rộng
- Xác thực 2 lớp 2FA TOTP và khôi phục tài khoản bằng mã dự phòng

### Kiểm tra kiểu dữ liệu TypeScript (Typecheck)
```bash
npm run typecheck
```

### Chạy đo kiểm hiệu năng (Benchmarks)
```bash
npm run benchmark
```
Đo lường thông lượng (QPS) và độ trễ (p50, p95, p99) khi chạy chèn đơn dòng, đọc song song và giao dịch batch dưới tải cao.
