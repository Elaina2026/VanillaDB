import React, { useState, useEffect, useRef } from 'react';
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
import { InboxPage } from './pages/InboxPage.js';
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

  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const adminOnlyTabs = ['telemetry', 'users'];

  // Guard admin-only routes against unprivileged users
  useEffect(() => {
    if (authenticated && !isAdmin && adminOnlyTabs.includes(route.tab)) {
      window.location.hash = '/overview';
    }
  }, [authenticated, isAdmin, route.tab]);

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

  // Desktop Sidebar Collapse state (persisted)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('vdb_sidebar_collapsed') === 'true';
  });

  // Vim-style chord reference (e.g. G then D, G then I)
  const chordRef = useRef<{ key: string; time: number } | null>(null);

  // Global Keyboard Shortcuts listener (Ctrl + K, Ctrl + B, Ctrl + \, Shift + ?, Vim chords, Alt + 1..8, etc.)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Modals & Command Palette & Sidebar toggle (Always active)
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

      // Sidebar Collapse toggle: Ctrl + \
      if ((e.ctrlKey || e.metaKey) && (e.key === '\\' || e.code === 'Backslash')) {
        e.preventDefault();
        setIsSidebarCollapsed((prev) => {
          const next = !prev;
          localStorage.setItem('vdb_sidebar_collapsed', String(next));
          return next;
        });
        return;
      }

      // 2. Input / Editable element and modal dialog detection
      const target = e.target as HTMLElement | null;
      const isInput = Boolean(
        target && (
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.isContentEditable ||
          Boolean(target.closest?.('.monaco-editor, [role="textbox"]'))
        )
      );
      const isModalOpen =
        isCreateDbOpen ||
        isCommandPaletteOpen ||
        Boolean(createTokenDbId) ||
        Boolean(document.querySelector('[role="dialog"], [aria-modal="true"]'));

      // Do not trigger general navigation or vim chords when actively typing or modal is open
      if (isInput || isModalOpen) {
        chordRef.current = null;
        return;
      }

      // 3. Vim Chords handling: G then D (Databases), G then I (Inbox)
      const now = Date.now();
      if (chordRef.current && chordRef.current.key === 'g' && now - chordRef.current.time < 1200) {
        const secondKey = e.key.toLowerCase();
        chordRef.current = null;
        if (secondKey === 'd') {
          e.preventDefault();
          navigateTo('databases');
          return;
        }
        if (secondKey === 'i') {
          e.preventDefault();
          navigateTo('inbox');
          return;
        }
      }

      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'g') {
        chordRef.current = { key: 'g', time: now };
        return;
      } else {
        chordRef.current = null;
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
      if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
        e.preventDefault();
        navigateTo('shortcuts');
        return;
      }

      // Fast Navigation (Alt + 1..8) - Role-Aware (User vs Admin)
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const key = e.key;
        const code = e.code;

        const is1 = key === '1' || code === 'Digit1' || code === 'Numpad1';
        const is2 = key === '2' || code === 'Digit2' || code === 'Numpad2';
        const is3 = key === '3' || code === 'Digit3' || code === 'Numpad3';
        const is4 = key === '4' || code === 'Digit4' || code === 'Numpad4';
        const is5 = key === '5' || code === 'Digit5' || code === 'Numpad5';
        const is6 = key === '6' || code === 'Digit6' || code === 'Numpad6';
        const is7 = key === '7' || code === 'Digit7' || code === 'Numpad7';
        const is8 = key === '8' || code === 'Digit8' || code === 'Numpad8';

        const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

        if (isAdmin) {
          if (is1) { e.preventDefault(); navigateTo('overview'); return; }
          if (is2) { e.preventDefault(); navigateTo('telemetry'); return; }
          if (is3) { e.preventDefault(); navigateTo('databases'); return; }
          if (is4) { e.preventDefault(); navigateTo('activity'); return; }
          if (is5) { e.preventDefault(); navigateTo('users'); return; }
          if (is6) { e.preventDefault(); navigateTo('settings'); return; }
          if (is7) { e.preventDefault(); navigateTo('inbox'); return; }
          if (is8) { e.preventDefault(); navigateTo('shortcuts'); return; }
        } else {
          if (is1) { e.preventDefault(); navigateTo('overview'); return; }
          if (is2) { e.preventDefault(); navigateTo('inbox'); return; }
          if (is3) { e.preventDefault(); navigateTo('databases'); return; }
          if (is4) { e.preventDefault(); navigateTo('activity'); return; }
          if (is5) { e.preventDefault(); navigateTo('settings'); return; }
          if (is6) { e.preventDefault(); navigateTo('shortcuts'); return; }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [language, theme, user, isCreateDbOpen, isCommandPaletteOpen, createTokenDbId]);

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

  const validTabs = ['overview', 'telemetry', 'users', 'databases', 'activity', 'settings', 'shortcuts', 'inbox'];
  const isUnauthorizedTab = !isAdmin && adminOnlyTabs.includes(route.tab);
  const isInvalidTab = (!route.databaseId && !validTabs.includes(route.tab)) || isUnauthorizedTab;

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
      isSidebarCollapsed={isSidebarCollapsed}
      onToggleSidebar={() =>
        setIsSidebarCollapsed((prev) => {
          const next = !prev;
          localStorage.setItem('vdb_sidebar_collapsed', String(next));
          return next;
        })
      }
    >
      {route.databaseId ? (
        <DatabaseDetailPage
          databaseId={route.databaseId}
          initialTab={route.dbTab as any}
          onTabChange={(newTab) => navigateTo('databases', route.databaseId, newTab)}
          onBack={() => navigateTo('databases')}
          onOpenCreateToken={(dbId) => setCreateTokenDbId(dbId)}
        />
      ) : route.tab === 'inbox' ? (
        <InboxPage onSelectDatabase={(id) => navigateTo('databases', id)} />
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
          onOpenSearch={() => setIsCommandPaletteOpen(true)}
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
