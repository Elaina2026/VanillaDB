import React, { useState, useEffect, useRef } from 'react';
import {
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
  Keyboard,
  ArrowRight,
  Sparkles,
  Command,
  FileCode,
  Folder,
  Radio,
  Clock,
  Archive,
  ArrowUpDown,
  Table as TableIcon
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../api/client.js';
import { useTheme } from '../hooks/useTheme.js';
import { useI18n } from '../hooks/useI18n.js';
import type { DatabaseRecord } from '@shared/index.js';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string, dbId?: string | null, dbTab?: string) => void;
  onOpenCreateDb: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenCreateDb,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useI18n();

  const { data: databases } = useQuery<DatabaseRecord[]>({
    queryKey: ['databases'],
    queryFn: () => apiRequest('/api/admin/databases'),
    enabled: isOpen,
  });

  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const isVi = language === 'vi';

  // Base navigation commands
  const navCommands = [
    {
      id: 'nav-overview',
      category: isVi ? 'Điều hướng' : 'Navigation',
      label: isVi ? 'Đi đến Tổng quan' : 'Go to Overview',
      detail: '#/overview',
      icon: Home,
      action: () => { onNavigate('overview'); onClose(); },
    },
    {
      id: 'nav-databases',
      category: isVi ? 'Điều hướng' : 'Navigation',
      label: isVi ? 'Quản lý Cơ sở dữ liệu' : 'All Databases',
      detail: '#/databases',
      icon: Database,
      action: () => { onNavigate('databases'); onClose(); },
    },
    {
      id: 'nav-telemetry',
      category: isVi ? 'Điều hướng' : 'Navigation',
      label: isVi ? 'Giám sát hệ thống (Telemetry Live 1s)' : 'Live Telemetry (1s)',
      detail: '#/telemetry',
      icon: Activity,
      action: () => { onNavigate('telemetry'); onClose(); },
    },
    {
      id: 'nav-activity',
      category: isVi ? 'Điều hướng' : 'Navigation',
      label: isVi ? 'Nhật ký hoạt động & Audit' : 'Activity & Audit Logs',
      detail: '#/activity',
      icon: Activity,
      action: () => { onNavigate('activity'); onClose(); },
    },
    {
      id: 'nav-users',
      category: isVi ? 'Điều hướng' : 'Navigation',
      label: isVi ? 'Quản trị Người dùng' : 'User Management',
      detail: '#/users',
      icon: Users,
      action: () => { onNavigate('users'); onClose(); },
    },
    {
      id: 'nav-settings',
      category: isVi ? 'Điều hướng' : 'Navigation',
      label: isVi ? 'Cài đặt hệ thống' : 'System Settings',
      detail: '#/settings',
      icon: Settings,
      action: () => { onNavigate('settings'); onClose(); },
    },
    {
      id: 'nav-shortcuts',
      category: isVi ? 'Điều hướng' : 'Navigation',
      label: isVi ? 'Bảng tra cứu phím tắt' : 'Keyboard Shortcuts Reference',
      detail: '#/shortcuts',
      icon: Keyboard,
      action: () => { onNavigate('shortcuts'); onClose(); },
    },
    {
      id: 'action-create-db',
      category: isVi ? 'Thao tác nhanh' : 'Quick Actions',
      label: isVi ? 'Tạo cơ sở dữ liệu mới' : 'Create New Database',
      detail: 'Ctrl + B',
      icon: Plus,
      action: () => { onClose(); onOpenCreateDb(); },
    },
    {
      id: 'action-toggle-theme',
      category: isVi ? 'Thao tác nhanh' : 'Quick Actions',
      label: isVi ? `Chuyển sang giao diện ${theme === 'dark' ? 'Sáng' : 'Tối'}` : `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} theme`,
      detail: theme === 'dark' ? 'Light' : 'Dark',
      icon: theme === 'dark' ? Sun : Moon,
      action: () => { setTheme(theme === 'dark' ? 'light' : 'dark'); onClose(); },
    },
    {
      id: 'action-toggle-lang',
      category: isVi ? 'Thao tác nhanh' : 'Quick Actions',
      label: isVi ? 'Chuyển sang English' : 'Chuyển sang Tiếng Việt',
      detail: 'Ctrl + Shift + L',
      icon: Sparkles,
      action: () => { setLanguage(isVi ? 'en' : 'vi'); onClose(); },
    },
  ];

  // Database specific commands (Direct jump into SQL Console, Tables, Schema, Jobs, etc.)
  const dbCommands = (databases || []).flatMap((db) => [
    {
      id: `db-${db.id}`,
      category: isVi ? 'Cơ sở dữ liệu' : 'Databases',
      label: db.name,
      detail: `${db.id}${db.description ? ` • ${db.description}` : ''}`,
      icon: Database,
      action: () => { onNavigate('databases', db.id, 'overview'); onClose(); },
    },
    {
      id: `db-${db.id}-editor`,
      category: isVi ? 'SQL Console' : 'SQL Console',
      label: `${db.name} › ${isVi ? 'Mở SQL Editor' : 'Open SQL Editor'}`,
      detail: `${db.id} • SQL Console`,
      icon: Terminal,
      action: () => { onNavigate('databases', db.id, 'editor'); onClose(); },
    },
    {
      id: `db-${db.id}-tables`,
      category: isVi ? 'Bảng dữ liệu' : 'Data Tables',
      label: `${db.name} › ${isVi ? 'Duyệt bảng dữ liệu' : 'Browse Tables'}`,
      detail: `${db.id} • Tables`,
      icon: TableIcon,
      action: () => { onNavigate('databases', db.id, 'tables'); onClose(); },
    },
    {
      id: `db-${db.id}-jobs`,
      category: isVi ? 'Tác vụ định kỳ' : 'Scheduled Jobs',
      label: `${db.name} › ${isVi ? 'Quản lý Cron Jobs' : 'Scheduled Jobs'}`,
      detail: `${db.id} • Cron Tasks`,
      icon: Clock,
      action: () => { onNavigate('databases', db.id, 'jobs'); onClose(); },
    }
  ]);

  const allItems = [...navCommands, ...dbCommands];
  const filtered = allItems.filter(item =>
    item.label.toLowerCase().includes(query.toLowerCase()) ||
    item.detail.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen && filtered.length > 0 && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [isOpen, selectedIndex, filtered.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + (filtered.length || 1)) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-100">
      <div className="w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh]">
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-muted/20">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder={isVi ? "Tìm kiếm database, trang hoặc lệnh... (Gõ để lọc)" : "Type a command, database name, or search..."}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 text-xs bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground font-sans"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-muted border border-border rounded text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-border/20">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground font-sans">
              {isVi ? 'Không tìm thấy kết quả phù hợp' : 'No matching commands or databases'}
            </div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  ref={(el) => { itemRefs.current[idx] = el; }}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-600 text-white font-medium' : 'text-foreground hover:bg-muted/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-blue-500'}`} />
                    <div className="truncate">
                      <span className="block font-medium truncate">{item.label}</span>
                      <span className={`text-[10px] truncate block ${isSelected ? 'text-white/80' : 'text-muted-foreground'}`}>
                        {item.category} • {item.detail}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'opacity-100' : 'opacity-20'}`} />
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{isVi ? 'Dùng phím ↑ ↓ để chọn, Enter để chạy' : 'Use ↑ ↓ to navigate, Enter to select'}</span>
          <span className="font-mono">Ctrl + K</span>
        </div>
      </div>
    </div>
  );
};
