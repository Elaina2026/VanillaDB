---
name: workflow-launch-exec
description: Kiểm tra toàn bộ thao tác từ role super_admin đến user xem có lỗi nào không
---

# Workflow Launch Exec

Kiểm tra toàn bộ ma trận thao tác và phân quyền trên hệ thống VanillaDatabase từ role `super_admin` đến `user`:

1. **super_admin (Platform Owner)**:
   - Toàn quyền hệ thống, quản lý cluster nodes & security policies.
   - Quản trị roles, hạn mức tài nguyên (quotas), và phân quyền hệ thống.
   - Tạo, truy vấn, bảo trì và xóa database sở hữu.

2. **admin (Platform Administrator)**:
   - Quản trị người dùng (users), cấp phát vai trò, giám sát telemetry.
   - Bị chặn tuyệt đối khi cố gắng sửa đổi hoặc hạ cấp Platform Owner.
   - Tạo và xóa database thuộc quyền quản trị.

3. **developer (Database Engineer)**:
   - Cô lập database riêng tư (chỉ thấy DB của mình hoặc DB được mời).
   - Thực thi DDL/SQL console, tạo token API, sao lưu (backups).
   - Xóa database do chính mình tạo; bị chặn khi cố xóa DB của người khác (403 Forbidden).
   - Bị chặn truy cập các endpoint quản trị hệ thống (`/users`, `/roles`, `/audit`).

4. **user (Standard Member)**:
   - Cô lập database riêng tư.
   - Thao tác dữ liệu bảng (table rows CRUD), mời cộng tác viên.
   - Xóa database do chính mình tạo thành công (200 OK).
   - Bị chặn khi cố xóa database người khác hoặc database chỉ được chia sẻ quyền xem/sửa (403 Forbidden).

## Lệnh thực thi kiểm tra
```bash
npm run workflow:exec
```
