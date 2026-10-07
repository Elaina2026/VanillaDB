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

