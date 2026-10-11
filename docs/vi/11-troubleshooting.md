# Cẩm nang Khắc phục Sự cố & FAQ

Tổng hợp các lỗi vận hành thường gặp, hướng dẫn chẩn đoán và giải đáp các thắc mắc phổ biến trong **VanillaDatabase**.

---

## 1. Các Sự cố Vận hành Thường gặp

### 1.1. Lỗi `SQLITE_BUSY: database is locked` (HTTP 503)
- **Nguyên nhân**: Một tiến trình ghi khác đang giữ khóa độc quyền trong lúc commit hoặc checkpoint.
- **Cách khắc phục**:
  - VanillaDatabase áp dụng thời gian chờ 5,000ms (`VDB_SQL_BUSY_TIMEOUT_MS=5000`).
  - Đảm bảo các giao dịch diễn ra nhanh chóng. Không gọi các tác vụ mạng dài hạn bên trong các khối giao dịch hàng loạt.
  - Kiểm tra chế độ WAL đang hoạt động (`PRAGMA journal_mode;` trả về `wal`).

### 1.2. Lỗi Cloudflare 502 Bad Gateway
- **Nguyên nhân**: Cloudflare chuyển tiếp lưu lượng HTTPS vào cổng 443 của máy chủ gốc (đang đóng) thay vì cổng dịch vụ thực tế của backend (ví dụ: 3000 hoặc 25589).
- **Cách khắc phục**:
  - Vào Cloudflare Dashboard -> **Rules** -> **Origin Rules**, tạo rule viết lại cổng đích (Rewrite Destination Port) về cổng ứng dụng thực tế.
  - Chọn chế độ mã hóa SSL/TLS là **Flexible** nếu máy chủ gốc chỉ hỗ trợ HTTP, hoặc **Full** nếu máy chủ có chứng chỉ SSL.

### 1.3. Trình duyệt Bị treo ở Màn hình "Loading VanillaDatabase..."
- **Nguyên nhân**: Trễ mạng hoặc yêu cầu API kiểm tra trạng thái bị treo khiến giao diện không thể hoàn tất hydrate.
- **Cách khắc phục**:
  - VanillaDatabase đã tích hợp bộ ngắt `AbortController` (12 giây) trên `apiRequest` và cơ chế fallback 3 giây trong `useAuth`.
  - Nếu vẫn treo, kiểm tra xem máy chủ backend có đang chạy và phản hồi hay không qua lệnh: `curl http://localhost:3000/health`.

### 1.4. Lỗi `Failed to load module script: Expected JavaScript but responded with text/html`
- **Nguyên nhân**: Máy chủ đang phục vụ tệp HTML chưa biên dịch thay vì gói bundle production hoàn chỉnh.
- **Cách khắc phục**:
  - Chạy `npm run build` để Vite biên dịch toàn bộ giao diện vào thư mục `dist/client/`.

### 1.5. Phiên làm việc Bị thu hồi (`Session revoked due to password or credential change`)
- **Nguyên nhân**: Người dùng đã đổi mật khẩu hoặc quản trị viên đã thay đổi quyền hạn/vô hiệu hóa tài khoản (VDB-SEC-01).
- **Cách khắc phục**:
  - Đăng nhập lại qua `POST /api/auth/login` để nhận cookie phiên mới mang giá trị `token_version` cập nhật.

### 1.6. Lỗi `INVALID_TOTP_CODE` khi Đăng nhập 2FA
- **Nguyên nhân**: Đồng hồ thiết bị xác thực bị lệch giờ hoặc mã OTP đã bị sử dụng trong vòng 90 giây trước đó (VDB-SEC-02).
- **Cách khắc phục**:
  - Đồng bộ lại giờ hệ thống trên điện thoại hoặc thiết bị xác thực.
  - Đợi chu kỳ bước thời gian 30 giây tiếp theo để nhập mã mới.

### 1.7. Lỗi `QUERY_TOKEN_NOT_PERMITTED` (HTTP 401)
- **Nguyên nhân**: Truyền API token qua chuỗi truy vấn URL (`?token=...`). Token trong URL bị cấm triệt để trên toàn bộ các route (kể cả stream/media) theo chuẩn RFC 6750.
- **Cách khắc phục**:
  - Chuyển các kịch bản curl hoặc ứng dụng ngoài sang dùng tiêu đề chuẩn:
    ```bash
    curl -X POST http://localhost:3000/v1/databases/:id/query \
      -H "Authorization: Bearer <token>" \
      -H "Content-Type: application/json" \
      -d '{"sql": "SELECT 1;"}'
    ```
  - Với các trường hợp nhúng media hoặc kết nối SSE (`EventSource`) không thể gửi header, tạo vé tạm thời qua `POST /v1/databases/:id/tickets` và truyền `?ticket=...`.

### 1.8. Lỗi Tải Ảnh đại diện: `FILE_TOO_LARGE` (HTTP 413) & `UNSUPPORTED_MEDIA_TYPE` (HTTP 415)
- **Nguyên nhân**: Tệp ảnh vượt quá 10MB hoặc chữ ký tệp nhị phân (magic bytes) không phải là PNG, JPEG, WebP hợp lệ (ví dụ tệp SVG, HTML hoặc tệp hỏng).
- **Cách khắc phục**:
  - Nén hoặc giảm kích thước ảnh xuống dưới 10MB.
  - Đảm bảo tệp là PNG thật (`89 50 4E 47`), JPEG thật (`FF D8 FF`), hoặc WebP thật (`RIFF....WEBP`). Máy chủ không dựa vào phần mở rộng hay header MIME của client mà kiểm tra trực tiếp byte nhị phân.

### 1.9. Lỗi `EXTERNAL_AVATAR_DISALLOWED` (HTTP 400) khi `PUT /profile`
- **Nguyên nhân**: Cố gắng lưu URL ngoài (`https://...`) hoặc chuỗi base64 mới vào trường `avatar_url` qua `PUT /api/auth/profile`.
- **Cách khắc phục**:
  - Tải tệp ảnh trực tiếp qua endpoint `POST /api/auth/profile/avatar`. Hệ thống chặn URL ngoài mới để triệt tiêu nguy cơ tracking pixel của bên thứ ba và tránh phình cơ sở dữ liệu metadata. Các tài khoản cũ có avatar từ trước vẫn hoạt động bình thường.

---

## 2. Các Câu hỏi Thường gặp (FAQ)

### VanillaDatabase có thể chạy trên VPS giá rẻ 512MB RAM không?
Có. VanillaDatabase tiêu thụ khoảng 35MB đến 50MB RAM ở trạng thái cơ bản và vận hành cực kỳ ổn định trên các máy chủ tài nguyên thấp.

### VanillaDatabase xử lý sao lưu thế nào khi đang có dữ liệu ghi liên tục?
Hệ thống sao lưu tự động chạy `PRAGMA wal_checkpoint(FULL)` trước khi chụp snapshot. Các tác vụ đọc và ghi dữ liệu của người dùng không hề bị gián đoạn.

### Toàn bộ dữ liệu được lưu trữ ở đâu trên ổ cứng?
- Cơ sở dữ liệu: `data/databases/:id.sqlite`
- Tệp Media: `data/storage/:databaseId/`
- Bản sao lưu: `data/backups/:databaseId/`
- Siêu dữ liệu hệ thống: `data/system/vanilladb.sqlite`
