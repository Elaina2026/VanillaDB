# Bộ Chuyển đổi & Nhập Dữ liệu Đa Hệ quản trị

VanillaDatabase tích hợp sẵn bộ dịch chuyển cú pháp SQL và cấu trúc tài liệu đa hệ thống, cho phép tự động nhập các bản sao lưu từ các hệ quản trị cơ sở dữ liệu phổ biến và chuyển đổi tương thích hoàn toàn sang SQLite.

---

## 1. Các Định dạng Hỗ trợ & Quy tắc Chuyển đổi

### 1. Bản sao lưu MySQL (`.sql`, `.dump`)
- Loại bỏ các ký tự dấu backtick (`` `users` `` $\rightarrow$ `"users"`).
- Dịch chuyển thuộc tính `AUTO_INCREMENT` thành `INTEGER PRIMARY KEY AUTOINCREMENT`.
- Ánh xạ các kiểu dữ liệu của MySQL (`VARCHAR`, `TINYINT`, `DATETIME`, `JSON`, `ENUM`) sang các kiểu lưu trữ chuẩn của SQLite (`TEXT`, `INTEGER`, `REAL`, `BLOB`).
- Bỏ qua các tùy chọn bảng đặc thù của MySQL (`ENGINE=InnoDB`, `DEFAULT CHARSET=utf8mb4`, `COLLATE=...`).
- Tách các định nghĩa chỉ mục nội dòng (`KEY`, `INDEX`) thành các câu lệnh `CREATE INDEX` độc lập.

### 2. Bản sao lưu PostgreSQL (`.sql`, `.dump`)
- Dịch chuyển các kiểu tự tăng `SERIAL` và `BIGSERIAL` $\rightarrow$ `INTEGER PRIMARY KEY AUTOINCREMENT`.
- Loại bỏ tiền tố schema (`"public"."users"` $\rightarrow$ `"users"`).
- Chuyển đổi các kiểu dữ liệu của PostgreSQL (`BYTEA`, `TIMESTAMPTZ`, `JSONB`, `UUID`, `CITEXT`, `FLOAT8`) sang kiểu tương thích của SQLite.
- Dịch các khối dữ liệu nạp nhanh `COPY table (col1, col2) FROM stdin; ... \.` thành các lệnh chèn theo lô nguyên tử `INSERT INTO`.

### 3. Tệp MongoDB & NDJSON / JSON (`.json`, `.ndjson`, `.jsonl`)
- Tự động lấy mẫu các bản ghi để suy luận kiểu dữ liệu của từng cột (`INTEGER`, `REAL`, `TEXT`).
- Sinh mã định nghĩa cấu trúc bảng `CREATE TABLE` (DDL) và chèn toàn bộ bản ghi theo lô atomic.

### 4. Tệp Dữ liệu Phân cách Bằng Dấu phẩy CSV (`.csv`)
- Tự động phân tích dòng tiêu đề (headers) và chèn các hàng dữ liệu vào bảng đã có hoặc tự động tạo bảng mới phù hợp.

### 5. Tệp Cơ sở Dữ liệu Nhị phân SQLite (`.sqlite`, `.db`)
- Kiểm tra chữ ký nhận dạng tiêu đề `SQLite format 3` và thay thế trực tiếp vào database khách thuê chỉ định.

---

## 2. Xuất Dữ liệu (Export)

Các cơ sở dữ liệu có thể được xuất ra thông qua endpoint `GET /api/admin/databases/:id/export?format=<format>`:
- **`sql`**: Tạo bản sao lưu mã SQL chuẩn bao gồm các câu lệnh `CREATE TABLE` và `INSERT INTO` được bọc trong một giao dịch.
- **`sqlite` / `db`**: Xả dữ liệu từ file WAL (`PRAGMA wal_checkpoint(PASSIVE)`) và tải về tệp nhị phân `.sqlite` gốc.
- **`json`**: Xuất toàn bộ các hàng dữ liệu thành một mảng JSON tiêu chuẩn.
- **`csv`**: Xuất dữ liệu thành tệp CSV với dấu phân cách phẩy và xử lý ký tự thoát chuỗi an toàn.
