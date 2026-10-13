# VanillaDatabase — Đặc Tả Kiến Trúc & Thiết Kế Kỹ Thuật Toàn Diện

> **Phiên bản:** 1.3.4  
> **Trạng thái:** Tài liệu Đặc tả Sản xuất (Production Reference)  
> **Đối tượng:** Kỹ sư Kiến trúc Hệ thống, Kỹ sư Bảo mật, Lập trình viên Cốt lõi và Quản trị viên Vận hành

---

## Mục Lục

1. [Tổng Quan Điều Hành & Nguyên Lý Kiến Trúc](#1-tổng-quan-điều-hành--nguyên-lý-kiến-trúc)
2. [Sơ Đồ Tô-pô Hệ Thống Cấp Cao](#2-sơ-đồ-tô-pô-hệ-thống-cấp-cao)
3. [Phân Tách Hai Phân Vùng: Control Plane vs. Data Plane](#3-phân-tách-hai-phân-vùng-control-plane-vs-data-plane)
4. [Mô Hình Cô Lập Lưu Trữ Vật Lý Đa Tenant](#4-mô-hình-cô-lập-lưu-trữ-vật-lý-đa-tenant)
5. [Động Cơ Cơ Sở Dữ Liệu & Kiến Trúc Đồng Thời](#5-động-cơ-cơ-sở-dữ-liệu--kiến-trúc-đồng-thời)
   - 5.1 [Động cơ Write-Ahead Logging (WAL)](#51-động-cơ-write-ahead-logging-wal)
   - 5.2 [Cơ chế Hộp cát (Sandbox) & An toàn SQL](#52-cơ-chế-hộp-cát-sandbox--an-toàn-sql)
   - 5.3 [Các Hàm Vô Hướng (Scalar Functions) Toán Học & Mật Mã](#53-các-hàm-vô-hướng-scalar-functions-toán-học--mật-mã)
   - 5.4 [Động Cơ Tìm Kiếm Toàn Văn (FTS5)](#54-động-cơ-tìm-kiếm-toàn-văn-fts5)
6. [Kiến Trúc Cụm Đa Node & Phân Mảnh Máy Chủ (Host Sharding)](#6-kiến-trúc-cụm-đa-node--phân-mảnh-máy-chủ-host-sharding)
   - 6.1 [Định tuyến Gateway & Bộ điều khiển Chuyển tiếp (Spillover Controller)](#61-định-tuyến-gateway--bộ-điều-khiển-chuyển-tiếp-spillover-controller)
   - 6.2 [Xác thực Nội bộ Cụm & So sánh Kháng Tấn công Thời gian](#62-xác-thực-nội-bộ-cụm--so-sánh-kháng-tấn-công-thời-gian)
   - 6.3 [Proxy Trong Suốt & Chuyển Đổi Dữ Liệu Không Gián Đoạn](#63-proxy-trong-suốt--chuyển-đổi-dữ-liệu-không-gián-đoạn)
7. [Kiến Trúc An Toàn & Rào Chắn Bảo Mật](#7-kiến-trúc-an-toàn--rào-chắn-bảo-mật)
   - 7.1 [VDB-SEC-01: Kiến Trúc Hủy Phiên Tức Thì (Session Revocation)](#71-vdb-sec-01-kiến-trúc-hủy-phiên-tức-thì-session-revocation)
   - 7.2 [VDB-SEC-02: Chống Tấn Công Phát Lại TOTP 2FA (RFC 6238)](#72-vdb-sec-02-chống-tấn-công-phát-lại-totp-2fa-rfc-6238)
   - 7.3 [VDB-SEC-03: Cấm Query Token (RFC 6750) & Kiến Trúc Vé Dùng Một Lần (Ticket)](#73-vdb-sec-03-cấm-query-token-rfc-6750--kiến-trúc-vé-dùng-một-lần-ticket)
   - 7.4 [Phòng Chống Tấn Công SSRF Trên Webhook](#74-phòng-chống-tấn-công-ssrf-trên-webhook)
   - 7.5 [Cô Lập Nội Dung Động & Tệp Đa Phương Tiện](#75-cô-lập-nội-dung-động--tệp-đa-phương-tiện)
   - 7.6 [Đường Ống Xử Lý Ảnh Đại Diện Nhị Phân Nội Bộ](#76-đường-ống-xử-lý-ảnh-đại-diện-nhị-phân-nội-bộ)
8. [Tự Động Hóa Nhiệm Vụ & Đường Ống Lịch Trình (Schedules Pipeline)](#8-tự-động-hóa-nhiệm-vụ--đường-ống-lịch-trình-schedules-pipeline)
   - 8.1 [Bộ Phân Tích Cú Pháp Cron 5 Thành Phần & Chế Độ Khoảng Thời Gian Đơn Giản](#81-bộ-phân-tích-cú-pháp-cron-5-thành-phần--chế-độ-khoảng-thời-gian-đơn-giản)
   - 8.2 [Động Cơ Thực Thi Chuỗi Đa Nhiệm Vụ (Multi-Task Chaining)](#82-động-cơ-thực-thi-chuỗi-đa-nhiệm-vụ-multi-task-chaining)
9. [Truyền Sự Kiện Thời Gian Thực (SSE) & Bộ Phát Webhook](#9-truyền-sự-kiện-thời-gian-thực-sse--bộ-phát-webhook)
10. [Kiến Trúc Giao Diện Người Dùng & Hệ Thống Thiết Kế UX](#10-kiến-trúc-giao-diện-người-dùng--hệ-thống-thiết-kế-ux)
    - 10.1 [Điều Hướng Phân Nhóm Chuẩn Pterodactyl](#101-điều-hướng-phân-nhóm-chuẩn-pterodactyl)
    - 10.2 [Dòng Thời Gian Nhật Ký Hoạt Động (Activity Timeline)](#102-dòng-thời-gian-nhật-ký-hoạt-động-activity-timeline)
    - 10.3 [Bảng Điều Khiển Thống Kê Tổng Hợp (Unified Dashboard)](#103-bảng-điều-khiển-thống-kê-tổng-hợp-unified-dashboard)
    - 10.4 [Hệ Thống Phím Tắt Toàn Diện & Chế Độ Tập Trung (Zen Mode)](#104-hệ-thống-phím-tắt-toàn-diện--chế-độ-tập-trung-zen-mode)
11. [Sơ Đồ Tuần Tự Vòng Đời Yêu Cầu & Luồng Dữ Liệu](#11-sơ-đồ-tuần-tự-vòng-đời-yêu-cầu--luồng-dữ-liệu)

---

## 1. Tổng Quan Điều Hành & Nguyên Lý Kiến Trúc

**VanillaDatabase (VanillaDB)** là một nền tảng điện toán đám mây SQLite đa người dùng (multi-tenant) hiệu năng cao, siêu nhẹ, được xây dựng trên nền Node.js 22+ và Fastify 5.2. Thay vì vận hành các cụm cơ sở dữ liệu nguyên khối cồng kềnh (như cụm PostgreSQL hoặc MySQL) tiêu tốn nhiều bộ nhớ RAM cho mỗi tenant nhàn rỗi, VanillaDatabase tự động cấp phát và điều phối **các tệp cơ sở dữ liệu SQLite độc lập** trực tiếp trên ổ đĩa.

### Nguyên Lý Kiến Trúc Cốt Lõi:
1. **Phân Vùng Vật Lý Trên Hệ Thống Tệp Thay Vì Không Gian Tên Logic:** Các tenant không dùng chung bảng hay schema. Mỗi database của người dùng là một tệp nhị phân SQLite (`.sqlite`) riêng biệt với file nhật ký WAL và file khóa bộ nhớ chia sẻ riêng.
2. **Ưu Tiên Thành Phần Tự Nhiên & Thư Viện Chuẩn:** Nền tảng tận dụng tối đa Fastify, Node.js stdlib `crypto`, `fs`, `stream`, và `better-sqlite3`. Không phụ thuộc vào message broker bên ngoài (Kafka/RabbitMQ) hay các ORM nặng nề.
3. **Mã Hóa Phần Cứng Dữ Liệu Khi Nghỉ (Data-at-Rest):** Cơ sở dữ liệu, bản sao lưu và tệp media hỗ trợ mã hóa chuẩn AES-256-GCM kèm mã kiểm tra toàn vẹn SHA-256.
4. **Bảo Mật Nghiêm Ngặt Chuẩn RFC Theo Mặc Định:** Hủy phiên tức thì khi đổi mật khẩu (VDB-SEC-01), chống phát lại TOTP 2FA theo RFC 6238 (VDB-SEC-02), cấm query token theo RFC 6750 và cấp vé dùng một lần có hạn 60 giây (VDB-SEC-03).
5. **Phân Mảnh Máy Chủ Theo Chiều Ngang:** Cơ chế Gateway proxy trong suốt cho phép phân bổ cơ sở dữ liệu sang nhiều node lưu trữ mà không làm thay đổi URL gọi API hay code của SDK client.

---

## 2. Sơ Đồ Tô-pô Hệ Thống Cấp Cao

```
                                  +---------------------------------------+
                                  |         Các Ứng Dụng Client           |
                                  |   (Giao diện Web, SDK, AI Agent, CLI) |
                                  +-------------------+-------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |    Fastify API Gateway (Cổng 3000)    |
                                  | - Tường lửa Bảo mật Helmet CSP & CORS |
                                  | - Bộ Giới Hạn Tần Suất L7 (Rate Limit)|
                                  | - Bộ Định Tuyến Phân Mảnh Máy Chủ     |
                                  +---------+-------------------+---------+
                                            |                   |
                     +----------------------+                   +----------------------+
                     | (Lưu Trữ Cục Bộ)                                 | (Ủy Quyền / Proxy)
                     v                                                  v
+----------------------------------------+          +----------------------------------------+
| Node Máy Chủ Chính (Local Node)        |          | Node Lưu Trữ Phụ (Remote Worker 1)     |
| - Metadata DB: data/metadata.sqlite    |          | - Node Cluster Agent (/api/internal/*) |
| - Người dùng, Phân quyền, Token, Lịch  |          | - CSDL Tenant: data/databases/:id.sqlite|
| - CSDL Tenant: data/databases/*        |          | - Tệp Media: data/storage/:id/*        |
| - Avatar: data/storage/avatars/*       |          | - Bản Sao Lưu: data/backups/*          |
| - Kho Vé Dùng 1 Lần (In-Memory Ticket) |          | - Động Cơ SQLite WAL & Hook Cục Bộ     |
+----------------------------------------+          +----------------------------------------+
```

---

## 3. Phân Tách Hai Phân Vùng: Control Plane vs. Data Plane

VanillaDatabase phân tách rõ rệt giữa thao tác quản trị nền tảng (Control Plane) và luồng xử lý dữ liệu của người dùng (Data Plane):

```
                        +----------------------------------------+
                        |            Ứng Dụng Fastify            |
                        +-------------------+--------------------+
                                            |
                    +-----------------------+-----------------------+
                    |                                               |
                    v                                               v
+---------------------------------------+       +---------------------------------------+
| Phân Vùng Quản Trị: Control Plane     |       | Phân Vùng Dữ Liệu: Data Plane         |
| (/api/*)                              |       | (/v1/*)                               |
|---------------------------------------|       |---------------------------------------|
| - Xác thực tài khoản (/api/auth/*)    |       | - Truy vấn tham số (/v1/databases/    |
| - Quản lý người dùng, Role & Quota    |       |   :id/query)                          |
| - Vòng đời CSDL (Tạo, Sửa, Xóa)       |       | - Chạy kịch bản SQL (/v1/exec)        |
| - Lập lịch trình & Chuỗi nhiệm vụ     |       | - Giao dịch nguyên tử (/v1/batch)     |
| - Sao lưu và khôi phục CSDL           |       | - Luồng sự kiện thời gian thực (SSE)  |
| - Bộ phát Webhook & Nhật ký kiểm toán |       | - Lưu trữ và stream tệp nhị phân      |
| - Quản lý cụm node & Đo đạc phần cứng |       |   (Phản hồi mã 206 Partial Content)   |
| - Cấp vé dùng 1 lần (/v1/tickets)     |       | - Tiêu thụ vé xác thực dùng 1 lần     |
+-------------------+-------------------+       +-------------------+-------------------+
                    |                                               |
                    v                                               v
+---------------------------------------+       +---------------------------------------+
| Danh Mục Siêu Dữ Liệu Hệ Thống        |       | Trình Điều Phối Kết Nối CSDL Tenant   |
| - data/metadata.sqlite                |       | - Bể chứa kết nối LRU Cache Pool      |
| - Dùng chung cho toàn bộ Control Plane|       | - Hộp cát thực thi SQL an toàn        |
+---------------------------------------+       +---------------------------------------+
```

---

## 4. Mô Hình Cô Lập Lưu Trữ Vật Lý Đa Tenant

Thay vì dùng chung một bảng lớn và lọc bằng điều kiện `WHERE tenant_id = ?`, VanillaDatabase đảm bảo **cô lập vật lý trực tiếp trên hệ thống tệp**:

| Thành Phần | Đường Dẫn Lưu Trữ | Cơ Chế Cách Ly & Đảm Bảo |
| :--- | :--- | :--- |
| **Catalog Hệ Thống** | `data/metadata.sqlite` | Database quản trị riêng biệt. Lưu mật khẩu băm Argon2id, roles, hạn mức quota, phiên đăng nhập, danh mục database, lịch trình và webhook. |
| **CSDL Của Tenant** | `data/databases/:databaseId.sqlite` | Mỗi cơ sở dữ liệu là một file SQLite nhị phân riêng. Có file nhật ký WAL (`:id.sqlite-wal`) và file chỉ mục bộ nhớ chia sẻ (`:id.sqlite-shm`) riêng. |
| **Tệp Tin Đa Phương Tiện** | `data/storage/databases/:databaseId/*` | Tệp nhị phân phân tách theo từng database, mã hóa dữ liệu khi nghỉ bằng thuật toán AES-256-GCM. |
| **Ảnh Đại Diện Người Dùng** | `data/storage/avatars/:userId.<ext>` | Tài sản nhị phân hệ thống. Hoàn toàn tách biệt khỏi hạn mức dung lượng CSDL của tenant và được xác thực bằng magic bytes. |
| **Bản Sao Lưu Mã Hóa** | `data/backups/:databaseId/*.sqlite.venc` | Bản snapshot CSDL nén và mã hóa AES-256-GCM kèm mã băm SHA-256 kiểm tra tính toàn vẹn. |

---

## 5. Động Cơ Cơ Sở Dữ Liệu & Kiến Trúc Đồng Thời

### 5.1 Động cơ Write-Ahead Logging (WAL)
Mỗi database khi mở đều được cấu hình các PRAGMA tối ưu:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA cache_size = -2000; -- 2MB bộ nhớ đệm trang RAM
```

- **Đặc tính đồng thời:** Thao tác đọc không chặn thao tác ghi, và thao tác ghi không chặn thao tác đọc. Nhiều luồng đọc có thể truy vấn đồng thời trong khi các lệnh ghi được xếp hàng tuần tự qua khóa ghi nội bộ của SQLite với thời gian chờ thử lại lên tới 5000ms.
- **Tự động dọn dẹp Checkpoint:** SQLite tự động chuyển dữ liệu từ file WAL về file chính khi đạt 1000 trang, hoặc khi quản trị viên chạy thao tác bảo trì `wal_checkpoint`.

### 5.2 Cơ chế Hộp cát (Sandbox) & An toàn SQL
Để ngăn chặn leo thang đặc quyền và thực thi mã tùy ý trên máy chủ:
1. **Vô hiệu hóa mở rộng nhị phân:** `load_extension` bị tắt vĩnh viễn trong cấu hình SQLite.
2. **Cấm câu lệnh nguy hiểm:** Lệnh `ATTACH DATABASE` và `DETACH DATABASE` bị chặn hoàn toàn ở tầng tiền xử lý regex/AST để ngăn truy cập chéo giữa các database.
3. **Chống lẩn tránh ghi qua CTE biến đổi (`isReadOnlySql`):** Các câu lệnh CTE (`WITH ... SELECT`) có thể lồng lệnh ghi (`INSERT INTO ... RETURNING *`). Bộ phân tích an toàn sẽ bóc tách chú thích SQL và từ chối các câu lệnh bắt đầu bằng `WITH` nhưng có chứa từ khóa ghi (`INSERT`, `UPDATE`, `DELETE`, `REPLACE`).
4. **Phân loại PRAGMA an toàn:** Token đọc (`database:read`) chỉ được thực thi PRAGMA chẩn đoán (`PRAGMA table_info`, `PRAGMA index_list`), bị cấm thực thi các PRAGMA can thiệp cấu trúc (`PRAGMA user_version = ...`, `auto_vacuum`, `optimize`, `wal_checkpoint`) vốn yêu cầu quyền `database:write` hoặc `database:admin`.

### 5.3 Các Hàm Vô Hướng (Scalar Functions) Toán Học & Mật Mã
Động cơ đăng ký sẵn các hàm tính toán trực tiếp vào handle SQLite:
- `cosine_similarity(vecA, vecB)`: Tính độ tương đồng Cosine giữa 2 vector JSON cho các ứng dụng AI.
- `l2_distance(vecA, vecB)`: Tính khoảng cách Euclidean.
- `vector_dot(vecA, vecB)`: Tích vô hướng nhanh của vector.
- `regexp(pattern, text)`: So khớp biểu thức chính quy Regex.
- `argon2_verify(hash, plain)`: Xác thực mật khẩu trực tiếp trong SQL.

### 5.4 Động Cơ Tìm Kiếm Toàn Văn (FTS5)
Hỗ trợ tạo bảng ảo FTS5 với các bộ tách từ (`unicode61`, `porter`, `ascii`, `trigram`) kèm các trigger tự động đồng bộ hóa trên `AFTER INSERT`, `AFTER UPDATE`, và `AFTER DELETE`.

---

## 6. Kiến Trúc Cụm Đa Node & Phân Mảnh Máy Chủ (Host Sharding)

VanillaDatabase cho phép phân bổ cơ sở dữ liệu trên nhiều node máy chủ vật lý khác nhau mà vẫn giữ nguyên một endpoint duy nhất đối với client:

### 6.1 Định tuyến Gateway & Bộ điều khiển Chuyển tiếp (Spillover Controller)
- Khi người dùng tạo database mới, Gateway sẽ kiểm tra dung lượng ổ đĩa của máy chủ chính.
- Nếu dung lượng vượt ngưỡng chuyển tiếp (`spillover_threshold_percent: 85%` hoặc dung lượng trống `< 5GB`), database sẽ được tự động khởi tạo trên remote worker node có dung lượng trống nhiều nhất.

### 6.2 Xác thực Nội bộ Cụm & So sánh Kháng Tấn công Thời gian
Các giao tiếp giữa Gateway và Worker node sử dụng header xác thực:
```http
x-cluster-secret: <VDB_CLUSTER_SECRET>
```
Để chống rò rỉ độ dài bí mật qua tấn công đo thời gian (timing attacks), chuỗi secret được băm thành SHA-256 cố định 32 bytes trước khi so sánh bằng `crypto.timingSafeEqual` trong hàm `safeCompareSecret()`.

### 6.3 Proxy Trong Suốt & Chuyển Đổi Dữ Liệu Không Gián Đoạn
- **Proxy trong suốt:** Khi client gửi request truy vấn database thuộc Worker node, Gateway tự động làm proxy chuyển tiếp HTTP request, multipart upload stream, hoặc đường truyền SSE tới Worker node tương ứng.
- **Di chuyển CSDL không mất mát dữ liệu:** Cho phép chuyển CSDL giữa các node mà không gián đoạn dịch vụ: tạm dừng ghi, checkpoint toàn bộ WAL vào đĩa (`PRAGMA wal_checkpoint(TRUNCATE)`), truyền bản snapshot mã hóa sang node đích và cập nhật `databases.node_id` trong danh mục hệ thống.

---

## 7. Kiến Trúc An Toàn & Rào Chắn Bảo Mật

### 7.1 VDB-SEC-01: Kiến Trúc Hủy Phiên Tức Thì (Session Revocation)
Cookie phiên sử dụng chữ ký HMAC có định dạng:
```
${userId}:${username}:${role}:${expiresAt}:${tokenVersion}
```
Bất cứ khi nào người dùng đổi mật khẩu, bật/tắt 2FA, hoặc tài khoản bị quản trị viên khóa, trường `token_version` trong bảng `users` sẽ tăng thêm 1. Tất cả các cookie mang `tokenVersion` cũ đều bị từ chối ngay lập tức với mã lỗi `401 Unauthorized`.

### 7.2 VDB-SEC-02: Chống Tấn Công Phát Lại TOTP 2FA (RFC 6238)
Để chống lại việc kẻ xấu chặn bắt và gửi lại mã OTP 6 số trong khoảng thời gian trôi 90 giây, hệ thống lưu `last_totp_step = Math.floor(Date.now() / 30000)` vào bảng `users`. Mọi mã OTP có bước thời gian $t \le T$ đã sử dụng đều bị từ chối ngay lập tức với lỗi `400 TOTP_CODE_REPLAYED`.

### 7.3 VDB-SEC-03: Cấm Query Token (RFC 6750) & Kiến Trúc Vé Dùng Một Lần (Ticket)
Theo chuẩn bảo mật RFC 6750 Mục 2.3, token truyền qua query string sẽ bị lộ trong lịch sử duyệt web và log của proxy:
1. **Cấm hoàn toàn:** Không cho phép truyền `?token=...` trên bất kỳ endpoint nào, trả về lỗi `401 QUERY_TOKEN_NOT_PERMITTED`.
2. **Cơ chế vé dùng một lần (Ticket):** Đối với các ngữ cảnh trình duyệt không gắn được header tùy biến (thẻ `<video>`, `<img>`, `EventSource` SSE):
   - Client gọi `POST /v1/databases/:databaseId/tickets` kèm Bearer Token trong header.
   - Gateway cấp một vé dùng một lần: `vdb_ticket_<random>`.
   - Vé có hạn 60 giây, bị giới hạn phạm vi chặt chẽ theo database và bị xóa khỏi RAM ngay sau lần sử dụng đầu tiên.

### 7.4 Phòng Chống Tấn Công SSRF Trên Webhook
Trước khi phát HTTP POST sự kiện webhook, hệ thống phân giải địa chỉ IP của URL đích và từ chối nếu trỏ vào:
- Địa chỉ Loopback (`127.0.0.0/8`, `::1`).
- Dải mạng nội bộ RFC 1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
- Địa chỉ Link-local và metadata của máy chủ đám mây AWS/GCP (`169.254.169.254`).

### 7.5 Cô Lập Nội Dung Động & Tệp Đa Phương Tiện
Các tệp SVG (`image/svg+xml`) và HTML (`text/html`) khi xem trực tiếp được đính kèm các header cô lập:
```http
Content-Disposition: attachment; filename="..."
Content-Security-Policy: default-src 'none'; sandbox
X-Content-Type-Options: nosniff
```
Header này ngăn chặn hoàn toàn nguy cơ Stored XSS trên domain chính của hệ thống.

### 7.6 Đường Ống Xử Lý Ảnh Đại Diện Nhị Phân Nội Bộ
- Ảnh avatar được tải lên qua multipart, kiểm tra magic bytes đầu tệp (PNG, JPEG, WebP) với giới hạn 10MB và lưu tại `data/storage/avatars/:userId.<ext>`.
- Trả về với header `nosniff`, `sandbox` và `cross-origin`. Tách biệt hoàn toàn khỏi hạn mức đĩa của CSDL.

---

## 8. Tự Động Hóa Nhiệm Vụ & Đường Ống Lịch Trình (Schedules Pipeline)

### 8.1 Bộ Phân Tích Cú Pháp Cron 5 Thành Phần & Chế Độ Khoảng Thời Gian Đơn Giản
Hỗ trợ cú pháp cron tiêu chuẩn:
`[Phút] [Giờ] [Ngày trong tháng] [Tháng] [Ngày trong tuần]`
Hỗ trợ ký tự đại diện (`*`), bước nhảy (`*/15`), dải (`1-5`), danh sách (`0,30`). Ngoài ra còn có giao diện trực quan hỗ trợ chọn khoảng thời gian Ngày, Giờ, Phút đơn giản.

### 8.2 Động Cơ Thực Thi Chuỗi Đa Nhiệm Vụ (Multi-Task Chaining)
Một lịch trình có thể chứa danh sách nhiều nhiệm vụ (`ScheduleTaskRecord`) thực thi tuần tự theo chuỗi:
1. `send_command`: Chạy câu lệnh SQL (DML/DDL).
2. `run_maintenance`: Chạy bảo trì tối ưu (`wal_checkpoint`, `vacuum`, `optimize`, `reindex`).
3. `create_backup`: Tạo bản sao lưu snapshot mã hóa vào mục Backups.
4. `trigger_webhook`: Phát thông báo webhook ra bên ngoài.
5. `export_data`: Xuất toàn bộ dữ liệu ra tệp dump.

Hỗ trợ thiết lập độ trễ (`time_offset`), bỏ qua khi lỗi (`continue_on_failure`) và chỉ chạy khi máy chủ hoạt động (`only_when_online`).

---

## 9. Truyền Sự Kiện Thời Gian Thực (SSE) & Bộ Phát Webhook

- **SSE Stream (`/v1/databases/:id/realtime`):** Sử dụng hook cập nhật của SQLite để đẩy trực tiếp các sự kiện `insert`, `update`, `delete`, `schema` tới trình duyệt theo thời gian thực, có ping giữ kết nối mỗi 15 giây.
- **Webhook Dispatcher:** Phát HTTP POST chứa dữ liệu thay đổi kèm chữ ký bảo mật HMAC-SHA256 trong header `X-VanillaDB-Signature` để bên nhận xác minh tính xác thực, có cơ chế tự động thử lại theo cấp số nhân khi gặp lỗi mạng.

---

## 10. Kiến Trúc Giao Diện Người Dùng & Hệ Thống Thiết Kế UX

Giao diện được xây dựng bằng React 19, Vite, Tailwind CSS v4, Lucide icons và React Query.

### 10.1 Điều Hướng Phân Nhóm Chuẩn Pterodactyl
Điều hướng quản lý database được chia thành 3 phân nhóm rõ ràng:
- **TỔNG QUAN / OVERVIEW:** Dashboard (`overview`), Truy vấn SQL / SQL Editor (`editor`), Hoạt động / Activity (`activity`), Cài đặt / Settings (`settings`), Hỗ trợ & API (`api`).
- **QUẢN LÝ / MANAGEMENT:** Bảng dữ liệu / Tables (`tables`), Lưu trữ tệp / File Storage (`storage`), Lịch trình / Schedules (`jobs`), Webhooks (`webhooks`), Sao lưu / Backups (`backups`), Thành viên / Members (`members`).
- **CÔNG CỤ / TOOLS:** Cấu trúc & ERD / Schema & ERD (`schema`), Nhập & Xuất / Import & Export (`import-export`), Khóa API / API Tokens (`tokens`).

### 10.2 Dòng Thời Gian Nhật Ký Hoạt Động (Activity Timeline)
Trình diễn toàn bộ lịch sử thao tác theo dạng dòng thời gian trực quan:
- Lọc nhanh theo tên người dùng hoặc loại hành động.
- Đường kẻ dọc liên tục với các điểm node tròn màu xanh, phân nhóm theo ngày ("Hôm nay", "Hôm qua", hoặc ngày cụ thể).
- Thẻ sự kiện hiển thị người thực hiện, nhãn hành động nổi bật (`schedule delete`, `backup create`, `console query`), thời gian chính xác, IP client, nút sao chép nhanh.
- Thanh điều khiển nổi ở cạnh dưới cho phép tạm dừng/tiếp tục luồng cập nhật trực tiếp, nút làm mới thủ công có hiệu ứng xoay và đếm số lượng sự kiện.

### 10.3 Bảng Điều Khiển Thống Kê Tổng Hợp (Unified Dashboard)
Tập hợp toàn bộ thông tin vận hành vào một tab Dashboard duy nhất:
- **Biểu đồ luồng hoạt động 24h:** Biểu đồ diện tích SVG tương tác thể hiện tỷ lệ các lệnh SELECT, INSERT, UPDATE, DELETE và DDL.
- **Thanh phân bổ ổ đĩa vật lý:** So sánh trực quan dung lượng giữa tệp CSDL chính và tệp nhật ký WAL.
- **Lưới ma trận phân bổ trang B-Tree:** Thể hiện trực quan các trang đang hoạt động (Active) và các trang trống (Freelist).
- **Chẩn đoán thông số PRAGMA & Công cụ bảo trì 1-click:** Kiểm tra tính toàn vẹn và tối ưu CSDL tức thì.

### 10.4 Hệ Thống Phím Tắt Toàn Diện & Chế Độ Tập Trung (Zen Mode)
- **F11 / Esc:** Bật/tắt chế độ toàn màn hình Zen Mode trong trình soạn thảo SQL.
- **Phím số 1..9:** Chuyển đổi nhanh giữa các tab chức năng cốt lõi.
- **Ctrl + Shift + B:** Tạo bản sao lưu snapshot tức thì.
- **Ctrl + Shift + D:** Mở nhanh cửa sổ nhân bản / rẽ nhánh CSDL (Dev Branch).
- **Alt + M:** Chạy kiểm tra toàn vẹn PRAGMA integrity_check.
- **Phím gạch chéo (`/`):** Đặt con trỏ vào ô tìm kiếm bảng dữ liệu.

---

## 11. Sơ Đồ Tuần Tự Vòng Đời Yêu Cầu & Luồng Dữ Liệu

### Sơ Đồ 1: Luồng Thực Thi Truy Vấn SQL Tham Số Hóa (Data Plane)

```
Client                  Fastify Gateway          Auth Guard         Database Manager       SQLite Handle
  |                            |                     |                     |                     |
  |--- POST /v1/db/query ----->|                     |                     |                     |
  |    (Bearer Token)          |--- verifyToken() -->|                     |                     |
  |                            |<- token hợp lệ -----|                     |                     |
  |                            |                                           |                     |
  |                            |--- getDatabaseHandle(databaseId) -------->|                     |
  |                            |                                           |--- mở CSDL WAL ---->|
  |                            |<- trả về handle --------------------------|                     |
  |                            |                                                                 |
  |                            |--- validateSqlSafety(sql) ------------------------------------->|
  |                            |--- prepare(sql).all(params) ----------------------------------->|
  |                            |<-- { rows, durationMs } ----------------------------------------|
  |<-- 200 OK (Dữ liệu JSON) --|
```

### Sơ Đồ 2: Cấp Vé Dùng Một Lần & Xem Tệp Phương Tiện (HTTP 206)

```
Client                  Fastify Gateway          Ticket Service       Storage Service      Filesystem
  |                            |                       |                     |                  |
  |--- POST /v1/db/tickets --->|                       |                     |                  |
  |    (Bearer Auth)           |--- issueTicket() ---->|                     |                  |
  |                            |    (Hạn 60s, 1 lần)   |                     |                  |
  |<-- { ticket: "vdb_xyz" } --|                       |                     |                  |
  |                            |                       |                     |                  |
  |--- GET /v1/files/:id/view -|                       |                     |                  |
  |    ?ticket=vdb_xyz         |--- consumeTicket() -->|                     |                  |
  |                            |<-- vé hợp lệ (xóa vé)-|                     |                  |
  |                            |                                             |                  |
  |                            |--- getStoragePath(dbId, filename) --------->|                  |
  |                            |                                             |--- fs.statSync ->|
  |                            |<-- trả về filePath -------------------------|                  |
  |<-- 206 Partial Content ----| (Truyền dòng dữ liệu kèm hỗ trợ dải Range) -------------------->|
```

---

*Tài liệu Đặc tả Kỹ thuật Kiến trúc VanillaDatabase &bull; Bản quyền theo Giấy phép MIT &bull; 2026*
