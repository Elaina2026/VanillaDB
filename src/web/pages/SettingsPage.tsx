import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Save, Check } from 'lucide-react';
import { apiRequest } from '../api/client.js';
import type { SystemSettings } from '@shared/index.js';

export const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data: settings, isLoading } = useQuery<SystemSettings>({
    queryKey: ['systemSettings'],
    queryFn: () => apiRequest('/api/system/settings'),
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
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const current = { ...settings, ...form };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(current);
  };

  if (isLoading) {
    return <div className="p-6 text-xs text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold tracking-tight">System Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure global SQLite engine defaults, backups, and security policies.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md text-xs font-medium transition-colors"
        >
          {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          {saved ? 'Saved' : 'Save Changes'}
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* General Settings */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold border-b border-border pb-2">General</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Instance Name</label>
              <input
                type="text"
                value={current.instance_name || ''}
                onChange={(e) => setForm({ ...form, instance_name: e.target.value })}
                className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Public Base URL</label>
              <input
                type="text"
                value={current.base_url || ''}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Database Defaults */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold border-b border-border pb-2">SQLite Engine Defaults</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Default Journal Mode</label>
              <select
                value={current.default_journal_mode || 'wal'}
                onChange={(e) => setForm({ ...form, default_journal_mode: e.target.value })}
                className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500"
              >
                <option value="wal">WAL (Write-Ahead Logging - Recommended)</option>
                <option value="delete">DELETE</option>
                <option value="truncate">TRUNCATE</option>
                <option value="memory">MEMORY</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Busy Timeout (ms)</label>
              <input
                type="number"
                value={current.default_busy_timeout || 5000}
                onChange={(e) => setForm({ ...form, default_busy_timeout: parseInt(e.target.value, 10) })}
                className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Synchronous Mode</label>
              <select
                value={current.default_synchronous || 'normal'}
                onChange={(e) => setForm({ ...form, default_synchronous: e.target.value })}
                className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500"
              >
                <option value="normal">NORMAL (Recommended with WAL)</option>
                <option value="full">FULL</option>
                <option value="extra">EXTRA</option>
                <option value="off">OFF</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Foreign Keys Enforcement</label>
              <select
                value={current.default_foreign_keys ? 'true' : 'false'}
                onChange={(e) => setForm({ ...form, default_foreign_keys: e.target.value === 'true' })}
                className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500"
              >
                <option value="true">Enabled (PRAGMA foreign_keys = ON)</option>
                <option value="false">Disabled</option>
              </select>
            </div>
          </div>
        </div>

        {/* Backups Schedule */}
        <div className="bg-card border border-border rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold border-b border-border pb-2">Automated Backups</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Backup Frequency</label>
              <select
                value={current.backup_schedule || 'daily'}
                onChange={(e) => setForm({ ...form, backup_schedule: e.target.value })}
                className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500"
              >
                <option value="disabled">Disabled</option>
                <option value="hourly">Every Hour</option>
                <option value="6hours">Every 6 Hours</option>
                <option value="12hours">Every 12 Hours</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Backup Retention Count</label>
              <input
                type="number"
                value={current.backup_retention || 10}
                onChange={(e) => setForm({ ...form, backup_retention: parseInt(e.target.value, 10) })}
                className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-[11px] text-muted-foreground">Keep last N backups per database</span>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
