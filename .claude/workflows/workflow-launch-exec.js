export const meta = {
  name: 'workflow-launch-exec',
  description: 'Kiểm tra toàn bộ thao tác từ role super_admin đến user xem có lỗi nào không',
  phases: [
    { title: 'Super Admin Audit', detail: 'Verify Platform Owner sovereignty, roles, quotas, and DB operations' },
    { title: 'Platform Admin Audit', detail: 'Verify Administrator privileges, user management, and owner protection' },
    { title: 'Developer Audit', detail: 'Verify Database Engineer tenant isolation, SQL execution, and deletion' },
    { title: 'Standard User Audit', detail: 'Verify Member data operations, invite collaboration, and database deletion' },
  ],
};

phase('Super Admin Audit');
log('Kiểm tra quyền hạn và thao tác super_admin (Platform Owner)...');
const superAdminResult = await agent(
  'Chạy kiểm tra chuyên sâu các thao tác của role super_admin: khởi tạo platform, quản trị roles và quotas, quản lý cluster nodes, tạo/truy vấn/xóa database. Xác nhận mọi thao tác thành công và tuân thủ nguyên tắc bảo mật.',
  { phase: 'Super Admin Audit', label: 'audit:super_admin' }
);

phase('Platform Admin Audit');
log('Kiểm tra quyền hạn và thao tác admin (Platform Administrator)...');
const adminResult = await agent(
  'Chạy kiểm tra thao tác của role admin: quản lý user accounts, kiểm tra cơ chế chặn sửa đổi/hạ cấp tài khoản super_admin, tạo và xóa database sở hữu.',
  { phase: 'Platform Admin Audit', label: 'audit:admin' }
);

phase('Developer Audit');
log('Kiểm tra quyền hạn và thao tác developer (Database Engineer)...');
const devResult = await agent(
  'Chạy kiểm tra thao tác của role developer: cô lập tenant database, thực thi SQL DDL/DML, tạo API token, sao lưu backup, xóa database riêng và xác nhận bị chặn khi truy cập routes quản trị hệ thống.',
  { phase: 'Developer Audit', label: 'audit:developer' }
);

phase('Standard User Audit');
log('Kiểm tra quyền hạn và thao tác user (Standard Member)...');
const userResult = await agent(
  'Chạy kiểm tra thao tác của role user: tạo database, cô lập dữ liệu, thêm sửa xóa dòng trong bảng, mời cộng tác viên, xóa database do chính mình tạo thành công, và xác nhận bị chặn khi xóa database của người khác.',
  { phase: 'Standard User Audit', label: 'audit:user' }
);

return {
  superAdmin: superAdminResult,
  admin: adminResult,
  developer: devResult,
  user: userResult,
};
