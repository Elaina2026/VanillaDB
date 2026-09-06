# Data Plane & Tham chiếu REST API

Tầng Data Plane (`/v1`) cung cấp các endpoint HTTP hiệu năng cao phục vụ cho việc thực thi các câu lệnh SQL, giao dịch batch atomic, thao tác CRUD bảng dữ liệu và quản lý kho tệp tin media.

---

## 1. Xác thực & Tiêu đề Yêu cầu (Headers)

Tất cả các endpoint thuộc Data Plane đều yêu cầu xác thực bằng mã API Bearer Token:
```http
Authorization: Bearer vdb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
*Lưu ý: Đối với việc phát luồng media và thẻ hình ảnh/video trên trình duyệt (`<img>`, `<video>`), mã xác thực cũng có thể được truyền trực tiếp qua tham số truy vấn trên URL: `?token=vdb_live_...`.*

---

## 2. Bảng Tổng hợp các Endpoint API

| Phương thức | Đường dẫn Endpoint | Mô tả chức năng | Quyền hạn yêu cầu |
| :--- | :--- | :--- | :--- |
| `POST` | `/v1/databases/:databaseId/query` | Thực thi câu lệnh SQL tham số hóa an toàn | `database:read` hoặc `database:write` |
| `POST` | `/v1/databases/:databaseId/batch` | Thực thi nhiều câu lệnh theo giao dịch batch atomic | `database:write` |
| `GET` | `/v1/databases/:databaseId/tables/:table/rows` | Đọc danh sách bản ghi kèm phân trang và sắp xếp | `database:read` |
| `POST` | `/v1/databases/:databaseId/tables/:table/rows` | Thêm mới bản ghi vào bảng | `database:write` |
| `PUT` | `/v1/databases/:databaseId/tables/:table/rows` | Cập nhật bản ghi theo điều kiện | `database:write` |
| `DELETE`| `/v1/databases/:databaseId/tables/:table/rows` | Xóa bản ghi theo khóa chính | `database:write` |
| `GET` | `/v1/databases/:databaseId/realtime` | Kênh phát sự kiện SSE khi dữ liệu bảng thay đổi | `database:read` |
| `GET` | `/v1/databases/:databaseId/files` | Liệt kê danh sách tệp tin trong kho lưu trữ database | `database:read` |
| `POST` | `/v1/databases/:databaseId/files` | Tải lên tệp tin (chuẩn multipart/form-data) | `database:write` |
| `DELETE`| `/v1/databases/:databaseId/files/:fileId` | Xóa tệp tin khỏi kho lưu trữ | `database:write` |
| `GET` | `/v1/files/:fileId/view` | Phát luồng/tải tệp tin (hỗ trợ HTTP 206 Range) | `database:read` |
| `GET` | `/v1/databases/:databaseId/storage/:filename` | Phát luồng tệp tin theo databaseId và tên tệp gốc | `database:read` |

---

## 3. Ví dụ Chi tiết Yêu cầu / Phản hồi

### 1. Thực thi Câu lệnh SQL Tham số hóa
- **POST** `/v1/databases/:databaseId/query`

**Dữ liệu yêu cầu (Request Body)**:
```json
{
  "sql": "SELECT id, username, score FROM users WHERE score >= ? ORDER BY score DESC LIMIT ?",
  "params": [100, 10]
}
```

**Phản hồi thành công (200 OK)**:
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

---

### 2. Giao dịch Batch Nguyên tử (Atomic Batch)
- **POST** `/v1/databases/:databaseId/batch`

**Dữ liệu yêu cầu (Request Body)**:
```json
{
  "transaction": true,
  "statements": [
    { "sql": "UPDATE accounts SET balance = balance - ? WHERE id = ?", "params": [50, "acc_1"] },
    { "sql": "UPDATE accounts SET balance = balance + ? WHERE id = ?", "params": [50, "acc_2"] }
  ]
}
```

**Phản hồi thành công (200 OK)**:
```json
{
  "success": true,
  "data": {
    "results": [
      { "changes": 1, "lastInsertRowid": 0 },
      { "changes": 1, "lastInsertRowid": 0 }
    ],
    "durationMs": 0.85
  }
}
```
