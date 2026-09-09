# Sự kiện Realtime (SSE) & Webhooks

Đặc tả kỹ thuật luồng phát sự kiện thay đổi dữ liệu theo thời gian thực qua Server-Sent Events (SSE) và hệ thống gửi webhook bất đồng bộ trong **VanillaDatabase**.

---

## 1. Luồng Phát Sự kiện Server-Sent Events (SSE)

### Giao thức Kết nối
- **Điểm cuối**: `GET /v1/databases/:databaseId/realtime`
- **Bộ lọc tùy chọn**: `?table=orders` (chỉ lắng nghe sự kiện trên bảng chỉ định)
- **Xác thực**: Bearer API token hoặc session cookie hợp lệ
- **Giữ kết nối (Keep-Alive)**: Tự động gửi gói tin ping nhịp tim mỗi 20 giây (`event: ping`) để chống ngắt kết nối bởi reverse proxy.

### Định dạng & Cấu trúc Gói tin
```http
event: insert
data: {"databaseId":"db_production","table":"orders","type":"insert","data":{"row":{"id":1024,"customer":"Alice","total":89.5},"result":{"changes":1,"lastInsertRowid":1024}},"timestamp":1788854400000}

event: delete
data: {"databaseId":"db_production","table":"sessions","type":"delete","data":{"row":{"id":"sess_old"},"result":{"changes":1}},"timestamp":1788854410000}
```

---

## 2. Động cơ Webhook & Bộ Điều phối Sự kiện

VanillaDatabase hỗ trợ gửi yêu cầu HTTP POST có ký số xác thực bất đồng bộ tới các dịch vụ bên ngoài khi dữ liệu thay đổi.

### Khả năng Vận hành
1. **Lọc sự kiện**: Đăng ký nhận toàn bộ sự kiện (`*`) hoặc theo từng hành động cụ thể (`insert`, `update`, `delete`, `schema`).
2. **Chữ ký số HMAC-SHA256**: Mỗi gói tin mang tiêu đề `X-Vanilla-Signature` được tính toán từ khóa bí mật của webhook.
3. **Tường lửa Chặn SSRF**:
   - Trình điều phối kiểm tra URL đích, chặn đứng các dải IP loopback (`127.0.0.0/8`, `::1`), dải mạng riêng tư RFC 1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), địa chỉ link-local và siêu dữ liệu đám mây (`169.254.169.254`).
   - Yêu cầu cấu hình webhook trỏ vào dải mạng nội bộ bị từ chối ngay (`400 Bad Request`).
4. **Tích hợp Nền tảng Bên thứ ba**:
   - **Discord**: Tự động chuyển đổi payload thành dạng embed nhiều màu sắc (`discord.com/api/webhooks`).
   - **Slack**: Định dạng theo cấu trúc khối Block Kit chuẩn (`hooks.slack.com`).
5. **Chống chịu lỗi**: Tự động thử lại khi gặp sự cố mạng tạm thời, đếm số lần lỗi liên tiếp và cho phép gửi thử nghiệm từ giao diện quản trị.

---

## 3. Xác minh Chữ ký Webhook (Phía Máy chủ Nhận)

Máy chủ nhận xác minh tính toàn vẹn của webhook bằng so sánh HMAC an toàn chống timing attack:

### Mã nguồn Node.js Mẫu
```javascript
import crypto from 'crypto';

export function verifyWebhook(rawBody, secret, signatureHeader) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const expected = hmac.digest('hex');

  if (signatureHeader.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
}
```

### Mã nguồn Python Mẫu
```python
import hmac
import hashlib

def verify_webhook(raw_body: bytes, secret: str, signature_header: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)
```
