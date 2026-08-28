import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth.js';
import { AuthPage } from './pages/AuthPage.js';
import { DashboardLayout } from './layouts/DashboardLayout.js';
import { OverviewPage } from './pages/OverviewPage.js';
import { DatabasesPage } from './pages/DatabasesPage.js';
import { DatabaseDetailPage } from './pages/DatabaseDetailPage.js';
import { ActivityPage } from './pages/ActivityPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { CreateDatabaseModal } from './components/CreateDatabaseModal.js';
import { CreateTokenModal } from './components/CreateTokenModal.js';

export const App: React.FC = () => {
  const { authenticated, isLoading } = useAuth();

  // URL Hash routing: #/overview, #/databases, #/databases/:id, #/databases/:id/:tab, #/activity, #/settings
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

  // Modals
  const [isCreateDbOpen, setIsCreateDbOpen] = useState(false);
  const [createTokenDbId, setCreateTokenDbId] = useState<string | null>(null);

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
        />
      ) : route.tab === 'databases' ? (
        <DatabasesPage
          onSelectDatabase={(id) => navigateTo('databases', id)}
          onOpenCreateModal={() => setIsCreateDbOpen(true)}
        />
      ) : route.tab === 'activity' ? (
        <ActivityPage />
      ) : route.tab === 'settings' ? (
        <SettingsPage />
      ) : (
        <OverviewPage
          onSelectDatabase={(id) => navigateTo('databases', id)}
          onOpenCreateModal={() => setIsCreateDbOpen(true)}
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
    </DashboardLayout>
  );
};
