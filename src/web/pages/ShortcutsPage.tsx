import React from 'react';
import {
  Keyboard,
  Search,
  Database,
  Terminal,
  Activity,
  Plus,
  Moon,
  Home,
  Users,
  Settings,
  Shield,
  FileCode,
  ArrowRight,
  Command
} from 'lucide-react';
import { useI18n } from '../hooks/useI18n.js';

export const ShortcutsPage: React.FC<{
  onNavigate: (tab: string, dbId?: string | null) => void;
  onOpenCreateDb: () => void;
}> = ({ onNavigate, onOpenCreateDb }) => {
  const { language } = useI18n();
  const isVi = language === 'vi';

  const shortcutGroups = [
    {
      title: isVi ? 'Toàn hệ thống (Global)' : 'Global Shortcuts',
      shortcuts: [
        { keys: ['Ctrl', 'K'], label: isVi ? 'Mở thanh tìm kiếm lệnh nhanh (Command Palette)' : 'Open Command Palette' },
        { keys: ['Ctrl', 'B'], label: isVi ? 'Mở cửa sổ tạo cơ sở dữ liệu mới' : 'Open Create Database modal' },
        { keys: ['Ctrl', 'Shift', 'L'], label: isVi ? 'Chuyển đổi nhanh ngôn ngữ (English / Tiếng Việt)' : 'Toggle language (English / Vietnamese)' },
        { keys: ['Ctrl', 'Shift', 'T'], label: isVi ? 'Chuyển đổi giao diện Sáng / Tối' : 'Toggle theme (Light / Dark)' },
        { keys: ['Shift', '?'], label: isVi ? 'Mở trang tra cứu phím tắt này' : 'Navigate to Shortcuts page' },
        { keys: ['Esc'], label: isVi ? 'Đóng các modal đang mở / Đóng Command Palette' : 'Close active modals / palette' },
      ],
    },
    {
      title: isVi ? 'Điều hướng trang (Navigation)' : 'Navigation Shortcuts',
      shortcuts: [
        { keys: ['Alt', '1'], label: isVi ? 'Đi đến trang Tổng quan (Overview)' : 'Go to Overview page', action: () => onNavigate('overview') },
        { keys: ['Alt', '2'], label: isVi ? 'Đi đến Giám sát hệ thống (Live Telemetry)' : 'Go to Live Telemetry page', action: () => onNavigate('telemetry') },
        { keys: ['Alt', '3'], label: isVi ? 'Đi đến danh sách Cơ sở dữ liệu (Databases)' : 'Go to Databases page', action: () => onNavigate('databases') },
        { keys: ['Alt', '4'], label: isVi ? 'Đi đến Nhật ký hoạt động (Activity Logs)' : 'Go to Activity Logs page', action: () => onNavigate('activity') },
        { keys: ['Alt', '5'], label: isVi ? 'Đi đến Quản lý người dùng (Users)' : 'Go to Users page', action: () => onNavigate('users') },
        { keys: ['Alt', '6'], label: isVi ? 'Đi đến Cài đặt hệ thống (Settings)' : 'Go to Settings page', action: () => onNavigate('settings') },
      ],
    },
    {
      title: isVi ? 'Trong chi tiết Database (Database Detail Tabs - Phím 1..9)' : 'Database Detail Tabs (Keys 1..9)',
      shortcuts: [
        { keys: ['1'], label: isVi ? 'Tab Tổng quan & Chỉ số (Overview & Stats)' : 'Overview & Stats tab' },
        { keys: ['2'], label: isVi ? 'Tab Truy vấn & B-Tree (Requests & Disk B-Tree)' : 'Requests & Disk B-Tree tab' },
        { keys: ['3'], label: isVi ? 'Tab Bảng dữ liệu (Tables Browser)' : 'Tables Browser tab' },
        { keys: ['4'], label: isVi ? 'Tab Trình soạn thảo SQL (SQL Editor)' : 'SQL Editor tab' },
        { keys: ['5'], label: isVi ? 'Tab Cấu trúc Schema & ERD (Schema Viewer)' : 'Schema Viewer tab' },
        { keys: ['6'], label: isVi ? 'Tab Kho lưu trữ Media (Media Storage)' : 'Media Storage tab' },
        { keys: ['7'], label: isVi ? 'Tab Nhập / Xuất dữ liệu (Import & Export)' : 'Import & Export tab' },
        { keys: ['8'], label: isVi ? 'Tab Luồng thời gian thực (Realtime Stream)' : 'Realtime Stream tab' },
        { keys: ['9'], label: isVi ? 'Tab Webhooks phát sự kiện' : 'Webhooks stream tab' },
      ],
    },
    {
      title: isVi ? 'Thao tác SQL Console' : 'SQL Console Operations',
      shortcuts: [
        { keys: ['Ctrl', 'Enter'], label: isVi ? 'Thực thi câu lệnh SQL đang soạn thảo' : 'Execute active SQL statement' },
        { keys: ['Ctrl', 'L'], label: isVi ? 'Xóa trắng trình soạn thảo SQL' : 'Clear SQL editor' },
        { keys: ['Ctrl', 'Shift', 'F'], label: isVi ? 'Định dạng mã SQL (Format Query)' : 'Format SQL statement' },
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
            <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded font-semibold font-mono">
              Ctrl + K
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {isVi
              ? 'Tăng tốc năng suất làm việc với hệ thống phím tắt toàn năng được tích hợp sẵn.'
              : 'Speed up your database administration workflow with built-in navigation and execution hotkeys.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
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
        {shortcutGroups.map((grp) => (
          <div key={grp.title} className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-foreground pb-2 border-b border-border flex items-center gap-2">
              <Command className="w-4 h-4 text-purple-500" />
              {grp.title}
            </h2>

            <div className="space-y-2.5">
              {grp.shortcuts.map((sc, idx) => (
                <div key={idx} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
                  <span className="text-xs text-muted-foreground pr-3">{sc.label}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {sc.keys.map((k, kIdx) => (
                      <kbd
                        key={kIdx}
                        className="px-2 py-0.5 text-[11px] font-mono font-bold bg-muted border border-border rounded shadow-xs text-foreground"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
