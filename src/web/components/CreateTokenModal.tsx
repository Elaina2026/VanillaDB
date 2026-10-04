import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Key, Copy, Check, ShieldCheck, AlertCircle } from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../hooks/useI18n.js';
import { useAuth } from '../hooks/useAuth.js';
import { isOwnerRole, type TokenPermission } from '@shared/index.js';

export const CreateTokenModal: React.FC<{
  isOpen: boolean;
  databaseId: string | null;
  onClose: () => void;
}> = ({ isOpen, databaseId, onClose }) => {
  const { t } = useI18n();
  const { user: currentUser } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<TokenPermission[]>(['database:read', 'database:write']);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);
  const [rateLimit, setRateLimit] = useState<number | null>(null);
  const [type] = useState<'live'>('live'); // Always live prefix, test prefix removed

  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (payload: any) =>
      apiRequest(`/api/admin/databases/${databaseId}/tokens`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dbTokens', databaseId] });
      setCreatedSecret(data.plainSecret);
    },
    onError: (err: any) => {
      setError(err.message || t('tokens.createError', 'Failed to create token'));
    },
  });

  if (!isOpen || !databaseId) return null;

  const handleTogglePerm = (perm: TokenPermission) => {
    if (permissions.includes(perm)) {
      setPermissions(permissions.filter((p) => p !== perm));
    } else {
      setPermissions([...permissions, perm]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || permissions.length === 0) return;
    setError(null);
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      permissions,
      rateLimit,
      expiresInDays,
      type,
    });
  };

  const handleClose = () => {
    setCreatedSecret(null);
    setName('');
    setDescription('');
    setPermissions(['database:read', 'database:write']);
    setCopiedUrl(false);
    setCopiedSecret(false);
    setError(null);
    onClose();
  };

  const handleCopy = () => {
    if (!createdSecret) return;
    navigator.clipboard.writeText(createdSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90dvh] flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-bold">
              {createdSecret ? t('tokens.generatedTitle', 'API Token Generated') : t('tokens.createToken', 'Create API Token')}
            </h2>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-accent rounded text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {createdSecret ? (
          <div className="p-5 space-y-4 flex-1 overflow-y-auto">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs rounded-md space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {t('tokens.copyPrompt', 'Copy this token & Database URL now')}
              </div>
              <p className="text-[11px] opacity-90">
                {t('tokens.securityNotice', 'For security reasons, VanillaDatabase will never display this secret token again.')}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t('tokens.dbApiUrl', 'Database API Base URL')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}/v1/databases/${databaseId}`}
                  className="flex-1 px-3 py-2 text-xs font-mono bg-background border border-border rounded-md select-all text-blue-400 font-semibold"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/v1/databases/${databaseId}`);
                    setCopiedUrl(true);
                    setTimeout(() => setCopiedUrl(false), 2000);
                  }}
                  className="px-3 py-2 bg-muted hover:bg-accent text-foreground rounded-md text-xs font-semibold flex items-center gap-1.5 shrink-0 border border-border cursor-pointer transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedUrl ? t('common.copied', 'Copied') : t('storage.copyUrl', 'Copy URL')}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t('tokens.tokenSecret', 'Your Token Secret')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={createdSecret}
                  className="flex-1 px-3 py-2 text-xs font-mono bg-background border border-border rounded-md select-all text-emerald-400 font-semibold"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedSecret ? t('common.copied', 'Copied') : t('common.copy', 'Copy')}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t('tokens.snippetTitle', 'TypeScript / Python Connection Snippet')}
              </label>
              <div className="p-2.5 bg-muted/60 border border-border rounded-md text-[11px] font-mono text-muted-foreground space-y-1 overflow-x-auto break-all whitespace-pre-wrap">
                <div className="text-foreground select-all">
                  <span className="text-purple-400">new</span> VanillaDatabase&#123; url: <span className="text-emerald-400">'{window.location.origin}/v1/databases/{databaseId}'</span>, token: <span className="text-emerald-400">'{createdSecret}'</span> &#125;
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleClose}
                className="px-4 py-1.5 text-xs bg-muted hover:bg-accent text-foreground font-semibold rounded-md transition-colors cursor-pointer"
              >
                {t('common.done', 'Done')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4 flex-1 overflow-y-auto">
            {error && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded font-medium">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t('tokens.nameLabel', 'Token Name')}
              </label>
              <input
                type="text"
                required
                placeholder={t('tokens.namePlaceholder', 'e.g. Discord Bot Production')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {t('tokens.permissions', 'Permissions')}
              </label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {[
                  { id: 'database:read', label: t('tokens.permRead', 'Read (SELECT)') },
                  { id: 'database:write', label: t('tokens.permWrite', 'Write (INSERT/UPDATE/DELETE)') },
                  { id: 'database:ddl', label: t('tokens.permDdl', 'DDL (Schema changes)') },
                  { id: 'database:admin', label: t('tokens.permAdmin', 'Admin (Full access)') },
                ].map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 p-2 border border-border rounded bg-muted/20 cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={permissions.includes(p.id as TokenPermission)}
                      onChange={() => handleTogglePerm(p.id as TokenPermission)}
                      className="rounded border-border text-blue-600 focus:ring-blue-500"
                    />
                    <span className="truncate">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {t('tokens.expiration', 'Expiration')}
                </label>
                <select
                  value={expiresInDays ?? ''}
                  onChange={(e) => setExpiresInDays(e.target.value ? parseInt(e.target.value, 10) : null)}
                  className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded-md"
                >
                  <option value="">{t('tokens.expNever', 'Never')}</option>
                  <option value="7">7 {t('tokens.days', 'Days')}</option>
                  <option value="30">30 {t('tokens.days', 'Days')}</option>
                  <option value="90">90 {t('tokens.days', 'Days')}</option>
                  <option value="365">1 {t('tokens.year', 'Year')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  {t('tokens.rateLimit', 'Rate Limit')}
                </label>
                <select
                  value={rateLimit === 0 ? '0' : (rateLimit === null ? 'default' : String(rateLimit))}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'default') {
                      setRateLimit(null);
                    } else if (val === '0') {
                      setRateLimit(0);
                    } else {
                      setRateLimit(parseInt(val, 10));
                    }
                  }}
                  className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded-md text-foreground focus:ring-1 focus:ring-primary"
                >
                  <option value="default">
                    {t('tokens.roleDefault', 'Tùy theo Role')} ({currentUser?.rate_limit_per_minute ? `${currentUser.rate_limit_per_minute} ${t('tokens.reqPerMin', 'req/min')}` : t('tokens.unlimitedShort', '∞ Không giới hạn')})
                  </option>
                  {currentUser && isOwnerRole(currentUser.role) && (
                    <option value="0">{t('tokens.unlimited', 'Không giới hạn (0 req/min)')}</option>
                  )}
                  {[30, 60, 120, 180, 300, 600, 1000]
                    .filter((opt) => (currentUser && isOwnerRole(currentUser.role)) || !currentUser?.rate_limit_per_minute || opt <= currentUser.rate_limit_per_minute)
                    .map((opt) => (
                      <option key={opt} value={String(opt)}>
                        {opt} {t('tokens.reqPerMin', 'req/min')}
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {rateLimit === 0
                    ? t('tokens.unlimitedDesc', 'Token sẽ không bị giới hạn số lượng request.')
                    : (rateLimit === null
                        ? `${t('tokens.defaultRoleDesc', 'Hạn mức token áp dụng theo Role của tài khoản')} (${currentUser?.rate_limit_per_minute || 180} req/min).`
                        : `${rateLimit} req/min`)}
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-3 py-1.5 text-xs border border-border hover:bg-accent rounded-md font-medium text-muted-foreground"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || !name.trim() || permissions.length === 0}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md font-semibold transition-colors"
              >
                {createMutation.isPending ? t('common.saving', 'Saving...') : t('tokens.createToken', 'Create Token')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
