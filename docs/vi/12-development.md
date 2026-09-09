# Hướng dẫn Phát triển Mã nguồn & Đóng góp

Cẩm nang chi tiết dành cho các nhà phát triển mong muốn đóng góp, mở rộng tính năng hoặc đo lường hiệu năng của **VanillaDatabase**.

---

## 1. Quy trình Phát triển Cục bộ

### Thiết lập Môi trường Local
```bash
# Tải mã nguồn dự án
git clone https://github.com/Elaina2026/VanillaDB.git
cd VanillaDB

# Cài đặt các gói phụ thuộc
npm install

# Khởi chạy môi trường phát triển với hot-reload
npm run dev
```

Môi trường phát triển sẽ khởi động đồng thời Fastify và Vite dev server với tính năng Hot Module Replacement (HMR) cho giao diện web.

---

## 2. Kiểm thử Tự động & Đảm bảo Chất lượng

### Chạy Kiểm thử Vitest
```bash
npm test
```
Toàn bộ 94 bài kiểm thử tích hợp xác thực:
- Thiết lập quản trị viên ban đầu và cơ chế đăng nhập.
- Thực thi SQL an toàn qua hộp cát và tham số hóa.
- Phân quyền token theo phạm vi và danh sách bảng cho phép/chặn.
- Giao dịch nguyên tử theo lô với bảo đảm rollback an toàn.
- Kho lưu trữ media mã hóa AES-256-GCM và phát luồng HTTP 206 Partial Content.
- Tạo bản sao lưu ảnh chụp mã hóa, phục hồi và kiểm tra toàn vẹn mã băm SHA-256.
- Gửi webhook bất đồng bộ kèm chữ ký HMAC và tường lửa chặn SSRF.
- Hàm AI vector bản địa (`vec_cosine_similarity()`, `vec_cosine_distance()`).
- Thu hồi phiên làm việc tức thì khi thay đổi mật khẩu (`VDB-SEC-01`).
- Chống phát lại mã xác thực TOTP 2FA theo RFC 6238 (`VDB-SEC-02`).

### Kiểm tra Biên dịch & Kiểu dữ liệu TypeScript
```bash
# Biên dịch giao diện và mã nguồn máy chủ
npm run build

# Chỉ chạy kiểm tra kiểu dữ liệu
npm run typecheck
```

### Đo điểm Hiệu năng (Benchmark)
```bash
npm run benchmark
```
Đo đạc thông lượng xử lý và phân phối độ trễ (p50, p95, p99) khi ghi đơn, đọc song song và giao dịch hàng loạt.

---

## 3. Quy chuẩn Đóng góp & Tạo Pull Request

Trước khi gửi Pull Request:
1. Đảm bảo toàn bộ 94 bài kiểm thử Vitest vượt qua mà không có lỗi hồi quy.
2. Khẳng định lệnh `npm run build` kết thúc thành công với 0 lỗi TypeScript.
3. Tuân thủ phong cách lập trình: Fastify route schemas, Zod validation và Pino logger.
4. Đồng bộ tài liệu song ngữ tại cả `docs/en/` và `docs/vi/`.
5. Tuyệt đối không sử dụng các biểu tượng unicode emoji thông thường trong tài liệu, commit message hoặc log hệ thống.
