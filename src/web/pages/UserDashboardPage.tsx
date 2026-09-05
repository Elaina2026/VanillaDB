import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Database,
  Layers,
  HardDrive,
  ShieldCheck,
  Shield,
  Plus,
  ArrowRight,
  Clock,
  User as UserIcon,
  Users,
  CheckCircle2,
  Lock,
  Key,
  X,
  QrCode,
  Copy,
  Check,
  Download
} from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { formatBytes, formatDate } from '../lib/utils.js';
import { useAuth } from '../hooks/useAuth.js';
import { useI18n } from '../hooks/useI18n.js';
import type { UserDashboardStats, DatabaseRecord } from '@shared/index.js';

export const UserDashboardPage: React.FC<{
  onSelectDatabase: (id: string) => void;
  onOpenCreateModal: () => void;
}> = ({ onSelectDatabase, onOpenCreateModal }) => {
  const { user: currentUser, refetchStatus: refetchAuthStatus } = useAuth();
  const { t } = useI18n();

  // 2FA modal state for Dashboard
  const [is2faModalOpen, setIs2faModalOpen] = useState(false);
  const [isBackupCodesModalOpen, setIsBackupCodesModalOpen] = useState(false);
  const [generatedBackupCodes, setGeneratedBackupCodes] = useState<string[]>([]);
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<{ secret: string; otpauthUri: string; qrDataUrl: string } | null>(null);
  const [totpPassword, setTotpPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState<string | null>(null);
  const [totpLoading, setTotpLoading] = useState(false);

  const handleOpen2fa = async () => {
    setTotpError(null);
    setTotpPassword('');
    setTotpCode('');
    try {
      const res = await apiRequest('/api/auth/2fa/setup', { method: 'POST' });
      const data = res?.data || res;
      setQrCodeData(data);
      setIs2faModalOpen(true);
    } catch (err: any) {
      alert(err.message || t('settings.create2faQrFailed', 'Không thể tạo mã QR 2FA'));
    }
  };

  const handleActivate2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpError(null);
    setTotpLoading(true);
    try {
      const res: any = await apiRequest('/api/auth/2fa/activate', {
        method: 'POST',
        body: JSON.stringify({ password: totpPassword, code: totpCode.trim() }),
      });
      const codes = res?.backupCodes || res?.data?.backupCodes || [];
      refetchAuthStatus();
      setIs2faModalOpen(false);
      setGeneratedBackupCodes(codes);
      setIsBackupCodesModalOpen(true);
    } catch (err: any) {
      setTotpError(err.message || t('settings.activate2faFailed', 'Kích hoạt 2FA thất bại'));
    } finally {
      setTotpLoading(false);
    }
  };

  const handleCopyBackupCodes = async () => {
    if (!generatedBackupCodes.length) return;
    const text = generatedBackupCodes.join('\n');
    let success = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        success = true;
      } catch {
        // fallback to execCommand
      }
    }
    if (!success) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch {
        success = false;
      }
    }
    if (success) {
      setCopiedBackupCodes(true);
      setTimeout(() => setCopiedBackupCodes(false), 2500);
    }
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
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const { data: stats, isLoading } = useQuery<UserDashboardStats>({
    queryKey: ['userDashboardStats'],
    queryFn: () => apiRequest('/api/admin/user/dashboard'),
  });

  const { data: databases = [] } = useQuery<DatabaseRecord[]>({
    queryKey: ['databases'],
    queryFn: () => apiRequest('/api/admin/databases'),
  });

  const myDatabases = databases.filter((db) => !db.is_shared || db.access_role === 'owner');
  const sharedDatabases = databases.filter((db) => db.is_shared && db.access_role !== 'owner');

  const quotaPercent =
    stats && stats.maxDatabases > 0
      ? Math.min(100, Math.round((stats.databasesCount / stats.maxDatabases) * 100))
      : 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6 select-none animate-in fade-in duration-150">
      {/* Personalized Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-border bg-muted/60 flex items-center justify-center shrink-0">
            {currentUser?.avatar_url ? (
              <img src={currentUser.avatar_url} alt={currentUser.username} className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-6 h-6 text-muted-foreground" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                {t('userDashboard.welcome', 'Chào mừng,')} {currentUser?.username}!
              </h1>
              <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded font-semibold uppercase tracking-wider">
                {currentUser?.role || 'user'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('userDashboard.subtitle', 'Bảng điều khiển cơ sở dữ liệu SQLite cô lập của bạn.')}
            </p>
          </div>
        </div>

        <button
          onClick={onOpenCreateModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-2 self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>{t('userDashboard.createNewDb', 'Tạo Database mới')}</span>
        </button>
      </div>

      {/* Quota & Resource Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Database Quota */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">{t('userDashboard.dbQuota', 'Hạn mức Database')}</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">{stats?.databasesCount ?? myDatabases.length}</span>
            <span className="text-xs text-muted-foreground">/ {stats?.maxDatabases ?? 5} {t('userDashboard.databasesUnit', 'cơ sở dữ liệu')}</span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-muted/60 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                quotaPercent > 80 ? 'bg-red-500' : 'bg-blue-500'
              }`}
              style={{ width: `${quotaPercent}%` }}
            />
          </div>
        </div>

        {/* Shared Databases */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">{t('userDashboard.sharedWithYou', 'Được chia sẻ với bạn')}</span>
            <Users className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {stats?.sharedDatabasesCount ?? sharedDatabases.length}
          </div>
          <span className="text-[10px] text-muted-foreground block">
            {t('userDashboard.sharedWithYouDesc', 'Cơ sở dữ liệu người khác mời bạn cộng tác')}
          </span>
        </div>

        {/* Total Storage Used */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">{t('userDashboard.storageUsed', 'Dung lượng sử dụng')}</span>
            <HardDrive className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {formatBytes(stats?.storageUsedBytes ?? 0)}
          </div>
          <span className="text-[10px] text-muted-foreground block">
            {t('userDashboard.storageUsedDesc', 'Bao gồm file SQLite chính và WAL buffer')}
          </span>
        </div>

        {/* Active API Tokens */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">{t('userDashboard.activeTokens', 'API Tokens đang dùng')}</span>
            <Key className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-foreground">
            {stats?.activeTokensCount ?? 0} {t('userDashboard.tokensUnit', 'Token')}
          </div>
          <span className="text-[10px] text-muted-foreground block">
            {t('userDashboard.activeTokensDesc', 'Dùng kết nối từ SDK & REST API')}
          </span>
        </div>
      </div>

      {/* Database Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Databases */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-bold text-foreground">{t('userDashboard.myDatabases', 'Database của tôi')} ({myDatabases.length})</h2>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">{t('userDashboard.privateAndIsolated', 'Riêng tư & Cô lập')}</span>
          </div>

          <div className="divide-y divide-border flex-1">
            {myDatabases.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
                <p>{t('userDashboard.noDatabases', 'Bạn chưa tạo cơ sở dữ liệu nào.')}</p>
                <button
                  onClick={onOpenCreateModal}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold cursor-pointer"
                >
                  {t('userDashboard.createFirstDb', 'Tạo Database đầu tiên')}
                </button>
              </div>
            ) : (
              myDatabases.map((db) => (
                <div
                  key={db.id}
                  onClick={() => onSelectDatabase(db.id)}
                  className="p-4 hover:bg-accent/40 transition-colors flex items-center justify-between cursor-pointer group"
                >
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground group-hover:text-blue-500 transition-colors truncate">
                        {db.name}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.2 bg-muted rounded border border-border">
                        {db.id}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {db.description || t('db.defaultDescription', 'SQLite DB with WAL mode')}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {formatBytes(db.size_bytes || 0)}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Shared Databases */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-500" />
              <h2 className="text-sm font-bold text-foreground">{t('userDashboard.sharedWithMe', 'Được chia sẻ với tôi')} ({sharedDatabases.length})</h2>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">{t('userDashboard.collaboration', 'Cộng tác')}</span>
          </div>

          <div className="divide-y divide-border flex-1">
            {sharedDatabases.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                {t('userDashboard.noSharedDatabases', 'Chưa có database nào được người khác chia sẻ với bạn.')}
              </div>
            ) : (
              sharedDatabases.map((db) => (
                <div
                  key={db.id}
                  onClick={() => onSelectDatabase(db.id)}
                  className="p-4 hover:bg-accent/40 transition-colors flex items-center justify-between cursor-pointer group"
                >
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground group-hover:text-purple-500 transition-colors truncate">
                        {db.name}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 text-[9px] rounded-full uppercase font-semibold border ${
                          db.access_role === 'admin'
                            ? 'bg-red-500/10 text-red-500 border-red-500/20'
                            : db.access_role === 'editor'
                            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                            : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                        }`}
                      >
                        {db.access_role}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {t('userDashboard.owner', 'Chủ sở hữu:')} {db.owner_username || 'Admin'}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {formatBytes(db.size_bytes || 0)}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Security & 2FA Status Notice */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {t('userDashboard.accountSecurity', 'Bảo mật tài khoản:')} {currentUser?.totp_enabled ? t('userDashboard.totpEnabled', 'Đã bật xác thực 2 bước (2FA)') : t('userDashboard.totpDisabled', 'Chưa bật 2FA')}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {currentUser?.totp_enabled
                ? t('userDashboard.totpProtected', 'Tài khoản của bạn được bảo vệ bằng mã OTP Google Authenticator / Authy.')
                : t('userDashboard.totpRecommend', 'Khuyến nghị kích hoạt 2FA trong mục Cài đặt để ngăn chặn truy cập trái phép.')}
            </p>
          </div>
        </div>

        {currentUser?.totp_enabled ? (
          <a
            href="#/settings"
            className="px-3.5 py-1.5 text-xs font-semibold bg-muted hover:bg-accent border border-border rounded-md text-foreground transition-colors shrink-0"
          >
            {t('userDashboard.manage2fa', 'Quản lý 2FA')}
          </a>
        ) : (
          <button
            onClick={handleOpen2fa}
            className="px-3.5 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors shrink-0 cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <QrCode className="w-3.5 h-3.5" />
            {t('userDashboard.activate2faNow', 'Kích hoạt 2FA ngay')}
          </button>
        )}
      </div>

      {/* Modal Kích Hoạt 2FA */}
      {is2faModalOpen && qrCodeData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-500" />
                <h3 className="text-sm font-bold text-foreground">{t('userDashboard.activateTotpModalTitle', 'Kích hoạt Google Authenticator / Authy')}</h3>
              </div>
              <button
                onClick={() => setIs2faModalOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {totpError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-md">
                {totpError}
              </div>
            )}

            <div className="flex flex-col items-center justify-center p-3 bg-white rounded-lg border border-border">
              <img src={qrCodeData.qrDataUrl} alt="2FA QR Code" className="w-44 h-44" />
              <p className="text-[10px] text-zinc-600 mt-1 font-mono select-all">Secret: {qrCodeData.secret}</p>
            </div>

            <form onSubmit={handleActivate2fa} className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {t('userDashboard.stepPassword', '1. Mật khẩu tài khoản (Bắt buộc xác thực)')}
                </label>
                <input
                  type="password"
                  required
                  value={totpPassword}
                  onChange={(e) => setTotpPassword(e.target.value)}
                  placeholder={t('userDashboard.passwordPlaceholder', 'Nhập mật khẩu hiện tại...')}
                  className="w-full px-3 py-1.5 bg-background border border-border rounded-md text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {t('userDashboard.stepTotpCode', '2. Mã 6 chữ số trên ứng dụng Authenticator')}
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
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
                  {t('common.cancel', 'Hủy')}
                </button>
                <button
                  type="submit"
                  disabled={totpLoading || !totpPassword || totpCode.length !== 6}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold cursor-pointer"
                >
                  {totpLoading ? t('common.verifying', 'Đang xác minh...') : t('userDashboard.confirmAndEnableTotp', 'Xác nhận & Bật 2FA')}
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
                <h3 className="text-sm font-bold text-foreground">{t('settings.activate2faSuccessTitle', 'Kích hoạt 2FA thành công!')}</h3>
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
                {t('settings.backupCodesWarningTitle', 'Lưu trữ 6 mã dự phòng này ở nơi an toàn!')}
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t('settings.backupCodesWarningDesc', 'Nếu bạn làm mất điện thoại hoặc không thể truy cập ứng dụng Authenticator, bạn có thể dùng một trong các mã này để đặt lại mật khẩu và khôi phục tài khoản. Mỗi mã chỉ dùng được 1 lần.')}
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
                <span>{copiedBackupCodes ? t('common.copied', 'Đã sao chép!') : t('settings.copyAllBackupCodes', 'Sao chép tất cả')}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadBackupCodes}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-muted hover:bg-accent border border-border text-foreground rounded text-xs font-medium transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-blue-500" />
                <span>{t('settings.downloadBackupCodes', 'Tải về (.txt)')}</span>
              </button>
            </div>

            <div className="pt-2 border-t border-border flex justify-end">
              <button
                type="button"
                onClick={() => setIsBackupCodesModalOpen(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              >
                {t('settings.backupCodesSavedConfirm', 'Tôi đã lưu mã an toàn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
