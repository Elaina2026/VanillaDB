import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth.js';
import { AuthPage } from './pages/AuthPage.js';
import { ErrorPage } from './pages/ErrorPage.js';
import { DashboardLayout } from './layouts/DashboardLayout.js';
import { OverviewPage } from './pages/OverviewPage.js';
import { UserDashboardPage } from './pages/UserDashboardPage.js';
import { TelemetryPage } from './pages/TelemetryPage.js';
import { UsersPage } from './pages/UsersPage.js';
import { DatabasesPage } from './pages/DatabasesPage.js';
import { DatabaseDetailPage } from './pages/DatabaseDetailPage.js';
import { ActivityPage } from './pages/ActivityPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { ShortcutsPage } from './pages/ShortcutsPage.js';
import { CreateDatabaseModal } from './components/CreateDatabaseModal.js';
import { CreateTokenModal } from './components/CreateTokenModal.js';
import { CommandPalette } from './components/CommandPalette.js';
import { useI18n } from './hooks/useI18n.js';
import { useTheme } from './hooks/useTheme.js';

export const App: React.FC = () => {
  const { authenticated, isLoading, isOffline, refetchStatus, user } = useAuth();
  const { language, toggleLanguage } = useI18n();
  const { theme, setTheme, toggleTheme } = useTheme();

  // URL Hash routing: #/overview, #/telemetry, #/users, #/databases, #/databases/:id, #/databases/:id/:tab, #/activity, #/settings
  // Auth sub-routes: #/login, #/register, #/reset-password
  const parseHash = () => {
    const raw = window.location.hash.replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    const first = parts[0] || '';

    if (parts[0] === 'databases' && parts[1]) {
      return {
        tab: 'databases',
        databaseId: parts[1],
        dbTab: parts[2] || 'overview',
        authSubRoute: null,
      };
    }

    if (['login', 'register', 'reset-password'].includes(first)) {
      return {
        tab: 'overview',
        databaseId: null,
        dbTab: 'overview',
        authSubRoute: first as 'login' | 'register' | 'reset-password',
      };
    }

    return {
      tab: first || 'overview',
      databaseId: null,
      dbTab: 'overview',
      authSubRoute: null,
    };
  };

  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHash());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // When authenticated, if URL hash is still #/login, #/register, or #/reset-password, redirect to #/overview
  useEffect(() => {
    if (authenticated && route.authSubRoute) {
      window.location.hash = '/overview';
    }
  }, [authenticated, route.authSubRoute]);

  const navigateTo = (tab: string, dbId: string | null = null, dbTab: string = 'overview') => {
    if (dbId) {
      window.location.hash = `/databases/${dbId}/${dbTab}`;
    } else {
      window.location.hash = `/${tab}`;
    }
  };

  // Modals & Command Palette
  const [isCreateDbOpen, setIsCreateDbOpen] = useState(false);
  const [createTokenDbId, setCreateTokenDbId] = useState<string | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Global Keyboard Shortcuts listener (Ctrl + K, Ctrl + B, Ctrl + Shift + L, Shift + ?, Esc, etc.)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);

      // Open Command Palette: Ctrl + K / Cmd + K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Create new Database: Ctrl + B / Cmd + B
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsCreateDbOpen(true);
        return;
      }

      // Toggle Language: Ctrl + Shift + L
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'L' || e.key === 'l' || e.code === 'KeyL')) {
        e.preventDefault();
        toggleLanguage();
        return;
      }

      // Toggle Theme: Alt + T or Ctrl + Shift + T
      if ((e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 't' || e.key === 'T' || e.code === 'KeyT')) ||
          ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'T' || e.key === 't' || e.code === 'KeyT'))) {
        e.preventDefault();
        toggleTheme();
        return;
      }

      // Jump to Shortcuts Reference: Shift + ? or '?'
      if ((e.key === '?' || (e.shiftKey && e.code === 'Slash')) && !isInput) {
        e.preventDefault();
        navigateTo('shortcuts');
        return;
      }

      // Fast Navigation (when not typing in an input):
      // Alt + 1: Overview, Alt + 2: Live Telemetry, Alt + 3: Databases, Alt + 4: Activity Logs, Alt + 5: Users, Alt + 6: Settings
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === '1' || e.code === 'Digit1') { e.preventDefault(); navigateTo('overview'); return; }
        if (e.key === '2' || e.code === 'Digit2') { e.preventDefault(); navigateTo('telemetry'); return; }
        if (e.key === '3' || e.code === 'Digit3') { e.preventDefault(); navigateTo('databases'); return; }
        if (e.key === '4' || e.code === 'Digit4') { e.preventDefault(); navigateTo('activity'); return; }
        if (e.key === '5' || e.code === 'Digit5') { e.preventDefault(); navigateTo('users'); return; }
        if (e.key === '6' || e.code === 'Digit6') { e.preventDefault(); navigateTo('settings'); return; }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [language, theme]);

  if (isOffline) {
    return <ErrorPage type="offline" onRetry={refetchStatus} />;
  }

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-muted-foreground text-xs font-mono">
        Loading VanillaDatabase...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <AuthPage
        initialMode={route.authSubRoute === 'reset-password' ? 'reset-password' : route.authSubRoute === 'register' ? 'register' : 'login'}
        onNavigate={(subRoute) => navigateTo(subRoute)}
      />
    );
  }

  const validTabs = ['overview', 'telemetry', 'users', 'databases', 'activity', 'settings', 'shortcuts'];
  const isInvalidTab = !route.databaseId && !validTabs.includes(route.tab);

  if (isInvalidTab) {
    return <ErrorPage type="404" onGoHome={() => navigateTo('overview')} />;
  }

  return (
    <DashboardLayout
      currentTab={route.tab}
      setCurrentTab={(tab) => navigateTo(tab)}
      selectedDatabaseId={route.databaseId}
      selectedDatabaseTab={route.dbTab}
      setSelectedDatabaseId={(id, tab = 'overview') => (id ? navigateTo('databases', id, tab) : navigateTo('databases'))}
      onOpenCreateDb={() => setIsCreateDbOpen(true)}
      onOpenSearch={() => setIsCommandPaletteOpen(true)}
    >
      {route.databaseId ? (
        <DatabaseDetailPage
          databaseId={route.databaseId}
          initialTab={route.dbTab as any}
          onTabChange={(newTab) => navigateTo('databases', route.databaseId, newTab)}
          onBack={() => navigateTo('databases')}
          onOpenCreateToken={(dbId) => setCreateTokenDbId(dbId)}
        />
      ) : route.tab === 'overview' ? (
        user?.role === 'user' ? (
          <UserDashboardPage
            onSelectDatabase={(id) => navigateTo('databases', id)}
            onOpenCreateModal={() => setIsCreateDbOpen(true)}
          />
        ) : (
          <OverviewPage
            onSelectDatabase={(id) => navigateTo('databases', id)}
            onOpenCreateModal={() => setIsCreateDbOpen(true)}
            onNavigateToTelemetry={() => navigateTo('telemetry')}
          />
        )
      ) : route.tab === 'telemetry' ? (
        <TelemetryPage />
      ) : route.tab === 'users' ? (
        <UsersPage />
      ) : route.tab === 'databases' ? (
        <DatabasesPage
          onSelectDatabase={(id) => navigateTo('databases', id)}
          onOpenCreateModal={() => setIsCreateDbOpen(true)}
        />
      ) : route.tab === 'activity' ? (
        <ActivityPage />
      ) : route.tab === 'settings' ? (
        <SettingsPage />
      ) : route.tab === 'shortcuts' ? (
        <ShortcutsPage
          onNavigate={(t, id) => navigateTo(t, id)}
          onOpenCreateDb={() => setIsCreateDbOpen(true)}
        />
      ) : (
        user?.role === 'user' ? (
          <UserDashboardPage
            onSelectDatabase={(id) => navigateTo('databases', id)}
            onOpenCreateModal={() => setIsCreateDbOpen(true)}
          />
        ) : (
          <OverviewPage
            onSelectDatabase={(id) => navigateTo('databases', id)}
            onOpenCreateModal={() => setIsCreateDbOpen(true)}
            onNavigateToTelemetry={() => navigateTo('telemetry')}
          />
        )
      )}

      {/* Modals */}
      <CreateDatabaseModal
        isOpen={isCreateDbOpen}
        onClose={() => setIsCreateDbOpen(false)}
        onSuccess={(db) => {
          navigateTo('databases', db.id, 'overview');
        }}
      />

      <CreateTokenModal
        isOpen={!!createTokenDbId}
        databaseId={createTokenDbId}
        onClose={() => setCreateTokenDbId(null)}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(tab, dbId, dbTab) => navigateTo(tab, dbId, dbTab)}
        onOpenCreateDb={() => setIsCreateDbOpen(true)}
      />
    </DashboardLayout>
  );
};
