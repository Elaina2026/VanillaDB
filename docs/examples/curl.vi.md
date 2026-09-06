# Ví dụ Gọi API bằng cURL cho VanillaDatabase

Các ví dụ cURL thực tế để tương tác với tầng Data Plane (`/v1`) của VanillaDatabase.

---

## 1. Thực thi Câu lệnh SQL Tham số hóa

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

## 2. Thực thi Giao dịch Batch Nguyên tử

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

## 3. Thao tác REST CRUD trên Bảng

### Thêm hàng dữ liệu mới (Insert)
```bash
curl -X POST http://localhost:3000/v1/databases/db_your_db_id/tables/users/rows \
  -H "Authorization: Bearer vdb_live_your_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "elaina",
    "score": 500
  }'
```

### Đọc danh sách hàng dữ liệu (Select)
```bash
curl -X GET "http://localhost:3000/v1/databases/db_your_db_id/tables/users/rows?limit=10&orderBy=score&order=DESC" \
  -H "Authorization: Bearer vdb_live_your_token_here"
```

---

## 4. Tải lên Media & Phát luồng Video/Audio

### Tải lên tệp tin
```bash
curl -X POST http://localhost:3000/v1/databases/db_your_db_id/files \
  -H "Authorization: Bearer vdb_live_your_token_here" \
  -F "file=@avatar.png;type=image/png"
```

### Phát luồng tệp tin với tiêu đề Range (HTTP 206)
```bash
curl -X GET http://localhost:3000/v1/files/file_id_here/view \
  -H "Authorization: Bearer vdb_live_your_token_here" \
  -H "Range: bytes=0-1024" \
  -o partial_output.mp4
```

---

## 5. Lắng nghe Sự kiện Thời gian thực (SSE Stream)

```bash
curl -N -X GET http://localhost:3000/v1/databases/db_your_db_id/realtime \
  -H "Authorization: Bearer vdb_live_your_token_here"
```
