# Lưu trữ Media & Phát luồng HTTP 206 (Storage & Streaming)

VanillaDatabase tích hợp sẵn hệ thống con quản lý tệp tin đa phương tiện được phân vùng riêng cho từng database, hỗ trợ mã hóa tại chỗ và phát luồng video mượt mà.

---

## 1. Kiến trúc lưu trữ

- Tệp tin được tổ chức trên ổ đĩa theo cấu trúc: `data/storage/:databaseId/file_<nanoid>.<ext>`
- Thông tin siêu dữ liệu (File ID, kích thước, định dạng MIME, mã băm SHA-256 checksum, metadata JSON) được lưu trong bảng `files` của metadata DB.
- **Chống tấn công Path Traversal**: Mọi đường dẫn đều được lọc bằng `path.basename()` và kiểm tra giới hạn thư mục gốc an toàn.

---

## 2. Mã hóa dữ liệu tại chỗ (AES-256-GCM)

Mọi tệp tin khi tải lên đều được mã hóa tự động trước khi ghi vào ổ đĩa:
- **Định dạng phong bì (Envelope Format)**: `[VENC(4B)][SALT(16B)][IV(12B)][TAG(16B)][CIPHERTEXT]`
- Khóa mã hóa được dẫn xuất từ khóa chủ (Master Key) thông qua PBKDF2 với 100,000 vòng lặp.
- Dù ổ cứng vật lý hoặc bản sao lưu bị trích xuất trái phép, nội dung nhị phân gốc không thể đọc được nếu thiếu khóa chủ.

---

## 3. Phát luồng phân đoạn HTTP 206 (Partial Content Range Streaming)

Khi phát video (`.mp4`, `.webm`) hoặc nhạc (`.mp3`), trình duyệt gửi header `Range` để tua nhanh đến đoạn mong muốn:
```http
GET /v1/files/file_abc123/view HTTP/1.1
Range: bytes=1048576-2097151
Authorization: Bearer vdb_live_...
```

VanillaDatabase tự động xử lý yêu cầu phân đoạn:
1. Xác thực quyền hạn của token và tính hợp lệ của dải byte yêu cầu.
2. Giải mã đoạn byte tương ứng trong bộ nhớ.
3. Trả về mã phản hồi `HTTP 206 Partial Content`:
```http
HTTP/1.1 206 Partial Content
Content-Range: bytes 1048576-2097151/15728640
Accept-Ranges: bytes
Content-Length: 1048576
Content-Type: video/mp4
```

Nhờ đó, trình phát `<video>` và `<audio>` trên web có thể tua bài hát hoặc video với độ trễ cực thấp.
