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
  X
} from 'lucide-react';
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
}) => {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);

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
            onClick={onOpenSearch}
            className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
            title="Search (Ctrl+K)"
          >
            <Search className="w-4 h-4" />
          </button>
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
          'fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border flex flex-col justify-between select-none transition-transform duration-200 ease-in-out md:static md:w-64 md:translate-x-0 shrink-0',
          isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        )}
      >
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          {/* Brand Header */}
          <div className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0">
            <div
              className="flex items-center gap-2.5 cursor-pointer"
              onClick={() => {
                setSelectedDatabaseId(null);
                setCurrentTab('databases');
                closeMobileMenu();
              }}
            >
              <div className="w-8 h-8 flex items-center justify-center shrink-0">
                <LogoIcon className="w-8 h-8" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm tracking-tight block">VanillaDatabase</span>
                  <span className="text-[9px] px-1 py-0.2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded font-mono font-bold">v1.3.2</span>
                </div>
                <span className="text-[10px] text-muted-foreground block -mt-0.5">SQLite Platform</span>
              </div>
            </div>
            <button
              onClick={closeMobileMenu}
              className="p-1 hover:bg-accent rounded text-muted-foreground md:hidden"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* If a Database is selected -> Show Database-scoped Sidebar Menu */}
          {selectedDatabaseId ? (
            <div className="p-3 space-y-4">
              {/* Back to all databases button */}
              <button
                onClick={() => {
                  setSelectedDatabaseId(null);
                  closeMobileMenu();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t('nav.allDatabases', 'All Databases')}</span>
              </button>

              {/* Active Database Badge */}
              <div className="px-2.5 py-2 bg-muted/60 border border-border rounded-lg">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold truncate block text-foreground">
                      {selectedDatabaseId}
                    </span>
                  </div>
                </div>
              </div>

              {/* Database Context Navigation Tabs */}
              <div className="space-y-1">
                <span className="px-2.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {t('nav.menu', 'Database Menu')}
                </span>
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
                  { id: 'settings', label: t('db.settings', 'Danger Settings'), icon: Sliders },
                ].map((t) => {
                  const Icon = t.icon;
                  const active = selectedDatabaseTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        setSelectedDatabaseId(selectedDatabaseId, t.id);
                        closeMobileMenu();
                      }}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-md font-medium transition-colors',
                        active
                          ? 'bg-blue-600 text-white font-semibold shadow-sm'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Global Main Navigation Links */
            <div className="p-3 space-y-1">
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
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Server className="w-4 h-4" />
                {t('nav.overview', 'Overview')}
              </button>

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
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <TrendingUp className="w-4 h-4" />
                {t('nav.telemetry', 'Live Telemetry')}
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
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Layers className="w-4 h-4" />
                  {t('nav.databases', 'Databases')}
                </div>
                <Plus
                  className="w-3.5 h-3.5 hover:text-white cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenCreateDb();
                    closeMobileMenu();
                  }}
                />
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
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Activity className="w-4 h-4" />
                {t('nav.activity', 'Activity Logs')}
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
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <Users className="w-4 h-4" />
                  {t('nav.users', 'User Management')}
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
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Settings className="w-4 h-4" />
                {t('nav.settings', 'Settings')}
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
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <Terminal className="w-4 h-4" />
                  {t('nav.shortcuts', 'Shortcuts')}
                </div>
                <kbd className="px-1.5 py-0.2 text-[9px] font-mono bg-muted/80 border border-border/80 rounded text-muted-foreground font-bold">
                  Shift+?
                </kbd>
              </button>
            </div>
          )}
        </div>

        {/* User and Theme Footer */}
        <div className="p-3 border-t border-border space-y-2 shrink-0 bg-card">
          <div className="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground">
            <span className="truncate font-medium">{user?.username}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
                title="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={logout}
                className="p-1 hover:bg-red-500/10 hover:text-red-500 rounded text-muted-foreground"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Universal Top Header with Quick Search (Ctrl + K) on every route */}
        <div className="hidden md:flex h-12 border-b border-border bg-card/60 backdrop-blur-sm px-4 items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <button
              onClick={onOpenSearch}
              className="w-full max-w-md flex items-center justify-between px-3 py-1.5 bg-background hover:bg-muted/60 border border-border rounded-lg text-xs text-muted-foreground transition-all group cursor-pointer shadow-xs hover:border-blue-500/40"
              title="Quick Search (Ctrl + K)"
            >
              <div className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-muted-foreground group-hover:text-blue-500 transition-colors" />
                <span className="font-sans">{t('nav.search', 'Quick search (Ctrl + K)')}</span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-muted border border-border rounded text-muted-foreground group-hover:text-foreground">
                  Ctrl
                </kbd>
                <kbd className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-muted border border-border rounded text-muted-foreground group-hover:text-foreground">
                  K
                </kbd>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-colors border border-border bg-card"
              title="Toggle theme (Light / Dark)"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
};
