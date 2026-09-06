# Khắc phục Sự cố & Câu hỏi Thường gặp (FAQ)

Tổng hợp các mã lỗi phổ biến, chẩn đoán hệ thống và giải đáp vận hành cho **VanillaDatabase**.

---

## 1. Các Lỗi Phổ biến & Biện pháp Xử lý

### 1. `SQLITE_BUSY: database is locked` (HTTP 503)
- **Nguyên nhân**: Một giao dịch ghi khác đang giữ khóa độc quyền hoặc đang trong quá trình ghi dữ liệu.
- **Giải pháp**: VanillaDatabase mặc định cấu hình thời gian chờ bận `5000ms` (`VDB_SQL_BUSY_TIMEOUT_MS`). Hãy đảm bảo các giao dịch ghi diễn ra nhanh chóng và không chứa các lệnh gọi mạng chặn luồng bên trong khối batch nguyên tử.

### 2. `ATTACH DATABASE is forbidden for security reasons` (HTTP 400)
- **Nguyên nhân**: Câu lệnh SQL cố gắng thực thi lệnh `ATTACH DATABASE`.
- **Giải pháp**: Nhằm đảm bảo an toàn cho kiến trúc đa khách thuê, các database không được phép truy cập chéo vào các tệp database lân cận.

### 3. `Requested range not satisfiable` (HTTP 416)
- **Nguyên nhân**: Trình duyệt yêu cầu một dải byte vượt quá tổng dung lượng của tệp tin.
- **Giải pháp**: Kiểm tra lại kích thước thực tế của tệp tin trên trang quản lý lưu trữ storage.

### 4. `RATE_LIMIT_EXCEEDED` (HTTP 429)
- **Nguyên nhân**: Mã API Token hoặc người dùng đã gửi số lượng yêu cầu vượt quá hạn mức cấu hình trên mỗi phút.
- **Giải pháp**: Tăng giới hạn tần suất của token trong trang quản lý mã khóa hoặc điều tiết tần suất gửi request từ phía ứng dụng khách.

---

## 2. Câu hỏi Thường gặp (FAQ)

#### Q: VanillaDatabase có chạy được trên máy chủ VPS giá rẻ 512MB RAM không?
**A**: Có. VanillaDatabase chạy trực tiếp trên Node.js 22 nguyên bản với mức tiêu thụ tài nguyên tối thiểu (~35MB–50MB RAM).

#### Q: VanillaDatabase xử lý sao lưu như thế nào khi đang có thao tác ghi dữ liệu?
**A**: Dịch vụ sao lưu tự động kích hoạt `PRAGMA wal_checkpoint(FULL)` trước khi chụp snapshot, đảm bảo tính nhất quán dữ liệu tuyệt đối mà không cần dừng máy chủ.

#### Q: Các tệp tin và database được lưu trữ ở đâu trên đĩa?
**A**: Toàn bộ database khách thuê nằm tại `data/databases/`, tệp media tại `data/storage/`, các bản sao lưu tại `data/backups/`, và metadata hệ thống tại `data/system/vanilladb.sqlite`.
