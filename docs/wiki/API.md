# Data Plane & REST API Reference

The Data Plane (`/v1`) provides high-performance HTTP endpoints for executing SQL queries, transactional batches, table CRUD, and managing media files.

---

## 1. Authentication & Headers

All Data Plane endpoints require authentication via an API Bearer token:
```http
Authorization: Bearer vdb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
*Note: For media streams and browser image/video tags (`<img>`, `<video>`), authentication can also be passed via URL query parameter: `?token=vdb_live_...`.*

---

## 2. API Endpoints Summary

| Method | Endpoint | Description | Required Permission |
| :--- | :--- | :--- | :--- |
| `POST` | `/v1/databases/:databaseId/query` | Execute parameterized SQL statement | `database:read` or `database:write` |
| `POST` | `/v1/databases/:databaseId/batch` | Execute atomic batch statements | `database:write` |
| `GET` | `/v1/databases/:databaseId/tables/:table/rows` | Select table rows with pagination & sorting | `database:read` |
| `POST` | `/v1/databases/:databaseId/tables/:table/rows` | Insert row into table | `database:write` |
| `PUT` | `/v1/databases/:databaseId/tables/:table/rows` | Update row(s) with condition | `database:write` |
| `DELETE`| `/v1/databases/:databaseId/tables/:table/rows` | Delete row by primary key | `database:write` |
| `GET` | `/v1/databases/:databaseId/realtime` | SSE Event Stream for table mutations | `database:read` |
| `GET` | `/v1/databases/:databaseId/files` | List uploaded files in database storage | `database:read` |
| `POST` | `/v1/databases/:databaseId/files` | Upload file (multipart/form-data) | `database:write` |
| `DELETE`| `/v1/databases/:databaseId/files/:fileId` | Delete file from storage | `database:write` |
| `GET` | `/v1/files/:fileId/view` | Stream/download file (HTTP 206 Range) | `database:read` |
| `GET` | `/v1/databases/:databaseId/storage/:filename` | Stream file by database & original filename | `database:read` |

---

## 3. Detailed Request / Response Examples

### 1. Execute SQL Query
- **POST** `/v1/databases/:databaseId/query`

**Request Body**:
```json
{
  "sql": "SELECT id, username, score FROM users WHERE score > ? ORDER BY score DESC LIMIT ?",
  "params": [100, 5]
}
```

**Success Response (200 OK)**:
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

### 2. Atomic Batch Transaction
- **POST** `/v1/databases/:databaseId/batch`

**Request Body**:
```json
{
  "transaction": true,
  "statements": [
    {
      "sql": "UPDATE bank_accounts SET balance = balance - ? WHERE account_id = ?",
      "params": [100, "acc_alice"]
    },
    {
      "sql": "UPDATE bank_accounts SET balance = balance + ? WHERE account_id = ?",
      "params": [100, "acc_bob"]
    }
  ]
}
```

**Success Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "results": [
      { "statementIndex": 0, "result": { "changes": 1, "durationMs": 0.21 } },
      { "statementIndex": 1, "result": { "changes": 1, "durationMs": 0.18 } }
    ],
    "totalDurationMs": 0.52
  }
}
```

---

### 3. REST Table Insert
- **POST** `/v1/databases/:databaseId/tables/:table/rows`

**Request Body**:
```json
{
  "username": "elaina",
  "score": 500,
  "created_at": 1724900000000
}
```

**Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "changes": 1,
    "lastInsertRowid": 12,
    "durationMs": 0.31
  }
}
```
