import React, { useState } from 'react';
import { Lock, User, KeyRound, AlertCircle, Fingerprint } from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';
import { useAuth } from '../hooks/useAuth.js';
import { useI18n } from '../hooks/useI18n.js';
import { apiRequest } from '../api/client.js';
import { LogoIcon } from '../components/LogoIcon.js';

export const AuthPage: React.FC = () => {
  const { initialized, refetchStatus } = useAuth();
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!initialized) {
        // Setup flow
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match');
        }
        await apiRequest('/api/auth/setup', {
          method: 'POST',
          body: JSON.stringify({ username, password, confirmPassword }),
        });
      } else {
        // Login flow
        await apiRequest('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });
      }
      refetchStatus();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-xl shadow-lg p-6 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex w-16 h-16 items-center justify-center mb-2">
            <LogoIcon className="w-16 h-16" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">
            {!initialized ? t('auth.welcome', 'Welcome to VanillaDatabase') : t('auth.signIn', 'Sign in to VanillaDatabase')}
          </h1>
          <p className="text-xs text-muted-foreground">
            {!initialized
              ? t('auth.setupDesc', 'Create your administrator credentials to initialize the platform.')
              : t('auth.loginDesc', 'Enter your credentials to access the management dashboard.')}
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded-md flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{t('auth.username', 'Username')}</label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
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

          {!initialized && (
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
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold shadow-sm transition-colors mt-2"
          >
            {loading ? t('common.loading', 'Processing...') : !initialized ? t('auth.submitSetup', 'Initialize Administrator') : t('auth.submitLogin', 'Sign In')}
          </button>

          {initialized && (
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
                className="w-full py-2 bg-card hover:bg-accent border border-border text-foreground rounded-md text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                <Fingerprint className="w-4 h-4 text-emerald-500" />
                <span>{t('auth.passkeySignIn', 'Sign in with Passkey (Touch ID / Windows Hello)')}</span>
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
