# Kho Lưu trữ Media & Phát luồng HTTP 206

Đặc tả kỹ thuật hệ thống lưu trữ tệp đa phương tiện theo phạm vi database, mã hóa phong bì AES-256-GCM, cơ chế chống vượt thư mục và phát luồng phân đoạn HTTP 206 Partial Content trong **VanillaDatabase**.

---

## 1. Kiến trúc Lưu trữ & Phân vùng Dữ liệu

VanillaDatabase quản lý kho media được phân vùng biệt lập theo từng tenant:
- **Đường dẫn vật lý**: `data/storage/:databaseId/file_<nanoid>.<ext>`
- **Sổ đăng ký siêu dữ liệu**: Bảng `files` lưu trữ `id`, `database_id`, `original_name`, `mime_type`, `size_bytes` và mã băm SHA-256 `checksum`.
- **Chống tấn công Path Traversal**: Mọi đường dẫn tệp được lọc nghiêm ngặt, đảm bảo không thể thoát ra khỏi thư mục gốc `data/storage/:databaseId/`.

---

## 2. Mã hóa Phong bì AES-256-GCM Dữ liệu Tĩnh

Tệp tải lên được mã hóa tự động trước khi ghi xuống đĩa cứng:

```
+-----------+-----------+----------+-----------+----------------------+
| Tiêu đề   | Muối Salt | IV/Nonce | Auth Tag  | Dữ liệu Bản mã       |
| "VENC"    | 16 Bytes  | 12 Bytes | 16 Bytes  | Nội dung tệp mã hóa  |
| (4 Bytes) | (PBKDF2)  | (GCM)    | (GCM MAC) | (Độ dài biến thiên)  |
+-----------+-----------+----------+-----------+----------------------+
```

- **Dẫn xuất Khóa an toàn**: PBKDF2-SHA256 với 100,000 vòng lặp kết hợp khóa chủ `VDB_MASTER_KEY` và muối ngẫu nhiên cho từng tệp.
- **Xác thực Tính toàn vẹn**: Thuật toán AES-256-GCM kiểm tra mã xác thực MAC trước khi gửi dữ liệu về client, ngăn chặn giả mạo file.

---

## 3. Phát luồng Phân đoạn HTTP 206 Partial Content

Khi phát các tệp âm thanh (`.mp3`, `.wav`) hoặc video (`.mp4`, `.webm`), trình duyệt gửi tiêu đề yêu cầu `Range` để tua đến đoạn cần phát:

```http
GET /v1/databases/:databaseId/storage/:fileId HTTP/1.1
Authorization: Bearer vdb_live_...
Range: bytes=1048576-2097151
```

### Quy trình Xử lý Máy chủ
1. Xác minh quyền hạn token và kiểm tra tính hợp lệ của dải byte yêu cầu.
2. Trích xuất và giải mã luồng byte tương ứng trong bộ nhớ.
3. Trả về phản hồi `HTTP 206 Partial Content`:

```http
HTTP/1.1 206 Partial Content
Accept-Ranges: bytes
Content-Range: bytes 1048576-2097151/15728640
Content-Length: 1048576
Content-Type: video/mp4
Content-Security-Policy: default-src 'none'; sandbox
X-Content-Type-Options: nosniff
```

Cơ chế này cho phép các trình phát HTML `<video>` và `<audio>` tua tức thì đến bất kỳ thời điểm nào mà không cần tải toàn bộ tệp.

---

## 4. Kiểm định Khóa ngoại & Toàn vẹn Tệp tải lên

Đặc tả kỹ thuật kiểm định tham chiếu, cấu trúc lỗi chuẩn và cơ chế hoạt động đa nút cluster:
- **Ràng buộc Khóa ngoại**: Bảng metadata `files` áp dụng nghiêm ngặt `FOREIGN KEY (database_id) REFERENCES databases(id) ON DELETE CASCADE`.
- **Kiểm định Thực thể Cha Trước khi Lưu (Pre-flight Validation)**: Trước khi lưu tệp hoặc nhận stream dữ liệu, hệ thống kiểm tra sự tồn tại của `databaseId` trong danh mục metadata. Nếu cơ sở dữ liệu không tồn tại, máy chủ phản hồi ngay lập tức HTTP `404 Not Found` với mã lỗi chuẩn `DATABASE_NOT_FOUND` theo cấu trúc envelope `{ success: false, error: { code: 'DATABASE_NOT_FOUND', message: '...' } }`.
- **Tự động Đăng ký Nút Lưu trữ (Worker Auto-Registration)**: Trên các worker storage node lưu trữ tệp `.sqlite` trực tiếp trên đĩa (`data/databases/:databaseId.sqlite`), hệ thống tự động đăng ký bản ghi cơ sở dữ liệu vào catalog metadata cục bộ để bảo toàn ràng buộc khóa ngoại khi API Gateway chuyển tiếp tải tệp.
- **Dọn dẹp Tệp Mồ côi (Orphan Cleanup Guarantee)**: Nếu quá trình lưu tệp hoặc lệnh INSERT gặp lỗi, tệp đã ghi trên đĩa sẽ lập tức bị xóa bỏ (`fs.unlinkSync`), đảm bảo không để lại tệp rác trên hệ thống.
- **Chuẩn hóa Siêu dữ liệu (Metadata Normalization)**: Các giá trị metadata tùy chọn nếu là chuỗi rỗng hoặc chỉ chứa khoảng trắng sẽ được tự động chuẩn hóa về giá trị `NULL`.

