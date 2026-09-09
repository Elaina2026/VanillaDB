# <img src="https://api.iconify.design/lucide:shield-check.svg?color=%2310b981" width="28" height="28" /> Chính sách Bảo mật VanillaDatabase

<p align="center">
  <strong>[ <a href="SECURITY.md">English Version</a> ]</strong> &bull;
  <strong>[ Tiếng Việt (Hiện tại) ]</strong> &bull;
  <strong>[ <a href="README.vi.md">README Tiếng Việt</a> ]</strong> &bull;
  <strong>[ <a href="docs/README.md">Trung tâm Tài liệu</a> ]</strong>
</p>

---

## 1. Tổng quan & Triết lý Bảo mật

VanillaDatabase được thiết kế như một nền tảng cơ sở dữ liệu SQLite đám mây đa người dùng (Multi-tenant) đạt tiêu chuẩn doanh nghiệp. Vì mỗi tenant sở hữu cơ sở dữ liệu SQLite độc lập trên ổ đĩa, việc duy trì cách ly nghiêm ngặt, tính toàn vẹn mật mã và bảo vệ hộp cát (sandbox) là ưu tiên hàng đầu.

Đội ngũ phát triển tuân thủ nguyên tắc **Phòng thủ Chiều sâu (Defense-in-Depth)** và mô hình Zero-Trust trên mọi tầng kiến trúc: chu vi mạng, quản lý phiên làm việc, cô lập động cơ SQLite và mã hóa dữ liệu tĩnh.

---

## 2. Phiên bản được Hỗ trợ

Các bản vá bảo mật và cập nhật an toàn được cung cấp cho các phiên bản đang hoạt động:

| Phiên bản | <img src="https://api.iconify.design/lucide:layers.svg?color=%230969da" width="16" height="16" /> Nhánh phát hành | <img src="https://api.iconify.design/lucide:check-circle.svg?color=%2310b981" width="16" height="16" /> Trạng thái hỗ trợ |
| :--- | :--- | :--- |
| `1.3.x` | `main` | **Hỗ trợ Tích cực (Bản vá đầy đủ & Cập nhật mới nhất)** |
| `1.x` | `release/1.x` | **Duy trì Bản vá Bảo mật Quan trọng** |
| `< 1.0.0` | Không có | **Hết vòng đời hỗ trợ (End of Life)** |

---

## 3. Báo cáo Lỗ hổng Bảo mật

Nếu bạn phát hiện lỗ hổng bảo mật (chẳng hạn như vượt quyền xác thực, thoát khỏi hộp cát SQL, IDOR giữa các tenant, tấn công duyệt thư mục Path Traversal hoặc thực thi mã từ xa RCE):

> **LƯU Ý QUAN TRỌNG:** Vui lòng KHÔNG mở GitHub Issue công khai hoặc gửi Pull Request công khai khi lỗ hổng chưa được phát hành bản vá.

### Kênh Báo cáo An toàn

