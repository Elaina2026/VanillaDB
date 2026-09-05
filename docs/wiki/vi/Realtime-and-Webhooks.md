# Luồng thời gian thực (SSE) & Webhooks (Realtime & Webhooks)

VanillaDatabase tích hợp sẵn bus sự kiện hiệu năng cao để phát trực tiếp các biến đổi dữ liệu (mutations) đến trình duyệt, client SDK và các dịch vụ bên ngoài thông qua Webhook.

---

## 1. Luồng sự kiện Server-Sent Events (SSE)

### Kết nối
- **Endpoint**: `GET /v1/databases/:databaseId/realtime`
- **Lọc theo bảng (Tùy chọn)**: `?table=users`
- **Xác thực**: `Authorization: Bearer vdb_live_...` hoặc tham số URL `?token=vdb_live_...` hoặc cookie phiên làm việc Admin.

### Giao thức
Endpoint trả về luồng dữ liệu chuẩn `text/event-stream`:
- Nhịp tim định kỳ 20 giây (`event: ping`) giữ kết nối NAT và Reverse Proxy không bị ngắt.
- Các sự kiện biến đổi dữ liệu trực tiếp (`insert`, `update`, `delete`, `schema`).

### Cấu trúc gói tin sự kiện
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

## 2. Hệ thống Webhooks

Hệ thống có thể phát các yêu cầu HTTP POST bất đồng bộ có ký số đến máy chủ bên thứ ba khi có thay đổi dữ liệu.

### Tính năng chính
1. **Lọc sự kiện**: Đăng ký toàn bộ sự kiện (`*`) hoặc cụ thể (`insert`, `update`, `delete`, `schema`).
2. **Ký số HMAC-SHA256**: Mỗi yêu cầu gửi đi đều đính kèm header `X-Vanilla-Signature` được tạo từ khóa bí mật của webhook.
3. **Định dạng sẵn cho Discord & Slack**:
   - Nếu URL là `discord.com/api/webhooks`, hệ thống tự động định dạng thành Rich Embeds có màu sắc tương ứng (`insert` = xanh lá, `update` = xanh dương, `delete` = đỏ, `schema` = tím).
   - Nếu URL là `hooks.slack.com`, thông điệp được chuyển đổi thành Slack Blocks chuẩn.
4. **Theo dõi lỗi & Tự thử lại**: Ghi nhận số lần gửi thất bại liên tiếp và hỗ trợ thử nghiệm trực tiếp trên giao diện quản trị.
