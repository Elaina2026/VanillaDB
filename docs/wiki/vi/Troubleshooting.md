# Khắc phục Sự cố & Câu hỏi Thường gặp (Troubleshooting)

Tổng hợp các mã lỗi phổ biến, chẩn đoán và câu hỏi kỹ thuật thường gặp khi vận hành **VanillaDatabase**.

---

## 1. Các lỗi phổ biến

### 1. `SQLITE_BUSY: database is locked` (HTTP 503)
- **Nguyên nhân**: Một tác vụ ghi khác đang giữ khóa độc quyền (exclusive lock).
- **Cách xử lý**: VanillaDatabase đặt mặc định thời gian chờ là `5000ms` (`VDB_SQL_BUSY_TIMEOUT_MS`). Hãy đảm bảo các giao dịch ghi diễn ra nhanh chóng, tránh gọi API ngoài làm nghẽn giao dịch batch.

### 2. `ATTACH DATABASE is forbidden for security reasons` (HTTP 400)
- **Nguyên nhân**: Câu lệnh SQL cố tình sử dụng lệnh `ATTACH DATABASE`.
- **Cách xử lý**: Vì lý do an toàn cho mô hình đa khách thuê (Multi-tenancy), hệ thống nghiêm cấm kết nối chéo giữa các tệp database khác nhau.

### 3. `Requested range not satisfiable` (HTTP 416)
- **Nguyên nhân**: Trình duyệt yêu cầu dải byte vượt quá tổng dung lượng của tệp tin.
- **Cách xử lý**: Kiểm tra lại kích thước thực tế của tệp trong giao diện Quản lý Kho Lưu Trữ.

### 4. `RATE_LIMIT_EXCEEDED` (HTTP 429)
- **Nguyên nhân**: Mã API Token hoặc người dùng đã gọi vượt quá số lượng yêu cầu mỗi phút cho phép.
- **Cách xử lý**: Nâng giới hạn `rate_limit` trong mục quản lý API Token hoặc giảm tần suất gửi request từ client.

---

## 2. Câu hỏi thường gặp (FAQ)

#### Q: Tôi có thể chạy VanillaDatabase trên máy chủ VPS 512MB RAM giá rẻ không?
**A**: Hoàn toàn được. VanillaDatabase được xây dựng trực tiếp trên Node.js 22 chuẩn với mức chiếm dụng RAM cực kỳ tối ưu (~35MB–50MB RAM khi chạy).

#### Q: Hệ thống xử lý việc sao lưu khi đang có thao tác ghi dữ liệu như thế nào?
**A**: Tiến trình sao lưu sẽ tự động gọi `PRAGMA wal_checkpoint(FULL)` trước khi chụp ảnh snapshot, đảm bảo dữ liệu ghi trong WAL được đồng bộ an toàn 100%.

#### Q: Tệp tin và cơ sở dữ liệu được lưu tại đâu trên đĩa?
**A**: Cơ sở dữ liệu tenant nằm tại `data/databases/`, tệp media tại `data/storage/`, bản sao lưu tại `data/backups/`, và siêu dữ liệu hệ thống tại `data/system/vanilladb.sqlite`.
