# Kiến trúc & Thiết kế Động cơ (Architecture)

Tài liệu này giải thích chi tiết kiến trúc bên trong, vòng đời kết nối, mô hình tương tác đồng thời và cơ chế cô lập dữ liệu của **VanillaDatabase**.

---

## 1. Sơ đồ kiến trúc tổng thể

```
                      ┌─────────────────────────────────┐
                      │    HTTP / WebSocket Clients     │
                      └────────────────┬────────────────┘
                                       │
                     ┌─────────────────┴─────────────────┐
                     │ Fastify HTTP Server (Port: 3000)  │
                     │  - Helmet Security & CORS         │
                     │  - Cookie Session Parser          │
                     │  - Multipart Upload Engine        │
                     │  - Metrics & Telemetry Hook       │
                     └─────────────────┬─────────────────┘
                                       │
        ┌──────────────────────────────┴──────────────────────────────┐
        ▼                                                             ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│ Control Plane (/api/*)       │              │ Data Plane (/v1/*)           │
│ • Admin Authentication       │              │ • API Bearer Token Guard     │
│ • User RBAC & Quotas         │              │ • Token Rate Limiter         │
│ • Multi-DB SQL Translator    │              │ • Parameterized Query Engine │
│ • Scheduled Backup Worker    │              │ • Atomic Batch Transaction   │
│ • Webhook Event Dispatcher   │              │ • Realtime SSE Stream Bus    │
│ • Audit & Activity Logs      │              │ • Media Storage (Range 206)  │
└──────────────┬───────────────┘              └──────────────┬───────────────┘
               │                                             │
               ▼                                             ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│ Metadata Store               │              │ Database Manager Pool        │
│ • data/system/vanilladb.db   │              │ • Connection Handle Cache    │
│ • Schema migrations          │              │ • SQL Safety Validator       │
│ • Users, Tokens, Settings    │              │ • Vector Math & SQL Crypto   │
└──────────────────────────────┘              └──────────────┬───────────────┘
                                                             │
                                                             ▼
                                              ┌──────────────────────────────┐
                                              │ Tenant SQLite Databases      │
                                              │ • data/databases/:id.sqlite  │
                                              │ • WAL Mode & Busy Timeout    │
                                              │ • data/storage/:id/*         │
                                              └──────────────────────────────┘
```

---

## 2. Cơ chế Đa Khách Thuê & Cô Lập Dữ Liệu

### File SQLite Riêng Biệt Cho Từng Tenant
Mỗi database được tạo ra là một tệp `.sqlite` hoàn toàn độc lập trên ổ đĩa:
- Tệp cơ sở dữ liệu chính: `data/databases/db_<nanoid>.sqlite`
- Nhật ký ghi trước (Write-Ahead Log): `data/databases/db_<nanoid>.sqlite-wal`
- Bộ nhớ chia sẻ (Shared Memory): `data/databases/db_<nanoid>.sqlite-shm`

### Ưu điểm vượt trội của mô hình file độc lập
1. **Cô lập tuyệt đối**: Không có nguy cơ rò rỉ dữ liệu giữa các tenant qua lỗi câu lệnh `WHERE` hoặc `JOIN`.
2. **Khôi phục từng phần**: Khôi phục một cơ sở dữ liệu bị lỗi mà không làm ảnh hưởng đến các database khác.
3. **Sao chép và di dời**: Mỗi cơ sở dữ liệu có thể dễ dàng sao chép, tải về hoặc di chuyển sang máy chủ khác chỉ bằng thao tác tệp tin.

---

## 3. Tối ưu hóa hiệu năng & Chế độ WAL

- **PRAGMA journal_mode = WAL**: Cho phép các tiến trình đọc (readers) và ghi (writers) diễn ra đồng thời mà không chặn lẫn nhau.
- **PRAGMA busy_timeout = 5000**: Tự động đợi tối đa 5000ms khi tệp tin bị khóa trước khi trả về lỗi `SQLITE_BUSY`.
- **Handle Cache Pool**: Giữ mở các kết nối được sử dụng thường xuyên trong 60 giây để tránh overhead đóng/mở tệp liên tục.
