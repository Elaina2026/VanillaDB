# Kiến trúc Hệ thống & Động cơ

Đặc tả kỹ thuật kiến trúc nội bộ, cơ chế quản lý bộ nhớ đệm kết nối, mô hình đồng thời và cô lập dữ liệu đa người thuê trong **VanillaDatabase**.

---

## 1. Sơ đồ Tô-pô Hệ thống

```
                       +-----------------------------------+
                       |      Tầng Khách HTTP / SSE        |
                       |  (Bảng điều khiển, SDKs, Scripts) |
                       +-----------------+-----------------+
                                         |
                                         v
                       +-----------------------------------+
                       |   Máy chủ Fastify (Cổng: 3000)    |
                       |  - Lá chắn Helmet & CORS nghiêm   |
                       |  - Phiên làm việc HMAC & Token    |
                       |  - Tải tệp Multipart & Range 206  |
                       |  - Giám sát CPU, RAM & IOPS       |
                       +-----------------+-----------------+
                                         |
        +--------------------------------+--------------------------------+
        |                                                                 |
        v                                                                 v
+------------------------------+                  +------------------------------+
| Control Plane (/api/*)       |                  | Data Plane (/v1/*)           |
| - Quản trị người dùng & RBAC |                  | - Kiểm tra quyền API Token   |
| - Hạn ngạch số lượng CSDL    |                  | - Giới hạn tốc độ cửa sổ trượt|
| - Bộ chuyển đổi phương ngữ   |                  | - Động cơ thực thi tham số   |
| - Worker chạy ngầm bảo trì   |                  | - Giao dịch nguyên tử theo lô |
| - Điều phối sự kiện Webhook  |                  | - Luồng sự kiện Realtime SSE |
| - Xuất nhật ký kiểm toán     |                  | - Phát luồng Media (Range 206)|
+--------------+---------------+                  +--------------+---------------+
               |                                                 |
               v                                                 v
+------------------------------+                  +------------------------------+
| Siêu dữ liệu Metadata        |                  | Pool Quản lý Kết nối         |
| - data/system/vanilladb.sqlite                  | - Lưu bộ nhớ đệm Handle      |
| - Bảng người dùng, phiên bản |                  | - Hộp cát an toàn SQL        |
| - Token & nhật ký hệ thống   |                  | - AI Vector & Hàm mã hóa SQL |
+------------------------------+                  +--------------+---------------+
                                                                 |
                                                                 v
                                                  +------------------------------+
                                                  | Cơ sở Dữ liệu Tenant Cô lập  |
                                                  | - data/databases/:id.sqlite  |
                                                  | - Chế độ WAL & Busy Timeout  |
                                                  | - data/storage/:id/*         |
                                                  | - data/backups/:id/*.sqlite  |
                                                  +------------------------------+
```

---

## 2. Cô lập Dữ liệu Đa người thuê

VanillaDatabase phân tách ranh giới vật lý tuyệt đối giữa siêu dữ liệu hệ thống và dữ liệu tenant:

| Thành phần | Đường dẫn lưu trữ | Đảm bảo an toàn |
| :--- | :--- | :--- |
| **Siêu dữ liệu hệ thống** | `data/system/vanilladb.sqlite` | Lưu trữ tài khoản, phiên làm việc (`token_version`), danh sách token, thành viên database, webhook và nhật ký kiểm toán. |
| **Cơ sở dữ liệu Tenant** | `data/databases/:id.sqlite` | Mỗi tenant sở hữu tệp SQLite riêng biệt với tệp nhật ký WAL và bộ chỉ mục bộ nhớ chia sẻ (`-shm`). |
| **Kho tệp Media** | `data/storage/:databaseId/*` | Tệp tin đa phương tiện mã hóa AES-256-GCM phân vùng theo từng database. |
| **Bản sao lưu** | `data/backups/:databaseId/*` | Tệp sao lưu mã hóa (`.sqlite.venc`) kèm mã băm kiểm tra toàn vẹn SHA-256. |

---

## 3. Quản lý Kết nối & Mô hình Đồng thời

### Chế độ Ghi nhật ký trước (WAL Mode)
Mỗi database khi khởi tạo được áp dụng các pragma tiêu chuẩn:
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```
- **Đọc và Ghi Đồng thời**: Nhiều luồng đọc dữ liệu có thể vận hành đồng thời mà không chặn đứng thao tác ghi mới.
- **Bộ nhớ đệm Handle**: `DatabaseManager` lưu các kết nối đang hoạt động trong bộ nhớ. Sau 5 phút không có truy vấn mới, kết nối tự động đóng để giải phóng file descriptor.

### Hộp cát An toàn Truy vấn
Toàn bộ truy vấn SQL từ người dùng phải đi qua hàm kiểm duyệt `DatabaseManager.validateSqlSafety()`:
- **Hành vi bị chặn đứng**: `ATTACH DATABASE`, `DETACH DATABASE`, `load_extension()` và `PRAGMA writable_schema`.
- **Tham số hóa**: 100% truy vấn nội bộ sử dụng câu lệnh chuẩn bị (Prepared Statements).

---

## 4. Phân tách Control Plane và Data Plane

### Tầng Điều khiển Control Plane (`/api/*`)
- Chỉ người dùng đã đăng nhập hoặc quản trị viên mới có thể truy cập.
- Xử lý việc tạo mới, nhân bản, kiểm tra toàn vẹn CSDL và phân quyền thành viên.
- Được bảo vệ bởi session cookie có đính kèm `token_version` để thu hồi phiên tức thì khi đổi mật khẩu.

### Tầng Dữ liệu Data Plane (`/v1/*`)
- Giao diện hiệu năng cao phục vụ kết nối trực tiếp từ ứng dụng và client SDK.
- Xác thực qua API Token dạng Bearer (`vdb_live_*`, `vdb_test_*`).
- Áp dụng giới hạn tốc độ trượt và phân quyền theo danh sách bảng.
