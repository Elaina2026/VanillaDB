import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'en' | 'vi';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, defaultVal?: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    'nav.overview': 'Overview',
    'nav.databases': 'Databases',
    'nav.telemetry': 'Telemetry',
    'nav.activity': 'Activity Logs',
    'nav.users': 'User Management',
    'nav.settings': 'Settings',
    'nav.shortcuts': 'Shortcuts',
    'nav.search': 'Quick search (Ctrl + K)',
    'common.search': 'Search...',
    'common.copy': 'Copy',
    'common.copied': 'Copied',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.delete': 'Delete',
    'common.create': 'Create',
    'common.edit': 'Edit',
    'common.status': 'Status',
    'common.language': 'Language',
    'common.theme': 'Theme',
    'shortcuts.title': 'Keyboard Shortcuts',
    'shortcuts.desc': 'Boost your productivity with quick navigation and operational keybindings.',
    'token.baseUrl': 'Database Base URL',
    'token.authHeader': 'Authorization Header',
    'token.secret': 'Token Secret',
    'telemetry.live1s': '1s (Live Realtime)',
    'telemetry.live5s': '5s (Normal)',
  },
  vi: {
    'nav.overview': 'Tổng quan',
    'nav.databases': 'Cơ sở dữ liệu',
    'nav.telemetry': 'Giám sát (Telemetry)',
    'nav.activity': 'Nhật ký hoạt động',
    'nav.users': 'Quản lý người dùng',
    'nav.settings': 'Cài đặt hệ thống',
    'nav.shortcuts': 'Phím tắt',
    'nav.search': 'Tìm kiếm nhanh (Ctrl + K)',
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
    'common.language': 'Ngôn ngữ hiển thị',
    'common.theme': 'Giao diện',
    'shortcuts.title': 'Bảng tra cứu phím tắt',
    'shortcuts.desc': 'Tối ưu hóa thao tác quản trị với hệ thống phím tắt toàn diện trên VanillaDatabase.',
    'token.baseUrl': 'Đường dẫn Base URL Database',
    'token.authHeader': 'Header xác thực (Authorization)',
    'token.secret': 'Mã bí mật Token',
    'telemetry.live1s': '1 giây (Thời gian thực 1s)',
    'telemetry.live5s': '5 giây (Tiêu chuẩn)',
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
