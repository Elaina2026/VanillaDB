# Tài liệu Kỹ thuật VanillaDatabase (Wiki Tiếng Việt)

Chào mừng bạn đến với hệ thống tài liệu kỹ thuật chi tiết của **VanillaDatabase (VanillaDB)**.

---

## 📚 Danh mục tài liệu

1. [**Bắt đầu & Thiết lập Môi trường**](01-getting-started.md)
   - Yêu cầu hệ thống, các bước cài đặt, cấu hình biến môi trường, khởi tạo Super Admin ban đầu.
2. [**Kiến trúc & Thiết kế Động cơ**](02-architecture.md)
   - Kiến trúc SQLite đa khách thuê (Multi-tenant), chế độ WAL, bộ đệm kết nối, phân tách Control Plane và Data Plane.
3. [**Quản trị Cơ sở Dữ liệu & Động cơ SQL**](03-database-engine.md)
   - Quản lý cấu trúc bảng, câu lệnh tham số hóa an toàn, giao dịch batch atomic, hàm toán học AI vector và mật mã tích hợp.
4. [**Data Plane & Tham chiếu REST API**](04-api-reference.md)
   - Đặc tả chi tiết các endpoint SQL query, batch transaction, thao tác CRUD bảng, kho tệp media và phân tích truy vấn.
5. [**Xác thực, Phân quyền RBAC & Bảo mật 2FA**](05-authentication-rbac-2fa.md)
   - Cấp bậc người dùng, hạn mức database, mã API Bearer Token, kiểm soát tần suất gọi API, RFC 6238 TOTP và mã dự phòng.
6. [**Luồng dữ liệu thời gian thực (SSE) & Webhooks**](06-realtime-and-webhooks.md)
   - Luồng Server-Sent Events (SSE), bộ phát sự kiện webhook bất đồng bộ, chữ ký bảo mật HMAC-SHA256, tích hợp Discord và Slack.
7. [**Lưu trữ Media & Phát luồng HTTP 206**](07-storage-and-streaming.md)
   - Tải lên tệp tin, mã hóa phong bì AES-256-GCM tại chỗ, phát luồng video/audio phân đoạn HTTP 206 Partial Content.
8. [**Sao lưu, Phục hồi & Tác vụ định kỳ**](08-backup-and-restore.md)
   - Tạo ảnh chụp nhị phân (Snapshot), kiểm tra tính toàn vẹn checksum SHA-256, khôi phục dữ liệu và lên lịch Cron Jobs tự động.
9. [**Bộ chuyển đổi CSDL Đa hệ quản trị**](09-migration-and-converter.md)
   - Di chuyển dữ liệu từ MySQL, PostgreSQL, MongoDB, NDJSON, CSV và SQLite nhị phân vào VanillaDatabase.
10. [**Triển khai & Vận hành Production**](10-deployment.md)
    - Cấu hình dịch vụ Systemd, thiết lập Nginx Reverse Proxy kèm chứng chỉ SSL/TLS, đóng gói Docker.
11. [**Khắc phục Sự cố & Câu hỏi thường gặp**](11-troubleshooting.md)
    - Các mã lỗi phổ biến, giải quyết tình trạng database locked/busy, xung đột cổng mạng và cấp quyền truy cập file.
12. [**Hướng dẫn Phát triển & Đóng góp**](12-development.md)
    - Cấu trúc thư mục dự án, chạy bộ kiểm thử Vitest, kiểm tra benchmark hiệu năng và quy trình đóng góp mã nguồn.

---

## 💡 Ví dụ mã tích hợp thực tế

- [Ví dụ gọi REST API bằng cURL](../examples/curl.vi.md)
- [Ví dụ SDK Node.js & TypeScript](../examples/nodejs.vi.md)

---

## 🌐 Tùy chọn ngôn ngữ

- 🇬🇧 **[English Documentation Wiki](../en/Home.md)**
- 📖 **[Trung tâm tài liệu chính](../README.md)**
