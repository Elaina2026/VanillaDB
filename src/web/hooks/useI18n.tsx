import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'en' | 'vi';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, defaultVal?: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    // Navigation
    'nav.overview': 'Overview',
    'nav.databases': 'Databases',
    'nav.telemetry': 'Telemetry',
    'nav.activity': 'Activity Logs',
    'nav.users': 'User Management',
    'nav.settings': 'Settings',
    'nav.shortcuts': 'Shortcuts',
    'nav.search': 'Quick search (Ctrl + K)',
    'nav.allDatabases': 'All Databases',

    // Database Detail Tabs
    'db.overview': 'Overview & Stats',
    'db.analytics': 'Requests & Disk B-Tree',
    'db.tables': 'Tables Browser',
    'db.editor': 'SQL Editor',
    'db.schema': 'Schema Viewer',
    'db.storage': 'Media Storage',
    'db.importExport': 'Import & Export',
    'db.realtime': 'Realtime Stream',
    'db.webhooks': 'Webhooks',
    'db.api': 'API & Quickstart',
    'db.tokens': 'API Tokens',
    'db.backups': 'Backups',
    'db.settings': 'Danger Settings',

    // Common Actions & Form Controls
    'common.search': 'Search...',
    'common.copy': 'Copy',
    'common.copied': 'Copied',
    'common.save': 'Save Changes',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.delete': 'Delete',
    'common.create': 'Create',
    'common.edit': 'Edit',
    'common.status': 'Status',
    'common.language': 'Language',
    'common.theme': 'Theme',
    'common.refresh': 'Refresh',
    'common.run': 'Run (Ctrl+Enter)',
    'common.clear': 'Clear',
    'common.export': 'Export',
    'common.import': 'Import',
    'common.upload': 'Upload File',
    'common.download': 'Download',
    'common.preview': 'Preview',
    'common.view': 'View',
    'common.execute': 'Execute',
    'common.actions': 'Actions',
    'common.loading': 'Loading...',
    'common.unlimited': 'Unlimited',
    'common.active': 'Active',
    'common.disabled': 'Disabled',
    'common.none': 'None',
    'common.confirm': 'Confirm',

    // Overview Page
    'overview.title': 'System Overview',
    'overview.healthy': 'Healthy',
    'overview.desc': 'Overview of SQLite multi-tenant nodes, host system resources, storage breakdown, and engine status.',
    'overview.activeDatabases': 'Active Databases',
    'overview.totalQueries': 'Total Queries (24h)',
    'overview.storageUsed': 'Total Storage Used',
    'overview.ramUsed': 'Host RAM Utilization',
    'overview.engineStatus': 'SQLite Engine Core Status',
    'overview.liveCharts': 'Live Charts',

    // Telemetry Page
    'telemetry.title': 'Live Telemetry & Metrics',
    'telemetry.stream': 'Live 60-Point Stream',
    'telemetry.desc': 'Real-time interactive SVG charts for Network In/Out, CPU, RAM, QPS throughput, and P95 latency distribution.',
    'telemetry.live1s': 'Live Realtime: 1s',
    'telemetry.live2s': 'Refresh: 2s (High-Res)',
    'telemetry.live5s': 'Refresh: 5s (Default)',
    'telemetry.live15s': 'Refresh: 15s',
    'telemetry.pause': 'Manual Pause',
    'telemetry.peakCpu': 'Peak CPU',
    'telemetry.peakRam': 'Peak RAM',
    'telemetry.maxQps': 'Max QPS',
    'telemetry.avgLatency': 'Avg Latency',
    'telemetry.networkIn': 'Network In',
    'telemetry.networkOut': 'Network Out',

    // API Token Modal
    'token.title': 'Create API Token',
    'token.generated': 'API Token Generated',
    'token.warning': 'Copy this token & Database URL now. VanillaDatabase will never display this secret token again.',
    'token.baseUrl': 'Database API Base URL',
    'token.authHeader': 'Authorization Header',
    'token.secret': 'Your Token Secret',
    'token.snippet': 'TypeScript / Python Connection Snippet',
    'token.name': 'Token Name',
    'token.permissions': 'Permissions',
    'token.expiration': 'Expiration',
    'token.rateLimit': 'Rate Limit',
    'token.prefix': 'Prefix',

    // Shortcuts Page
    'shortcuts.title': 'Keyboard Shortcuts Cheat Sheet',
    'shortcuts.desc': 'Boost your productivity with quick navigation and operational keybindings across all devices.',
    'shortcuts.global': 'Global & Navigation Hotkeys',
    'shortcuts.database': 'Database Workspace Tabs',
    'shortcuts.editor': 'SQL Console & Data Table',
  },
  vi: {
    // Navigation
    'nav.overview': 'Tổng quan',
    'nav.databases': 'Cơ sở dữ liệu',
    'nav.telemetry': 'Giám sát (Telemetry)',
    'nav.activity': 'Nhật ký hoạt động',
    'nav.users': 'Quản lý người dùng',
    'nav.settings': 'Cài đặt hệ thống',
    'nav.shortcuts': 'Bảng phím tắt',
    'nav.search': 'Tìm kiếm nhanh (Ctrl + K)',
    'nav.allDatabases': 'Tất cả cơ sở dữ liệu',

    // Database Detail Tabs
    'db.overview': 'Tổng quan & Thống kê',
    'db.analytics': 'Truy vấn & Phân bổ B-Tree',
    'db.tables': 'Duyệt bảng dữ liệu',
    'db.editor': 'Trình soạn thảo SQL',
    'db.schema': 'Cấu trúc Schema',
    'db.storage': 'Kho lưu trữ Media',
    'db.importExport': 'Nhập & Xuất dữ liệu',
    'db.realtime': 'Luồng sự kiện Realtime',
    'db.webhooks': 'Webhooks',
    'db.api': 'API & Hướng dẫn kết nối',
    'db.tokens': 'Mã truy cập API (Tokens)',
    'db.backups': 'Sao lưu & Khôi phục',
    'db.settings': 'Cấu hình nguy hiểm',

    // Common Actions & Form Controls
    'common.search': 'Tìm kiếm...',
    'common.copy': 'Sao chép',
    'common.copied': 'Đã sao chép',
    'common.save': 'Lưu thay đổi',
    'common.cancel': 'Hủy',
    'common.close': 'Đóng',
    'common.delete': 'Xóa',
    'common.create': 'Tạo mới',
    'common.edit': 'Chỉnh sửa',
    'common.status': 'Trạng thái',
    'common.language': 'Ngôn ngữ giao diện',
    'common.theme': 'Chủ đề giao diện',
    'common.refresh': 'Làm mới',
    'common.run': 'Chạy truy vấn (Ctrl+Enter)',
    'common.clear': 'Xóa nội dung',
    'common.export': 'Xuất dữ liệu',
    'common.import': 'Nhập dữ liệu',
    'common.upload': 'Tải lên tập tin',
    'common.download': 'Tải xuống',
    'common.preview': 'Xem trước',
    'common.view': 'Xem',
    'common.execute': 'Thực thi',
    'common.actions': 'Hành động',
    'common.loading': 'Đang tải...',
    'common.unlimited': 'Không giới hạn',
    'common.active': 'Đang hoạt động',
    'common.disabled': 'Đã vô hiệu hóa',
    'common.none': 'Không có',
    'common.confirm': 'Xác nhận',

    // Overview Page
    'overview.title': 'Tổng quan hệ thống',
    'overview.healthy': 'Ổn định (Healthy)',
    'overview.desc': 'Theo dõi tổng quát các cụm cơ sở dữ liệu SQLite đa khách thuê, tài nguyên máy chủ và trạng thái động cơ.',
    'overview.activeDatabases': 'Database đang kích hoạt',
    'overview.totalQueries': 'Tổng truy vấn (24h)',
    'overview.storageUsed': 'Dung lượng ổ đĩa sử dụng',
    'overview.ramUsed': 'Mức chiếm dụng bộ nhớ RAM',
    'overview.engineStatus': 'Trạng thái động cơ lõi SQLite',
    'overview.liveCharts': 'Xem biểu đồ trực tiếp',

    // Telemetry Page
    'telemetry.title': 'Giám sát Telemetry thời gian thực',
    'telemetry.stream': 'Luồng trực tiếp 60 điểm',
    'telemetry.desc': 'Biểu đồ trực quan tương tác SVG theo dõi Lưu lượng mạng vào/ra, CPU, RAM, thông lượng QPS và độ trễ P95.',
    'telemetry.live1s': 'Thời gian thực: 1 giây',
    'telemetry.live2s': 'Làm mới: 2 giây (Độ nét cao)',
    'telemetry.live5s': 'Làm mới: 5 giây (Tiêu chuẩn)',
    'telemetry.live15s': 'Làm mới: 15 giây',
    'telemetry.pause': 'Tạm dừng thủ công',
    'telemetry.peakCpu': 'Đỉnh CPU',
    'telemetry.peakRam': 'Đỉnh RAM',
    'telemetry.maxQps': 'QPS tối đa',
    'telemetry.avgLatency': 'Độ trễ trung bình',
    'telemetry.networkIn': 'Mạng tải vào',
    'telemetry.networkOut': 'Mạng gửi ra',

    // API Token Modal
    'token.title': 'Tạo mã Token API',
    'token.generated': 'Mã API Token đã được tạo',
    'token.warning': 'Hãy sao chép ngay mã bí mật và Base URL này. VanillaDatabase sẽ không bao giờ hiển thị lại chuỗi bí mật này.',
    'token.baseUrl': 'Đường dẫn Base URL Database',
    'token.authHeader': 'Header xác thực (Authorization)',
    'token.secret': 'Mã bí mật Token',
    'token.snippet': 'Đoạn mã kết nối mẫu (TypeScript / Python)',
    'token.name': 'Tên gợi nhớ Token',
    'token.permissions': 'Quyền hạn cấp phát',
    'token.expiration': 'Thời gian hết hạn',
    'token.rateLimit': 'Giới hạn tần suất',
    'token.prefix': 'Tiền tố Token',

    // Shortcuts Page
    'shortcuts.title': 'Bảng tra cứu phím tắt toàn hệ thống',
    'shortcuts.desc': 'Tăng tốc năng suất làm việc với phím tắt điều hướng nhanh và thao tác dữ liệu tối ưu trên mọi màn hình.',
    'shortcuts.global': 'Phím tắt Toàn cục & Điều hướng',
    'shortcuts.database': 'Phím tắt Tab Workspace Database',
    'shortcuts.editor': 'Phím tắt SQL Console & Bảng dữ liệu',
  },
};

const I18nContext = createContext<I18nContextType | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLangState] = useState<Language>(() => {
    return (localStorage.getItem('vdb_language') as Language) || 'vi';
  });

  const setLanguage = (lang: Language) => {
    setLangState(lang);
    localStorage.setItem('vdb_language', lang);
  };

  const t = (key: string, defaultVal?: string): string => {
    return translations[language]?.[key] || defaultVal || translations.en[key] || key;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      language: 'vi' as Language,
      setLanguage: () => {},
      t: (key: string, def?: string) => def || key,
    };
  }
  return ctx;
};
