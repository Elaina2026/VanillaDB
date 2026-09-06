# Quản trị Cơ sở Dữ liệu & Động cơ SQL

Tài liệu này giải thích chi tiết các thao tác SQL, hàm mở rộng tùy biến tích hợp, kiểm tra cấu trúc bảng, phân nhánh (branching) và các giao dịch batch trong **VanillaDatabase**.

---

## 1. Thao tác Cơ sở Dữ liệu

### Tạo Cơ sở Dữ liệu Mới
Cơ sở dữ liệu có thể được tạo qua giao diện Dashboard hoặc Admin API:
- Định dạng ID: `db_<nanoid(16)>` (ví dụ: `db_pMI8Tn-5MvVgh9-1`)
- Định dạng Slug: Chuỗi định danh duy nhất thân thiện với URL (ví dụ: `production-store-db`)

### Phân nhánh / Nhân bản 1-Click (Branching & Cloning)
VanillaDatabase hỗ trợ nhân bản cơ sở dữ liệu gần như tức thì:
- Thực thi lệnh đồng bộ nguyên tử `PRAGMA wal_checkpoint(FULL)` trên database gốc.
- Sao chép tệp tin sang một phiên bản khách thuê mới.
- Khởi tạo bản ghi metadata tương ứng, cho phép kiểm thử môi trường staging/nhánh an toàn mà không ảnh hưởng tới dữ liệu production.

### Các Tác vụ Bảo trì Định kỳ (Maintenance)
Các tác vụ sau có thể chạy trực tiếp qua API (`POST /api/admin/databases/:id/maintenance`) hoặc trên Dashboard:
1. `integrity_check`: Kiểm tra tính toàn vẹn toàn diện trên cây B-Tree, cấu trúc trang dữ liệu và các chỉ mục.
2. `quick_check`: Kiểm tra nhanh tình trạng hệ thống và bỏ qua bước duyệt chỉ mục sâu.
3. `wal_checkpoint`: Thực thi lệnh `PRAGMA wal_checkpoint(TRUNCATE)` để ghi toàn bộ dữ liệu từ tệp WAL vào tệp chính và thu hồi kích thước file WAL về 0 byte.
4. `vacuum`: Chống phân mảnh các trang dữ liệu, hoàn trả dung lượng trống về hệ điều hành và tối ưu hóa cấu trúc lưu trữ.
5. `reindex`: Tái tạo lại toàn bộ chỉ mục (index) trong cơ sở dữ liệu.
6. `optimize`: Phân tích bảng dữ liệu và cập nhật bảng thống kê cho bộ lập kế hoạch truy vấn của SQLite.

---

## 2. Hàm SQL Mở rộng Tích hợp Sẵn (Native Custom Functions)

VanillaDatabase tích hợp sẵn các hàm mở rộng trực tiếp vào từng phiên bản SQLite:

### Hàm Toán học Vector AI (Vector Embeddings & RAG)
Phù hợp để lưu trữ mảng vector embedding trong các cột kiểu chuỗi JSON chuẩn:

```sql
-- Tính toán độ tương đồng Cosine giữa hai mảng vector (1.0 = trùng khớp hoàn toàn, 0.0 = trực giao)
SELECT id, title,
       vec_cosine_similarity(embedding, '[0.012, 0.421, -0.198, 0.087]') as similarity
FROM document_embeddings
WHERE similarity > 0.75
ORDER BY similarity DESC
LIMIT 5;

-- Tính khoảng cách Cosine (0.0 = trùng khớp, 2.0 = đối lập hoàn toàn)
SELECT id, vec_cosine_distance(embedding, '[0.1, 0.2, 0.3]') as dist
FROM items
ORDER BY dist ASC;
```

### Hàm Mật mã học Trực tiếp trong SQL (Native Crypto)
- `encrypt_aes(plaintext, key)`: Mã hóa chuỗi văn bản bằng chuẩn xác thực AES-256-GCM.
- `decrypt_aes(ciphertext, key)`: Giải mã chuỗi văn bản đã được mã hóa AES-256-GCM.
- `hash_sha256(data)`: Tính toán mã băm SHA-256 dạng chuỗi hex tiêu chuẩn.
- `hash_hmac(data, secret)`: Tính toán mã băm xác thực thông điệp HMAC-SHA256.

---

## 3. Hộp cát Bảo mật SQL (SQL Safety Sandbox)

Để đảm bảo tính an toàn cho mô hình đa khách thuê và độ ổn định của máy chủ, động cơ SQL từ chối nghiêm ngặt các câu lệnh nguy hiểm:
- **`ATTACH DATABASE` & `DETACH DATABASE`**: Nghiêm cấm hoàn toàn nhằm ngăn chặn truy cập trái phép vào các tệp database lân cận.
- **`load_extension()`**: Nghiêm cấm nhằm chặn nạp các thư viện nhị phân tùy ý từ bên ngoài.
- **Các lệnh PRAGMA nguy hiểm**: Việc can thiệp trực tiếp vào `data_version`, `journal_mode` hoặc `foreign_keys` đều được kiểm soát và chặn nếu vi phạm chính sách an toàn.
