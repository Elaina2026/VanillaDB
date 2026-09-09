# Tài liệu Kỹ thuật VanillaDatabase (Tiếng Việt)

Chào mừng bạn đến với hệ thống tài liệu kỹ thuật chi tiết của **VanillaDatabase (VanillaDB)**.

---

## Điều hướng & Lựa chọn ngôn ngữ

- **Trung tâm tài liệu**: [Central Hub](../README.md)
- **Phiên bản Tiếng Anh**: [English Documentation](../en/Home.md)
- **Mã nguồn dự án**: [GitHub Repository](https://github.com/Elaina2026/VanillaDB)

---

## Mục lục chuyên đề

### [CHUYÊN ĐỀ 01] Hướng dẫn Khởi động & Cài đặt
- Tệp: [01-getting-started.md](01-getting-started.md)
- Nội dung: Yêu cầu hệ thống, cấu hình biến môi trường, khởi tạo tài khoản Super Admin ban đầu, lệnh CLI đặt lại mật khẩu và kiểm tra trạng thái sức khỏe.

### [CHUYÊN ĐỀ 02] Kiến trúc Hệ thống & Động cơ
- Tệp: [02-architecture.md](02-architecture.md)
- Nội dung: Kiến trúc SQLite đa người thuê, chế độ Write-Ahead Logging (WAL), tách biệt Control Plane và Data Plane, quản lý bộ nhớ đệm kết nối và tối ưu RAM.

### [CHUYÊN ĐỀ 03] Quản trị Cơ sở Dữ liệu & Động cơ SQL
- Tệp: [03-database-engine.md](03-database-engine.md)
- Nội dung: Vòng đời tạo và quản lý database, kiểm tra cấu trúc schema, thực thi truy vấn tham số hóa, giao dịch theo lô, hàm AI vector và hàm mã hóa SQL.

### [CHUYÊN ĐỀ 04] Tầng Dữ liệu & Tham chiếu REST API
- Tệp: [04-api-reference.md](04-api-reference.md)
- Nội dung: Quy chuẩn chi tiết các endpoint `/v1/databases/:id/query`, `/exec`, `/batch`, `/tables`, `/schema`, `/realtime`, và `/storage`.

### [CHUYÊN ĐỀ 05] Xác thực, Phân quyền RBAC & Bảo mật 2FA
- Tệp: [05-authentication-rbac-2fa.md](05-authentication-rbac-2fa.md)
- Nội dung: Phân quyền vai trò hệ thống (`super_admin`, `admin`, `user`), vai trò database (`owner`, `admin`, `editor`, `viewer`), mã token Bearer, thu hồi phiên làm việc (`VDB-SEC-01`), chống phát lại mã TOTP (`VDB-SEC-02`) và mã dự phòng.

### [CHUYÊN ĐỀ 06] Sự kiện Realtime (SSE) & Webhooks
- Tệp: [06-realtime-and-webhooks.md](06-realtime-and-webhooks.md)
- Nội dung: Kết nối Server-Sent Events, định dạng gói tin thay đổi dữ liệu, hệ thống gửi webhook bất đồng bộ, ký xác thực HMAC-SHA256 và cơ chế chặn SSRF.

### [CHUYÊN ĐỀ 07] Kho Lưu trữ Media & Phát luồng HTTP 206
- Tệp: [07-storage-and-streaming.md](07-storage-and-streaming.md)
- Nội dung: Lưu trữ media theo database, mã hóa khối AES-256-GCM trong suốt và phát luồng âm thanh/video phân đoạn HTTP 206 Partial Content.

### [CHUYÊN ĐỀ 08] Sao lưu, Phục hồi & Hẹn giờ Tự động
- Tệp: [08-backup-and-restore.md](08-backup-and-restore.md)
- Nội dung: Tạo bản sao lưu tức thì, xác minh mã kiểm tra toàn vẹn SHA-256, khôi phục database theo thời điểm và worker chạy ngầm dọn dẹp log.

### [CHUYÊN ĐỀ 09] Chuyển đổi & Nhập Cơ sở Dữ liệu Đa phương ngữ
- Tệp: [09-migration-and-converter.md](09-migration-and-converter.md)
- Nội dung: Hướng dẫn chuyển đổi dữ liệu từ MySQL, PostgreSQL, MongoDB / NDJSON, CSV và file nhị phân SQLite.

### [CHUYÊN ĐỀ 10] Triển khai Production & Vận hành Cloudflare
- Tệp: [10-deployment.md](10-deployment.md)
- Nội dung: Hướng dẫn cấu hình dịch vụ systemd, thiết lập Cloudflare SSL Flexible kết hợp Origin Rules dẫn cổng, Docker Compose và cập nhật không gián đoạn.

### [CHUYÊN ĐỀ 11] Cẩm nang Khắc phục Sự cố & FAQ
- Tệp: [11-troubleshooting.md](11-troubleshooting.md)
- Nội dung: Xử lý lỗi tranh chấp khóa `SQLITE_BUSY`, lỗi định dạng MIME type, quản lý bộ nhớ, sự cố phiên đăng nhập và quy trình phục hồi khẩn cấp.

### [CHUYÊN ĐỀ 12] Hướng dẫn Phát triển Mã nguồn & Đóng góp
- Tệp: [12-development.md](12-development.md)
- Nội dung: Thiết lập môi trường lập trình local, chạy kiểm thử Vitest (94/94 passed), kiểm tra biên dịch, quy chuẩn code và quy trình mở PR.

---

## Ví dụ Tích hợp Thực tế

- [Ví dụ Tích hợp qua cURL](../examples/curl.vi.md)
- [Ví dụ Tích hợp Node.js & TypeScript SDK](../examples/nodejs.vi.md)
