# Kiến trúc & Thiết kế Động cơ

Tài liệu này giải thích chi tiết cấu trúc kiến trúc bên trong, cơ chế quản lý bộ đệm kết nối (connection pooling), mô hình xử lý đồng thời và giải pháp cô lập dữ liệu đa người dùng (multi-tenant) của **VanillaDatabase**.

---

## 1. Sơ đồ Kiến trúc Tổng thể

```
                      ┌─────────────────────────────────┐
                      │     Clients HTTP / Luồng SSE    │
                      │  (Giao diện Web, SDKs, Scripts) │
                      └────────────────┬────────────────┘
                                       │
                     ┌─────────────────┴─────────────────┐
                     │ Máy chủ HTTP Fastify (Cổng: 3000) │
                     │  - Bảo mật Helmet & Bộ lọc CORS   │
                     │  - Xác thực Cookie & Bearer Token │
                     │  - Tải tệp Multipart & Range 206  │
                     │  - Thu thập chỉ số & Telemetry    │
                     └─────────────────┬─────────────────┘
                                       │
        ┌──────────────────────────────┴──────────────────────────────┐
        ▼                                                             ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│ Control Plane (/api/*)       │              │ Data Plane (/v1/*)           │
│ • Xác thực Admin & Phiên     │              │ • Kiểm soát API Bearer Token │
│ • Phân quyền RBAC & Hạn mức  │              │ • Giới hạn tần suất (429)    │
│ • Dịch chuyển đa hệ CSDL SQL │              │ • Động cơ SQL tham số hóa    │
│ • Lập lịch sao lưu tự động   │              │ • Giao dịch Batch nguyên tử  │
│ • Bộ phát sự kiện Webhook    │              │ • Kênh SSE thời gian thực    │
│ • Nhật ký kiểm toán hệ thống │              │ • Lưu trữ & phát luồng Range │
└──────────────┬───────────────┘              └──────────────┬───────────────┘
               │                                             │
               ▼                                             ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│ Kho Metadata Hệ thống        │              │ Bộ đệm Quản lý Kết nối CSDL  │
│ • data/system/vanilladb.sqlite              │ • Bộ nhớ đệm Handle kết nối  │
│ • Lịch sử di chuyển schema   │              │ • Hộp cát bảo mật cú pháp    │
│ • Người dùng, Token, Cấu hình│              │ • Hàm Vector AI & Mật mã SQL │
└──────────────────────────────┘              └──────────────┬───────────────┘
                                                             │
                                                             ▼
                                              ┌──────────────────────────────┐
                                              │ Tệp CSDL SQLite Khách thuê   │
                                              │ • data/databases/:id.sqlite  │
                                              │ • Chế độ WAL & Busy Timeout  │
                                              │ • data/storage/:id/*         │
                                              │ • data/backups/:id/*.sqlite  │
                                              └──────────────────────────────┘
```

---

## 2. Phân tách Hai Tầng: Control Plane và Data Plane

VanillaDatabase phân tách rành mạch giữa luồng điều khiển quản trị và luồng dữ liệu của khách thuê:

### Control Plane (`/api/*`)
- Quản trị các tác vụ hệ thống: tạo/xóa database, phát hành API token, lập lịch backup, mời thành viên nhóm và quản lý người dùng.
- Được bảo vệ bằng cookie phiên làm việc (`vdb_session`) với cơ chế xác minh băm mật khẩu `Argon2id` và kiểm tra quyền RBAC.
- Dữ liệu được lưu trữ tại cơ sở dữ liệu metadata hệ thống (`data/system/vanilladb.sqlite`).

### Data Plane (`/v1/*`)
- Tầng thực thi dữ liệu hiệu năng cao dành cho các câu truy vấn SQL, giao dịch batch atomic và phát luồng media.
- Được bảo vệ bằng các mã API Bearer Token có phạm vi quyền (`vdb_live_*`, `vdb_test_*`) kèm bộ lọc giới hạn tần suất cửa sổ trượt (sliding-window rate limiter).
- Hoàn toàn cô lập trong phạm vi database đích được chỉ định.

---

## 3. Kiến trúc Đa khách thuê & Cô lập Dữ liệu

### Tệp Cơ sở Dữ liệu Độc lập
Mỗi cơ sở dữ liệu khách thuê được lưu trữ thành một tệp SQLite riêng biệt trên ổ đĩa:
- Tệp database chính: `data/databases/db_<nanoid>.sqlite`
- Nhật ký ghi trước (Write-Ahead Log): `data/databases/db_<nanoid>.sqlite-wal`
- Bộ nhớ chia sẻ (Shared Memory): `data/databases/db_<nanoid>.sqlite-shm`

### Ưu điểm của Cơ chế Cô lập
1. **Bảo mật Tuyệt đối**: Ngăn chặn hoàn toàn rủi ro rò rỉ dữ liệu chéo giữa các khách thuê do tấn công SQL Injection hoặc mệnh đề `JOIN` nhầm lẫn.
2. **Khả năng Di động & Sao lưu Riêng biệt**: Từng database có thể được sao lưu, phục hồi, nhân bản (clone) hoặc tải về mà không gây khóa các database khác.
3. **Thực thi Hạn mức Nghiêm ngặt**: Dễ dàng kiểm soát dung lượng ổ đĩa theo từng khách thuê (`max_size_mb`).

---

## 4. Động cơ Xử lý Đồng thời & Tối ưu Hiệu năng

- **PRAGMA journal_mode = WAL**: Chế độ Write-Ahead Logging cho phép nhiều luồng đọc và một luồng ghi hoạt động song song mà không tranh chấp khóa.
- **PRAGMA busy_timeout = 5000**: Khi xảy ra khóa ghi, các yêu cầu tiếp theo sẽ tự động chờ tối đa 5000ms trước khi trả về mã lỗi `SQLITE_BUSY`.
- **Bộ nhớ đệm Handle kết nối (`dbManager`)**: Các kết nối SQLite thường xuyên truy vấn được lưu trong bộ nhớ với thời gian trượt 60 giây, giảm thiểu chi phí mở/đóng tệp ở cấp hệ điều hành.
- **Điểm kiểm tra Checkpoint nguyên tử**: Trước khi sao lưu, hệ thống kích hoạt `PRAGMA wal_checkpoint(FULL)` đảm bảo không còn trang bẩn (dirty pages) chưa được ghi trước khi chụp snapshot.
