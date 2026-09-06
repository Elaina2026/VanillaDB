# Sao lưu, Phục hồi & Tác vụ Lập lịch Tự động

VanillaDatabase cung cấp cơ chế sao lưu ảnh chụp (snapshot) thời điểm có mã hóa an toàn, kiểm tra tính toàn vẹn bằng checksum và dịch vụ chạy nền định kỳ tự động.

---

## 1. Quy trình Sao lưu & Cơ chế Mã hóa

### Khởi tạo Snapshot
Khi tác vụ sao lưu được kích hoạt (thủ công hoặc qua bộ lập lịch tự động):
1. **Đồng bộ Nhật ký WAL**: Thực thi `PRAGMA wal_checkpoint(FULL)` trên database chỉ định để đảm bảo toàn bộ trang dữ liệu chưa commit hoặc nằm trong file nhật ký đều được ghi hoàn tất vào tệp database chính.
2. **Mã hóa AES-256-GCM**: Toàn bộ tệp database được đọc và mã hóa thành một tệp snapshot an toàn lưu tại `data/backups/:databaseId/backup_<timestamp>_<nanoid>.sqlite`.
3. **Mã kiểm tra Toàn vẹn Checksum**: Tính toán mã băm SHA-256 bất biến của tệp snapshot và lưu trữ vào bảng `database_backups`.

---

## 2. Quy trình Phục hồi Dữ liệu (Restore)

Khi phục hồi một bản sao lưu (`POST /api/admin/databases/:id/backups/:backupId/restore`):
1. **Kiểm tra Checksum**: Xác minh tệp snapshot trên ổ đĩa khớp hoàn toàn với mã SHA-256 đã lưu. Nếu có dấu hiệu bị can thiệp trái phép, tiến trình phục hồi lập tức bị hủy bỏ.
2. **Tạo Bản sao An toàn (Safety Snapshot)**: Tự động tạo một bản sao lưu dự phòng hệ thống (`system`) của trạng thái hiện tại trước khi ghi đè dữ liệu.
3. **Giải phóng Kết nối**: Đóng và giải phóng toàn bộ handle kết nối SQLite đang hoạt động (`.sqlite`, `-wal`, `-shm`).
4. **Giải mã & Thay thế Nguyên tử**: Giải mã tệp sao lưu và ghi đè vào đường dẫn database chính.
5. **Kiểm tra Tình trạng Sau Phục hồi**: Mở lại kết nối database và chạy lệnh `PRAGMA quick_check;`. Nếu phát hiện bất kỳ lỗi hỏng cấu trúc nào, hệ thống sẽ cảnh báo lỗi ngay lập tức.

---

## 3. Bộ Lập lịch Sao lưu Tự động (Backup Scheduler)

VanillaDatabase tích hợp sẵn một tiến trình chạy ngầm theo chu kỳ cron (`src/server/services/backupScheduler.ts`):

### Các Chu kỳ Cấu hình Linh hoạt
- `disabled`: Tắt tính năng sao lưu tự động.
- `hourly`: Chạy sao lưu mỗi giờ một lần.
- `6hours`: Chạy định kỳ mỗi 6 giờ.
- `12hours`: Chạy định kỳ mỗi 12 giờ.
- `daily`: Chạy mỗi ngày một lần (mỗi 24 giờ).
- `weekly`: Chạy mỗi tuần một lần (mỗi 7 ngày).

### Chính sách Tự động Thu dọn Bản sao Cũ (Retention Policy)
- Có thể thiết lập giới hạn lưu giữ (`backup_retention` trong mục Cài đặt, ví dụ: giữ lại 7 bản sao lưu gần nhất).
- Tự động xóa các tệp sao lưu cũ khỏi ổ đĩa và cơ sở dữ liệu metadata để tiết kiệm dung lượng lưu trữ.
