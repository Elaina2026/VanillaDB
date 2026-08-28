# VanillaDatabase API Documentation (Full Reference từ A-Z)

VanillaDatabase cung cấp HTTP API hiệu năng cao trên nền tảng **Node.js 24 native SQLite Engine (`node:sqlite`)**. Hỗ trợ **không giới hạn token**, **không giới hạn rate limit**, đa dạng chế độ truy vấn (Raw SQL, Batch Statements, REST API, Database Management).

---

## Mục Lục

1. [Tổng Quan & Cấu Trúc URL](#1-tổng-quan--cấu-trúc-url)
2. [Cơ Chế Xác Thực (Authentication) & Phân Quyền (Permissions)](#2-cơ-chế-xác-thực-authentication--phân-quyền-permissions)
3. [Data Plane APIs (Dành cho ứng dụng & Token)](#3-data-plane-apis-dành-cho-ứng-dụng--token)
   - [3.1. Raw SQL Query (`POST /v1/databases/:id/query`)](#31-raw-sql-query-post-v1databasesidquery)
   - [3.2. Batch Execution & Transactions (`POST /v1/databases/:id/batch`)](#32-batch-execution--transactions-post-v1databasesidbatch)
   - [3.3. REST API - Lấy danh sách dòng (`GET /v1/databases/:id/tables/:table/rows`)](#33-rest-api---lấy-danh-sách-dòng-get-v1databasesidtablestablerows)
   - [3.4. REST API - Thêm dòng (`POST /v1/databases/:id/tables/:table/rows`)](#34-rest-api---thêm-dòng-post-v1databasesidtablestablerows)
   - [3.5. REST API - Xóa dòng (`DELETE /v1/databases/:id/tables/:table/rows`)](#35-rest-api---xóa-dòng-delete-v1databasesidtablestablerows)
4. [Control Plane APIs (Admin Dashboard & Automation)](#4-control-plane-apis-admin-dashboard--automation)
   - [4.1. Authentication (Login / Logout / Check)](#41-authentication-login--logout--check)
   - [4.2. Quản Lý Database (CRUD, Clone, Schema)](#42-quản-lý-database-crud-clone-schema)
   - [4.3. Quản Lý Token (Tạo, Liệt kê, Thu hồi, Xóa)](#43-quản-lý-token-tạo-liệt-kê-thu-hồi-xóa)
   - [4.4. Quản Lý Backup & Restore](#44-quản-lý-backup--restore)
   - [4.5. Bảo Trì Database (Maintenance / Integrity Check / Vacuum)](#45-bảo-trì-database-maintenance--integrity-check--vacuum)
   - [4.6. Activity & Audit Logs](#46-activity--audit-logs)
5. [Quy Chuẩn Mã Lỗi & HTTP Status](#5-quy-chuẩn-mã-lỗi--http-status)
6. [SDK & Code Examples Đầy Đủ (Node.js, Python, cURL, Go, PHP)](#6-sdk--code-examples-đầy-đủ)

---

## 1. Tổng Quan & Cấu Trúc URL

Tất cả các API request đều sử dụng chuẩn JSON (`Content-Type: application/json`).

- **Base Server URL**: `http://localhost:3000` (hoặc domain của bạn)
- **Data Plane (Token)**: `/v1/databases/:databaseId/*`
- **Control Plane (Admin Session)**: `/api/admin/*`, `/api/auth/*`, `/api/system/*`

---

## 2. Cơ Chế Xác Thực (Authentication) & Phân Quyền (Permissions)

### Bearer Token (Data Plane)
Truyền Bearer Token vào header của mọi request gọi vào `/v1/*`:
```http
Authorization: Bearer vdb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Mỗi token được tạo ra từ Admin Dashboard với các quyền hạn:
- `database:read`: Cho phép thực hiện câu lệnh `SELECT`, `EXPLAIN`, `WITH`, `PRAGMA` an toàn.
- `database:write`: Cho phép thực hiện `INSERT`, `UPDATE`, `DELETE`, và chạy Transaction.
- `database:ddl`: Cho phép tạo bảng, sửa schema (`CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, `CREATE INDEX`).
- `database:admin`: Toàn quyền thao tác trên database được cấp.

Ngoài ra, Token có thể bị giới hạn:
- `allowedTables`: Chỉ được thao tác trên danh sách bảng cho phép.
- `deniedTables`: Bị cấm truy cập vào danh sách bảng chỉ định.
- `expiresAt`: Thời gian hết hạn của token.

---

## 3. Data Plane APIs (Dành cho ứng dụng & Token)

### 3.1. Raw SQL Query
Thực thi một câu lệnh SQL duy nhất với parameterized inputs (chống SQL Injection).

- **Endpoint**: `POST /v1/databases/:databaseId/query`
- **Headers**:
  - `Authorization: Bearer <TOKEN>`
  - `Content-Type: application/json`

#### Request Body:
```json
{
  "sql": "SELECT id, name, email, balance FROM users WHERE status = ? AND balance >= ? ORDER BY id DESC LIMIT ?",
  "params": ["active", 100, 10]
}
```
*Lưu ý: `params` có thể là mảng `[]` (dùng dấu `?`) hoặc object `{}` (dùng `:paramName` hoặc `$paramName`).*

#### Response khi SELECT:
```json
{
  "success": true,
  "data": {
    "columns": ["id", "name", "email", "balance"],
    "rows": [
      { "id": 10, "name": "Nguyen Van A", "email": "a@example.com", "balance": 250 },
      { "id": 9, "name": "Tran Thi B", "email": "b@example.com", "balance": 120 }
    ],
    "rowCount": 2,
    "durationMs": 0.42
  }
}
```

#### Response khi INSERT / UPDATE / DELETE / DDL:
```json
{
  "success": true,
  "data": {
    "changes": 1,
    "lastInsertRowid": 11,
    "durationMs": 0.35
  }
}
```

---

### 3.2. Batch Execution & Transactions
Thực thi một danh sách nhiều câu lệnh SQL tuần tự trong cùng một atomic transaction (hoặc riêng rẽ).

- **Endpoint**: `POST /v1/databases/:databaseId/batch`
- **Headers**:
  - `Authorization: Bearer <TOKEN>`
  - `Content-Type: application/json`

#### Request Body:
```json
{
  "transaction": true,
  "statements": [
    {
      "sql": "UPDATE accounts SET balance = balance - ? WHERE id = ?",
      "params": [50, 1]
    },
    {
      "sql": "UPDATE accounts SET balance = balance + ? WHERE id = ?",
      "params": [50, 2]
    },
    {
      "sql": "INSERT INTO transfer_logs (from_id, to_id, amount, created_at) VALUES (?, ?, ?, ?)",
      "params": [1, 2, 50, 1724765000]
    }
  ]
}
```

#### Response:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "statementIndex": 0,
        "result": { "changes": 1, "lastInsertRowid": 0, "durationMs": 0.12 }
      },
      {
        "statementIndex": 1,
        "result": { "changes": 1, "lastInsertRowid": 0, "durationMs": 0.11 }
      },
      {
        "statementIndex": 2,
        "result": { "changes": 1, "lastInsertRowid": 154, "durationMs": 0.15 }
      }
    ],
    "totalDurationMs": 0.65
  }
}
```

---

### 3.3. REST API - Lấy danh sách dòng
Truy vấn bảng nhanh dưới dạng REST resource không cần viết SQL.

- **Endpoint**: `GET /v1/databases/:databaseId/tables/:tableName/rows`
- **Headers**: `Authorization: Bearer <TOKEN>`
- **Query Parameters**:
  - `limit`: Số lượng dòng tối đa (mặc định: `100`, tối đa: `1000`).
  - `offset`: Vị trí bắt đầu phân trang (mặc định: `0`).
  - `orderBy`: Tên cột cần sắp xếp.
  - `order`: `ASC` hoặc `DESC` (mặc định: `ASC`).

#### Ví dụ Request:
```http
GET /v1/databases/db_33QLtt_Rz9O4fA2P/tables/products/rows?limit=20&offset=0&orderBy=created_at&order=DESC
```

---

### 3.4. REST API - Thêm dòng
Chèn một bản ghi mới vào bảng.

- **Endpoint**: `POST /v1/databases/:databaseId/tables/:tableName/rows`
- **Headers**:
  - `Authorization: Bearer <TOKEN>`
  - `Content-Type: application/json`

#### Request Body:
```json
{
  "name": "Mechanical Keyboard",
  "price": 89.99,
  "stock": 150,
  "created_at": 1724765000
}
```

#### Response:
```json
{
  "success": true,
  "data": {
    "changes": 1,
    "lastInsertRowid": 42,
    "durationMs": 0.28
  }
}
```

---

### 3.5. REST API - Xóa dòng
Xóa dòng theo khóa chính (Primary Key).

- **Endpoint**: `DELETE /v1/databases/:databaseId/tables/:tableName/rows?id=42`
- **Headers**: `Authorization: Bearer <TOKEN>`
- **Query Parameter**: Khóa chính của bảng (ví dụ: `?id=42` hoặc `?custom_pk=val`).

---

### 3.6. File & Media Storage API (Hình ảnh, Video, Audio, Tài liệu)
VanillaDatabase cung cấp hệ thống lưu trữ media & file nhị phân **thuộc quyền quản lý riêng của từng Database**:
- Khi xóa database, toàn bộ file thuộc database đó sẽ tự động được dọn dẹp sạch sẽ (Cascade deletion).
- Hỗ trợ **HTTP 206 Partial Content (Range headers)** giúp phát video, tua audio, streaming mượt mà mà không cần tải hết toàn bộ file.

#### 1. Upload File / Media:
- **Endpoint**: `POST /v1/databases/:databaseId/files`
- **Headers**:
  - `Authorization: Bearer <TOKEN>` (Quyền `database:write`)
  - `Content-Type: multipart/form-data`
- **Body**: Form data chứa trường `file` (và tùy chọn `metadata`).

#### Response:
```json
{
  "success": true,
  "data": {
    "id": "file_TBQYSV0DP-Ppkkip",
    "database_id": "db_nWsLwIFZ1UgmvHcr",
    "filename": "file_TBQYSV0DP-Ppkkip.mp4",
    "original_name": "intro-video.mp4",
    "mime_type": "video/mp4",
    "size_bytes": 10485760,
    "checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "created_at": 1724765000,
    "updated_at": 1724765000
  }
}
```

#### 2. Lấy danh sách Files của Database:
- **Endpoint**: `GET /v1/databases/:databaseId/files`
- **Headers**: `Authorization: Bearer <TOKEN>` (Quyền `database:read`)

#### 3. Stream & Xem File / Video / Audio (Hỗ trợ Range 206):
- **Endpoint 1 (Theo file ID)**: `GET /v1/files/:fileId/view`
- **Endpoint 2 (Theo database & filename)**: `GET /v1/databases/:databaseId/storage/:filename`
- **Headers**:
  - `Authorization: Bearer <TOKEN>`
  - `Range: bytes=0-1048575` *(Tùy chọn cho Video/Audio streaming)*

---

## 4. Control Plane APIs (Admin Dashboard & Automation)

Các API này yêu cầu đăng nhập bằng session cookie của Administrator.

### 4.1. Authentication
- `POST /api/auth/login`: `{ "username": "...", "password": "..." }`
- `POST /api/auth/logout`: Xóa session cookie.
- `GET /api/auth/me`: Lấy thông tin admin hiện tại.

### 4.2. Quản Lý Database
- `GET /api/admin/databases`: Danh sách toàn bộ databases.
- `POST /api/admin/databases`: Tạo database mới `{ "name": "orders_db", "description": "..." }`.
- `GET /api/admin/databases/:id`: Lấy thông số chi tiết (kích thước file, WAL, page size, table count...).
- `PATCH /api/admin/databases/:id`: Sửa tên/mô tả.
- `DELETE /api/admin/databases/:id`: Xóa database vĩnh viễn.
- `POST /api/admin/databases/:id/clone`: Nhân bản database `{ "name": "orders_db_copy" }`.
- `GET /api/admin/databases/:id/schema`: Đọc toàn bộ Schema (bảng, cột, indexes, foreign keys, triggers, DDL).

### 4.3. Quản Lý Token
- `GET /api/admin/databases/:id/tokens`: Danh sách token của database.
- `POST /api/admin/databases/:id/tokens`: Tạo token mới.
  ```json
  {
    "name": "Backend Node Service",
    "description": "Token for main API backend",
    "permissions": ["database:read", "database:write", "database:ddl"],
    "allowedTables": ["users", "orders"],
    "expiresInDays": 365,
    "type": "live"
  }
  ```
  *Lưu ý: API trả về `plainSecret` đúng 1 lần duy nhất.*
- `POST /api/admin/tokens/:tokenId/revoke`: Thu hồi vô hiệu hóa token.
- `DELETE /api/admin/tokens/:tokenId`: Xóa hẳn token.

### 4.4. Quản Lý Backup & Restore
- `GET /api/admin/databases/:id/backups`: Danh sách bản backup.
- `POST /api/admin/databases/:id/backups`: Tạo ngay 1 bản backup WAL-flushed an toàn.
- `POST /api/admin/databases/:id/backups/:backupId/restore`: Khôi phục database về bản backup.
- `DELETE /api/admin/backups/:backupId`: Xóa bản backup.

### 4.5. Bảo Trì Database (Maintenance)
- `POST /api/admin/databases/:id/maintenance`
  ```json
  { "action": "quick_check" }
  ```
  Các action hỗ trợ:
  - `quick_check`: Kiểm tra nhanh tính toàn vẹn.
  - `integrity_check`: Quét toàn diện cấu trúc B-Tree SQLite.
  - `wal_checkpoint`: Ép ghi toàn bộ WAL vào file DB chính (`TRUNCATE`).
  - `vacuum`: Dọn dẹp phân mảnh, giải phóng dung lượng đĩa.
  - `optimize`: Tối ưu chỉ mục truy vấn.
  - `analyze`: Cập nhật thống kê query planner.

---

## 5. Quy Chuẩn Mã Lỗi & HTTP Status

| HTTP Status | Error Code | Ý Nghĩa |
|---|---|---|
| `400` | `INVALID_REQUEST` / `VALIDATION_ERROR` | Payload JSON sai định dạng hoặc thiếu trường bắt buộc |
| `400` | `SQLITE_ERROR` | Lỗi cú pháp SQL hoặc vi phạm ràng buộc (Unique/Foreign Key) |
| `401` | `UNAUTHORIZED` | Token không hợp lệ, hết hạn, hoặc bị thu hồi |
| `403` | `FORBIDDEN` | Token không đủ quyền (ví dụ token chỉ Read nhưng gọi lệnh Write/DDL) |
| `404` | `NOT_FOUND` / `TABLE_NOT_FOUND` | Database hoặc bảng không tồn tại |
| `500` | `INTERNAL_ERROR` | Lỗi hệ thống máy chủ |

---

## 6. SDK & Code Examples Đầy Đủ

### 6.1. Node.js / TypeScript (Native Fetch)
```typescript
interface QueryResponse<T = any> {
  success: boolean;
  data: {
    columns: string[];
    rows: T[];
    rowCount: number;
    durationMs: number;
  };
}

class VanillaClient {
  constructor(
    private baseUrl: string,
    private databaseId: string,
    private token: string
  ) {}

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const res = await fetch(`${this.baseUrl}/v1/databases/${this.databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });

    const json: any = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error?.message || `Query failed with status ${res.status}`);
    }

    return json.data.rows;
  }

  async execute(sql: string, params: any[] = []) {
    const res = await fetch(`${this.baseUrl}/v1/databases/${this.databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });

    const json: any = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error?.message || `Execution failed`);
    }

    return json.data; // { changes, lastInsertRowid, durationMs }
  }
}

// Cách dùng:
const db = new VanillaClient('http://localhost:3000', 'db_33QLtt_Rz9O4fA2P', 'vdb_live_xxx');

// 1. SELECT
const users = await db.query('SELECT * FROM users WHERE active = ?', [1]);
console.log('Users:', users);

// 2. INSERT
const insertResult = await db.execute(
  'INSERT INTO users (name, email) VALUES (?, ?)',
  ['John Doe', 'john@example.com']
);
console.log('Inserted ID:', insertResult.lastInsertRowid);
```

---

### 6.2. Python (Requests)
```python
import requests

BASE_URL = "http://localhost:3000"
DB_ID = "db_33QLtt_Rz9O4fA2P"
TOKEN = "vdb_live_xxxxxxxxxxxxxxxxxxxxxxxx"

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

# 1. Truy vấn SELECT
payload = {
    "sql": "SELECT id, name, balance FROM accounts WHERE balance > ? LIMIT 5",
    "params": [1000]
}

res = requests.post(f"{BASE_URL}/v1/databases/{DB_ID}/query", json=payload, headers=headers)
data = res.json()

if res.status_code == 200 and data.get("success"):
    for row in data["data"]["rows"]:
        print(row)
else:
    print("Error:", data.get("error"))
```

---

### 6.3. cURL (Bash/CLI)
```bash
# 1. Truy vấn SELECT
curl -X POST "http://localhost:3000/v1/databases/db_33QLtt_Rz9O4fA2P/query" \
  -H "Authorization: Bearer vdb_live_xxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT * FROM products WHERE price < ? ORDER BY price ASC",
    "params": [50]
  }'

# 2. Chạy Transaction nhiều câu lệnh (Batch)
curl -X POST "http://localhost:3000/v1/databases/db_33QLtt_Rz9O4fA2P/batch" \
  -H "Authorization: Bearer vdb_live_xxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction": true,
    "statements": [
      { "sql": "INSERT INTO logs (msg) VALUES (?)", "params": ["Step 1"] },
      { "sql": "INSERT INTO logs (msg) VALUES (?)", "params": ["Step 2"] }
    ]
  }'
```

---

### 6.4. Go (Golang)
```go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

type QueryPayload struct {
	Sql    string        `json:"sql"`
	Params []interface{} `json:"params"`
}

type QueryResponse struct {
	Success bool `json:"success"`
	Data    struct {
		Columns  []string                 `json:"columns"`
		Rows     []map[string]interface{} `json:"rows"`
		RowCount int                      `json:"rowCount"`
	} `json:"data"`
}

func main() {
	url := "http://localhost:3000/v1/databases/db_33QLtt_Rz9O4fA2P/query"
	token := "vdb_live_xxxxxxxxxxxxxxxxxxxxxxxx"

	reqBody, _ := json.Marshal(QueryPayload{
		Sql:    "SELECT * FROM users WHERE status = ?",
		Params: []interface{}{"active"},
	})

	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(reqBody))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	var result QueryResponse
	json.NewDecoder(resp.Body).Decode(&result)
	fmt.Printf("Got %d rows\n", result.Data.RowCount)
}
```

---

### 6.5. PHP (cURL / Guzzle)
```php
<?php
$url = "http://localhost:3000/v1/databases/db_33QLtt_Rz9O4fA2P/query";
$token = "vdb_live_xxxxxxxxxxxxxxxxxxxxxxxx";

$payload = [
    "sql" => "SELECT * FROM users WHERE id = ?",
    "params" => [1]
];

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer $token",
    "Content-Type: application/json"
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));

$response = curl_exec($ch);
curl_close($ch);

$data = json_decode($response, true);
print_r($data['data']['rows']);
?>
```
