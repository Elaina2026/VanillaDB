import React, { useState } from 'react';
import { Database, Plus, Search, Layers, Server, Activity, Shield, Terminal, HardDrive, Settings, LogOut, Sun, Moon, Laptop, ChevronRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { useTheme } from '../hooks/useTheme.js';
import { cn } from '../lib/utils.js';

interface DashboardLayoutProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  selectedDatabaseId: string | null;
  setSelectedDatabaseId: (id: string | null) => void;
  children: React.ReactNode;
  onOpenCreateDb: () => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  currentTab,
  setCurrentTab,
  selectedDatabaseId,
  setSelectedDatabaseId,
  children,
  onOpenCreateDb,
}) => {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border flex flex-col justify-between bg-card shrink-0">
        <div>
          {/* Brand Header */}
          <div className="h-14 border-b border-border flex items-center justify-between px-4">
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => {
                setSelectedDatabaseId(null);
                setCurrentTab('databases');
              }}
            >
              <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-900 border border-slate-700/50 flex items-center justify-center shrink-0">
                <img src="/src/web/assets/logo.svg" alt="VanillaDatabase" className="w-6 h-6 object-contain" />
              </div>
              <div>
                <span className="font-semibold text-sm tracking-tight block">VanillaDatabase</span>
                <span className="text-[10px] text-muted-foreground block -mt-1">SQLite Platform</span>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="p-3 space-y-1">
            <button
              onClick={() => {
                setSelectedDatabaseId(null);
                setCurrentTab('overview');
              }}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-md font-medium transition-colors',
                !selectedDatabaseId && currentTab === 'overview'
                  ? 'bg-blue-600 text-white'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Server className="w-4 h-4" />
              Overview
            </button>

            <button
              onClick={() => {
                setSelectedDatabaseId(null);
                setCurrentTab('databases');
              }}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 text-xs rounded-md font-medium transition-colors',
                !selectedDatabaseId && currentTab === 'databases'
                  ? 'bg-blue-600 text-white'
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
                }}
              />
            </button>

            <button
              onClick={() => {
                setSelectedDatabaseId(null);
                setCurrentTab('activity');
              }}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-md font-medium transition-colors',
                !selectedDatabaseId && currentTab === 'activity'
                  ? 'bg-blue-600 text-white'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Activity className="w-4 h-4" />
              Activity Logs
            </button>

            <button
              onClick={() => {
                setSelectedDatabaseId(null);
                setCurrentTab('settings');
              }}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-md font-medium transition-colors',
                !selectedDatabaseId && currentTab === 'settings'
                  ? 'bg-blue-600 text-white'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>
        </div>

        {/* User and Theme Footer */}
        <div className="p-3 border-t border-border space-y-2">
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