1. **GitHub Private Security Advisory (Khuyến nghị):**  
   Mở báo cáo bảo mật riêng tư tại [tab GitHub Security](https://github.com/Elaina2026/VanillaDB/security/advisories/new).
2. **Kênh Liên hệ Trực tiếp:**  
   Gửi email chi tiết hoặc mã hóa đến hòm thư `ariaasamane@gmail.com` với tiêu đề:  
   `[SECURITY] VanillaDatabase Vulnerability Disclosure - <Tên thành phần>`

### Thông tin Cần cung cấp trong Báo cáo

Để giúp đội ngũ kỹ thuật phân loại và xử lý nhanh chóng, vui lòng gửi kèm:
- **Phân loại lỗ hổng:** Tên hoặc mã phân loại (ví dụ: Bỏ qua SSRF, Xâm nhập động cơ SQLite, Rò rỉ mã phiên).
- **Thành phần bị ảnh hưởng:** Đường dẫn tệp tin hoặc điểm cuối API (ví dụ: `src/server/db/manager.ts`, `POST /v1/databases/:id/query`).
- **Bằng chứng Khái niệm (PoC):** Các bước tái hiện chi tiết, câu lệnh cURL hoặc kịch bản kiểm thử.
- **Đánh giá Mức độ Ảnh hưởng:** Nguy cơ leo thang đặc quyền, rò rỉ dữ liệu hoặc xâm nhập hệ thống.
- **Đề xuất Bản vá:** Gợi ý cách khắc phục hoặc mã nguồn sửa lỗi nếu có.

### Cam kết Thời gian Phản hồi (SLA)

| Cột mốc | Mục tiêu SLA | Mô tả chi tiết |
| :--- | :--- | :--- |
| **Xác nhận Tiếp nhận** | `< 24 giờ` | Kỹ sư bảo mật phản hồi và xác nhận đã nhận báo cáo. |
| **Phân loại & Tái hiện** | `< 48 giờ` | Tái hiện thành công lỗi và đánh giá mức độ nghiêm trọng. |
| **Phát triển Bản vá** | `< 72 giờ` | Viết mã khắc phục trên nhánh riêng, kiểm thử unit test và pentest. |
| **Phát hành Công khai & Advisory** | `7 đến 14 ngày` | Phát hành phiên bản vá lỗi chính thức và công bố CVE / Advisory. |

---

## 4. Kiến trúc Phòng thủ Chiều sâu Tích hợp sẵn

```
                                 [ Lưu lượng Truy cập Mạng ]
                                              |
                +-----------------------------v-----------------------------+
                |     Lá chắn Chu vi: Helmet CSP, CORS, Giới hạn Tốc độ    |
                +-----------------------------+-----------------------------+
                                              |
                +-----------------------------v-----------------------------+
                |     Xác thực Danh tính: Argon2id, Cookie HMAC, RFC 6238  |
                +-----------------------------+-----------------------------+
                                              |
                +-----------------------------v-----------------------------+
                |     Kiểm tra Phạm vi Token & Phân quyền Truy cập (RBAC)  |
                +-----------------------------+-----------------------------+
                                              |
         +------------------------------------+------------------------------------+
         |                                    |                                    |
         v                                    v                                    v
+-----------------+                  +-----------------+                  +-----------------+
| Hộp cát SQLite  |                  | Tường lửa SSRF  |                  | Động cơ Lưu trữ |
| - Chặn ATTACH   |                  | - Chặn RFC1918  |                  | - AES-256-GCM   |
| - Chặn Module   |                  | - Chặn Loopback |                  | - Muối PBKDF2   |
| - Prepared Stmt |                  | - Chặn Cloud IP |                  | - HTTP 206 Byte |
+-----------------+                  +-----------------+                  +-----------------+
```

### <img src="https://api.iconify.design/lucide:key.svg?color=%230969da" width="20" height="20" align="absmiddle" /> 1. Bảo mật Danh tính & Phiên làm việc

- **Băm mật khẩu Argon2id:** Mật khẩu người dùng được mã hóa với chi phí bộ nhớ và vòng lặp tính toán cao, vô hiệu hóa nguy cơ tấn công vét cạn (brute-force) ngoại tuyến.
- **Thu hồi Phiên làm việc Tức thì (VDB-SEC-01):**
  - Chữ ký HMAC của session cookie ràng buộc chặt chẽ với `token_version` của người dùng:  
    `${userId}:${username}:${role}:${expiresAt}:${tokenVersion}` được ký với HMAC-SHA256.
  - Khi người dùng đổi mật khẩu hoặc bị vô hiệu hóa tài khoản, `token_version` trong cơ sở dữ liệu tự động tăng thêm 1, lập tức hủy hiệu lực của mọi phiên đăng nhập cũ trên toàn bộ thiết bị.
- **Chống Phát lại Mã TOTP 2FA (VDB-SEC-02 - RFC 6238):**
  - Hệ thống lưu vết bước thời gian đã sử dụng gần nhất trong `last_totp_step`.
  - Một mã xác thực 6 chữ số không thể bị gửi lại hoặc tái sử dụng lần thứ hai trong cùng cửa sổ trôi dạt 90 giây.
- **Lưu trữ Khóa API:** Các token (`vdb_live_*`, `vdb_test_*`) được băm bằng SHA-256 trước khi lưu vào siêu dữ liệu hệ thống. Token thô không bao giờ tồn tại trong cơ sở dữ liệu.

### <img src="https://api.iconify.design/lucide:database.svg?color=%23003b57" width="20" height="20" align="absmiddle" /> 2. Cách ly Hộp cát Động cơ SQLite

- **Phân vùng Tệp tin Cực kỳ Nghiêm ngặt:** Mỗi tenant database vận hành dưới dạng một tệp SQLite độc lập tại `data/databases/:id.sqlite`. Siêu dữ liệu hệ thống được đặt riêng biệt tại `data/system/vanilladb.sqlite`.
- **Bắt buộc Dùng Prepared Statements:** Mọi truy vấn đều sử dụng tham số hóa (`?`), triệt tiêu hoàn toàn nguy cơ SQL Injection.
- **Vô hiệu hóa Tính năng Nguy hiểm:**
  - Lệnh `ATTACH DATABASE` và `DETACH DATABASE` bị chặn hoàn toàn ở tầng phân tích cú pháp, ngăn chặn truy cập chéo giữa các cơ sở dữ liệu.
  - Tính năng nạp tiện ích mở rộng nhị phân (`sqlite3_load_extension`) bị khóa vĩnh viễn ở tầng biên dịch native C++.
  - Các lệnh PRAGMA quản trị có khả năng can thiệp hệ thống tệp bị loại bỏ.

### <img src="https://api.iconify.design/lucide:server.svg?color=%236366f1" width="20" height="20" align="absmiddle" /> 3. Phòng thủ Mạng & Tường lửa Chu vi

- **Tường lửa Chặn SSRF (Server-Side Request Forgery):** Webhook kiểm tra địa chỉ IP đích trước khi thực hiện kết nối HTTP:
  - Chặn toàn bộ dải mạng riêng tư (RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
  - Chặn địa chỉ loopback nội bộ (`127.0.0.0/8`, `::1`).
  - Chặn link-local và siêu dữ liệu đám mây (`169.254.169.254`).
- **Lá chắn Helmet & CSP Nghiêm ngặt:** Các tiêu đề HTTP bảo mật (`Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` và `Content-Security-Policy` khắt khe) ngăn ngừa triệt để XSS và Clickjacking.
- **Giới hạn Tốc độ (Rate Limiting):** Kiểm soát lưu lượng theo IP và người dùng, bảo vệ hệ thống trước tấn công từ chối dịch vụ (DoS) và vét cạn thông tin đăng nhập.

### <img src="https://api.iconify.design/lucide:lock.svg?color=%238b5cf6" width="20" height="20" align="absmiddle" /> 4. Mã hóa Dữ liệu Tĩnh & Lưu trữ Media

- **Mã hóa Phong bì AES-256-GCM:** Các bản sao lưu và tệp tin đa phương tiện được mã hóa an toàn bằng khóa dẫn xuất PBKDF2 và thuật toán AES-256-GCM xác thực.
- **Tiêu đề Xác thực Toàn vẹn:** Mỗi khối dữ liệu mã hóa bao gồm chữ ký `VENC`, muối 16-byte ngẫu nhiên, vector khởi tạo IV 12-byte và thẻ xác thực (Auth Tag) 128-bit.
- **Phát luồng HTTP 206 Partial Content:** Tệp đa phương tiện được truyền tải theo từng dải byte mà không cần giải mã ra thư mục công khai, ngăn chặn nguy cơ rò rỉ duyệt thư mục.

### <img src="https://api.iconify.design/lucide:terminal.svg?color=%23ea580c" width="20" height="20" align="absmiddle" /> 5. Phân quyền Truy cập (RBAC) & Phạm vi Token

- **Vai trò Hệ thống:** `super_admin` (cấu hình hệ thống), `admin` (quản trị người dùng & DB), `user` (người dùng thông thường).
- **Vai trò trong Database:** `owner` (chủ sở hữu), `admin` (quản trị DB), `editor` (đọc ghi dữ liệu), `viewer` (chỉ đọc).
- **Phạm vi Quyền hạn Khóa Token:**
  - `database:read`: Thực thi SELECT, xuất dữ liệu
  - `database:write`: Thực thi INSERT, UPDATE, DELETE
  - `database:ddl`: Tạo bảng, sửa bảng, tạo chỉ mục (Index)
  - `database:admin`: Sao lưu, dọn dẹp (Vacuum), bảo trì
- **Kiểm soát Truy cập Bảng (ACL):** Cho phép đặt danh sách bảng trắng (allowlist) hoặc bảng đen (denylist) cho từng token.

---

## 5. Vinh danh Đóng góp Bảo mật (Hall of Fame)

Chúng tôi trân trọng và biết ơn sâu sắc các chuyên gia bảo mật tuân thủ nguyên tắc công bố có trách nhiệm (Responsible Disclosure). Tên và đóng góp của bạn sẽ được ghi nhận trang trọng trong phần phát hành phiên bản và Bảng vinh danh Bảo mật của VanillaDatabase (trừ khi có yêu cầu ẩn danh).
