# Data Plane & Tham chiếu REST API (API)

Data Plane (`/v1`) cung cấp các endpoint HTTP hiệu năng cao để thực thi câu lệnh SQL, giao dịch batch, thao tác dữ liệu bảng và quản lý tệp tin media.

---

## 1. Xác thực & Headers

Mọi yêu cầu đến Data Plane đều yêu cầu xác thực bằng mã Bearer Token trong header `Authorization`:
```http
Authorization: Bearer vdb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
*Ghi chú: Đối với các thẻ trình duyệt như `<img>` hoặc `<video>`, có thể truyền token qua query parameter trên URL: `?token=vdb_live_...`.*

---

## 2. Bảng tổng hợp các Endpoint

| Phương thức | Đường dẫn | Mô tả chức năng | Quyền hạn yêu cầu |
| :--- | :--- | :--- | :--- |
| `POST` | `/v1/databases/:databaseId/query` | Thực thi câu lệnh SQL có tham số | `database:read` hoặc `database:write` |
| `POST` | `/v1/databases/:databaseId/batch` | Thực thi loạt câu lệnh giao dịch atomic | `database:write` |
| `GET` | `/v1/databases/:databaseId/tables/:table/rows` | Lấy dữ liệu bảng kèm phân trang & sắp xếp | `database:read` |
| `POST` | `/v1/databases/:databaseId/tables/:table/rows` | Chèn một dòng dữ liệu mới | `database:write` |
| `PUT` | `/v1/databases/:databaseId/tables/:table/rows` | Cập nhật dòng dữ liệu theo điều kiện | `database:write` |
| `DELETE`| `/v1/databases/:databaseId/tables/:table/rows` | Xóa dòng dữ liệu theo khóa chính | `database:write` |
| `GET` | `/v1/databases/:databaseId/realtime` | Luồng SSE nhận sự kiện thay đổi dữ liệu | `database:read` |
| `GET` | `/v1/databases/:databaseId/files` | Liệt kê các tệp đã tải lên của database | `database:read` |
| `POST` | `/v1/databases/:databaseId/files` | Tải lên tệp media (multipart/form-data) | `database:write` |
| `DELETE`| `/v1/databases/:databaseId/files/:fileId` | Xóa tệp khỏi kho lưu trữ | `database:write` |
| `GET` | `/v1/files/:fileId/view` | Xem/tải/phát luồng tệp (HTTP 206 Range) | `database:read` |

---

## 3. Ví dụ chi tiết Yêu cầu / Phản hồi

### 1. Thực thi câu lệnh SQL (Execute Query)
- **POST** `/v1/databases/:databaseId/query`

**Dữ liệu gửi lên (Request Body)**:
```json
{
  "sql": "SELECT id, username, score FROM users WHERE score > ? ORDER BY score DESC LIMIT ?",
  "params": [100, 5]
}
```

**Kết quả trả về (200 OK)**:
```json
{
  "success": true,
  "data": {
    "columns": ["id", "username", "score"],
    "rows": [
      { "id": 1, "username": "alice", "score": 250 },
      { "id": 4, "username": "bob", "score": 180 }
    ],
    "rowCount": 2,
    "durationMs": 0.38
  }
}
```
