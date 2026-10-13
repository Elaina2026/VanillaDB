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

---

## 5. Phân cụm Đa máy chủ & Phân mảnh Lưu trữ (Host Sharding)

VanillaDatabase hỗ trợ mở rộng lưu trữ theo chiều ngang (horizontal host sharding) qua nhiều máy chủ Node.js:

```
                                +-----------------------------------+
                                |     Máy chủ Chính / Siêu dữ liệu  |
                                |  - vanilladb.sqlite (metadata)    |
                                |  - Giám sát phần cứng thời gian thực|
                                |  - Bộ điều khiển tự động tràn đĩa |
                                +-----------------+-----------------+
                                                  |
                  +-------------------------------+-------------------------------+
                  | (Proxy / Luồng)                               | (Proxy / Luồng)
                  v                                               v
        +-------------------+                           +-------------------+
        |  Máy chủ Worker 1 |                           |  Máy chủ Worker 2 |
        |  node_id: node_1  |                           |  node_id: node_2  |
        |  Trống: 400 GB    |                           |  Trống: 250 GB    |
        |  /api/internal/*  |                           |  /api/internal/*  |
        +-------------------+                           +-------------------+
```

### 5.1. Cơ chế Tự động Tràn Dung lượng Ổ đĩa (Auto-Spillover)
1. **Giám sát Ngưỡng dung lượng**: Định kỳ mỗi 15 giây, máy chủ Gateway thu thập chỉ số ổ đĩa vật lý (`fs.statfsSync`) hoặc theo hạn mức cấu hình (`VDB_HOST_DISK_GB`).
2. **Kích hoạt Tràn đĩa**: Khi ổ đĩa máy chủ chính sử dụng vượt quá 85% dung lượng HOẶC dung lượng trống khả dụng còn dưới 5 GB, chế độ Auto-Spillover tự động bật.
3. **Lựa chọn Máy chủ Đích**: Hàm `ClusterService.selectPlacementNode()` tự động tìm kiếm các máy chủ worker đang hoạt động khỏe mạnh (`status = 'healthy'`) có dung lượng trống tối thiểu 5 GB, ưu tiên máy chủ có `disk_free_bytes` lớn nhất. Cơ sở dữ liệu mới sẽ được gán `node_id` của worker đó.

### 5.2. Chuyển tiếp Yêu cầu Trong suốt (Transparent Query Proxying)
Khi có yêu cầu gửi đến Tầng Dữ liệu Data Plane (`/v1/databases/:id/query`, `/exec`, `/batch`, `/storage/*`) nhắm vào cơ sở dữ liệu nằm trên máy chủ worker (`db.node_id !== 'local'` và `db.node_id !== config.nodeId`):
- Gateway chặn bắt yêu cầu trước khi mở tệp SQLite cục bộ.
- Phương thức, tiêu đề và nội dung yêu cầu được chuyển tiếp trực tiếp (stream proxy) đến `http://${workerNode.base_url}${req.url}` kèm tiêu đề chứng thực nội bộ (`x-cluster-secret`).
- Kết quả phản hồi (bao gồm cả phân đoạn media HTTP 206) được truyền ngược về ứng dụng khách với nguyên vẹn mã trạng thái HTTP và headers.

### 5.3. Di chuyển Cơ sở Dữ liệu Không gián đoạn (Zero-Downtime Migration)
Quản trị viên có thể tái cân bằng dung lượng lưu trữ trên toàn cụm bất kỳ lúc nào qua `POST /api/admin/cluster/migrate`:
1. **Tạo Bản chụp Nguyên tử**: Máy chủ nguồn tạm thời hoàn tất các truy vấn đang xử lý và kích hoạt lệnh SQLite `VACUUM INTO` để tạo tệp snapshot nhất quán tại thời điểm di chuyển.
2. **Phát Luồng Dữ liệu**: Tệp snapshot và thư mục media liên kết được stream trực tiếp sang điểm cuối `/api/internal/node/databases/:id/receive` trên node đích.
3. **Kiểm tra Toàn vẹn Dữ liệu**: Node đích tiến hành xác minh tính toàn vẹn của tệp SQLite (`PRAGMA quick_check;`) và kiểm tra mã băm SHA-256.
4. **Cập nhật Siêu dữ liệu**: Gateway cập nhật bảng ghi hệ thống: `UPDATE databases SET node_id = ? WHERE id = ?`.
5. **Giải phóng Ổ đĩa Nguồn**: Node nguồn xóa tệp tin cũ để giải phóng dung lượng đĩa ngay lập tức.

