# Quản trị Cơ sở Dữ liệu & Động cơ SQL (Database)

Tài liệu hướng dẫn thao tác cơ sở dữ liệu, hàm SQL mở rộng tùy biến, kiểm tra cấu trúc bảng và giao dịch batch trong **VanillaDatabase**.

---

## 1. Thao tác Cơ sở Dữ liệu

### Khởi tạo Database
Database có thể tạo qua Giao diện hoặc Admin API:
- Định dạng ID: `db_<nanoid(16)>` (ví dụ: `db_abc1234567890xyz`)
- Định dạng Slug: Chuỗi định danh duy nhất thân thiện với URL (ví dụ: `production-db`)

### Nhân bản / Phân nhánh 1 chạm (1-Click Database Branching)
Hệ thống cho phép nhân bản một database tức thì:
- Thực hiện `PRAGMA wal_checkpoint(FULL)` atomic trên database nguồn.
- Sao chép tệp tin sang một phiên bản tenant mới hoàn toàn độc lập.
- Tạo mục siêu dữ liệu mới, giúp kiểm thử staging an toàn mà không ảnh hưởng tới dữ liệu thực tế.

### Các tác vụ bảo trì định kỳ (Maintenance Operations)
Các tác vụ có thể kích hoạt trực tiếp từ Dashboard hoặc API:
1. `integrity_check`: Kiểm tra tính toàn vẹn chuyên sâu trên cây B-Tree, cấp phát trang (pages) và chỉ mục (indexes).
2. `quick_check`: Kiểm tra sức khỏe nhanh bỏ qua kiểm tra cây chỉ mục.
3. `wal_checkpoint`: Thực thi `PRAGMA wal_checkpoint(TRUNCATE)` để đồng bộ toàn bộ WAL vào tệp chính và thu nhỏ tệp WAL về 0 byte.
4. `vacuum`: Chống phân mảnh các trang lưu trữ, thu hồi dung lượng trống trả về cho hệ điều hành.
5. `reindex`: Xây dựng lại toàn bộ các chỉ mục trong database.
6. `optimize`: Tối ưu hóa thống kê bảng cho bộ lập lịch truy vấn SQLite.

---

## 2. Hàm SQL tùy biến tích hợp (Native Extensions)

Mọi database SQLite trong VanillaDatabase đều được tích hợp sẵn các hàm mở rộng:

### Tính toán AI Vector Math (Embeddings & RAG)
Hỗ trợ lưu trữ mảng vector dưới dạng chuỗi JSON:
```sql
-- Tính độ tương đồng Cosine giữa 2 vector (1.0 = giống nhau hoàn toàn)
SELECT id, title,
       vec_cosine_similarity(embedding, '[0.012, 0.421, -0.198, 0.087]') as similarity
FROM document_embeddings
WHERE similarity > 0.75
ORDER BY similarity DESC
LIMIT 5;

-- Tính khoảng cách Cosine
SELECT id, vec_cosine_distance(embedding, '[0.1, 0.2, 0.3]') as dist
FROM items
ORDER BY dist ASC;
```

### Hàm Mật mã học (SQL Native Crypto)
- `encrypt_aes(plaintext, key)`: Mã hóa chuỗi bằng thuật toán AES-256-GCM.
- `decrypt_aes(ciphertext, key)`: Giải mã chuỗi AES-256-GCM.
- `hash_sha256(data)`: Tạo mã băm SHA-256 dạng hex.
- `hash_hmac(data, secret)`: Tạo mã xác thực HMAC-SHA256.
