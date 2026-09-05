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
  Radio,
  Languages,
  Fingerprint,
  Trash2,
  Bell,
  Mail,
  QrCode,
  ShieldCheck,
  UploadCloud,
  Check,
  X,
  Copy,
  Download
} from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { useAuth } from '../hooks/useAuth.js';
import { useI18n } from '../hooks/useI18n.js';
import type { SystemSettings, SystemStatus } from '@shared/index.js';

export const SettingsPage: React.FC = () => {
  const { user: currentUser, refetchStatus: refetchAuthStatus } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const queryClient = useQueryClient();

  const isSuperAdminOrAdmin = currentUser?.role === 'super_admin' || currentUser?.role === 'admin';

  const [activeTab, setActiveTab] = useState<'general' | 'engine' | 'backups' | 'quotas' | 'alerts' | 'debug' | 'account'>(
    isSuperAdminOrAdmin ? 'general' : 'account'
  );
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Profile Edit State
  const [profileEmail, setProfileEmail] = useState(currentUser?.email || '');
  const [profileAvatar, setProfileAvatar] = useState(currentUser?.avatar_url || '');
  const [profileStatus, setProfileStatus] = useState<string | null>(null);

  // 2FA Setup State
  const [is2faModalOpen, setIs2faModalOpen] = useState(false);
  const [isDisable2faModalOpen, setIsDisable2faModalOpen] = useState(false);
  const [isBackupCodesModalOpen, setIsBackupCodesModalOpen] = useState(false);
  const [generatedBackupCodes, setGeneratedBackupCodes] = useState<string[]>([]);
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);
  const [disableSuccessNotice, setDisableSuccessNotice] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<{ secret: string; otpauthUri: string; qrDataUrl: string } | null>(null);
  const [totpVerifyPassword, setTotpVerifyPassword] = useState('');
  const [totpVerifyCode, setTotpVerifyCode] = useState('');
  const [totpStatus, setTotpStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

  // Passkey credentials query
  const { data: passkeys = [], refetch: refetchPasskeys } = useQuery<any[]>({
    queryKey: ['webauthnCreds'],
    queryFn: () => apiRequest('/api/auth/webauthn/credentials'),
    enabled: activeTab === 'account',
  });

  const [passkeyStatus, setPasskeyStatus] = useState<string | null>(null);

  const handleRegisterPasskey = async () => {
    setPasskeyStatus(null);
    try {
      const { startRegistration } = await import('@simplewebauthn/browser');
      const opts = await apiRequest('/api/auth/webauthn/register-options', { method: 'POST' });
      const optionsJSON = opts?.data || opts;
      const regResp = await startRegistration({ optionsJSON });
      await apiRequest('/api/auth/webauthn/register-verify', {
        method: 'POST',
        body: JSON.stringify(regResp),
      });
      refetchPasskeys();
      setPasskeyStatus('Passkey registered successfully for this device!');
      setTimeout(() => setPasskeyStatus(null), 4000);
    } catch (err: any) {
      setPasskeyStatus(`Registration error: ${err.message || String(err)}`);
    }
  };

  const deletePasskeyMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/auth/webauthn/credentials/${id}`, { method: 'DELETE' }),
    onSuccess: () => refetchPasskeys(),
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

  const updateProfileMutation = useMutation({
    mutationFn: (payload: { email?: string; avatar_url?: string }) =>
      apiRequest('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      refetchAuthStatus();
      setProfileStatus('Cập nhật thông tin hồ sơ thành công!');
      setTimeout(() => setProfileStatus(null), 3500);
    },
    onError: (err: any) => {
      setProfileStatus(`Lỗi: ${err.message || 'Cập nhật thất bại'}`);
      setTimeout(() => setProfileStatus(null), 4000);
    },
  });

  const handleStart2faSetup = async () => {
    setTotpStatus(null);
    setTotpVerifyPassword('');
    setTotpVerifyCode('');
    try {
      const res = await apiRequest('/api/auth/2fa/setup', { method: 'POST' });
      const data = res?.data || res;
      setQrCodeData(data);
      setIs2faModalOpen(true);
    } catch (err: any) {
      alert(err.message || 'Không thể tạo mã 2FA QR');
    }
  };

  const handleActivate2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpStatus(null);
    try {
      const res = await apiRequest('/api/auth/2fa/activate', {
        method: 'POST',
        body: JSON.stringify({ password: totpVerifyPassword, code: totpVerifyCode.trim() }),
      });
      const codes = res?.data?.backupCodes || [];
      refetchAuthStatus();
      setIs2faModalOpen(false);
      setGeneratedBackupCodes(codes);
      setIsBackupCodesModalOpen(true);
    } catch (err: any) {
      setTotpStatus({ type: 'error', message: err.message || 'Kích hoạt 2FA thất bại' });
    }
  };

  const handleDisable2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpStatus(null);
    try {
      await apiRequest('/api/auth/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ password: totpVerifyPassword, code: totpVerifyCode.trim() }),
      });
      refetchAuthStatus();
      setIsDisable2faModalOpen(false);
      setDisableSuccessNotice(true);
      setTimeout(() => setDisableSuccessNotice(false), 5000);
    } catch (err: any) {
      setTotpStatus({ type: 'error', message: err.message || 'Tắt 2FA thất bại' });
    }
  };

  const handleCopyBackupCodes = () => {
    if (!generatedBackupCodes.length) return;
    const text = generatedBackupCodes.join('\n');
    navigator.clipboard.writeText(text);
    setCopiedBackupCodes(true);
    setTimeout(() => setCopiedBackupCodes(false), 2500);
  };

  const handleDownloadBackupCodes = () => {
    if (!generatedBackupCodes.length) return;
    const content = `VANILLADATABASE 2FA BACKUP RECOVERY CODES\nGenerated: ${new Date().toISOString()}\nAccount: ${currentUser?.username || 'user'}\n\nKeep these codes safe! Each code can be used once to reset your password if you lose access to your authenticator app:\n\n` +
      generatedBackupCodes.map((c, i) => `${i + 1}. ${c}`).join('\n') +
      '\n\nNotice: Keep this file offline and confidential.';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vanilladb-backup-codes-${currentUser?.username || 'user'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Ảnh đại diện không được vượt quá 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setProfileAvatar(dataUrl);
    };
    reader.readAsDataURL(file);
  };

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
    enable_system_alerts: true,
    alert_webhook_url: '',
    alert_cpu_threshold: 85,
    alert_ram_threshold: 85,
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

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-xs font-mono text-muted-foreground">
        Loading System Settings...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto pt-6 px-4 md:px-6 pb-12 max-w-5xl mx-auto w-full space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {isSuperAdminOrAdmin ? t('settings.title', 'Platform Settings') : t('settings.userTitle', 'Account & Security Settings')}
            </h1>
            <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded font-semibold uppercase tracking-wider">
              {currentUser?.role || 'user'}
            </span>
            {current.debug_mode && (
              <span className="text-[10px] px-2 py-0.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded font-semibold uppercase tracking-wider flex items-center gap-1 animate-pulse">
                <Bug className="w-2.5 h-2.5" />
                {t('settings.debugActive', 'Debug Active')}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isSuperAdminOrAdmin
              ? t('settings.desc', 'Configure SQLite engine parameters, backup frequency, alerting channels, and authentication credentials.')
              : t('settings.userDesc', 'Manage your personal profile, avatar, credentials, and Two-Factor Authentication.')}
          </p>
        </div>

        {activeTab !== 'account' && isSuperAdminOrAdmin && (
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold shadow-sm transition-colors cursor-pointer self-start sm:self-auto"
          >
            {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {saved ? t('settings.saved', 'Saved Successfully') : updateMutation.isPending ? t('settings.saving', 'Saving...') : t('settings.save', 'Save Settings')}
          </button>
        )}
      </div>

      {/* Notifications */}
      {disableSuccessNotice && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-lg text-xs flex items-center gap-2 animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Đã tắt bảo mật 2 lớp (2FA) thành công cho tài khoản của bạn.</span>
        </div>
      )}

      {saved && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-lg text-xs flex items-center gap-2 animate-in fade-in duration-150">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{t('settings.savedSuccess', 'System configuration saved and applied successfully.')}</span>
        </div>
      )}

      {saveError && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-xs flex items-center gap-2 animate-in fade-in duration-150">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Navigation Tabs (Only rendered for Admin roles with multiple tabs) */}
      {isSuperAdminOrAdmin && (
        <div className="flex items-center gap-1 border-b border-border overflow-x-auto pb-px shrink-0">
          {[
            { id: 'general', label: t('settings.tabGeneral', 'General & Platform'), icon: Server },
            { id: 'engine', label: t('settings.tabEngine', 'SQLite Engine'), icon: Cpu },
            { id: 'backups', label: t('settings.tabBackups', 'Backups & Storage'), icon: Archive },
            { id: 'quotas', label: t('settings.tabQuotas', 'User Quotas & Limits'), icon: Gauge },
            { id: 'alerts', label: t('settings.tabAlerts', 'System Alerting & Health'), icon: Bell },
            { id: 'debug', label: t('settings.tabDebug', 'Diagnostics & Debugging'), icon: Bug },
            { id: 'account', label: t('settings.tabAccount', 'My Account & Security'), icon: User },
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
      )}

      {/* TAB 1: General & Platform */}
      {activeTab === 'general' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 pb-2 border-b border-border">
              <Server className="w-4 h-4 text-blue-500" />
              {t('settings.instanceName', 'Instance Display Name')}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.instanceName', 'Instance Display Name')}</label>
                <input
                  type="text"
                  disabled={!isSuperAdminOrAdmin}
                  value={current.instance_name || ''}
                  onChange={(e) => setForm({ ...form, instance_name: e.target.value })}
                  placeholder="e.g. VanillaDatabase Production"
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 text-foreground"
                />
                <p className="text-[10px] text-muted-foreground mt-1">{t('settings.instanceNameDesc', 'Shown across header badges and audit records.')}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.baseUrl', 'Canonical Base URL')}</label>
                <input
                  type="text"
                  disabled={!isSuperAdminOrAdmin}
                  value={current.base_url || ''}
                  onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                  placeholder="https://db.example.com"
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 text-foreground"
                />
                <p className="text-[10px] text-muted-foreground mt-1">{t('settings.baseUrlDesc', 'Used for webhook dispatch callbacks and SDK endpoints.')}</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                  <Languages className="w-3.5 h-3.5 text-blue-500" />
                  {t('settings.languageSelect', 'Interface Language / Ngôn ngữ')}
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground"
                >
                  <option value="vi">Tiếng Việt (Mặc định)</option>
                  <option value="en">English (US)</option>
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">{t('settings.languageDesc', 'Select default management dashboard language.')}</p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 pb-2 border-b border-border">
              <Activity className="w-4 h-4 text-emerald-500" />
              {t('settings.telemetryLogging', 'Telemetry & Query Audit Logging')}
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
                  <span className="text-xs font-semibold text-foreground block">{t('settings.realtimeLogging', 'Real-time Activity & Telemetry Logging')}</span>
                  <span className="text-[11px] text-muted-foreground block">
                    {t('settings.realtimeLoggingDesc', 'Record query execution duration, row counts, errors, and system resource metrics to activity logs.')}
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
                  <span className="text-xs font-semibold text-foreground block">{t('settings.verboseSql', 'Verbose SQL Statement Logging')}</span>
                  <span className="text-[11px] text-muted-foreground block">
                    {t('settings.verboseSqlDesc', 'Output raw SQL statements to server stdout log (useful during development, may log sensitive values).')}
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
              {t('settings.engineTitle', 'Native SQLite Engine Pragmas & Concurrency')}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('settings.engineDesc', 'These pragmas are automatically configured when opening new SQLite database file connections.')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.journalMode', 'Default Journal Mode')}</label>
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
                {t('settings.journalModeDesc', 'WAL enables concurrent readers while writing.')}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.synchronous', 'Synchronous Mode')}</label>
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
                {t('settings.synchronousDesc', 'NORMAL is fast and safe when combined with WAL mode.')}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.busyTimeout', 'SQL Busy Timeout (ms)')}</label>
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
                {t('settings.busyTimeoutDesc', 'Milliseconds to retry on `SQLITE_BUSY` before throwing lock error.')}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.cacheSize', 'Page Cache Size (Pages / KB)')}</label>
              <input
                type="number"
                disabled={!isSuperAdminOrAdmin}
                value={current.default_cache_size || -2000}
                onChange={(e) => setForm({ ...form, default_cache_size: parseInt(e.target.value, 10) || -2000 })}
                className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground font-mono disabled:opacity-50"
              />
              <span className="text-[10px] text-muted-foreground mt-1 block">
                {t('settings.cacheSizeDesc', 'Negative number indicates KiB (e.g. -2000 = 2MB cache per open db).')}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.autoVacuum', 'Auto Vacuum Strategy')}</label>
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
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.foreignKeys', 'Foreign Key Constraints')}</label>
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
              {t('settings.backupsTitle', 'Automated Snapshots & Storage Limits')}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('settings.backupsDesc', 'Set automated backup intervals, backup retention caps, and file upload thresholds.')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.backupSchedule', 'Scheduled Backup Cadence')}</label>
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
                {t('settings.backupScheduleDesc', 'Automatic atomic VACUUM INTO snapshots created in background.')}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.backupRetention', 'Snapshot Retention Count')}</label>
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
                {t('settings.backupRetentionDesc', 'Keep newest N snapshots per database before auto-pruning.')}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.maxUploadSize', 'Max Media Upload Size (MB)')}</label>
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
                {t('settings.maxUploadSizeDesc', 'Maximum file size allowed for storage uploads and dump imports.')}
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
              {t('settings.quotasTitle', 'Default Sub-account Resource Quotas')}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('settings.quotasDesc', 'Default limits applied when creating new standard users in User Management.')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.maxDbsPerUser', 'Default Max Databases per User')}</label>
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
                {t('settings.maxDbsPerUserDesc', 'Users with role `user` cannot create more databases than this quota.')}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.rateLimitPerUser', 'Default API Rate Limit (req/min)')}</label>
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
                {t('settings.rateLimitPerUserDesc', '0 = Unlimited requests per minute for standard accounts.')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: System Alerting & Health Channels */}
      {activeTab === 'alerts' && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-5 animate-in fade-in duration-150">
          <div className="border-b border-border pb-3">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-500" />
              {t('settings.alertsTitle', 'System Resource Alerting & Health Channels')}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('settings.alertsDesc', 'Broadcast automated threshold alerts to Discord, Telegram, or custom webhooks when system resources spike.')}
            </p>
          </div>

          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                disabled={!isSuperAdminOrAdmin}
                checked={current.enable_system_alerts}
                onChange={(e) => setForm({ ...form, enable_system_alerts: e.target.checked })}
                className="mt-0.5 rounded border-border text-amber-600 focus:ring-amber-500 bg-background"
              />
              <div>
                <span className="text-xs font-semibold text-foreground block">{t('settings.enableAlerts', 'Enable Automated System Resource Alerts')}</span>
                <span className="text-[11px] text-muted-foreground block">
                  {t('settings.enableAlertsDesc', 'Continuously monitor CPU and RAM usage and broadcast alerts with 15-minute deduplication cooldown.')}
                </span>
              </div>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.alertCpu', 'CPU Warning Threshold (%)')}</label>
                <input
                  type="number"
                  min={10}
                  max={100}
                  disabled={!isSuperAdminOrAdmin}
                  value={current.alert_cpu_threshold ?? 85}
                  onChange={(e) => setForm({ ...form, alert_cpu_threshold: parseInt(e.target.value, 10) || 85 })}
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground font-mono disabled:opacity-50"
                />
                <span className="text-[10px] text-muted-foreground mt-1 block">
                  {t('settings.alertCpuDesc', 'Trigger alert when host CPU utilization exceeds this percentage.')}
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.alertRam', 'RAM Warning Threshold (%)')}</label>
                <input
                  type="number"
                  min={10}
                  max={100}
                  disabled={!isSuperAdminOrAdmin}
                  value={current.alert_ram_threshold ?? 85}
                  onChange={(e) => setForm({ ...form, alert_ram_threshold: parseInt(e.target.value, 10) || 85 })}
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground font-mono disabled:opacity-50"
                />
                <span className="text-[10px] text-muted-foreground mt-1 block">
                  {t('settings.alertRamDesc', 'Trigger alert when host memory utilization exceeds this percentage.')}
                </span>
              </div>
            </div>

            <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg text-xs flex items-center gap-2 text-muted-foreground">
              <Radio className="w-4 h-4 text-amber-500 shrink-0" />
              <span>{t('settings.alertsTip', 'Alert events are broadcast to active system webhooks and can be received via Discord, Telegram or Slack.')}</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: Diagnostics & Debugging */}
      {activeTab === 'debug' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Bug className="w-4 h-4 text-red-500" />
                  {t('settings.debugTitle', 'Runtime Debugging & Diagnostic Flags')}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('settings.debugDesc', 'Enable verbose inspection mode and adjust internal system logging levels for troubleshooting.')}
                </p>
              </div>
              <button
                onClick={() => refetchStatus()}
                disabled={isFetchingStatus}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-accent border border-border text-foreground rounded text-xs font-medium transition-colors"
              >
                <Activity className={`w-3.5 h-3.5 ${isFetchingStatus ? 'animate-spin' : ''}`} />
                <span>{t('settings.checkStatus', 'Check System Status')}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.logLevel', 'Server Log Verbosity (Pino)')}</label>
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
                  {t('settings.logLevelDesc', 'Takes effect dynamically without restarting server.')}
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.corsPolicy', 'Cross-Origin Policy (CORS)')}</label>
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
                  {t('settings.corsDesc', 'Allow browser clients from any domain to connect during testing.')}
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
                    <span>{t('settings.globalDebug', 'Global Debug Mode')}</span>
                    <span className="text-[9px] px-1.5 py-0.2 bg-red-500/10 text-red-500 border border-red-500/20 rounded font-semibold uppercase">
                      Developer
                    </span>
                  </span>
                  <span className="text-[11px] text-muted-foreground block">
                    {t('settings.globalDebugDesc', 'Bypasses non-critical catch blocks and includes full internal runtime debug metadata in API responses.')}
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
                  <span className="text-xs font-semibold text-foreground block">{t('settings.enableStackTraces', 'Include Error Stack Traces in API Responses')}</span>
                  <span className="text-[11px] text-muted-foreground block">
                    {t('settings.enableStackTracesDesc', 'Returns `error.stack` inside HTTP 4xx/5xx JSON responses for debugging frontend/SDK integration bugs.')}
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Quick System Diagnostic Snapshot */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-foreground flex items-center gap-2 uppercase tracking-wider">
              <Terminal className="w-3.5 h-3.5 text-blue-500" />
              {t('settings.diagSnapshot', 'Runtime Diagnostic Snapshot')}
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div className="p-2.5 bg-muted/40 rounded border border-border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">VanillaDB</span>
                <span className="font-mono font-bold text-emerald-500 block mt-0.5">v{status?.version || '1.3.2'}</span>
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
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">{t('settings.hostUptime', 'Host Uptime')}</span>
                <span className="font-mono font-bold text-foreground block mt-0.5">{Math.floor((status?.uptimeSeconds || 0) / 60)} mins</span>
              </div>

              <div className="p-2.5 bg-muted/40 rounded border border-border">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">{t('settings.totalDatabases', 'Total Databases')}</span>
                <span className="font-mono font-bold text-blue-500 block mt-0.5">{status?.databaseCount ?? 0}</span>
              </div>
            </div>
          </div>

          {/* Security & Data-At-Rest Encryption Diagnostics & Recommendations */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-foreground flex items-center gap-2 uppercase tracking-wider">
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
              {t('settings.securityArch', 'Data-At-Rest Encryption Architecture')}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider block">{t('settings.storageEnc', 'Storage & Backup Encryption')}</span>
                <span className="font-semibold text-foreground block mt-1">AES-256-GCM (Active)</span>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {t('settings.storageEncDesc', 'Backups (.sqlite) & uploaded media are automatically encrypted at rest using PBKDF2 derived keys.')}
                </p>
              </div>

              <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                <span className="text-[10px] text-blue-500 font-bold uppercase tracking-wider block">{t('settings.sqlCrypto', 'SQL Field Cryptography')}</span>
                <span className="font-semibold text-foreground block mt-1">SQL Native Functions</span>
                <p className="text-[10px] text-muted-foreground mt-1">
                  <code className="text-blue-500 font-mono text-[10px]">encrypt_aes()</code> & <code className="text-blue-500 font-mono text-[10px]">decrypt_aes()</code> {t('settings.sqlCryptoDesc', 'Native functions registered in SQLite engine.')}
                </p>
              </div>
            </div>

            {status?.securityDiagnostics?.recommendations && (
              <div className="pt-2 border-t border-border space-y-1.5">
                <span className="text-[11px] font-semibold text-foreground block">{t('settings.secRecs', 'Security Recommendations')}:</span>
                <div className="space-y-1">
                  {status.securityDiagnostics.recommendations.map((rec, i) => (
                    <div key={i} className="text-[11px] text-muted-foreground flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 7: My Account & Password */}
      {activeTab === 'account' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Account Profile & Avatar Card */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 pb-2 border-b border-border">
              <User className="w-4 h-4 text-blue-500" />
              {t('settings.accountProfile', 'Account Profile')}
            </h2>

            {profileStatus && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-500 text-xs rounded-md">
                {profileStatus}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-4 border-b border-border">
              {/* Avatar Preview */}
              <div className="relative group">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-border bg-muted/60 flex items-center justify-center shrink-0">
                  {profileAvatar ? (
                    <img src={profileAvatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <label className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 rounded-full flex flex-col items-center justify-center text-[9px] font-semibold cursor-pointer transition-opacity">
                  <UploadCloud className="w-4 h-4 mb-0.5" />
                  <span>Đổi ảnh</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
                </label>
              </div>

              <div className="flex-1 space-y-2 w-full max-w-md">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">{t('auth.email', 'Email Address')}</label>
                  <input
                    type="email"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500 text-foreground"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={updateProfileMutation.isPending}
                    onClick={() => updateProfileMutation.mutate({ email: profileEmail || undefined, avatar_url: profileAvatar || undefined })}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                  >
                    {updateProfileMutation.isPending ? 'Đang lưu...' : 'Lưu hồ sơ & Avatar'}
                  </button>
                  {profileAvatar && (
                    <button
                      type="button"
                      onClick={() => setProfileAvatar('')}
                      className="px-2.5 py-1.5 text-xs text-muted-foreground hover:text-red-500 border border-border rounded hover:bg-red-500/10 transition-colors"
                    >
                      Gỡ avatar
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-muted/30 border border-border rounded-lg">
                <span className="text-muted-foreground block text-[11px]">{t('settings.loggedInAs', 'Logged in as')}</span>
                <span className="font-bold text-foreground text-sm mt-0.5 block">{currentUser?.username}</span>
              </div>

              <div className="p-3 bg-muted/30 border border-border rounded-lg">
                <span className="text-muted-foreground block text-[11px]">{t('settings.permissionRole', 'Permission Role')}</span>
                <span className="font-semibold text-blue-500 uppercase text-xs mt-0.5 block">{currentUser?.role || 'user'}</span>
              </div>

              <div className="p-3 bg-muted/30 border border-border rounded-lg">
                <span className="text-muted-foreground block text-[11px]">{t('settings.accountId', 'Account ID')}</span>
                <span className="font-mono text-muted-foreground text-[10px] mt-0.5 block truncate">{currentUser?.userId}</span>
              </div>
            </div>
          </div>

          {/* Two-Factor Authentication (2FA TOTP) Card */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div>
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  Xác thực 2 bước (2FA - Google Authenticator / Authy)
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Bảo vệ tài khoản bằng mã xác thực 6 chữ số biến đổi mỗi 30 giây khi đăng nhập.
                </p>
              </div>

              {currentUser?.totp_enabled ? (
                <button
                  onClick={() => setIsDisable2faModalOpen(true)}
                  className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-500/20 rounded text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  Tắt 2FA
                </button>
              ) : (
                <button
                  onClick={handleStart2faSetup}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  Kích hoạt 2FA
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Trạng thái:</span>
                {currentUser?.totp_enabled ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    <Check className="w-3 h-3" />
                    Đang hoạt động (Được bảo vệ)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
                    <X className="w-3 h-3" />
                    Chưa kích hoạt
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Change Password Form Card */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2 pb-2 border-b border-border">
              <KeyRound className="w-4 h-4 text-amber-500" />
              {t('settings.changePassword', 'Change Account Password')}
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
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.currentPassword', 'Current Password')}</label>
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
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.newPassword', 'New Password (min 6 characters)')}</label>
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
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t('settings.confirmPassword', 'Confirm New Password')}</label>
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
                  {changePasswordMutation.isPending ? t('settings.updating', 'Updating...') : t('settings.updatePassword', 'Update Password')}
                </button>
              </div>
            </form>
          </div>

          {/* Modal Kích Hoạt 2FA (Bắt buộc quét QR + Nhập mật khẩu + Nhập OTP) */}
          {is2faModalOpen && qrCodeData && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-card border border-border rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4 animate-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-blue-500" />
                    <h3 className="text-sm font-bold text-foreground">Kích hoạt Google Authenticator / Authy</h3>
                  </div>
                  <button
                    onClick={() => setIs2faModalOpen(false)}
                    className="p-1 text-muted-foreground hover:text-foreground rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {totpStatus && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-md">
                    {totpStatus.message}
                  </div>
                )}

                <div className="flex flex-col items-center justify-center p-3 bg-white rounded-lg border border-border">
                  <img src={qrCodeData.qrDataUrl} alt="2FA QR Code" className="w-44 h-44" />
                  <p className="text-[10px] text-zinc-500 mt-1 font-mono select-all">Secret: {qrCodeData.secret}</p>
                </div>

                <form onSubmit={handleActivate2fa} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      1. Mật khẩu tài khoản (Bắt buộc xác thực)
                    </label>
                    <input
                      type="password"
                      required
                      value={totpVerifyPassword}
                      onChange={(e) => setTotpVerifyPassword(e.target.value)}
                      placeholder="Nhập mật khẩu hiện tại..."
                      className="w-full px-3 py-1.5 bg-background border border-border rounded-md text-foreground"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      2. Mã 6 chữ số trên ứng dụng Authenticator
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      pattern="[0-9]{6}"
                      value={totpVerifyCode}
                      onChange={(e) => setTotpVerifyCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000"
                      className="w-full px-3 py-2 text-center text-lg font-mono font-bold tracking-widest bg-background border border-border rounded-md text-foreground"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIs2faModalOpen(false)}
                      className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={!totpVerifyPassword || totpVerifyCode.length !== 6}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold"
                    >
                      Xác nhận & Bật 2FA
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal Tắt 2FA */}
          {isDisable2faModalOpen && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-card border border-border rounded-xl shadow-2xl p-6 w-full max-w-sm space-y-4 animate-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="text-sm font-bold text-foreground">Tắt xác thực 2 bước (2FA)</h3>
                  <button onClick={() => setIsDisable2faModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {totpStatus && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-md">
                    {totpStatus.message}
                  </div>
                )}

                <form onSubmit={handleDisable2fa} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Mật khẩu tài khoản</label>
                    <input
                      type="password"
                      required
                      value={totpVerifyPassword}
                      onChange={(e) => setTotpVerifyPassword(e.target.value)}
                      placeholder="Mật khẩu của bạn..."
                      className="w-full px-3 py-1.5 bg-background border border-border rounded-md text-foreground"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Mã 6 chữ số hiện tại</label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={totpVerifyCode}
                      onChange={(e) => setTotpVerifyCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000"
                      className="w-full px-3 py-1.5 text-center font-mono font-bold text-foreground bg-background border border-border rounded-md"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsDisable2faModalOpen(false)}
                      className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={!totpVerifyPassword || totpVerifyCode.length !== 6}
                      className="px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded text-xs font-semibold"
                    >
                      Xác nhận tắt
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal Hiển Thị 6 Mã Dự Phòng Khi Kích Hoạt 2FA Thành Công */}
          {isBackupCodesModalOpen && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-card border border-border rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4 animate-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <h3 className="text-sm font-bold text-foreground">Kích Hoạt 2FA Thành Công!</h3>
                  </div>
                  <button
                    onClick={() => setIsBackupCodesModalOpen(false)}
                    className="p-1 text-muted-foreground hover:text-foreground rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs rounded-lg space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <Shield className="w-4 h-4" />
                    Lưu trữ 6 mã dự phòng này ở nơi an toàn!
                  </p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Nếu bạn mất điện thoại hoặc không thể truy cập ứng dụng Authenticator, bạn có thể dùng một trong các mã này để đặt lại mật khẩu và lấy lại tài khoản. Mỗi mã chỉ dùng được một lần.
                  </p>
                </div>

                {/* Grid 6 backup codes */}
                <div className="grid grid-cols-2 gap-2 p-3 bg-muted/50 rounded-lg border border-border font-mono text-center text-xs font-bold text-foreground tracking-wider select-all">
                  {generatedBackupCodes.map((code, idx) => (
                    <div key={idx} className="p-2 bg-background border border-border rounded shadow-xs">
                      {code}
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleCopyBackupCodes}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-muted hover:bg-accent border border-border text-foreground rounded text-xs font-medium transition-colors cursor-pointer"
                  >
                    {copiedBackupCodes ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedBackupCodes ? 'Đã sao chép!' : 'Sao chép tất cả'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadBackupCodes}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-muted hover:bg-accent border border-border text-foreground rounded text-xs font-medium transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-500" />
                    <span>Tải về máy (.txt)</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-border flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsBackupCodesModalOpen(false)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                  >
                    Tôi đã lưu mã an toàn
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* WebAuthn / Passkey Hardware Device Management */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div>
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 text-emerald-500" />
                  {t('settings.passkeys', 'Hardware Passkeys (WebAuthn / Biometrics)')}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('settings.passkeysDesc', 'Log in securely with fingerprint, Touch ID, or Windows Hello without typing passwords.')}
                </p>
              </div>
              <button
                onClick={handleRegisterPasskey}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
              >
                <Fingerprint className="w-3.5 h-3.5" />
                {t('settings.addPasskey', 'Register Passkey')}
              </button>
            </div>

            {passkeyStatus && (
              <div className="p-3 bg-muted/60 border border-border rounded text-xs text-foreground font-mono">
                {passkeyStatus}
              </div>
            )}

            <div className="space-y-2">
              {passkeys.length === 0 ? (
                <div className="p-6 border border-dashed border-border rounded-lg text-center text-xs text-muted-foreground">
                  {t('settings.noPasskeys', 'No passkeys registered on this account yet. Click "Register Passkey" to pair this device.')}
                </div>
              ) : (
                passkeys.map((pk) => (
                  <div key={pk.id} className="p-3 bg-muted/30 border border-border rounded-lg flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <Fingerprint className="w-4 h-4 text-emerald-500" />
                      <div>
                        <span className="font-bold text-foreground block font-mono">{pk.credential_id.substring(0, 16)}...</span>
                        <span className="text-[10px] text-muted-foreground block">
                          Registered: {new Date(pk.created_at).toLocaleDateString()} • Device: {pk.device_type || 'platform'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => deletePasskeyMutation.mutate(pk.id)}
                      className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                      title="Revoke Passkey"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
