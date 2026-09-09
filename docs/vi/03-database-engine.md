# Quản trị Cơ sở Dữ liệu & Động cơ SQL

Đặc tả kỹ thuật các thao tác cơ sở dữ liệu, hàm SQL tự định nghĩa bản địa, kiểm tra cấu trúc schema, nhân bản cơ sở dữ liệu và giao dịch hàng loạt trong **VanillaDatabase**.

---

## 1. Vòng đời & Thao tác Quản trị Cơ sở Dữ liệu

### Khởi tạo & Định danh
Cơ sở dữ liệu có thể được tạo qua Giao diện web hoặc API Control Plane:
- **Định danh ID**: Định dạng `db_<nanoid(16)>` (ví dụ: `db_pMI8Tn-5MvVgh9-1`).
- **Slug**: Chuỗi định danh an toàn URL (ví dụ: `production-store-db`).
- **Định danh chủ sở hữu**: Ràng buộc với ID người dùng tạo để phục vụ phân quyền RBAC và tính toán hạn mức.

### Nhân bản Database Tức thì (1-Click Branching)
VanillaDatabase hỗ trợ nhân bản database ngay lập tức phục vụ môi trường staging hoặc thử nghiệm tính năng:
1. Chạy `PRAGMA wal_checkpoint(FULL)` trên database gốc để đồng bộ dữ liệu vào tệp chính.
2. Thực hiện sao chép nguyên tử tệp `.sqlite` trên ổ đĩa sang phiên bản tenant mới.
3. Tạo bản ghi siêu dữ liệu độc lập. Các thao tác ghi trên bản sao hoàn toàn không ảnh hưởng đến dữ liệu production.

### Lệnh Bảo trì Hệ thống
Các tác vụ quản trị sau có thể thực thi qua `POST /api/admin/databases/:id/maintenance`:
- `integrity_check`: Chạy `PRAGMA integrity_check` kiểm tra tính toàn vẹn cấu trúc B-Tree, bảng cấp phát trang và chỉ mục.
- `quick_check`: Kiểm tra nhanh bỏ qua quét chỉ mục phụ.
- `wal_checkpoint`: Thực thi `PRAGMA wal_checkpoint(TRUNCATE)` để ghi sạch thay đổi từ file WAL vào file chính và đặt kích thước file WAL về 0 byte.
- `vacuum`: Chống phân mảnh các trang dữ liệu và hoàn trả các khối trống về hệ điều hành máy chủ.
- `reindex`: Tái xây dựng toàn bộ chỉ mục trên database.
- `optimize`: Thu thập số liệu thống kê schema và tinh chỉnh ước lượng của bộ lập kế hoạch truy vấn SQLite.

---

## 2. Hàm SQL Mở rộng Bản địa (Native Custom Functions)

Mỗi kết nối SQLite được đăng ký sẵn các hàm mở rộng C/C++ trực tiếp:

### Hàm Toán học AI Vector
Hỗ trợ tính toán khoảng cách embedding vector lưu dưới dạng chuỗi JSON:

```sql
-- Tính toán độ tương đồng Cosine (1.0 = trùng khớp tuyệt đối, 0.0 = trực giao)
SELECT id, title,
       vec_cosine_similarity(embedding, '[0.012, 0.421, -0.198, 0.087]') as similarity
FROM document_embeddings
WHERE similarity > 0.75
ORDER BY similarity DESC
LIMIT 5;

-- Tính khoảng cách Cosine (0.0 = trùng khớp tuyệt đối, 2.0 = đối lập)
SELECT id, vec_cosine_distance(embedding, '[0.1, 0.2, 0.3]') as dist
FROM items
ORDER BY dist ASC;
```

### Hàm Mật mã học Trực tiếp trong SQL
Mã hóa và băm dữ liệu trực tiếp trong câu lệnh:

```sql
-- Mã hóa dữ liệu nhạy cảm bằng chuẩn AES-256-GCM
SELECT id, encrypt_aes(ssn_plaintext, 'khoa_bi_mat_256bit') as ssn_encrypted
FROM customer_records;

-- Giải mã chuỗi đã mã hóa
SELECT id, decrypt_aes(ssn_encrypted, 'khoa_bi_mat_256bit') as ssn_plaintext
FROM customer_records;

-- Tính toán mã băm SHA-256
SELECT hash_sha256('chuoi_can_bam');

-- Tính toán chữ ký HMAC-SHA256
SELECT hash_hmac('du_lieu_payload', 'khoa_ky_secret');
```

---

## 3. Giao dịch Lô Nguyên tử (Atomic Batch Transactions)

Tầng Data Plane hỗ trợ gửi lô nhiều câu lệnh SQL trong một giao dịch duy nhất qua `/v1/databases/:id/batch`:

```json
{
  "transaction": true,
  "statements": [
    {
      "sql": "UPDATE bank_accounts SET balance = balance - 100 WHERE id = ?;",
      "params": ["acc_alice"]
    },
    {
      "sql": "UPDATE bank_accounts SET balance = balance + 100 WHERE id = ?;",
      "params": ["acc_bob"]
    }
  ]
}
```

Nếu bất kỳ câu lệnh nào trong lô thất bại (vi phạm ràng buộc hoặc lỗi cú pháp), toàn bộ giao dịch được hoàn tác (rollback) lập tức, đảm bảo tính toàn vẹn tuyệt đối.
