import React from 'react';
import {
  Keyboard,
  Search,
  Database,
  Terminal,
  Activity,
  Plus,
  Moon,
  Sun,
  Home,
  Users,
  Settings,
  Shield,
  FileCode,
  ArrowRight,
  Command,
  Mail,
  TrendingUp,
  LayoutDashboard,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  Archive,
  Table as TableIcon,
  Maximize2,
  Download,
  PanelLeftClose,
  User as UserIcon,
  Trash2,
  RefreshCw,
  Clock
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { useI18n } from '../hooks/useI18n.js';
import { useTheme } from '../hooks/useTheme.js';

interface ShortcutItem {
  keys: string[];
  label: string;
  action?: () => void;
  contextual?: boolean;
}

interface ShortcutGroup {
  title: string;
  icon: any;
  shortcuts: ShortcutItem[];
}

export const ShortcutsPage: React.FC<{
  onNavigate: (tab: string, dbId?: string | null) => void;
  onOpenCreateDb: () => void;
  onOpenSearch?: () => void;
}> = ({ onNavigate, onOpenCreateDb, onOpenSearch }) => {
  const { user } = useAuth();
  const { language, toggleLanguage } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const isVi = language === 'vi';
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  // Navigation shortcuts: explicitly separated by role
  const navShortcuts: ShortcutItem[] = isAdmin
    ? [
        { keys: ['Alt', '1'], label: isVi ? 'Đi đến Tổng quan hệ thống (Overview)' : 'Go to System Overview', action: () => onNavigate('overview') },
        { keys: ['Alt', '2'], label: isVi ? 'Đi đến Giám sát hệ thống (Live Telemetry)' : 'Go to Live Telemetry', action: () => onNavigate('telemetry') },
        { keys: ['Alt', '3'], label: isVi ? 'Đi đến danh sách Cơ sở dữ liệu (Databases)' : 'Go to Databases', action: () => onNavigate('databases') },
        { keys: ['Alt', '4'], label: isVi ? 'Đi đến Nhật ký hoạt động & Kiểm toán (Activity Logs)' : 'Go to Activity & Audit Logs', action: () => onNavigate('activity') },
        { keys: ['Alt', '5'], label: isVi ? 'Đi đến Quản lý người dùng (User Management)' : 'Go to User Management', action: () => onNavigate('users') },
        { keys: ['Alt', '6'], label: isVi ? 'Đi đến Cài đặt hệ thống (Platform Settings)' : 'Go to Platform Settings', action: () => onNavigate('settings') },
        { keys: ['Alt', '7'], label: isVi ? 'Đi đến Hộp thư & Thông báo (Inbox & Notifications)' : 'Go to Inbox & Notifications', action: () => onNavigate('inbox') },
        { keys: ['Alt', '8'], label: isVi ? 'Đi đến Bảng phím tắt này (Shortcuts Reference)' : 'Go to Shortcuts Reference', action: () => onNavigate('shortcuts') },
      ]
    : [
        { keys: ['Alt', '1'], label: isVi ? 'Đi đến Bảng điều khiển cá nhân (User Dashboard)' : 'Go to User Dashboard', action: () => onNavigate('overview') },
        { keys: ['Alt', '2'], label: isVi ? 'Đi đến Hộp thư & Lời mời chia sẻ (Inbox & Invitations)' : 'Go to Inbox & Invitations', action: () => onNavigate('inbox') },
        { keys: ['Alt', '3'], label: isVi ? 'Đi đến danh sách Cơ sở dữ liệu của tôi (Databases)' : 'Go to My Databases', action: () => onNavigate('databases') },
        { keys: ['Alt', '4'], label: isVi ? 'Đi đến Nhật ký hoạt động cá nhân (Activity Logs)' : 'Go to Activity Logs', action: () => onNavigate('activity') },
        { keys: ['Alt', '5'], label: isVi ? 'Đi đến Cài đặt tài khoản (Account Settings)' : 'Go to Account Settings', action: () => onNavigate('settings') },
        { keys: ['Alt', '6'], label: isVi ? 'Đi đến Bảng phím tắt này (Shortcuts Reference)' : 'Go to Shortcuts Reference', action: () => onNavigate('shortcuts') },
      ];

  const shortcutGroups: ShortcutGroup[] = [
    {
      title: isVi ? 'Toàn hệ thống & Vim Chords (Global UX)' : 'Global Shortcuts & Vim Chords',
      icon: Command,
      shortcuts: [
        { keys: ['Ctrl', 'K'], label: isVi ? 'Mở thanh tìm kiếm lệnh nhanh (Command Palette)' : 'Open Command Palette', action: onOpenSearch },
        { keys: ['Ctrl', 'B'], label: isVi ? 'Mở cửa sổ tạo cơ sở dữ liệu mới' : 'Open Create Database modal', action: onOpenCreateDb },
        { keys: ['Ctrl', '\\'], label: isVi ? 'Thu gọn / Mở rộng Sidebar điều hướng' : 'Toggle Sidebar collapse/expand' },
        { keys: ['G', 'D'], label: isVi ? 'Nhảy nhanh về danh sách Database (Vim style)' : 'Jump to Databases (Vim chord)', action: () => onNavigate('databases') },
        { keys: ['G', 'I'], label: isVi ? 'Nhảy nhanh về Hộp thư thông báo (Vim style)' : 'Jump to Inbox (Vim chord)', action: () => onNavigate('inbox') },
        { keys: ['Ctrl', 'Shift', 'L'], label: isVi ? 'Chuyển đổi nhanh ngôn ngữ (English / Tiếng Việt)' : 'Toggle language (English / Vietnamese)', action: toggleLanguage },
        { keys: ['Alt', 'T'], label: isVi ? 'Chuyển đổi giao diện Sáng / Tối' : 'Toggle theme (Light / Dark)', action: toggleTheme },
        { keys: ['Shift', '?'], label: isVi ? 'Mở trang tra cứu phím tắt này' : 'Navigate to Shortcuts page', action: () => onNavigate('shortcuts') },
        { keys: ['Esc'], label: isVi ? 'Đóng các modal / Command Palette / Thoát Zen mode' : 'Close active modals / palette / exit Zen' },
      ],
    },
    {
      title: isAdmin
        ? (isVi ? 'Điều hướng Quản trị viên (Admin Navigation - Alt + 1..8)' : 'Admin Navigation (Alt + 1..8)')
        : (isVi ? 'Điều hướng Người dùng (User Navigation - Alt + 1..6)' : 'User Navigation (Alt + 1..6)'),
      icon: isAdmin ? Shield : UserIcon,
      shortcuts: navShortcuts,
    },
    ...(isAdmin
      ? [
          {
            title: isVi ? 'Đặc quyền Quản trị viên (Admin Operations)' : 'Admin Operations',
            icon: ShieldAlert,
            shortcuts: [
              { keys: ['Alt', '2'], label: isVi ? 'Giám sát CPU / RAM / IOPS thời gian thực' : 'Realtime CPU/RAM/IOPS Telemetry', action: () => onNavigate('telemetry') },
              { keys: ['Alt', '5'], label: isVi ? 'Phân quyền, cấp hạn ngạch Disk & Database cho người dùng' : 'Manage User Quotas & Roles', action: () => onNavigate('users') },
              { keys: ['Alt', '7'], label: isVi ? 'Phát thông báo bảo trì / cảnh báo hệ thống tới toàn sàn' : 'Broadcast System & Maintenance Announcements', action: () => onNavigate('inbox') },
              { keys: ['Alt', '6'], label: isVi ? 'Cấu hình Pragmas, Token, Khóa bảo mật SQLite Cloud' : 'Platform Security & Pragma Configuration', action: () => onNavigate('settings') },
            ],
          },
        ]
      : []),
    {
      title: isVi ? 'Trong chi tiết Database (Database Detail Tabs - Phím 1..9)' : 'Database Detail Tabs (Keys 1..9)',
      icon: Database,
      shortcuts: [
        { keys: ['1'], label: isVi ? 'Tab Tổng quan & Chỉ số (Overview & Stats)' : 'Overview & Stats tab', contextual: true, action: () => onNavigate('databases') },
        { keys: ['2'], label: isVi ? 'Tab Truy vấn & B-Tree (Requests & Disk B-Tree)' : 'Requests & Disk B-Tree tab', contextual: true, action: () => onNavigate('databases') },
        { keys: ['3'], label: isVi ? 'Tab Bảng dữ liệu (Tables Browser)' : 'Tables Browser tab', contextual: true, action: () => onNavigate('databases') },
        { keys: ['4'], label: isVi ? 'Tab Trình soạn thảo SQL (SQL Editor)' : 'SQL Editor tab', contextual: true, action: () => onNavigate('databases') },
        { keys: ['5'], label: isVi ? 'Tab Cấu trúc Schema & ERD (Schema Viewer)' : 'Schema Viewer tab', contextual: true, action: () => onNavigate('databases') },
        { keys: ['6'], label: isVi ? 'Tab Kho lưu trữ Media (Media Storage)' : 'Media Storage tab', contextual: true, action: () => onNavigate('databases') },
        { keys: ['7'], label: isVi ? 'Tab Nhập / Xuất dữ liệu (Import & Export)' : 'Import & Export tab', contextual: true, action: () => onNavigate('databases') },
        { keys: ['8'], label: isVi ? 'Tab Luồng thời gian thực (Realtime Stream)' : 'Realtime Stream tab', contextual: true, action: () => onNavigate('databases') },
        { keys: ['9'], label: isVi ? 'Tab Webhooks phát sự kiện' : 'Webhooks stream tab', contextual: true, action: () => onNavigate('databases') },
      ],
    },
    {
      title: isVi ? 'Tác vụ Database & Sao lưu (Database Actions)' : 'Database Actions & Backup Operations',
      icon: Archive,
      shortcuts: [
        { keys: ['Ctrl', 'Shift', 'B'], label: isVi ? 'Tạo nhanh bản sao lưu tức thì (Instant Snapshot)' : 'Create instant database backup snapshot', contextual: true },
        { keys: ['Ctrl', 'Shift', 'D'], label: isVi ? 'Mở cửa sổ nhân bản Database (Clone/Branch Database)' : 'Open Clone / Branch Database modal', contextual: true },
        { keys: ['Alt', 'M'], label: isVi ? 'Chạy kiểm tra toàn vẹn & dọn dẹp (PRAGMA integrity_check)' : 'Run maintenance integrity check & vacuum', contextual: true },
      ],
    },
    {
      title: isVi ? 'Quản lý Bảng & Dòng (Table Browser Operations)' : 'Table Browser Operations',
      icon: TableIcon,
      shortcuts: [
        { keys: ['Alt', 'I'], label: isVi ? 'Mở cửa sổ chèn dòng mới (Insert Row)' : 'Open Insert Row modal', contextual: true },
        { keys: ['Alt', 'R'], label: isVi ? 'Tải lại dữ liệu bảng hiện tại (Refresh Table Rows)' : 'Refresh table rows and schema', contextual: true },
        { keys: ['['], label: isVi ? 'Lùi trang dữ liệu trước (Previous Page)' : 'Previous table page', contextual: true },
        { keys: [']'], label: isVi ? 'Tiến trang dữ liệu kế tiếp (Next Page)' : 'Next table page', contextual: true },
        { keys: ['/'], label: isVi ? 'Nhảy nhanh con trỏ vào ô tìm kiếm bảng' : 'Quick focus table search / filter', contextual: true },
        { keys: ['Del'], label: isVi ? 'Xóa các dòng dữ liệu đang chọn (Bulk Delete)' : 'Delete selected rows', contextual: true },
      ],
    },
    {
      title: isVi ? 'Trình soạn thảo SQL (SQL Console Operations)' : 'SQL Console Operations',
      icon: Terminal,
      shortcuts: [
        { keys: ['Ctrl', 'Enter'], label: isVi ? 'Thực thi câu lệnh SQL đang soạn thảo' : 'Execute active SQL statement', contextual: true },
        { keys: ['Ctrl', 'E'], label: isVi ? 'Phân tích kế hoạch truy vấn (EXPLAIN Query Plan)' : 'Analyze EXPLAIN query plan', contextual: true },
        { keys: ['Ctrl', 'S'], label: isVi ? 'Tải kết quả truy vấn ra file CSV' : 'Export query results to CSV', contextual: true },
        { keys: ['Alt', '↑'], label: isVi ? 'Duyệt câu lệnh SQL trước đó trong lịch sử' : 'Navigate backward in query history', contextual: true },
        { keys: ['Alt', '↓'], label: isVi ? 'Duyệt câu lệnh SQL kế tiếp trong lịch sử' : 'Navigate forward in query history', contextual: true },
        { keys: ['Ctrl', '/'], label: isVi ? 'Bật/tắt comment dòng lệnh SQL (--)' : 'Toggle SQL line comment (--)', contextual: true },
        { keys: ['F11'], label: isVi ? 'Bật/tắt chế độ toàn màn hình Editor (Zen Mode)' : 'Toggle Fullscreen Zen Mode for SQL Editor', contextual: true },
        { keys: ['Ctrl', 'L'], label: isVi ? 'Xóa trắng trình soạn thảo SQL' : 'Clear SQL editor', contextual: true },
        { keys: ['Ctrl', 'Shift', 'F'], label: isVi ? 'Định dạng mã SQL (Format Query)' : 'Format SQL statement', contextual: true },
      ],
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 md:p-6 max-w-5xl mx-auto w-full space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-blue-500" />
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {isVi ? 'Bảng tra cứu phím tắt' : 'Keyboard Shortcuts Reference'}
            </h1>
            <span
              className={`text-[10px] px-2.5 py-0.5 rounded font-semibold font-mono border flex items-center gap-1 ${
                isAdmin
                  ? 'bg-purple-500/10 text-purple-500 border-purple-500/20'
                  : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
              }`}
            >
              {isAdmin ? <Shield className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
              {isAdmin
                ? isVi ? 'Chế độ Quản trị viên (Admin)' : 'Admin Mode'
                : isVi ? 'Chế độ Người dùng (User)' : 'User Mode'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {isVi
              ? 'Tăng tốc năng suất làm việc với hệ thống phím tắt toàn diện. Bạn có thể nhấp chuột trực tiếp vào bất kỳ phím tắt nào bên dưới để chuyển trang nhanh.'
              : 'Speed up your workflow with integrated keyboard shortcuts. Click any shortcut row below to execute that action immediately.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenSearch && (
            <button
              onClick={onOpenSearch}
              className="px-3 py-1.5 border border-border hover:bg-accent rounded-md text-xs font-medium flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{isVi ? 'Lệnh nhanh (Ctrl+K)' : 'Command Palette (Ctrl+K)'}</span>
            </button>
          )}

          <button
            onClick={onOpenCreateDb}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isVi ? 'Tạo Database (Ctrl+B)' : 'Create DB (Ctrl+B)'}</span>
          </button>
        </div>
      </div>

      {/* Grid of Shortcut Groups */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {shortcutGroups.map((grp) => {
          const GroupIcon = grp.icon;
          return (
            <div key={grp.title} className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
              <h2 className="text-sm font-bold text-foreground pb-2 border-b border-border flex items-center gap-2">
                <GroupIcon className="w-4 h-4 text-blue-500" />
                <span>{grp.title}</span>
              </h2>

              <div className="space-y-1">
                {grp.shortcuts.map((sc, idx) => {
                  const isClickable = Boolean(sc.action);
                  return (
                    <div
                      key={idx}
                      onClick={sc.action}
                      role={isClickable ? 'button' : undefined}
                      tabIndex={isClickable ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          sc.action!();
                        }
                      }}
                      className={`flex items-center justify-between py-2 px-2.5 rounded-lg text-xs group transition-all ${
                        isClickable
                          ? 'hover:bg-accent cursor-pointer text-foreground'
                          : 'text-muted-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-3">
                        <span className={`truncate font-medium ${isClickable ? 'group-hover:text-blue-500' : ''}`}>
                          {sc.label}
                        </span>
                        {sc.contextual && (
                          <span className="text-[9px] px-1.5 py-0.2 bg-muted border border-border rounded text-muted-foreground shrink-0">
                            {isVi ? 'Trong DB' : 'In DB'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {sc.keys.map((k, kIdx) => (
                          <kbd
                            key={kIdx}
                            className="px-2 py-0.5 bg-background border border-border rounded font-mono text-[11px] font-semibold text-foreground shadow-2xs group-hover:border-blue-500/40 transition-colors"
                          >
                            {k}
                          </kbd>
                        ))}
                        {isClickable && (
                          <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all ml-1" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
