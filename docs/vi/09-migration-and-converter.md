# Chuyển đổi & Nhập Cơ sở Dữ liệu Đa phương ngữ

Hướng dẫn kỹ thuật nhập và tự động chuyển đổi các bản sao lưu từ MySQL, PostgreSQL, MongoDB / NDJSON, CSV và file nhị phân SQLite vào **VanillaDatabase**.

---

## 1. Các định dạng Hỗ trợ & Quy trình Chuyển đổi

VanillaDatabase trang bị bộ chuyển dịch phương ngữ SQL bản địa (`src/server/utils/sqlTranslator.ts`) giúp nhập dữ liệu từ các hệ quản trị cơ sở dữ liệu khác mà không cần công cụ ETL phụ trợ.

### 1.1. Bản sao lưu MySQL (`.sql`, `.dump`)
- Thay thế dấu nháy ngược bằng dấu nháy chuẩn SQLite.
- Chuyển đổi từ khóa `AUTO_INCREMENT` thành `INTEGER PRIMARY KEY AUTOINCREMENT`.
- Ánh xạ các kiểu dữ liệu của MySQL (`VARCHAR`, `TINYINT`, `DATETIME`, `JSON`, `ENUM`) sang các kiểu lưu trữ chuẩn SQLite (`TEXT`, `INTEGER`, `REAL`, `BLOB`).
- Loại bỏ các tùy chọn bảng không tương thích (`ENGINE=InnoDB`, `DEFAULT CHARSET=utf8mb4`, `COLLATE=...`).
- Tách các mệnh đề `KEY` và `INDEX` lồng trong bảng thành các câu lệnh `CREATE INDEX` độc lập.

### 1.2. Bản sao lưu PostgreSQL (`.sql`, `.dump`)
- Chuyển đổi `SERIAL` và `BIGSERIAL` thành `INTEGER PRIMARY KEY AUTOINCREMENT`.
- Loại bỏ tiền tố namespace schema của PostgreSQL (ví dụ: `"public"."users"` -> `"users"`).
- Chuẩn hóa các kiểu dữ liệu PostgreSQL (`BYTEA`, `TIMESTAMPTZ`, `JSONB`, `UUID`, `CITEXT`, `FLOAT8`).
- Phân tích cú pháp các khối dữ liệu `COPY table (col1, col2) FROM stdin; ... \.` và chuyển thành các lô câu lệnh `INSERT INTO` nguyên tử.

### 1.3. MongoDB, JSON & NDJSON (`.json`, `.ndjson`, `.jsonl`)
- Tự động quét mẫu tài liệu để suy luận cấu trúc cột và kiểu dữ liệu (`INTEGER`, `REAL`, `TEXT`).
- Sinh câu lệnh `CREATE TABLE` tương ứng và chèn toàn bộ bản ghi theo giao dịch hàng loạt.

### 1.4. Bảng tính CSV (`.csv`)
- Đọc dòng tiêu đề và nạp dữ liệu vào bảng có sẵn hoặc tự động khởi tạo cấu trúc bảng mới.

### 1.5. Cơ sở Dữ liệu Nhị phân SQLite (`.sqlite`, `.db`)
- Tự động nạp trực tiếp sau khi xác thực chữ ký tiêu đề nhị phân 16 byte `SQLite format 3`.

---

## 2. Các Định dạng Xuất Dữ liệu

Cơ sở dữ liệu tenant có thể được xuất ra qua `GET /api/admin/databases/:id/export?format=<format>`:
- **`sql`**: Tạo bản dump SQL chứa toàn bộ DDL cấu trúc bảng và các câu lệnh `INSERT INTO` bao bọc trong giao dịch.
- **`sqlite` / `db`**: Đồng bộ nhật ký WAL qua `PRAGMA wal_checkpoint(PASSIVE)` và tải về tệp nhị phân gốc.
- **`json`**: Xuất toàn bộ dữ liệu dưới dạng mảng đối tượng JSON.
- **`csv`**: Xuất bảng dữ liệu sang tệp CSV tuân thủ tiêu chuẩn RFC 4180.
