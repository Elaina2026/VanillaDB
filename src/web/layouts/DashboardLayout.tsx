import React, { useState } from 'react';
import {
  Database,
  Plus,
  Search,
  Layers,
  Server,
  Activity,
  Shield,
  Terminal,
  HardDrive,
  Settings,
  LogOut,
  Sun,
  Moon,
  Laptop,
  ChevronRight,
  ArrowLeft,
  Table as TableIcon,
  FileCode,
  Folder,
  Radio,
  Webhook as WebhookIcon,
  Key,
  Archive,
  Sliders,
  BarChart3,
  ArrowUpDown,
  TrendingUp,
  Clock,
  Users,
  Menu,
  X,
  User as UserIcon,
  LayoutDashboard,
  Mail,
  Bell,
  PanelLeftClose,
  PanelLeft
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../api/client.js';
import type { UserInboxResponse } from '@shared/index.js';
import { useAuth } from '../hooks/useAuth.js';
import { useTheme } from '../hooks/useTheme.js';
import { useI18n } from '../hooks/useI18n.js';
import { LogoIcon } from '../components/LogoIcon.js';
import { cn } from '../lib/utils.js';

interface DashboardLayoutProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  selectedDatabaseId: string | null;
  selectedDatabaseTab?: string;
  setSelectedDatabaseId: (id: string | null, tab?: string) => void;
  children: React.ReactNode;
  onOpenCreateDb: () => void;
  onOpenSearch?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  currentTab,
  setCurrentTab,
  selectedDatabaseId,
  selectedDatabaseTab = 'overview',
  setSelectedDatabaseId,
  children,
  onOpenCreateDb,
  onOpenSearch,
  isSidebarCollapsed = false,
  onToggleSidebar,
}) => {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t, language } = useI18n();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);

  const { data: inbox } = useQuery<UserInboxResponse>({
    queryKey: ['userInbox'],
    queryFn: () => apiRequest('/api/admin/inbox'),
    refetchInterval: 15000,
    enabled: !!user,
  });
  const unreadCount = inbox?.unreadCount || 0;

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    // Edge swipe from left (x < 40) opens mobile drawer
    if (touchStartRef.current.x < 40 && dx > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setIsMobileMenuOpen(true);
    }
    touchStartRef.current = null;
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="flex h-screen w-screen overflow-hidden bg-background text-foreground flex-col md:flex-row"
    >
      {/* Mobile Top Navigation Bar */}
      <header className="md:hidden h-14 border-b border-border bg-card px-4 flex items-center justify-between shrink-0 z-30">
        <div
          className="flex items-center gap-2.5 cursor-pointer"
          onClick={() => {
            setSelectedDatabaseId(null);
            setCurrentTab('databases');
            closeMobileMenu();
          }}
        >
          <div className="w-7 h-7 flex items-center justify-center shrink-0">
            <LogoIcon className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-1">
              <span className="font-semibold text-xs tracking-tight block">VanillaDatabase</span>
              <span className="text-[8px] px-1 py-0.2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded font-mono font-bold">v1.3.2</span>
            </div>
            <span className="text-[9px] text-muted-foreground block -mt-0.5">SQLite Cloud</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setSelectedDatabaseId(null);
              setCurrentTab('inbox');
            }}
            className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground relative"
            title={t('nav.inbox', 'Inbox')}
          >
            <Mail className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-background" />
            )}
          </button>
          {onOpenSearch && (
            <button
              onClick={onOpenSearch}
              className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
              title="Search (Ctrl+K)"
            >
              <Search className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={closeMobileMenu}
        />
      )}

      {/* Sidebar (Responsive Drawer on Mobile, Fixed Sidebar on Desktop) */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 bg-card border-r border-border flex flex-col justify-between select-none transition-all duration-200 ease-in-out md:static md:translate-x-0 shrink-0',
          isMobileMenuOpen ? 'translate-x-0 shadow-2xl w-72' : '-translate-x-full',
          isSidebarCollapsed ? 'md:w-16' : 'md:w-64'
        )}
      >
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          {/* Brand Header */}
          <div className={cn(
            'h-14 border-b border-border flex items-center shrink-0 px-3',
            isSidebarCollapsed ? 'justify-center' : 'justify-between'
          )}>
            <div
              className={cn(
                'flex items-center gap-2.5 cursor-pointer min-w-0',
                isSidebarCollapsed ? 'justify-center' : ''
              )}
              onClick={() => {
                setSelectedDatabaseId(null);
                setCurrentTab('databases');
                closeMobileMenu();
              }}
              title="VanillaDatabase"
            >
              <div className="w-8 h-8 flex items-center justify-center shrink-0">
                <LogoIcon className="w-8 h-8" />
              </div>
              {!isSidebarCollapsed && (
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm tracking-tight block truncate">VanillaDatabase</span>
                    <span className="text-[9px] px-1 py-0.2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded font-mono font-bold">v1.3.2</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground block -mt-0.5">SQLite Platform</span>
                </div>
              )}
            </div>

            {/* Desktop Collapse Toggle Button */}
            {onToggleSidebar && !isSidebarCollapsed && (
              <button
                onClick={onToggleSidebar}
                className="hidden md:flex p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                title={`${language === 'vi' ? 'Thu gọn thanh bên' : 'Collapse Sidebar'} (Ctrl+\\)`}
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}

            {/* Mobile close button */}
            <button
              onClick={closeMobileMenu}
              className="p-1 hover:bg-accent rounded text-muted-foreground md:hidden"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Collapsed Expand Toggle Button */}
          {onToggleSidebar && isSidebarCollapsed && (
            <div className="hidden md:flex justify-center p-2 border-b border-border/50">
              <button
                onClick={onToggleSidebar}
                className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                title={`${language === 'vi' ? 'Mở rộng thanh bên' : 'Expand Sidebar'} (Ctrl+\\)`}
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* If a Database is selected -> Show Database-scoped Sidebar Menu */}
          {selectedDatabaseId ? (
            <div className="p-2 space-y-3">
              {/* Back to all databases button */}
              <button
                onClick={() => {
                  setSelectedDatabaseId(null);
                  closeMobileMenu();
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors font-medium',
                  isSidebarCollapsed ? 'justify-center px-0' : ''
                )}
                title={t('nav.allDatabases', 'All Databases')}
              >
                <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                {!isSidebarCollapsed && <span>{t('nav.allDatabases', 'All Databases')}</span>}
              </button>

              {/* Active Database Badge */}
              <div
                className={cn(
                  'bg-muted/60 border border-border rounded-lg',
                  isSidebarCollapsed ? 'p-2 flex justify-center' : 'px-2.5 py-2'
                )}
                title={`Active DB: ${selectedDatabaseId}`}
              >
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-500 shrink-0" />
                  {!isSidebarCollapsed && (
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold truncate block text-foreground">
                        {selectedDatabaseId}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Database Context Navigation Tabs */}
              <div className="space-y-1">
                {!isSidebarCollapsed && (
                  <span className="px-2.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase block mb-1">
                    {t('nav.menu', 'Database Menu')}
                  </span>
                )}
                {[
                  { id: 'overview', label: t('db.overview', 'Overview & Stats'), icon: BarChart3 },
                  { id: 'analytics', label: t('db.analytics', 'Requests & Disk B-Tree'), icon: TrendingUp },
                  { id: 'tables', label: t('db.tables', 'Tables Browser'), icon: TableIcon },
                  { id: 'editor', label: t('db.editor', 'SQL Editor'), icon: Terminal },
                  { id: 'schema', label: t('db.schema', 'Schema Viewer'), icon: FileCode },
                  { id: 'storage', label: t('db.storage', 'Media Storage'), icon: Folder },
                  { id: 'import-export', label: t('db.importExport', 'Import & Export'), icon: ArrowUpDown },
                  { id: 'realtime', label: t('db.realtime', 'Realtime Stream'), icon: Radio },
                  { id: 'webhooks', label: t('db.webhooks', 'Webhooks'), icon: WebhookIcon },
                  { id: 'api', label: t('db.api', 'API & Quickstart'), icon: Key },
                  { id: 'tokens', label: t('db.tokens', 'API Tokens'), icon: Shield },
                  { id: 'jobs', label: t('db.jobs', 'Scheduled Jobs'), icon: Clock },
                  { id: 'backups', label: t('db.backups', 'Backups'), icon: Archive },
                  { id: 'members', label: t('db.members', 'Members & Collaboration'), icon: Users },
                  { id: 'settings', label: t('db.settings', 'Danger Settings'), icon: Sliders },
                ].map((item) => {
                  const Icon = item.icon;
                  const active = selectedDatabaseTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setSelectedDatabaseId(selectedDatabaseId, item.id);
                        closeMobileMenu();
                      }}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-md font-medium transition-colors',
                        active
                          ? 'bg-blue-600 text-white font-semibold shadow-sm'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        isSidebarCollapsed ? 'justify-center px-0' : ''
                      )}
                      title={item.label}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {!isSidebarCollapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Global Main Navigation Links */
            <div className="p-2 space-y-1">
              <button
                onClick={() => {
                  setSelectedDatabaseId(null);
                  setCurrentTab('overview');
                  closeMobileMenu();
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-md font-medium transition-colors',
                  currentTab === 'overview'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  isSidebarCollapsed ? 'justify-center px-0' : ''
                )}
                title={user?.role === 'user' ? t('nav.userDashboard', 'User Dashboard') : t('nav.overview', 'Overview')}
              >
                {user?.role === 'user' ? (
                  <LayoutDashboard className="w-4 h-4 shrink-0" />
                ) : (
                  <Server className="w-4 h-4 shrink-0" />
                )}
                {!isSidebarCollapsed && (
                  <span>{user?.role === 'user' ? t('nav.userDashboard', 'User Dashboard') : t('nav.overview', 'Overview')}</span>
                )}
              </button>

              {(user?.role === 'super_admin' || user?.role === 'admin') && (
                <button
                  onClick={() => {
                    setSelectedDatabaseId(null);
                    setCurrentTab('telemetry');
                    closeMobileMenu();
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-md font-medium transition-colors',
                    currentTab === 'telemetry'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    isSidebarCollapsed ? 'justify-center px-0' : ''
                  )}
                  title={t('nav.telemetry', 'Live Telemetry')}
                >
                  <TrendingUp className="w-4 h-4 shrink-0" />
                  {!isSidebarCollapsed && <span>{t('nav.telemetry', 'Live Telemetry')}</span>}
                </button>
              )}

              <button
                onClick={() => {
                  setSelectedDatabaseId(null);
                  setCurrentTab('inbox');
                  closeMobileMenu();
                }}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 text-xs rounded-md font-medium transition-colors',
                  currentTab === 'inbox'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  isSidebarCollapsed ? 'justify-center px-0' : ''
                )}
                title={t('nav.inbox', 'Inbox')}
              >
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4 shrink-0" />
                  {!isSidebarCollapsed && <span>{t('nav.inbox', 'Inbox')}</span>}
                </div>
                {unreadCount > 0 && (
                  <span className={cn(
                    'font-bold bg-red-500 text-white rounded-full flex items-center justify-center',
                    isSidebarCollapsed ? 'w-2 h-2 absolute top-1 right-1' : 'px-1.5 py-0.2 text-[10px]'
                  )}>
                    {!isSidebarCollapsed && unreadCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setSelectedDatabaseId(null);
                  setCurrentTab('databases');
                  closeMobileMenu();
                }}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 text-xs rounded-md font-medium transition-colors',
                  currentTab === 'databases'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  isSidebarCollapsed ? 'justify-center px-0' : ''
                )}
                title={t('nav.databases', 'Databases')}
              >
                <div className="flex items-center gap-2.5">
                  <Layers className="w-4 h-4 shrink-0" />
                  {!isSidebarCollapsed && <span>{t('nav.databases', 'Databases')}</span>}
                </div>
                {!isSidebarCollapsed && (
                  <Plus
                    className="w-3.5 h-3.5 hover:text-white cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCreateDb();
                      closeMobileMenu();
                    }}
                  />
                )}
              </button>

              <button
                onClick={() => {
                  setSelectedDatabaseId(null);
                  setCurrentTab('activity');
                  closeMobileMenu();
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-md font-medium transition-colors',
                  currentTab === 'activity'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  isSidebarCollapsed ? 'justify-center px-0' : ''
                )}
                title={t('nav.activity', 'Activity Logs')}
              >
                <Activity className="w-4 h-4 shrink-0" />
                {!isSidebarCollapsed && <span>{t('nav.activity', 'Activity Logs')}</span>}
              </button>

              {(user?.role === 'super_admin' || user?.role === 'admin') && (
                <button
                  onClick={() => {
                    setSelectedDatabaseId(null);
                    setCurrentTab('users');
                    closeMobileMenu();
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-md font-medium transition-colors',
                    currentTab === 'users'
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    isSidebarCollapsed ? 'justify-center px-0' : ''
                  )}
                  title={t('nav.users', 'User Management')}
                >
                  <Users className="w-4 h-4 shrink-0" />
                  {!isSidebarCollapsed && <span>{t('nav.users', 'User Management')}</span>}
                </button>
              )}

              <button
                onClick={() => {
                  setSelectedDatabaseId(null);
                  setCurrentTab('settings');
                  closeMobileMenu();
                }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-md font-medium transition-colors',
                  currentTab === 'settings'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  isSidebarCollapsed ? 'justify-center px-0' : ''
                )}
                title={t('nav.settings', 'Settings')}
              >
                <Settings className="w-4 h-4 shrink-0" />
                {!isSidebarCollapsed && <span>{t('nav.settings', 'Settings')}</span>}
              </button>

              <button
                onClick={() => {
                  setSelectedDatabaseId(null);
                  setCurrentTab('shortcuts');
                  closeMobileMenu();
                }}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 text-xs rounded-md font-medium transition-colors',
                  currentTab === 'shortcuts'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  isSidebarCollapsed ? 'justify-center px-0' : ''
                )}
                title={`${t('nav.shortcuts', 'Shortcuts')} (Shift+?)`}
              >
                <div className="flex items-center gap-2.5">
                  <Terminal className="w-4 h-4 shrink-0" />
                  {!isSidebarCollapsed && <span>{t('nav.shortcuts', 'Shortcuts')}</span>}
                </div>
                {!isSidebarCollapsed && (
                  <kbd className="px-1.5 py-0.2 text-[9px] font-mono bg-muted/80 border border-border/80 rounded text-muted-foreground font-bold">
                    Shift+?
                  </kbd>
                )}
              </button>
            </div>
          )}
        </div>

        {/* User and Theme Footer */}
        <div className="p-2 border-t border-border space-y-2 shrink-0 bg-card">
          <div className={cn(
            'flex items-center justify-between text-xs text-muted-foreground',
            isSidebarCollapsed ? 'flex-col gap-2 py-1' : 'px-2 py-1'
          )}>
            <button
              onClick={() => {
                setSelectedDatabaseId(null);
                setCurrentTab('settings');
                closeMobileMenu();
              }}
              className={cn(
                'flex items-center gap-2 min-w-0 hover:text-foreground text-left cursor-pointer transition-colors group',
                isSidebarCollapsed ? 'justify-center' : 'flex-1'
              )}
              title={`${user?.username || 'Account'} (${user?.role || 'user'})`}
            >
              <div className="w-7 h-7 rounded-full overflow-hidden border border-border group-hover:border-blue-500 bg-muted/50 flex items-center justify-center shrink-0 transition-colors">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                )}
              </div>
              {!isSidebarCollapsed && (
                <div className="truncate">
                  <span className="truncate font-medium text-foreground block group-hover:text-blue-500 transition-colors">{user?.username}</span>
                  <span className="text-[10px] text-muted-foreground block capitalize">{user?.role || 'user'}</span>
                </div>
              )}
            </button>

            <div className={cn('flex items-center gap-1 shrink-0', isSidebarCollapsed ? 'flex-col' : 'ml-1')}>
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
                title={t('shortcuts.toggleTheme', 'Switch light / dark theme')}
              >
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={logout}
                className="p-1 hover:bg-red-500/10 hover:text-red-500 rounded text-muted-foreground"
                title={t('auth.signOut', 'Sign Out')}
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
};
