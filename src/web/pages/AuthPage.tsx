import React, { useState } from 'react';
import { Database, Lock, User, KeyRound, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { apiRequest } from '../api/client.js';

export const AuthPage: React.FC = () => {
  const { initialized, refetchStatus } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
          <div className="inline-flex w-14 h-14 rounded-xl bg-slate-900 border border-slate-700/60 items-center justify-center mb-2 shadow-md">
            <img src="/src/web/assets/logo.svg" alt="VanillaDatabase Logo" className="w-10 h-10 object-contain" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">
            {!initialized ? 'Welcome to VanillaDatabase' : 'Sign in to VanillaDatabase'}
          </h1>
          <p className="text-xs text-muted-foreground">
            {!initialized
              ? 'Create your administrator credentials to initialize the platform.'
              : 'Enter your credentials to access the management dashboard.'}
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
            <label className="block text-xs font-medium text-muted-foreground mb-1">Username</label>
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
            <label className="block text-xs font-medium text-muted-foreground mb-1">Password</label>
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
              <label className="block text-xs font-medium text-muted-foreground mb-1">Confirm Password</label>
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
            {loading ? 'Processing...' : !initialized ? 'Initialize VanillaDatabase' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};
