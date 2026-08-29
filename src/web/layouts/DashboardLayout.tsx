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
  Users,
  Menu,
  X
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { useTheme } from '../hooks/useTheme.js';
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
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  currentTab,
  setCurrentTab,
  selectedDatabaseId,
  selectedDatabaseTab = 'overview',
  setSelectedDatabaseId,
  children,
  onOpenCreateDb,
}) => {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground flex-col md:flex-row">
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
            <span className="font-semibold text-xs tracking-tight block">VanillaDatabase</span>
            <span className="text-[9px] text-muted-foreground block -mt-0.5">SQLite Cloud</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
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
                <span className="font-semibold text-sm tracking-tight block">VanillaDatabase</span>
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
                <span>All Databases</span>
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
                  Database Menu
                </span>
                {[
                  { id: 'overview', label: 'Overview & Stats', icon: BarChart3 },
                  { id: 'analytics', label: 'Requests & Disk B-Tree', icon: TrendingUp },
                  { id: 'tables', label: 'Tables Browser', icon: TableIcon },
                  { id: 'editor', label: 'SQL Editor', icon: Terminal },
                  { id: 'schema', label: 'Schema Viewer', icon: FileCode },
                  { id: 'storage', label: 'Media Storage', icon: Folder },
                  { id: 'import-export', label: 'Import & Export', icon: ArrowUpDown },
                  { id: 'realtime', label: 'Realtime Stream', icon: Radio },
                  { id: 'webhooks', label: 'Webhooks', icon: WebhookIcon },
                  { id: 'api', label: 'API & Quickstart', icon: Key },
                  { id: 'tokens', label: 'API Tokens', icon: Shield },
                  { id: 'backups', label: 'Backups', icon: Archive },
                  { id: 'settings', label: 'Danger Settings', icon: Sliders },
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
                Overview
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
                Live Telemetry
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
                  Databases
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
                Activity Logs
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
                  User Management
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
                Settings
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
        {children}
      </main>
    </div>
  );
};
