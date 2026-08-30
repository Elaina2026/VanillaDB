import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings,
  Save,
  Check,
  Server,
  Cpu,
  Archive,
  Shield,
  User,
  KeyRound,
  Sliders,
  Database,
  HardDrive,
  Activity,
  Lock,
  CheckCircle2,
  AlertCircle,
  Clock,
  Gauge,
  Bug,
  Terminal,
  FileCode,
  Zap,
  Globe,
  Radio
} from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';
import type { SystemSettings, SystemStatus } from '@shared/index.js';

export const SettingsPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'general' | 'engine' | 'backups' | 'quotas' | 'debug' | 'account'>('general');
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const { data: settings, isLoading } = useQuery<SystemSettings>({
    queryKey: ['systemSettings'],
    queryFn: () => apiRequest('/api/system/settings'),
  });

  const { data: status, refetch: refetchStatus, isFetching: isFetchingStatus } = useQuery<SystemStatus>({
    queryKey: ['systemStatus'],
    queryFn: () => apiRequest('/api/system/status'),
  });

  const [form, setForm] = useState<Partial<SystemSettings>>({});

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<SystemSettings>) =>
      apiRequest('/api/system/settings', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['systemSettings'], data);
      setSaved(true);
      setSaveError(null);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err: any) => {
      setSaveError(err.message || 'Lưu cài đặt thất bại');
      setTimeout(() => setSaveError(null), 4000);
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setPasswordStatus({ type: 'success', message: 'Đổi mật khẩu tài khoản thành công!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordStatus(null), 4000);
    },
    onError: (err: any) => {
      setPasswordStatus({ type: 'error', message: err.message || 'Đổi mật khẩu thất bại' });
    },
  });

  const current: SystemSettings = {
    instance_name: 'VanillaDatabase Primary',
    base_url: window.location.origin,
    default_journal_mode: 'wal',
    default_busy_timeout: 5000,
    default_synchronous: 'normal',
    default_foreign_keys: true,
    default_cache_size: -2000,
    default_auto_vacuum: 'none',
    backup_schedule: 'daily',
    backup_retention: 10,
    max_upload_size_mb: 50,
    default_user_rate_limit: 60,
    default_user_max_databases: 5,
    enable_query_logging: true,
    log_sql: false,
    debug_mode: false,
    log_level: 'info',
    enable_cors_all: false,
    enable_stack_traces: false,
    ...settings,
    ...form,
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    updateMutation.mutate(current);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setPasswordStatus({ type: 'error', message: 'Vui lòng nhập mật khẩu hiện tại' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordStatus({ type: 'error', message: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', message: 'Mật khẩu xác nhận không khớp' });
      return;
    }
    setPasswordStatus(null);
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  const isSuperAdminOrAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'admin';

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-xs font-mono text-muted-foreground">
        Loading System Settings...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 md:p-6 max-w-5xl mx-auto w-full space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">Configuration & Settings</h1>
            <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded font-semibold uppercase tracking-wider">
              {currentUser?.role || 'user'}
            </span>
            {current.debug_mode && (
              <span className="text-[10px] px-2 py-0.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded font-semibold uppercase tracking-wider flex items-center gap-1 animate-pulse">
                <Bug className="w-2.5 h-2.5" />
                Debug Active
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage global SQLite engine parameters, debug diagnostics, backup policies, user quotas, and account credentials.
          </p>
        </div>

        {activeTab !== 'account' && isSuperAdminOrAdmin && (
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold shadow-sm transition-colors cursor-pointer self-start sm:self-auto"
          >
            {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {saved ? 'Saved Successfully' : updateMutation.isPending ? 'Saving...' : 'Save Settings'}
          </button>
        )}
      </div>

      {/* Notifications */}
      {saved && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-lg text-xs flex items-center gap-2 animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>System configuration saved and applied successfully.</span>
        </div>
      )}

      {saveError && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-xs flex items-center gap-2 animate-in fade-in duration-150">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto pb-px">
        {[
          { id: 'general', label: 'General & Platform', icon: Server },
          { id: 'engine', label: 'SQLite Engine', icon: Cpu },
          { id: 'backups', label: 'Backups & Storage', icon: Archive },
          { id: 'quotas', label: 'User Quotas & Limits', icon: Gauge },
          { id: 'debug', label: 'Diagnostics & Debugging', icon: Bug },
          { id: 'account', label: 'My Account & Security', icon: User },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
                isActive
                  ? 'border-blue-600 text-blue-500 font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: General & Platform */}
      {activeTab === 'general' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 pb-2 border-b border-border">
              <Server className="w-4 h-4 text-blue-500" />
              Instance Identification & Public Host
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Instance Display Name</label>
                <input
                  type="text"
                  disabled={!isSuperAdminOrAdmin}
                  value={current.instance_name || ''}
                  onChange={(e) => setForm({ ...form, instance_name: e.target.value })}
                  placeholder="e.g. VanillaDatabase Production"
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 text-foreground"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Shown across header badges and audit records.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Canonical Base URL</label>
                <input
                  type="text"
                  disabled={!isSuperAdminOrAdmin}
                  value={current.base_url || ''}
                  onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                  placeholder="https://db.example.com"
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 text-foreground"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Used for webhook dispatch callbacks and SDK endpoints.</p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 pb-2 border-b border-border">
              <Activity className="w-4 h-4 text-emerald-500" />
              Telemetry & Query Audit Logging
            </h2>

            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isSuperAdminOrAdmin}
                  checked={current.enable_query_logging}
                  onChange={(e) => setForm({ ...form, enable_query_logging: e.target.checked })}
                  className="mt-0.5 rounded border-border text-blue-600 focus:ring-blue-500 bg-background"
                />
                <div>
                  <span className="text-xs font-semibold text-foreground block">Real-time Activity & Telemetry Logging</span>
                  <span className="text-[11px] text-muted-foreground block">
                    Record query execution duration, row counts, errors, and system resource metrics to activity logs.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer pt-2 border-t border-border/60">
                <input
                  type="checkbox"
                  disabled={!isSuperAdminOrAdmin}
                  checked={current.log_sql}
                  onChange={(e) => setForm({ ...form, log_sql: e.target.checked })}
                  className="mt-0.5 rounded border-border text-blue-600 focus:ring-blue-500 bg-background"
                />
                <div>
                  <span className="text-xs font-semibold text-foreground block">Verbose SQL Statement Logging</span>
                  <span className="text-[11px] text-muted-foreground block">
                    Output raw SQL statements to server stdout log (useful during development, may log sensitive values).
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SQLite Engine Defaults */}
      {activeTab === 'engine' && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-5 animate-in fade-in duration-150">
          <div className="border-b border-border pb-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-500" />
              Native SQLite Engine Pragmas & Concurrency
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              These pragmas are automatically configured when opening new SQLite database file connections.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Default Journal Mode</label>
              <select
                disabled={!isSuperAdminOrAdmin}
                value={current.default_journal_mode || 'wal'}
                onChange={(e) => setForm({ ...form, default_journal_mode: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground disabled:opacity-50"
              >
                <option value="wal">WAL (Write-Ahead Logging - Recommended for multi-tenant)</option>
                <option value="delete">DELETE (Classic rollback)</option>
                <option value="truncate">TRUNCATE</option>
                <option value="memory">MEMORY (In-memory journal)</option>
              </select>
              <span className="text-[10px] text-muted-foreground mt-1 block">
                WAL enables concurrent readers while writing.
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Synchronous Mode</label>
              <select
                disabled={!isSuperAdminOrAdmin}
                value={current.default_synchronous || 'normal'}
                onChange={(e) => setForm({ ...form, default_synchronous: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground disabled:opacity-50"
              >
                <option value="normal">NORMAL (Optimal durability with WAL)</option>
                <option value="full">FULL (Strict sync on each commit)</option>
                <option value="extra">EXTRA (Super strict with directory sync)</option>
                <option value="off">OFF (Maximum write throughput, crash risk)</option>
              </select>
              <span className="text-[10px] text-muted-foreground mt-1 block">
                NORMAL is fast and safe when combined with WAL mode.
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">SQL Busy Timeout (ms)</label>
              <input
                type="number"
                min={100}
                max={60000}
                disabled={!isSuperAdminOrAdmin}
                value={current.default_busy_timeout || 5000}
                onChange={(e) => setForm({ ...form, default_busy_timeout: parseInt(e.target.value, 10) || 5000 })}
                className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground font-mono disabled:opacity-50"
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">
                Milliseconds to retry on `SQLITE_BUSY` before throwing lock error.
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Page Cache Size (Pages / KB)</label>
              <input
                type="number"
                disabled={!isSuperAdminOrAdmin}
                value={current.default_cache_size || -2000}
                onChange={(e) => setForm({ ...form, default_cache_size: parseInt(e.target.value, 10) || -2000 })}
                className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground font-mono disabled:opacity-50"
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">
                Negative number indicates KiB (e.g. -2000 = 2MB cache per open db).
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Auto Vacuum Strategy</label>
              <select
                disabled={!isSuperAdminOrAdmin}
                value={current.default_auto_vacuum || 'none'}
                onChange={(e) => setForm({ ...form, default_auto_vacuum: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground disabled:opacity-50"
              >
                <option value="none">NONE (Manual vacuum via maintenance)</option>
                <option value="incremental">INCREMENTAL (Background partial reclaim)</option>
                <option value="full">FULL (Reclaim on every delete commit)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Foreign Key Constraints</label>
              <select
                disabled={!isSuperAdminOrAdmin}
                value={current.default_foreign_keys ? 'true' : 'false'}
                onChange={(e) => setForm({ ...form, default_foreign_keys: e.target.value === 'true' })}
                className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground disabled:opacity-50"
              >
                <option value="true">Enabled (PRAGMA foreign_keys = ON)</option>
                <option value="false">Disabled (Ignore foreign key violations)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Backups & Storage */}
      {activeTab === 'backups' && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-5 animate-in fade-in duration-150">
          <div className="border-b border-border pb-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Archive className="w-4 h-4 text-amber-500" />
              Automated Snapshots & Storage Limits
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Set automated backup intervals, backup retention caps, and file upload thresholds.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Scheduled Backup Cadence</label>
              <select
                disabled={!isSuperAdminOrAdmin}
                value={current.backup_schedule || 'daily'}
                onChange={(e) => setForm({ ...form, backup_schedule: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground disabled:opacity-50"
              >
                <option value="disabled">Disabled (Manual backups only)</option>
                <option value="hourly">Every 1 Hour</option>
                <option value="6hours">Every 6 Hours</option>
                <option value="12hours">Every 12 Hours</option>
                <option value="daily">Daily (Every 24h)</option>
                <option value="weekly">Weekly (Every 7 days)</option>
              </select>
              <span className="text-[10px] text-muted-foreground mt-1 block">
                Automatic atomic VACUUM INTO snapshots created in background.
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Snapshot Retention Count</label>
              <input
                type="number"
                min={1}
                max={100}
                disabled={!isSuperAdminOrAdmin}
                value={current.backup_retention || 10}
                onChange={(e) => setForm({ ...form, backup_retention: parseInt(e.target.value, 10) || 10 })}
                className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground font-mono disabled:opacity-50"
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">
                Keep newest N snapshots per database before auto-pruning.
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Max Media Upload Size (MB)</label>
              <input
                type="number"
                min={1}
                max={500}
                disabled={!isSuperAdminOrAdmin}
                value={current.max_upload_size_mb || 50}
                onChange={(e) => setForm({ ...form, max_upload_size_mb: parseInt(e.target.value, 10) || 50 })}
                className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground font-mono disabled:opacity-50"
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">
                Maximum file size allowed for storage uploads and dump imports.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: User Quotas & Limits */}
      {activeTab === 'quotas' && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-5 animate-in fade-in duration-150">
          <div className="border-b border-border pb-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Gauge className="w-4 h-4 text-cyan-500" />
              Default Sub-account Resource Quotas
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Default limits applied when creating new standard users in User Management.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Default Max Databases per User</label>
              <input
                type="number"
                min={1}
                max={1000}
                disabled={!isSuperAdminOrAdmin}
                value={current.default_user_max_databases || 5}
                onChange={(e) => setForm({ ...form, default_user_max_databases: parseInt(e.target.value, 10) || 5 })}
                className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground font-mono disabled:opacity-50"
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">
                Users with role `user` cannot create more databases than this quota.
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Default API Rate Limit (req/min)</label>
              <input
                type="number"
                min={0}
                max={10000}
                disabled={!isSuperAdminOrAdmin}
                value={current.default_user_rate_limit || 60}
                onChange={(e) => setForm({ ...form, default_user_rate_limit: parseInt(e.target.value, 10) || 0 })}
                className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground font-mono disabled:opacity-50"
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">
                0 = Unlimited requests per minute for standard accounts.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Diagnostics & Debugging */}
      {activeTab === 'debug' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Bug className="w-4 h-4 text-red-500" />
                  Runtime Debugging & Diagnostic Flags
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Enable verbose inspection mode and adjust internal system logging levels for troubleshooting.
                </p>
              </div>
              <button
                onClick={() => refetchStatus()}
                disabled={isFetchingStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-accent border border-border text-foreground rounded text-xs font-medium transition-colors"
              >
                <Activity className={`w-3.5 h-3.5 ${isFetchingStatus ? 'animate-spin' : ''}`} />
                <span>Check System Status</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Server Log Verbosity (Pino)</label>
                <select
                  disabled={!isSuperAdminOrAdmin}
                  value={current.log_level || 'info'}
                  onChange={(e) => setForm({ ...form, log_level: e.target.value as any })}
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground disabled:opacity-50"
                >
                  <option value="trace">TRACE (Deepest internal trace)</option>
                  <option value="debug">DEBUG (Detailed debug statements)</option>
                  <option value="info">INFO (Standard production info)</option>
                  <option value="warn">WARN (Warnings & Anomalies)</option>
                  <option value="error">ERROR (Failures & Errors only)</option>
                </select>
                <span className="text-[10px] text-muted-foreground mt-1 block">
                  Takes effect dynamically without restarting server.
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Cross-Origin Policy (CORS)</label>
                <select
                  disabled={!isSuperAdminOrAdmin}
                  value={current.enable_cors_all ? 'all' : 'restricted'}
                  onChange={(e) => setForm({ ...form, enable_cors_all: e.target.value === 'all' })}
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground disabled:opacity-50"
                >
                  <option value="all">Allow Any Origin (* - Debug / Development)</option>
                  <option value="restricted">Strict Origin Check (Production Safe)</option>
                </select>
                <span className="text-[10px] text-muted-foreground mt-1 block">
                  Allow browser clients from any domain to connect during testing.
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-border space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isSuperAdminOrAdmin}
                  checked={current.debug_mode}
                  onChange={(e) => setForm({ ...form, debug_mode: e.target.checked })}
                  className="mt-0.5 rounded border-border text-red-600 focus:ring-red-500 bg-background"
                />
                <div>
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <span>Global Debug Mode</span>
                    <span className="text-[9px] px-1.5 py-0.2 bg-red-500/10 text-red-500 border border-red-500/20 rounded font-semibold uppercase">
                      Developer
                    </span>
                  </span>
                  <span className="text-[11px] text-muted-foreground block">
                    Bypasses non-critical catch blocks and includes full internal runtime debug metadata in API responses.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isSuperAdminOrAdmin}
                  checked={current.enable_stack_traces}
                  onChange={(e) => setForm({ ...form, enable_stack_traces: e.target.checked })}
                  className="mt-0.5 rounded border-border text-red-600 focus:ring-red-500 bg-background"
                />
                <div>
                  <span className="text-xs font-semibold text-foreground block">Include Error Stack Traces in API Responses</span>
                  <span className="text-[11px] text-muted-foreground block">
                    Returns `error.stack` inside HTTP 4xx/5xx JSON responses for debugging frontend/SDK integration bugs.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Quick System Diagnostic Snapshot */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-foreground flex items-center gap-2 uppercase tracking-wider">
              <Terminal className="w-3.5 h-3.5 text-blue-500" />
              Runtime Diagnostic Snapshot
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div className="p-2.5 bg-muted/40 rounded border border-border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">VanillaDB</span>
                <span className="font-mono font-bold text-emerald-500 block mt-0.5">v{status?.version || '1.3.0'}</span>
              </div>

              <div className="p-2.5 bg-muted/40 rounded border border-border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Node.js Engine</span>
                <span className="font-mono font-bold text-foreground block mt-0.5">{status?.nodeVersion || process.version}</span>
              </div>

              <div className="p-2.5 bg-muted/40 rounded border border-border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">SQLite Binary</span>
                <span className="font-mono font-bold text-foreground block mt-0.5">{status?.sqliteVersion || '3.x'}</span>
              </div>

              <div className="p-2.5 bg-muted/40 rounded border border-border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Host Uptime</span>
                <span className="font-mono font-bold text-foreground block mt-0.5">{Math.floor((status?.uptimeSeconds || 0) / 60)} mins</span>
              </div>

              <div className="p-2.5 bg-muted/40 rounded border border-border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Total Databases</span>
                <span className="font-mono font-bold text-blue-500 block mt-0.5">{status?.databaseCount ?? 0}</span>
              </div>
            </div>
          </div>

          {/* Security & Data-At-Rest Encryption Diagnostics */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-foreground flex items-center gap-2 uppercase tracking-wider">
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
              Data-At-Rest Encryption Architecture
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider block">Storage & Backup Encryption</span>
                <span className="font-semibold text-foreground block mt-1">AES-256-GCM (Active)</span>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Backups (.sqlite) & uploaded media are automatically encrypted at rest using PBKDF2 derived keys.
                </p>
              </div>

              <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                <span className="text-[10px] text-blue-500 font-bold uppercase tracking-wider block">SQL Field Cryptography</span>
                <span className="font-semibold text-foreground block mt-1">SQL Native Functions</span>
                <p className="text-[10px] text-muted-foreground mt-1">
                  <code className="text-blue-500 font-mono text-[10px]">encrypt_aes()</code> & <code className="text-blue-500 font-mono text-[10px]">decrypt_aes()</code> registered in SQLite engine.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: My Account & Password */}
      {activeTab === 'account' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Account Overview Card */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 pb-2 border-b border-border">
              <User className="w-4 h-4 text-blue-500" />
              Account Profile
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-muted/30 border border-border rounded-lg">
                <span className="text-muted-foreground block text-[11px]">Logged in as</span>
                <span className="font-bold text-foreground text-sm mt-0.5 block">{currentUser?.username}</span>
              </div>

              <div className="p-3 bg-muted/30 border border-border rounded-lg">
                <span className="text-muted-foreground block text-[11px]">Permission Role</span>
                <span className="font-semibold text-blue-500 uppercase text-xs mt-0.5 block">{currentUser?.role || 'user'}</span>
              </div>

              <div className="p-3 bg-muted/30 border border-border rounded-lg">
                <span className="text-muted-foreground block text-[11px]">Account ID</span>
                <span className="font-mono text-muted-foreground text-[10px] mt-0.5 block truncate">{currentUser?.userId}</span>
              </div>
            </div>
          </div>

          {/* Change Password Form Card */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 pb-2 border-b border-border">
              <KeyRound className="w-4 h-4 text-amber-500" />
              Change Account Password
            </h2>

            {passwordStatus && (
              <div
                className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                  passwordStatus.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500'
                    : 'bg-red-500/10 border border-red-500/20 text-red-500'
                }`}
              >
                {passwordStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{passwordStatus.message}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-md">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Mật khẩu hiện tại</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Mật khẩu mới (tối thiểu 6 ký tự)</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Xác nhận mật khẩu mới</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={changePasswordMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  {changePasswordMutation.isPending ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
