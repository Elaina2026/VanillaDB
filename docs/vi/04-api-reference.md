# Tầng Dữ liệu & Tham chiếu REST API

Tài liệu tham chiếu các điểm cuối HTTP thuộc Tầng Dữ liệu (`/v1`) trong **VanillaDatabase**: thực thi truy vấn SQL, giao dịch nguyên tử theo lô, thao tác CRUD bảng dữ liệu, luồng sự kiện Server-Sent Events và phát luồng tệp tin media.

---

## 1. Tiêu chuẩn Xác thực & Headers

Mọi điểm cuối Data Plane yêu cầu xác thực qua Bearer Token hoặc cookie phiên hợp lệ:

```http
Authorization: Bearer vdb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

> [SECURITY] **Cấm Token trong Query String (Chuẩn RFC 6750)**:
> Việc truyền API token qua chuỗi truy vấn URL (`?token=...`) bị **nghiêm cấm** trên các route ghi/sửa dữ liệu (`/query`, `/batch`, `/exec`), hệ thống sẽ từ chối ngay với mã lỗi HTTP 401 `QUERY_TOKEN_NOT_PERMITTED`.
> Với các luồng phát đa phương tiện và Server-Sent Events không hỗ trợ gắn header tùy biến (như thẻ `<img src="...">`, `<audio src="...">`, hoặc `EventSource`), sử dụng cơ chế **One-Time Tickets** (Vé dùng một lần):
> ```http
> POST /v1/databases/:databaseId/tickets
> Authorization: Bearer vdb_live_...
> 
> Phản hồi (201 Created):
> {
>   "success": true,
>   "data": {
>     "ticket": "vdb_ticket_...",
>     "expiresAt": 1775560000000,
>     "expiresInSeconds": 60
>   }
> }
> ```
> Sau đó truy cập bằng tham số URL:
> ```http
> GET /v1/databases/:databaseId/realtime?ticket=vdb_ticket_...
> GET /v1/files/:fileId/view?ticket=vdb_ticket_...
> ```
> Vé chỉ có hiệu lực dùng 1 lần duy nhất, giới hạn chặt chẽ theo database và route, tự động hết hạn sau 60 giây. Query token (`?token=...`) bị nghiêm cấm hoàn toàn trên tất cả các route (kể cả streaming và media) với mã lỗi HTTP 401 `QUERY_TOKEN_NOT_PERMITTED`.

---

## 2. Bảng Tham chiếu Điểm cuối API

| Giao thức | Đường dẫn | Mô tả chức năng | Quyền hạn tối thiểu |
| :--- | :--- | :--- | :--- |
| `POST` | `/v1/databases/:databaseId/query` | Thực thi truy vấn SQL có tham số (SELECT/INSERT/UPDATE) | `database:read` hoặc `database:write` |
| `POST` | `/v1/databases/:databaseId/exec` | Thực thi một câu lệnh thay đổi dữ liệu đơn lẻ | `database:write` |
| `POST` | `/v1/databases/:databaseId/batch` | Thực thi giao dịch nhiều câu lệnh nguyên tử | `database:write` |
| `POST` | `/v1/databases/:databaseId/tickets` | Cấp vé dùng 1 lần (60 giây) cho SSE và phát luồng media | `database:read` |
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
| `POST` | `/api/auth/profile/avatar` | Tải lên tệp ảnh đại diện (PNG/JPEG/WebP, tối đa 10MB) | Phiên đăng nhập |
| `GET` | `/api/auth/avatar/:userId` | Phục vụ ảnh đại diện kèm nosniff và CSP sandbox | Công khai / Bộ nhớ đệm |
| `DELETE`| `/api/auth/profile/avatar` | Xóa ảnh đại diện người dùng | Phiên đăng nhập |
| `PUT` | `/api/auth/profile` | Cập nhật hồ sơ (chặn URL ngoài và data URI mới) | Phiên đăng nhập |

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

---

## 4. Điểm cuối Quản trị Cụm & Máy chủ Lưu trữ (Cluster Endpoints)

Tất cả các điểm cuối quản trị cụm yêu cầu phiên làm việc có vai trò `super_admin` hoặc `admin`.

### 4.1. Giám sát Sức khỏe & Thông số Phần cứng Cụm
- **GET** `/api/admin/cluster/status`

**Dữ liệu phản hồi:**
```json
{
  "success": true,
  "data": {
    "totalNodes": 3,
    "healthyNodes": 3,
    "totalClusterDiskBytes": 1073741824000,
    "freeClusterDiskBytes": 644245094400,
    "usedClusterDiskPercent": 40,
    "spilloverActive": false,
    "localNodeFull": false,
    "nodes": [
      {
        "id": "local",
        "name": "Primary Gateway",
        "base_url": "http://127.0.0.1:3000",
        "status": "healthy",
        "is_local": true,
        "cpu_percent": 12,
        "ram_percent": 34,
        "disk_total_bytes": 21474836480,
        "disk_free_bytes": 16106127360,
        "disk_used_percent": 25,
        "network_rate_bps": 45020,
        "database_count": 8,
        "last_heartbeat_at": 1788854400000
      }
    ]
  }
}
```

### 4.2. Đăng ký Máy chủ Worker Lưu trữ Mới
- **POST** `/api/admin/cluster/nodes`

```json
{
  "name": "Storage-Node-Frankfurt-01",
  "baseUrl": "http://192.168.1.102:3000",
  "authToken": "optional_custom_secret_key"
}
```

### 4.3. Kiểm tra Nhịp tim Toàn cụm
- **POST** `/api/admin/cluster/poll`

Gửi yêu cầu kiểm tra song song (`Promise.allSettled`) đến tất cả các node để cập nhật thông số CPU, RAM, Disk và Network I/O vào bộ nhớ đệm hệ thống.

### 4.4. Di chuyển Cơ sở Dữ liệu Không Gián đoạn
- **POST** `/api/admin/cluster/migrate`

```json
{
  "databaseId": "db_BIcZhxUYK83SMS2r",
  "targetNodeId": "node_frankfurt_01"
}
```

Tạo snapshot nhất quán tức thì bằng `VACUUM INTO`, phát luồng dữ liệu sang node đích, kiểm tra toàn vẹn mã băm và cập nhật bản ghi điều phối trong cơ sở dữ liệu hệ thống.

---

## 5. API Vé Truy cập Ngắn hạn (RFC 6750 Single-Use Streaming)

Nhằm ngăn ngừa lộ token truy cập dài hạn qua chuỗi truy vấn URL khi phát luồng Server-Sent Events hoặc tệp âm thanh/video, ứng dụng khách yêu cầu cấp vé truy cập một lần.

### 5.1. Cấp vé truy cập ngắn hạn
- **POST** `/v1/databases/:databaseId/tickets`
- **Tiêu đề**: `Authorization: Bearer <token>`
- **Phản hồi**:
```json
{
  "success": true,
  "ticket": "vdb_ticket_9k3f8b1a4c2e7d5f0b8a1c3e5d7f9a2b",
  "expiresAt": 1788854460000,
  "expiresInSeconds": 60
}
```

Vé tự động hết hạn sau 60 giây và bị xóa ngay lập tức khỏi bộ nhớ đệm sau lần sử dụng đầu tiên tại:
- `GET /v1/databases/:databaseId/realtime?ticket=vdb_ticket_...`
- `GET /v1/files/:fileId/view?ticket=vdb_ticket_...`

---

## 6. API Quản lý Lịch trình Tác vụ (Schedules Automation)

### 6.1. Danh sách lịch trình
- **GET** `/api/admin/databases/:databaseId/schedules`
- **Phản hồi**:
```json
{
  "success": true,
  "schedules": [
    {
      "id": "sch_1a2b3c",
      "database_id": "db_BIcZhxUYK83SMS2r",
      "name": "Bảo trì định kỳ & Sao lưu",
      "cron_minute": "0",
      "cron_hour": "*",
      "cron_day_of_month": "*",
      "cron_month": "*",
      "cron_day_of_week": "*",
      "is_active": 1,
      "only_when_online": 1,
      "tasks": [
        {
          "id": "tsk_01",
          "sequence": 0,
          "action": "run_maintenance",
          "payload": "wal_checkpoint",
          "time_offset": 0,
          "continue_on_failure": 0
        },
        {
          "id": "tsk_02",
          "sequence": 1,
          "action": "create_backup",
          "payload": "",
          "time_offset": 5,
          "continue_on_failure": 1
        }
      ]
    }
  ]
}
```

### 6.2. Tạo lịch trình mới
- **POST** `/api/admin/databases/:databaseId/schedules`
- **Dữ liệu gửi**:
```json
{
  "name": "Dọn dẹp phiên hết hạn",
  "cron_minute": "30",
  "cron_hour": "2",
  "cron_day_of_month": "*",
  "cron_month": "*",
  "cron_day_of_week": "*",
  "is_active": true,
  "only_when_online": true,
  "tasks": [
    {
      "action": "send_command",
      "payload": "DELETE FROM sessions WHERE expires_at < unixepoch();",
      "time_offset": 0,
      "continue_on_failure": false
    }
  ]
}
```

### 6.3. Kích hoạt thực thi lịch trình ngay lập tức
- **POST** `/api/admin/databases/:databaseId/schedules/:scheduleId/execute`
- Kích hoạt quy trình chạy ngầm thực thi các tác vụ tuần tự ngay lập tức.

---

## 7. API Dòng Thời gian Hoạt động & Nhật ký Kiểm toán

### 7.1. Truy vấn dòng hoạt động hợp nhất
- **GET** `/api/admin/databases/:databaseId/activity?search=&limit=80`
- **Phản hồi**:
```json
{
  "success": true,
  "activity": [
    {
      "id": "act_88f91c",
      "action": "schedule execute",
      "username": "admin",
      "created_at": 1788854400000,
      "status": "success",
      "ip_address": "127.0.0.1",
      "details": "Kích hoạt lịch trình Bảo trì định kỳ & Sao lưu"
    }
  ]
}
```


