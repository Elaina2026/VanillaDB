import React, { useState } from 'react';
import { Lock, User, KeyRound, AlertCircle, Fingerprint, Mail, ShieldCheck, ArrowLeft, Shield, CheckCircle2, X } from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';
import { useAuth } from '../hooks/useAuth.js';
import { useI18n } from '../hooks/useI18n.js';
import { apiRequest } from '../api/client.js';
import { LogoIcon } from '../components/LogoIcon.js';

export const AuthPage: React.FC = () => {
  const { initialized, refetchStatus } = useAuth();
  const { t } = useI18n();

  // Mode: 'login' | 'register'
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Form Fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 2FA Challenge State
  const [require2fa, setRequire2fa] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');

  // 2FA Recovery with Backup Code State
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');
  const [recoveryBackupCode, setRecoveryBackupCode] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [recoveryStatus, setRecoveryStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePasskeyLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const optsRes = await apiRequest('/api/auth/webauthn/login-options', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim() || undefined }),
      });
      const asseResp = await startAuthentication({ optionsJSON: optsRes.data });
      await apiRequest('/api/auth/webauthn/login-verify', {
        method: 'POST',
        body: JSON.stringify(asseResp),
      });
      refetchStatus();
    } catch (err: any) {
      setError(err.message || 'Passkey authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handle2faSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiRequest('/api/auth/login/2fa', {
        method: 'POST',
        body: JSON.stringify({ tempToken, code: totpCode.trim() }),
      });
      refetchStatus();
    } catch (err: any) {
      setError(err.message || 'Mã 2FA không chính xác');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryStatus(null);

    if (recoveryNewPassword.length < 6) {
      setRecoveryStatus({ type: 'error', message: 'Mật khẩu mới phải có tối thiểu 6 ký tự' });
      return;
    }
    if (recoveryNewPassword !== recoveryConfirmPassword) {
      setRecoveryStatus({ type: 'error', message: 'Mật khẩu xác nhận không khớp' });
      return;
    }

    setRecoveryLoading(true);
    try {
      const res = await apiRequest('/api/auth/recovery/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          usernameOrEmail: recoveryIdentifier.trim(),
          backupCode: recoveryBackupCode.trim(),
          newPassword: recoveryNewPassword,
        }),
      });

      setRecoveryStatus({
        type: 'success',
        message: res?.message || 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập ngay với mật khẩu mới.'
      });
      setTimeout(() => {
        setIsRecoveryOpen(false);
        setRequire2fa(false);
        setAuthMode('login');
        setUsername(recoveryIdentifier.trim());
        setPassword('');
        setRecoveryStatus(null);
      }, 3000);
    } catch (err: any) {
      setRecoveryStatus({ type: 'error', message: err.message || 'Khôi phục tài khoản thất bại' });
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!initialized) {
        // Setup flow
        if (password !== confirmPassword) {
          throw new Error('Mật khẩu xác nhận không khớp');
        }
        await apiRequest('/api/auth/setup', {
          method: 'POST',
          body: JSON.stringify({ username, password, confirmPassword, email: email || undefined }),
        });
        refetchStatus();
      } else if (authMode === 'register') {
        // Register flow
        if (password !== confirmPassword) {
          throw new Error('Mật khẩu xác nhận không khớp');
        }
        await apiRequest('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim(), password, username: username.trim() || undefined }),
        });
        refetchStatus();
      } else {
        // Login flow
        const res = await apiRequest('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username: username.trim(), password }),
        });

        const data = res?.data || res;
        if (data?.require2fa) {
          setRequire2fa(true);
          setTempToken(data.tempToken);
          setLoading(false);
          return;
        }

        refetchStatus();
      }
    } catch (err: any) {
      setError(err.message || 'Xác thực thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-background p-4 select-none">
      <div className="w-full max-w-sm bg-card border border-border rounded-xl shadow-lg p-6 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex w-16 h-16 items-center justify-center mb-2">
            <LogoIcon className="w-16 h-16" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            {!initialized
              ? t('auth.welcome', 'Welcome to VanillaDatabase')
              : require2fa
              ? t('auth.enter2fa', 'Two-Factor Verification')
              : authMode === 'register'
              ? t('auth.signUp', 'Create New Account')
              : t('auth.signIn', 'Sign in to VanillaDatabase')}
          </h1>
          <p className="text-xs text-muted-foreground">
            {!initialized
              ? t('auth.setupDesc', 'Create your administrator credentials to initialize the platform.')
              : require2fa
              ? t('auth.enter2faDesc', 'Enter the 6-digit verification code from your Authenticator app.')
              : authMode === 'register'
              ? t('auth.setupDesc', 'Sign up for your isolated SQLite tenant space.')
              : t('auth.loginDesc', 'Enter your credentials to access the management dashboard.')}
          </p>
        </div>

        {/* Tab switch between Sign In and Sign Up */}
        {initialized && !require2fa && (
          <div className="grid grid-cols-2 p-1 bg-muted/60 rounded-lg border border-border text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setError(null);
              }}
              className={`py-1.5 rounded-md transition-all ${
                authMode === 'login' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('auth.submitLogin', 'Sign In')}
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setError(null);
              }}
              className={`py-1.5 rounded-md transition-all ${
                authMode === 'register' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('auth.signUp', 'Sign Up')}
            </button>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-md flex items-center gap-2 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 2FA Verification Card */}
        {require2fa ? (
          <form onSubmit={handle2faSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('auth.totpCode', '6-digit Authenticator Code')}</label>
              <div className="relative">
                <ShieldCheck className="w-4 h-4 absolute left-3 top-2.5 text-blue-500" />
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full pl-9 pr-3 py-2 text-center tracking-widest text-lg font-mono font-bold bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || totpCode.length !== 6}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              {loading ? t('common.loading', 'Processing...') : t('auth.verify2fa', 'Verify & Sign In')}
            </button>

            <button
              type="button"
              onClick={() => {
                setRequire2fa(false);
                setTotpCode('');
                setError(null);
              }}
              className="w-full py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t('auth.backToLogin', 'Back to Sign In')}</span>
            </button>

            <div className="pt-2 border-t border-border text-center">
              <button
                type="button"
                onClick={() => {
                  setRecoveryIdentifier(username);
                  setIsRecoveryOpen(true);
                }}
                className="text-[11px] text-blue-500 hover:text-blue-400 hover:underline transition-colors"
              >
                Mất điện thoại? Khôi phục bằng mã dự phòng (Backup Code)
              </button>
            </div>
          </form>
        ) : (
          /* Normal Auth Form (Login / Register / Setup) */
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {(!initialized || authMode === 'register') && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t('auth.email', 'Email Address')}</label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                  <input
                    type="email"
                    required={authMode === 'register'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {authMode === 'register' ? t('auth.username', 'Username (Optional)') : t('auth.username', 'Username or Email')}
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  required={authMode !== 'register'}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={authMode === 'register' ? 'johndoe' : 'admin or user@example.com'}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('auth.password', 'Password')}</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {(!initialized || authMode === 'register') && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t('auth.confirmPassword', 'Confirm Password')}</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold shadow-sm transition-colors mt-2 cursor-pointer"
            >
              {loading
                ? t('common.loading', 'Processing...')
                : !initialized
                ? t('auth.submitSetup', 'Initialize Administrator')
                : authMode === 'register'
                ? t('auth.submitRegister', 'Create Account')
                : t('auth.submitLogin', 'Sign In')}
            </button>

            {initialized && authMode === 'login' && (
              <div className="pt-2">
                <div className="relative flex items-center justify-center my-3">
                  <div className="border-t border-border w-full" />
                  <span className="bg-card px-2 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    Or Biometrics
                  </span>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handlePasskeyLogin}
                  className="w-full py-2 bg-card hover:bg-accent border border-border text-foreground rounded-md text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Fingerprint className="w-4 h-4 text-emerald-500" />
                  <span>{t('auth.passkeySignIn', 'Sign in with Passkey (Touch ID / Windows Hello)')}</span>
                </button>
              </div>
            )}
          </form>
        )}
      </div>

      {/* Modal Khôi Phục Tài Khoản Bằng Mã Dự Phòng 2FA */}
      {isRecoveryOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl p-6 w-full max-w-md space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-bold text-foreground">Khôi Phục Mật Khẩu Bằng Mã 2FA</h3>
              </div>
              <button
                onClick={() => setIsRecoveryOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Nhập tên tài khoản hoặc email kèm một trong 6 mã dự phòng (định dạng <code className="text-foreground font-mono">XXXX-XXXX</code>) đã được cấp khi kích hoạt 2FA.
            </p>

            {recoveryStatus && (
              <div
                className={`p-3 rounded-md text-xs flex items-center gap-2 ${
                  recoveryStatus.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500'
                    : 'bg-red-500/10 border border-red-500/20 text-red-500'
                }`}
              >
                {recoveryStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{recoveryStatus.message}</span>
              </div>
            )}

            <form onSubmit={handleRecoverySubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Tên tài khoản hoặc Email</label>
                <input
                  type="text"
                  required
                  value={recoveryIdentifier}
                  onChange={(e) => setRecoveryIdentifier(e.target.value)}
                  placeholder="admin hoặc user@example.com"
                  className="w-full px-3 py-1.5 bg-background border border-border rounded-md text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Mã dự phòng (Backup Code: XXXX-XXXX)</label>
                <input
                  type="text"
                  required
                  value={recoveryBackupCode}
                  onChange={(e) => setRecoveryBackupCode(e.target.value.toUpperCase())}
                  placeholder="VD: 7T9K-4MP2"
                  className="w-full px-3 py-1.5 text-center font-mono font-bold tracking-wider bg-background border border-border rounded-md text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Mật khẩu mới (Tối thiểu 6 ký tự)</label>
                <input
                  type="password"
                  required
                  value={recoveryNewPassword}
                  onChange={(e) => setRecoveryNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-1.5 bg-background border border-border rounded-md text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Xác nhận mật khẩu mới</label>
                <input
                  type="password"
                  required
                  value={recoveryConfirmPassword}
                  onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-1.5 bg-background border border-border rounded-md text-foreground"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsRecoveryOpen(false)}
                  className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={recoveryLoading || !recoveryIdentifier || !recoveryBackupCode || !recoveryNewPassword || !recoveryConfirmPassword}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold"
                >
                  {recoveryLoading ? 'Đang xác thực...' : 'Đặt lại mật khẩu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