---

## 5. Cách ly & Bảo vệ Nội dung Tệp Tĩnh (Active Content Isolation)

- **Danh sách Trắng MIME & Bắt buộc Tải về (Forced Attachment)**: Chỉ các định dạng tĩnh an toàn (`image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/avif`, `audio/*`, `video/*`) được xem trực tiếp (inline). Các tệp có khả năng thực thi (`image/svg+xml`, `text/html`, XML, PDF, script) bắt buộc gửi `Content-Disposition: attachment; filename="..."` và `Content-Security-Policy: sandbox; default-src 'none'`.
- **Chuẩn hóa MIME**: Máy chủ xác định MIME theo phần mở rộng tệp và chữ ký bytes thay vì tin tưởng hoàn toàn header từ phía client.
- **Header An toàn**: Mọi phản hồi xem tệp đều kèm theo `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`, và `Referrer-Policy: no-referrer`.
- **Vé Dùng Một Lần & Cấm Hoàn toàn Query Token**: Việc truyền trực tiếp token qua `?token=...` bị nghiêm cấm hoàn toàn trên toàn bộ các route (kể cả stream/media) với mã lỗi HTTP 401 `QUERY_TOKEN_NOT_PERMITTED` theo chuẩn RFC 6750. Đối với việc nhúng thẻ `<img src="...">`, `<audio src="...">`, `<video src="...">`, hoặc `EventSource`, ứng dụng bắt buộc xin vé dùng một lần qua `POST /v1/databases/:id/tickets` và truyền `?ticket=vdb_ticket_...` (hiệu lực 60 giây, chỉ dùng 1 lần).

---

## 6. Quy trình Lưu trữ Ảnh đại diện Nội bộ

- **Điểm cuối**: `POST /api/auth/profile/avatar` (multipart/form-data).
- **Giới hạn Dung lượng**: 10 MB (`AVATAR_MAX_BYTES`). Tệp vượt quá ngưỡng này bị từ chối ngay với HTTP 413 `FILE_TOO_LARGE`.
- **Xác minh Định dạng Nhị phân**: Bỏ qua header `Content-Type` và phần mở rộng do client gửi, máy chủ quét trực tiếp chữ ký byte nhị phân (magic bytes) cho `image/png`, `image/jpeg`, `image/webp`. Các định dạng không hợp lệ trả về HTTP 415 `UNSUPPORTED_MEDIA_TYPE`.
- **Lưu trữ trên Ổ đĩa**: Tệp nhị phân được ghi nguyên tử vào `data/storage/avatars/:userId.<ext>` qua tệp tạm và atomic rename. Tệp ảnh cũ của người dùng được tự động dọn dẹp.
- **Điểm cuối Phục vụ Ảnh**: `GET /api/auth/avatar/:userId` trả về ảnh gốc kèm `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, và `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`.
- **Xóa Ảnh**: `DELETE /api/auth/profile/avatar` xóa tệp khỏi ổ đĩa và cập nhật trường `avatar_url` trong cơ sở dữ liệu về `NULL`.
- **Hạch toán Dung lượng**: Ảnh đại diện được lưu ở cấp hệ thống (`data/storage/avatars/`) và hoàn toàn tách biệt, không tính vào hạn mức lưu trữ tenant database (`max_storage_mb`).
- **Kiến trúc Single Gateway**: Tệp avatar lưu trực tiếp trên ổ đĩa cục bộ của máy chủ Gateway độc lập, không yêu cầu chia sẻ file phân tán multi-gateway.
- **Tương thích Ngược**: Các tài khoản cũ có `avatar_url` dạng `https://...` hoặc `data:image/...` tiếp tục hiển thị bình thường. `PUT /api/auth/profile` chặn URL ngoài và data URI mới để triệt tiêu nguy cơ tracking pixel của bên thứ ba.