---

## 6. Động cơ Lập lịch Tác vụ Đa bước (Schedules Execution Pipeline)

VanillaDatabase tích hợp động cơ quản lý lịch trình linh hoạt lấy cảm hứng từ các hệ thống điều khiển công nghiệp:
- **Cú pháp Cron 5 thành phần**: Phân tích biểu thức cron tiêu chuẩn (`phút giờ ngày_trong_tháng tháng ngày_trong_tuần`) hỗ trợ ký tự đại diện, bước nhảy, danh sách và khoảng giá trị.
- **Chuỗi Tác vụ Tuần tự**: Mỗi lịch trình có thể thực thi danh sách các tác vụ có thứ tự:
  1. `send_command`: Thực thi câu lệnh SQL hoặc khối truy vấn tham số hóa.
  2. `run_maintenance`: Kích hoạt quy trình bảo trì động cơ (`wal_checkpoint`, `vacuum`, `optimize`, `reindex`).
  3. `create_backup`: Tự động tạo bản sao lưu snapshot mã hóa theo thời điểm.
  4. `trigger_webhook`: Bắn webhook thời gian thực tới hệ thống giám sát bên ngoài.
  5. `export_data`: Xuất toàn bộ lược đồ và dữ liệu phục vụ khắc phục thảm họa.
- **Tùy chọn Điều khiển**: Thiết lập độ trễ thực thi theo từng tác vụ (`time_offset`), cơ chế chịu lỗi (`continue_on_failure`), và điều kiện chỉ chạy khi cơ sở dữ liệu hoạt động bình thường (`only_when_online`).

---

## 7. Dòng thời gian Hoạt động & Dòng Kiểm toán Thời gian thực

Mọi hành động thực thi trên cơ sở dữ liệu tenant đều được ghi nhận vào nhật ký vận hành và nhật ký kiểm toán có cấu trúc:
- **Điểm cuối**: `GET /api/admin/databases/:id/activity?search=...&limit=80`
- **Hợp nhất Dữ liệu**: Truy vấn và chuẩn hóa cả nhật ký kiểm toán hệ thống lẫn sự kiện cơ sở dữ liệu thành đối tượng `DatabaseActivityItem` thống nhất kèm mốc thời gian, tên tài khoản thực hiện, danh mục nhãn màu sắc (`schedule create`, `backup restore`, `query execute`), trạng thái lỗi và địa chỉ IP của máy khách.
- **Giao diện Giám sát Trực tiếp**: Hỗ trợ tự động tải định kỳ với nút tạm dừng/tiếp tục và làm mới thủ công trên giao diện.

---

## 8. Hệ thống Vé Truy cập Ngắn hạn (RFC 6750 Ephemeral Ticket System)

Nhằm ngăn chặn rò rỉ token truy cập qua lịch sử trình duyệt web, nhật ký proxy HTTP và tiêu đề `Referer`:
- Cấm hoàn toàn việc truyền Bearer Token qua chuỗi truy vấn URL (`?token=...`) trên toàn bộ các tuyến dữ liệu (`VDB-SEC-03`).
- Vé truy cập ngắn hạn dùng một lần (`vdb_ticket_*`) được cấp qua `POST /v1/databases/:databaseId/tickets` dành riêng cho việc phát luồng media (`/v1/files/:id/view`) và kết nối luồng sự kiện thời gian thực Server-Sent Events (`/v1/databases/:id/realtime`).
- Vé tự động hủy sau 60 giây và bị xóa ngay khỏi bộ nhớ đệm sau lần sử dụng đầu tiên.

---

## 9. Đường ống Quản lý Ảnh đại diện Nhị phân Nội bộ

Ảnh đại diện người dùng được xử lý qua hệ thống lưu trữ nhị phân cô lập:
- **Lưu trữ**: Lưu tại `data/storage/avatars/:userId.<ext>` dưới dạng tài nguyên hệ thống, không tính vào hạn mức dung lượng đĩa của cơ sở dữ liệu tenant.
- **Xác thực**: Điểm cuối tải lên (`POST /api/auth/profile/avatar`) kiểm tra chữ ký nhị phân (magic bytes) đối với định dạng PNG, JPEG, WebP với dung lượng tối đa 10MB.
- **Phân phối**: Cung cấp qua `GET /api/auth/avatar/:userId` đi kèm các tiêu đề bảo mật nghiêm ngặt (`nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, và `Cross-Origin-Resource-Policy: cross-origin`).


