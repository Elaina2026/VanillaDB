# Sao lưu, Phục hồi & Tác vụ định kỳ (Backup & Restore)

VanillaDatabase cung cấp cơ chế sao lưu ảnh chụp (snapshot) mã hóa theo thời điểm, xác thực toàn vẹn bằng checksum SHA-256 và tiến trình lập lịch chạy ngầm tự động.

---

## 1. Quy trình sao lưu & Mã hóa

### Tạo bản chụp (Snapshot Creation)
Khi bắt đầu sao lưu (thủ công hoặc theo lịch):
1. **Xả nhật ký WAL**: Gọi `PRAGMA wal_checkpoint(FULL)` lên database mục tiêu để đảm bảo toàn bộ dữ liệu từ tệp WAL đã được nạp hoàn chỉnh vào tệp SQLite chính.
2. **Mã hóa AES-256-GCM**: Đọc nội dung tệp database và mã hóa thành tệp bản chụp lưu tại `data/backups/:databaseId/backup_<timestamp>_<nanoid>.sqlite`.
3. **Mã băm toàn vẹn**: Tính toán mã băm SHA-256 của tệp sao lưu và ghi nhận vào bảng `database_backups`.

---

## 2. Quy trình phục hồi dữ liệu (Restore)

Khi phục hồi một bản sao lưu (`POST /api/admin/databases/:id/backups/:backupId/restore`):
1. **Kiểm tra Checksum**: Xác minh tệp sao lưu trên đĩa khớp hoàn toàn với mã SHA-256 ban đầu. Nếu tệp bị hỏng hoặc bị sửa đổi, quá trình lập tức dừng lại.
2. **Ảnh chụp an toàn**: Tự động tạo một bản sao lưu trạng thái hiện tại trước khi ghi đè dữ liệu cũ.
3. **Giải phóng kết nối**: Đóng và ngắt các con trỏ kết nối SQLite đang mở.
4. **Giải mã & Thay thế nguyên tử**: Giải mã tệp sao lưu và ghi đè vào đường dẫn database chính.
5. **Kiểm tra sau phục hồi**: Mở lại cơ sở dữ liệu và chạy `PRAGMA quick_check;` để đảm bảo cơ sở dữ liệu không bị hỏng hóc.

---

## 3. Lập lịch sao lưu tự động

Hệ thống tích hợp sẵn tiến trình hẹn giờ chạy nền (`src/server/services/backupScheduler.ts`):
- `disabled`: Tắt sao lưu tự động.
- `hourly`: Chạy mỗi giờ một lần.
- `6hours`: Chạy mỗi 6 giờ.
- `12hours`: Chạy mỗi 12 giờ.
- `daily`: Chạy mỗi ngày một lần.
- `weekly`: Chạy mỗi tuần một lần.
- **Tự động dọn dẹp (Retention)**: Cấu hình số lượng bản lưu giữ (ví dụ: giữ lại 7 bản gần nhất), các bản cũ hơn sẽ tự động bị xóa để tiết kiệm dung lượng ổ cứng.
