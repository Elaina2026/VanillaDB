# Tầng Dữ liệu & Tham chiếu REST API

Tài liệu tham chiếu các điểm cuối HTTP thuộc Tầng Dữ liệu (`/v1`) trong **VanillaDatabase**: thực thi truy vấn SQL, giao dịch nguyên tử theo lô, thao tác CRUD bảng dữ liệu, luồng sự kiện Server-Sent Events và phát luồng tệp tin media.

---

## 1. Tiêu chuẩn Xác thực & Headers

Mọi điểm cuối Data Plane yêu cầu xác thực qua Bearer Token hoặc cookie phiên hợp lệ:

```http
Authorization: Bearer vdb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

Đối với phát luồng tệp đa phương tiện trong thẻ `<audio>`, `<img>`, hoặc `<video>`, mã token có thể được truyền trực tiếp qua tham số URL:
```http
GET /v1/databases/:databaseId/storage/:fileId?token=vdb_live_...
```

---

## 2. Bảng Tham chiếu Điểm cuối API

| Giao thức | Đường dẫn | Mô tả chức năng | Quyền hạn tối thiểu |
| :--- | :--- | :--- | :--- |
| `POST` | `/v1/databases/:databaseId/query` | Thực thi truy vấn SQL có tham số (SELECT/INSERT/UPDATE) | `database:read` hoặc `database:write` |
| `POST` | `/v1/databases/:databaseId/exec` | Thực thi một câu lệnh thay đổi dữ liệu đơn lẻ | `database:write` |
| `POST` | `/v1/databases/:databaseId/batch` | Thực thi giao dịch nhiều câu lệnh nguyên tử | `database:write` |
| `GET` | `/v1/databases/:databaseId/tables/:table/rows` | Lấy danh sách dòng với phân trang & sắp xếp | `database:read` |
| `POST` | `/v1/databases/:databaseId/tables/:table/rows` | Chèn một dòng mới vào bảng | `database:write` |
| `PUT` | `/v1/databases/:databaseId/tables/:table/rows` | Cập nhật dòng theo điều kiện lọc | `database:write` |
| `DELETE`| `/v1/databases/:databaseId/tables/:table/rows` | Xóa dòng theo điều kiện lọc | `database:write` |
| `GET` | `/v1/databases/:databaseId/schema` | Kiểm tra cấu trúc các bảng và cột dữ liệu | `database:read` |
| `GET` | `/v1/databases/:databaseId/realtime` | Kết nối luồng Server-Sent Events nhận sự kiện | `database:read` |
| `GET` | `/v1/databases/:databaseId/files` | Liệt kê các tệp media đã lưu trữ | `database:read` |
| `POST` | `/v1/databases/:databaseId/files` | Tải tệp media lên kho lưu trữ (multipart) | `database:write` |
| `GET` | `/v1/databases/:databaseId/storage/:fileId` | Phát luồng tệp tin media (HTTP 206 Range) | `database:read` |
| `DELETE`| `/v1/databases/:databaseId/files/:fileId` | Xóa tệp tin media khỏi kho lưu trữ | `database:write` |

---

## 3. Định dạng Yêu cầu & Phản hồi Mẫu

### 3.1. Thực thi Truy vấn SQL
- **POST** `/v1/databases/:databaseId/query`

**Dữ liệu gửi lên (Request Payload):**
```json
{
  "sql": "SELECT id, username, status, score FROM users WHERE score >= ? ORDER BY score DESC LIMIT ?;",
  "params": [100, 10]
}
```

**Phản hồi thành công (200 OK):**
```json
{
  "success": true,
  "data": {
    "columns": ["id", "username", "status", "score"],
    "rows": [
      { "id": 1, "username": "alice", "status": "active", "score": 250 },
      { "id": 4, "username": "bob", "status": "active", "score": 180 }
    ],
    "rowCount": 2,
    "durationMs": 0.38
  }
}
```

---

### 3.2. Giao dịch Lô Nguyên tử (Batch)
- **POST** `/v1/databases/:databaseId/batch`

**Dữ liệu gửi lên:**
```json
{
  "transaction": true,
  "statements": [
    {
      "sql": "UPDATE accounts SET balance = balance - ? WHERE id = ?;",
      "params": [50, "acc_alice"]
    },
    {
      "sql": "UPDATE accounts SET balance = balance + ? WHERE id = ?;",
      "params": [50, "acc_bob"]
    }
  ]
}
```

**Phản hồi thành công (200 OK):**
```json
{
  "success": true,
  "data": {
    "results": [
      { "changes": 1, "lastInsertRowid": 0 },
      { "changes": 1, "lastInsertRowid": 0 }
    ],
    "durationMs": 0.72
  }
}
```

---

### 3.3. Luồng Thay đổi Dữ liệu Realtime (SSE)
- **GET** `/v1/databases/:databaseId/realtime`

**Tiêu đề kết nối:**
```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Định dạng sự kiện phát đi:**
```json
data: {"event":"insert","table":"orders","databaseId":"db_123","timestamp":1788854400000,"data":{"id":842,"total":49.99,"status":"paid"}}

data: {"event":"delete","table":"sessions","databaseId":"db_123","timestamp":1788854405000,"data":{"id":"sess_abc"}}
```

---

### 3.4. Cấu trúc Báo lỗi Tiêu chuẩn

Khi một yêu cầu thất bại (lỗi kiểm tra kiểu, cú pháp SQL hoặc không đủ quyền), VanillaDatabase trả về gói tin lỗi có cấu trúc rõ ràng:

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Token lacks required permission: database:write"
  }
}
```

Mã lỗi phổ biến:
- `UNAUTHORIZED`: Thiếu hoặc sai token xác thực / cookie phiên.
- `FORBIDDEN`: Token không có quyền hạn yêu cầu hoặc bảng nằm trong danh sách cấm.
- `RATE_LIMIT_EXCEEDED`: Vượt quá số lượng yêu cầu cho phép trong cửa sổ trượt (HTTP 429).
- `SQLITE_ERROR`: Sai cú pháp SQL, không tìm thấy bảng hoặc vi phạm ràng buộc dữ liệu.
- `PAYLOAD_TOO_LARGE`: Dung lượng gói tin vượt quá ngưỡng MB cấu hình (HTTP 413).
