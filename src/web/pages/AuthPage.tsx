import React, { useState, useEffect } from 'react';
import {
  Lock,
  User,
  KeyRound,
  AlertCircle,
  Fingerprint,
  Mail,
  ShieldCheck,
  ArrowLeft,
  Shield,
  CheckCircle2,
  Key,
  Smartphone
} from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';
import { useAuth } from '../hooks/useAuth.js';
import { useI18n } from '../hooks/useI18n.js';
import { apiRequest } from '../api/client.js';
import { LogoIcon } from '../components/LogoIcon.js';

interface AuthPageProps {
  initialMode?: 'login' | 'register' | 'reset-password';
  onNavigate?: (mode: 'login' | 'register' | 'reset-password') => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ initialMode = 'login', onNavigate }) => {
  const { initialized, refetchStatus } = useAuth();
  const { t } = useI18n();

  // Mode: 'login' | 'register' | 'reset-password'
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'reset-password'>(initialMode);

  useEffect(() => {
    if (initialMode) {
      setAuthMode(initialMode);
    }
  }, [initialMode]);

  const switchMode = (mode: 'login' | 'register' | 'reset-password') => {
    setAuthMode(mode);
    setError(null);
    setRecoveryStatus(null);
    if (onNavigate) {
      onNavigate(mode);
    } else {
      window.location.hash = `#/${mode}`;
    }
  };

  // Form Fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 2FA Challenge State
  const [require2fa, setRequire2fa] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');

  // Reset Password State (Dual-Factor: TOTP 6-digit OR Backup Code)
  const [recoveryMethod, setRecoveryMethod] = useState<'totp' | 'backup'>('totp');
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');
  const [recoveryTotpCode, setRecoveryTotpCode] = useState('');
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
      setError(err.message || t('auth.passkeyFailed', 'Passkey authentication failed'));
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
      setError(err.message || t('auth.invalid2fa', 'Mã 2FA không chính xác'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryStatus(null);

    if (recoveryNewPassword.length < 6) {
      setRecoveryStatus({ type: 'error', message: t('auth.recoveryPasswordMin', 'Mật khẩu mới phải có tối thiểu 6 ký tự') });
      return;
    }
    if (recoveryNewPassword !== recoveryConfirmPassword) {
      setRecoveryStatus({ type: 'error', message: t('auth.passwordMismatch', 'Mật khẩu xác nhận không khớp') });
      return;
    }

    if (recoveryMethod === 'totp' && recoveryTotpCode.trim().length !== 6) {
      setRecoveryStatus({ type: 'error', message: t('auth.invalid2fa', 'Mã xác thực 2FA phải gồm 6 chữ số') });
      return;
    }

    if (recoveryMethod === 'backup' && recoveryBackupCode.trim().length < 8) {
      setRecoveryStatus({ type: 'error', message: 'Mã dự phòng khôi phục phải có ít nhất 8 ký tự' });
      return;
    }

    setRecoveryLoading(true);
    try {
      const payload: any = {
        usernameOrEmail: recoveryIdentifier.trim(),
        newPassword: recoveryNewPassword,
      };

      if (recoveryMethod === 'totp') {
        payload.totpCode = recoveryTotpCode.trim();
      } else {
        payload.backupCode = recoveryBackupCode.trim();
      }

      const res = await apiRequest('/api/auth/recovery/reset-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setRecoveryStatus({
        type: 'success',
        message: res?.message || t('auth.recoverySuccess', 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập ngay với mật khẩu mới.')
      });

      setTimeout(() => {
        setUsername(recoveryIdentifier.trim());
        setPassword('');
        setRecoveryTotpCode('');
        setRecoveryBackupCode('');
        setRecoveryNewPassword('');
        setRecoveryConfirmPassword('');
        setRecoveryStatus(null);
        switchMode('login');
      }, 2500);
    } catch (err: any) {
      setRecoveryStatus({ type: 'error', message: err.message || t('auth.recoveryFailed', 'Khôi phục tài khoản thất bại') });
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
              : authMode === 'reset-password'
              ? t('auth.resetPasswordTitle', 'Khôi Phục & Đặt Lại Mật Khẩu')
              : authMode === 'register'
              ? t('auth.signUp', 'Create New Account')
              : t('auth.signIn', 'Sign in to VanillaDatabase')}
          </h1>
          <p className="text-xs text-muted-foreground">
            {!initialized
              ? t('auth.setupDesc', 'Create your administrator credentials to initialize the platform.')
              : require2fa
              ? t('auth.enter2faDesc', 'Enter the 6-digit verification code from your Authenticator app.')
              : authMode === 'reset-password'
              ? t('auth.resetPasswordDesc', 'Khôi phục quyền truy cập tài khoản bằng mã xác thực Authenticator 6 số hoặc mã dự phòng đã lưu.')
              : authMode === 'register'
              ? t('auth.setupDesc', 'Sign up for your isolated SQLite tenant space.')
              : t('auth.loginDesc', 'Enter your credentials to access the management dashboard.')}
          </p>
        </div>

        {/* Tab switch between Sign In, Sign Up, and Reset Password */}
        {initialized && !require2fa && (
          <div className="grid grid-cols-3 p-1 bg-muted/60 rounded-lg border border-border text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`py-1.5 rounded-md transition-all ${
                authMode === 'login' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('auth.tabSignIn', 'Sign In')}
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`py-1.5 rounded-md transition-all ${
                authMode === 'register' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('auth.tabSignUp', 'Sign Up')}
            </button>
            <button
              type="button"
              onClick={() => switchMode('reset-password')}
              className={`py-1.5 rounded-md transition-all ${
                authMode === 'reset-password' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('auth.tabResetPassword', 'Reset')}
            </button>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-md flex items-center gap-2 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 2FA Verification Form */}
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
                  setRequire2fa(false);
                  switchMode('reset-password');
                }}
                className="text-[11px] text-blue-500 hover:text-blue-400 hover:underline transition-colors cursor-pointer"
              >
                {t('auth.lost2faRecovery', 'Lost phone? Recover using backup code')}
              </button>
            </div>
          </form>
        ) : authMode === 'reset-password' ? (
          /* Dedicated Forgot / Reset Password Screen */
          <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5 text-xs">
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

            {/* Account Username or Email */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('auth.usernameOrEmail', 'Username or Email')}</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  required
                  value={recoveryIdentifier}
                  onChange={(e) => setRecoveryIdentifier(e.target.value)}
                  placeholder={t('auth.usernameOrEmailPlaceholder', 'admin or user@example.com')}
                  className="w-full pl-9 pr-3 py-1.5 bg-background border border-border rounded-md text-foreground focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Recovery Method Selection */}
            <div>
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                {t('auth.resetMethod', 'Phương thức xác minh khôi phục')}
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted/60 border border-border rounded-lg text-[11px]">
                <button
                  type="button"
                  onClick={() => setRecoveryMethod('totp')}
                  className={`py-1.5 px-2 rounded-md flex items-center justify-center gap-1.5 font-medium transition-all ${
                    recoveryMethod === 'totp' ? 'bg-card text-foreground shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5 text-blue-500" />
                  <span>2FA OTP (6 số)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRecoveryMethod('backup')}
                  className={`py-1.5 px-2 rounded-md flex items-center justify-center gap-1.5 font-medium transition-all ${
                    recoveryMethod === 'backup' ? 'bg-card text-foreground shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Key className="w-3.5 h-3.5 text-amber-500" />
                  <span>Mã dự phòng</span>
                </button>
              </div>
            </div>

            {/* Credential input according to selected method */}
            {recoveryMethod === 'totp' ? (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t('auth.totpCode', '6-digit Authenticator Code')}</label>
                <div className="relative">
                  <ShieldCheck className="w-4 h-4 absolute left-3 top-2.5 text-blue-500" />
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={recoveryTotpCode}
                    onChange={(e) => setRecoveryTotpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full pl-9 pr-3 py-1.5 text-center font-mono font-bold tracking-widest bg-background border border-border rounded-md text-foreground focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">{t('auth.backupCodeLabel', 'Backup Code (XXXX-XXXX)')}</label>
                <div className="relative">
                  <Shield className="w-4 h-4 absolute left-3 top-2.5 text-amber-500" />
                  <input
                    type="text"
                    required
                    value={recoveryBackupCode}
                    onChange={(e) => setRecoveryBackupCode(e.target.value.toUpperCase())}
                    placeholder={t('auth.backupCodePlaceholder', 'VD: 7T9K-4MP2')}
                    className="w-full pl-9 pr-3 py-1.5 text-center font-mono font-bold tracking-wider bg-background border border-border rounded-md text-foreground focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {/* New Password & Confirmation */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('auth.newPasswordMin', 'New Password (min 6 characters)')}</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  type="password"
                  required
                  value={recoveryNewPassword}
                  onChange={(e) => setRecoveryNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3 py-1.5 bg-background border border-border rounded-md text-foreground focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t('auth.confirmNewPassword', 'Confirm New Password')}</label>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  type="password"
                  required
                  value={recoveryConfirmPassword}
                  onChange={(e) => setRecoveryConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3 py-1.5 bg-background border border-border rounded-md text-foreground focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={recoveryLoading}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold shadow-sm transition-colors mt-2 cursor-pointer"
            >
              {recoveryLoading ? t('common.loading', 'Processing...') : t('auth.resetPasswordButton', 'Reset Password & Continue')}
            </button>

            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t('auth.backToLogin', 'Back to Sign In')}</span>
            </button>
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
                {authMode === 'register' ? t('auth.username', 'Username (Optional)') : t('auth.usernameOrEmail', 'Username or Email')}
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  required={authMode !== 'register'}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={authMode === 'register' ? 'johndoe' : t('auth.usernameOrEmailPlaceholder', 'admin or user@example.com')}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-muted-foreground">{t('auth.password', 'Password')}</label>
                {initialized && authMode === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryIdentifier(username.trim());
                      switchMode('reset-password');
                    }}
                    className="text-[11px] text-blue-500 hover:text-blue-400 hover:underline transition-colors cursor-pointer"
                  >
                    {t('auth.forgotPassword', 'Forgot password?')}
                  </button>
                )}
              </div>
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
                    {t('auth.orBiometrics', 'Or Biometrics')}
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
    </div>
  );
};
