# VanillaDatabase cURL API Examples

Practical cURL examples for interacting with the VanillaDatabase Data Plane (`/v1`).

---

## 1. Execute Parameterized SQL Query

```bash
curl -X POST http://localhost:3000/v1/databases/db_your_db_id/query \
  -H "Authorization: Bearer vdb_live_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT id, username, score FROM users WHERE score >= ? ORDER BY score DESC LIMIT ?",
    "params": [100, 10]
  }'
```

---

## 2. Execute Atomic Batch Transaction

```bash
curl -X POST http://localhost:3000/v1/databases/db_your_db_id/batch \
  -H "Authorization: Bearer vdb_live_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "transaction": true,
    "statements": [
      {
        "sql": "UPDATE accounts SET balance = balance - ? WHERE id = ?",
        "params": [50, "user_1"]
      },
      {
        "sql": "UPDATE accounts SET balance = balance + ? WHERE id = ?",
        "params": [50, "user_2"]
      }
    ]
  }'
```

---

## 3. REST Table CRUD

### Insert Row
```bash
curl -X POST http://localhost:3000/v1/databases/db_your_db_id/tables/users/rows \
  -H "Authorization: Bearer vdb_live_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "elaina",
    "score": 500
  }'
```

### Select Rows
```bash
curl -X GET "http://localhost:3000/v1/databases/db_your_db_id/tables/users/rows?limit=10&orderBy=score&order=DESC" \
  -H "Authorization: Bearer vdb_live_your_token_here"
```

---

## 4. Media Upload & Streaming

### Upload File
```bash
curl -X POST http://localhost:3000/v1/databases/db_your_db_id/files \
  -H "Authorization: Bearer vdb_live_your_token_here" \
  -F "file=@avatar.png;type=image/png"
```

### Stream File with Range (HTTP 206)
```bash
curl -X GET http://localhost:3000/v1/files/file_id_here/view \
  -H "Authorization: Bearer vdb_live_your_token_here" \
  -H "Range: bytes=0-1024" \
  -o partial_output.mp4
```

---

## 5. Listen to Realtime Events (SSE)

```bash
curl -N -X GET http://localhost:3000/v1/databases/db_your_db_id/realtime \
  -H "Authorization: Bearer vdb_live_your_token_here"
```
