# Lưu trữ Media & Phát luồng HTTP 206 Phân đoạn

VanillaDatabase tích hợp sẵn một phân hệ lưu trữ tệp tin media được phân vùng độc lập theo từng database khách thuê, đi kèm cơ chế mã hóa tĩnh xác thực trong suốt và khả năng phát luồng video/audio trực tiếp.

---

## 1. Kiến trúc Lưu trữ

- Tệp tin được lưu trên ổ đĩa theo cấu trúc: `data/storage/:databaseId/file_<nanoid>.<ext>`
- Thông tin metadata (ID tệp, kích thước, định dạng MIME, mã kiểm tra checksum SHA-256, metadata JSON tùy biến) được ghi nhận trong bảng `files` tại cơ sở dữ liệu metadata trung tâm.
- **Bảo vệ Chống Tấn công Path Traversal**: Mọi đường dẫn tệp đều được làm sạch bằng `path.basename()` và kiểm tra nghiêm ngặt không vượt ra ngoài phạm vi thư mục gốc `data/storage`.

---

## 2. Mã hóa Dữ liệu Tĩnh Chuẩn Doanh nghiệp (AES-256-GCM)

Mọi tệp tin khi tải lên VanillaDatabase đều tự động được mã hóa trước khi ghi xuống đĩa:
- **Cấu trúc Phong bì Mã hóa (Envelope)**: `[VENC(4B)][SALT(16B)][IV(12B)][TAG(16B)][CIPHERTEXT]`
- Khóa mã hóa được dẫn xuất từ khóa chủ của hệ thống thông qua thuật toán PBKDF2 (100.000 vòng lặp).
- Ngay cả khi ổ cứng vật lý hoặc snapshot bị trích xuất trái phép, nội dung tệp tin media thô đều không thể đọc được nếu không có khóa mã hóa chủ.

---

## 3. Phát luồng Phân đoạn HTTP 206 Partial Content

Khi phát luồng các tệp video (`.mp4`, `.webm`) hoặc âm thanh (`.mp3`, `.wav`), các trình duyệt hiện đại sẽ gửi tiêu đề `Range` để tua nhanh hoặc phát từng đoạn dữ liệu:
```http
GET /v1/files/file_abc123/view HTTP/1.1
Range: bytes=1048576-2097151
Authorization: Bearer vdb_live_...
```

VanillaDatabase xử lý các yêu cầu phân đoạn một cách hoàn toàn tự động và trong suốt:
1. Xác thực quyền hạn của mã token và kiểm tra tính hợp lệ của phạm vi byte.
2. Tiến hành giải mã phân đoạn tệp được yêu cầu trực tiếp trong bộ nhớ (on-the-fly).
3. Phản hồi với mã trạng thái `HTTP 206 Partial Content`:
```http
HTTP/1.1 206 Partial Content
Content-Range: bytes 1048576-2097151/15728640
Accept-Ranges: bytes
Content-Length: 1048576
Content-Type: video/mp4
```

Cơ chế này cho phép các trình phát thẻ `<video>` và `<audio>` chuẩn HTML5 có thể tua nhanh (scrub) mượt mà trên các tệp media dung lượng lớn.
