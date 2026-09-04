import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth.js';
import { AuthPage } from './pages/AuthPage.js';
import { ErrorPage } from './pages/ErrorPage.js';
import { DashboardLayout } from './layouts/DashboardLayout.js';
import { OverviewPage } from './pages/OverviewPage.js';
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

export const App: React.FC = () => {
  const { authenticated, isLoading, isOffline, refetchStatus } = useAuth();

  // URL Hash routing: #/overview, #/telemetry, #/users, #/databases, #/databases/:id, #/databases/:id/:tab, #/activity, #/settings
  const parseHash = () => {
    const hash = window.location.hash.replace(/^#\/?/, '') || 'overview';
    const parts = hash.split('/').filter(Boolean);

    if (parts[0] === 'databases' && parts[1]) {
      return {
        tab: 'databases',
        databaseId: parts[1],
        dbTab: parts[2] || 'overview',
      };
    }

    return {
      tab: parts[0] || 'overview',
      databaseId: null,
      dbTab: 'overview',
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

  // Global Keyboard Shortcuts listener (Ctrl + K, Ctrl + B, Shift + ?)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts inside text inputs or textareas unless it's Escape or Ctrl+K
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsCreateDbOpen(true);
        return;
      }

      if (e.key === '?' && e.shiftKey && !isInput) {
        e.preventDefault();
        navigateTo('shortcuts');
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

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
    return <AuthPage />;
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
        <OverviewPage
          onSelectDatabase={(id) => navigateTo('databases', id)}
          onOpenCreateModal={() => setIsCreateDbOpen(true)}
          onNavigateToTelemetry={() => navigateTo('telemetry')}
        />
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
        <OverviewPage
          onSelectDatabase={(id) => navigateTo('databases', id)}
          onOpenCreateModal={() => setIsCreateDbOpen(true)}
          onNavigateToTelemetry={() => navigateTo('telemetry')}
        />
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
