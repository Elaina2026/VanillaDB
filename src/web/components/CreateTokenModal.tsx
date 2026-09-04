import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Key, Copy, Check, ShieldCheck, AlertCircle } from 'lucide-react';
import { apiRequest } from '../api/client.js';
import type { TokenPermission } from '@shared/index.js';

export const CreateTokenModal: React.FC<{
  isOpen: boolean;
  databaseId: string | null;
  onClose: () => void;
}> = ({ isOpen, databaseId, onClose }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<TokenPermission[]>(['database:read', 'database:write']);
  const [expiresInDays, setExpiresInDays] = useState<number | null>(null);
  const [rateLimit, setRateLimit] = useState<number | null>(null);
  const [type, setType] = useState<'live' | 'test'>('live');

  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
      setError(err.message || 'Failed to create token');
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
    setCopied(false);
    setError(null);
    onClose();
  };

  const handleCopy = () => {
    if (!createdSecret) return;
    navigator.clipboard.writeText(createdSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-bold">
              {createdSecret ? 'API Token Generated' : 'Create API Token'}
            </h2>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-accent rounded text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {createdSecret ? (
          <div className="p-5 space-y-4">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs rounded-md space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                Copy this token & Database URL now
              </div>
              <p className="text-[11px] opacity-90">
                For security reasons, VanillaDatabase will never display this secret token again.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Database API Base URL</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}/v1/databases/${databaseId}`}
                  className="flex-1 px-3 py-2 text-xs font-mono bg-background border border-border rounded-md select-all text-blue-400 font-semibold"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/v1/databases/${databaseId}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="px-3 py-2 bg-muted hover:bg-accent text-foreground rounded-md text-xs font-semibold flex items-center gap-1.5 shrink-0 border border-border"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy URL
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Your Token Secret</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={createdSecret}
                  className="flex-1 px-3 py-2 text-xs font-mono bg-background border border-border rounded-md select-all text-emerald-400 font-semibold"
                />
                <button
                  onClick={handleCopy}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy Secret'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">TypeScript / Python Connection Snippet</label>
              <div className="p-2.5 bg-muted/60 border border-border rounded-md text-[11px] font-mono text-muted-foreground space-y-1">
                <div className="text-foreground">
                  <span className="text-purple-400">new</span> VanillaDatabase&#123; url: <span className="text-emerald-400">'{window.location.origin}/v1/databases/{databaseId}'</span>, token: <span className="text-emerald-400">'{createdSecret}'</span> &#125;
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleClose}
                className="px-4 py-1.5 text-xs bg-muted hover:bg-accent text-foreground font-semibold rounded-md transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {error && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded font-medium">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Token Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Discord Bot Production"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Permissions</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {[
                  { id: 'database:read', label: 'Read (SELECT)' },
                  { id: 'database:write', label: 'Write (INSERT/UPDATE/DELETE)' },
                  { id: 'database:ddl', label: 'DDL (Schema changes)' },
                  { id: 'database:admin', label: 'Admin (Full access)' },
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

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Expiration</label>
                <select
                  value={expiresInDays ?? ''}
                  onChange={(e) => setExpiresInDays(e.target.value ? parseInt(e.target.value, 10) : null)}
                  className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded-md"
                >
                  <option value="">Never</option>
                  <option value="7">7 Days</option>
                  <option value="30">30 Days</option>
                  <option value="90">90 Days</option>
                  <option value="365">1 Year</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Rate Limit</label>
                <select
                  value={rateLimit ?? ''}
                  onChange={(e) => setRateLimit(e.target.value ? parseInt(e.target.value, 10) : null)}
                  className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded-md"
                >
                  <option value="">Unlimited</option>
                  <option value="60">60 req/min</option>
                  <option value="300">300 req/min</option>
                  <option value="600">600 req/min</option>
                  <option value="1200">1200 req/min</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Prefix</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded-md"
                >
                  <option value="live">vdb_live_</option>
                  <option value="test">vdb_test_</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-3 py-1.5 text-xs border border-border hover:bg-accent rounded-md font-medium text-muted-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || !name.trim() || permissions.length === 0}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md font-semibold transition-colors"
              >
                {createMutation.isPending ? 'Generating...' : 'Generate Token'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
