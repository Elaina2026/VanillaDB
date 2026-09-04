# Tài liệu kỹ thuật VanillaDatabase (Wiki Tiếng Việt)

Chào mừng bạn đến với hệ thống tài liệu kỹ thuật chi tiết của **VanillaDatabase (VanillaDB)**.

---

## 📚 Danh mục tài liệu

1. [**Bắt đầu & Cài đặt Môi trường (Getting Started)**](Getting-Started.md)
   - Yêu cầu hệ thống, cài đặt, cấu hình biến môi trường và khởi tạo tài khoản quản trị Super Admin.
2. [**Kiến trúc Động cơ (Architecture)**](Architecture.md)
   - Kiến trúc SQLite đa khách thuê (Multi-tenant), cơ chế WAL mode, quản lý bộ nhớ đệm, phân tách Control Plane và Data Plane.
3. [**Quản trị Cơ sở Dữ liệu & Động cơ SQL (Database)**](Database.md)
   - Quản lý cấu trúc bảng (Schema), câu lệnh tham số hóa an toàn, giao dịch batch atomic, hàm toán học AI vector và mật mã tích hợp.
4. [**Data Plane & Tham chiếu REST API (API)**](API.md)
   - Đặc tả chi tiết các endpoint SQL query, batch transaction, thao tác CRUD dữ liệu bảng, kho tệp media và phân tích truy vấn.
5. [**Xác thực, Phân quyền RBAC & Quotas (Authentication)**](Authentication.md)
   - Cấp bậc người dùng, hạn mức số lượng database, mã API Bearer Token, kiểm soát tần suất gọi API (Rate Limiting) và ma trận quyền hạn.
6. [**Luồng dữ liệu thời gian thực (SSE) & Webhooks (Realtime & Webhooks)**](Realtime-and-Webhooks.md)
   - Giao thức Server-Sent Events (SSE), bộ phát sự kiện webhook bất đồng bộ, chữ ký bảo mật HMAC-SHA256, tích hợp Discord và Telegram.
7. [**Lưu trữ Media & Phát luồng HTTP 206 (Storage & Streaming)**](Storage-and-Streaming.md)
   - Tải lên tệp nhị phân, mã hóa phong bì AES-256-GCM tại chỗ, phát luồng video/audio phân đoạn HTTP 206 Partial Content.
8. [**Sao lưu, Phục hồi & Tác vụ định kỳ (Backup, Restore & Jobs)**](Backup-and-Restore.md)
   - Tạo ảnh chụp nhị phân (Snapshot), kiểm tra tính toàn vẹn checksum SHA-256, khôi phục dữ liệu và lên lịch Cron Tasks tự động.
9. [**Chuyển đổi dữ liệu Đa hệ quản trị (Import & Export)**](Import-and-Export.md)
   - Di chuyển dữ liệu từ MySQL, PostgreSQL, MongoDB, NDJSON, CSV và SQLite nhị phân vào VanillaDatabase.
10. [**Triển khai & Vận hành Production (Deployment)**](Deployment.md)
    - Cấu hình dịch vụ Systemd, thiết lập Nginx Reverse Proxy kèm chứng chỉ SSL/TLS, đóng gói Docker.
11. [**Khắc phục sự cố & Câu hỏi thường gặp (Troubleshooting)**](Troubleshooting.md)
    - Các mã lỗi phổ biến, giải quyết tình trạng database locked/busy, xung đột cổng mạng và cấp quyền truy cập file.
12. [**Phát triển & Đóng góp mã nguồn (Development)**](Development.md)
    - Cấu trúc thư mục dự án, chạy bộ kiểm thử Vitest, kiểm tra benchmark hiệu năng và quy trình tạo Pull Request.
