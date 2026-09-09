# Sao lưu, Phục hồi & Hẹn giờ Tự động

Cẩm nang kỹ thuật về tạo bản sao lưu ảnh chụp mã hóa theo thời điểm, xác thực mã băm kiểm tra, quy trình khôi phục an toàn và worker bảo trì định kỳ trong **VanillaDatabase**.

---

## 1. Quy trình Tạo Bản Sao lưu Mã hóa

### Các bước Tạo Snapshot
Khi kích hoạt sao lưu (thủ công qua Dashboard, Control Plane API hoặc lịch trình tự động):
1. **Đồng bộ nhật ký WAL**: Chạy lệnh `PRAGMA wal_checkpoint(FULL)` trên database chỉ định, đảm bảo toàn bộ giao dịch và trang bộ nhớ được ghi sạch vào tệp chính.
2. **Mã hóa AES-256-GCM**: Dữ liệu database được nạp và ghi ra tệp snapshot mã hóa tại `data/backups/:databaseId/backup_<timestamp>_<nanoid>.sqlite`.
3. **Mã băm Toàn vẹn SHA-256**: Hệ thống tính toán mã băm SHA-256 bất biến của tệp sao lưu và lưu vào bảng siêu dữ liệu `database_backups`.

---

## 2. Quy trình Khôi phục Cơ sở Dữ liệu

Khi thực hiện lệnh khôi phục qua `POST /api/admin/databases/:id/backups/:backupId/restore`:
1. **Xác minh Tính toàn vẹn**: So sánh tệp trên đĩa với mã băm SHA-256 đã lưu. Nếu phát hiện tệp bị can thiệp trái phép, quy trình hủy ngay lập tức.
2. **Tạo Bản sao lưu An toàn (Pre-restore Snapshot)**: Tự động chụp lại trạng thái hiện tại trước khi ghi đè để có thể quay lui nếu cần.
3. **Đóng Kết nối Cũ**: Ngắt toàn bộ handle kết nối SQLite (`.sqlite`, `-wal`, `-shm`) khỏi bộ nhớ đệm connection pool.
4. **Giải mã & Ghi đè Nguyên tử**: Giải mã bản sao lưu trực tiếp vào đường dẫn database chính của tenant.
5. **Kiểm tra Toàn vẹn Hậu khôi phục**: Mở lại kết nối và thực thi `PRAGMA quick_check;` để khẳng định database hoạt động trơn tru.

---

## 3. Worker Chạy ngầm Tự động hóa

### 3.1. Trình Lập lịch Sao lưu (`backupScheduler.ts`)
Hỗ trợ cấu hình chu kỳ sao lưu linh hoạt theo từng database hoặc toàn hệ thống:
- `disabled`: Tắt sao lưu tự động.
- `hourly`: Chạy mỗi giờ một lần.
- `6hours`: Chạy mỗi 6 giờ.
- `12hours`: Chạy mỗi 12 giờ.
- `daily`: Chạy mỗi ngày một lần (24 giờ).
- `weekly`: Chạy mỗi tuần một lần (7 ngày).

### Chính sách Dọn dẹp Hạn mức Lưu trữ
- Tự động xóa các bản sao lưu cũ vượt quá số lượng lưu trữ cho phép (ví dụ: giữ lại 7 bản sao lưu gần nhất) để bảo vệ dung lượng ổ đĩa.

### 3.2. Worker Tự động Bảo trì Định kỳ (`maintenanceWorker.ts`)
- Định kỳ chạy `PRAGMA optimize` trên các database đang hoạt động để cập nhật số liệu lập kế hoạch truy vấn SQLite.
- Tự động dọn dẹp các bản ghi nhật ký hoạt động và kiểm toán hết hạn.
