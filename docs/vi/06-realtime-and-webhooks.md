# Luồng Dữ liệu Thời gian thực (SSE) & Webhooks

VanillaDatabase tích hợp sẵn một trục truyền tin sự kiện (event bus) có khả năng phát luồng các thay đổi dữ liệu trực tiếp tới bảng điều khiển trình duyệt, các bộ SDK và các endpoint webhook bên ngoài.

---

## 1. Kênh Luồng Server-Sent Events (SSE)

### Kết nối
- **Endpoint**: `GET /v1/databases/:databaseId/realtime`
- **Tham số tùy chọn**: `?table=users` (lọc sự kiện chỉ riêng cho một bảng cụ thể)
- **Xác thực**: Tiêu đề `Authorization: Bearer vdb_live_...` hoặc tham số `?token=vdb_live_...` hoặc Cookie phiên quản trị viên.

### Giao thức Truyền tin
Endpoint duy trì kết nối luồng chuẩn `text/event-stream`:
- Gửi nhịp tim định kỳ mỗi 20 giây (`event: ping`) nhằm duy trì kết nối qua các tường lửa NAT và reverse proxy.
- Phát các sự kiện thay đổi dữ liệu thực tế (`insert`, `update`, `delete`, `schema`).

### Cấu trúc Gói tin Sự kiện
```json
event: insert
data: {
  "databaseId": "db_production_123",
  "table": "users",
  "type": "insert",
  "data": {
    "row": { "id": 15, "username": "elaina", "coins": 500 },
    "result": { "changes": 1, "lastInsertRowid": 15 }
  },
  "timestamp": 1724901234567
}
```

---

## 2. Động cơ Webhooks

VanillaDatabase có thể gửi các yêu cầu HTTP POST bất đồng bộ có kèm chữ ký mật mã tới các dịch vụ bên ngoài mỗi khi có biến động dữ liệu.

### Tính năng Nổi bật
1. **Lọc Sự kiện Linh hoạt**: Đăng ký nhận tất cả sự kiện (`*`) hoặc từng hành động cụ thể (`insert`, `update`, `delete`, `schema`).
2. **Chữ ký Mật mã HMAC-SHA256**: Mỗi yêu cầu đều đính kèm tiêu đề `X-Vanilla-Signature` được tạo từ khóa bí mật riêng của webhook đó.
3. **Định dạng Tự động cho Discord & Slack**:
   - Nếu URL khớp với `discord.com/api/webhooks`, hệ thống tự động đóng gói dữ liệu thành khung Discord Embeds sinh động với màu sắc trực quan (`insert` = xanh lá, `update` = xanh dương, `delete` = đỏ, `schema` = tím).
   - Nếu URL khớp với `hooks.slack.com`, thông điệp được tự động định dạng thành khối tin nhắn chuẩn của Slack.
4. **Theo dõi Tình trạng & Thử lại (Health Tracking)**: Ghi nhận thời điểm kích hoạt gần nhất và số lần thất bại liên tiếp. Có thể kiểm tra thử và đặt lại trạng thái webhook ngay trên giao diện dashboard.

### Xác thực Chữ ký Webhook (Ví dụ trên Node.js)

```javascript
import crypto from 'crypto';

function verifySignature(payloadBuffer, secret, signatureHeader) {
  const expected = crypto.createHmac('sha256', secret).update(payloadBuffer).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}
```
