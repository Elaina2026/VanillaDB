# Nhập & Xuất Dữ liệu Đa Hệ Quản Trị (Import & Export)

VanillaDatabase tích hợp sẵn bộ dịch đa ngôn ngữ SQL và tài liệu, tự động chuyển đổi các bản xuất từ hệ cơ sở dữ liệu khác sang chuẩn SQLite.

---

## 1. Định dạng hỗ trợ & Quy tắc chuyển đổi

### 1. Bản xuất từ MySQL (`.sql`, `.dump`)
- Thay thế dấu nháy ngược backtick (`` `users` `` thành `"users"`).
- Chuyển đổi `AUTO_INCREMENT` thành `INTEGER PRIMARY KEY AUTOINCREMENT`.
- Ánh xạ kiểu dữ liệu cột của MySQL (`VARCHAR`, `TINYINT`, `DATETIME`, `JSON`, `ENUM`) sang kiểu lưu trữ SQLite (`TEXT`, `INTEGER`, `REAL`, `BLOB`).
- Loại bỏ các tùy chọn bảng của MySQL (`ENGINE=InnoDB`, `DEFAULT CHARSET=utf8mb4`, `COLLATE=...`).
- Tách các định nghĩa chỉ mục nội dòng (`KEY`, `INDEX`) thành các câu lệnh `CREATE INDEX` riêng biệt.

### 2. Bản xuất từ PostgreSQL (`.sql`, `.dump`)
- Chuyển đổi `SERIAL` và `BIGSERIAL` thành `INTEGER PRIMARY KEY AUTOINCREMENT`.
- Xóa tiền tố schema (`"public"."users"` thành `"users"`).
- Chuyển đổi khối dữ liệu `COPY table FROM stdin; ... \.` thành các câu lệnh `INSERT INTO` atomic.

### 3. MongoDB & NDJSON / JSON (`.json`, `.ndjson`, `.jsonl`)
- Tự động lấy mẫu dữ liệu để suy luận kiểu dữ liệu (`INTEGER`, `REAL`, `TEXT`).
- Tự sinh câu lệnh `CREATE TABLE` DDL và chèn toàn bộ bản ghi theo lô.

### 4. Tệp CSV (`.csv`)
- Tự động nhận diện tiêu đề cột và chèn vào bảng hiện có hoặc tự tạo bảng mới.

### 5. Tệp nhị phân SQLite (`.sqlite`, `.db`)
- Kiểm tra tính hợp lệ của chữ ký nhị phân `SQLite format 3` trước khi nạp vào hệ thống.

---

## 2. Xuất dữ liệu (Exporting Data)

Cơ sở dữ liệu có thể xuất qua API `GET /api/admin/databases/:id/export?format=<format>`:
- **`sql`**: Tạo file SQL dump hoàn chỉnh với cấu trúc bảng và lệnh `INSERT INTO` đặt trong giao dịch.
- **`sqlite` / `db`**: Xả nhật ký WAL và tải trực tiếp tệp nhị phân SQLite thuần.
- **`json`**: Xuất toàn bộ bảng thành mảng đối tượng JSON.
- **`csv`**: Xuất bảng thành định dạng tệp CSV.
