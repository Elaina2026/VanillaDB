import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Database, UploadCloud } from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../hooks/useI18n.js';
import type { DatabaseRecord } from '@shared/index.js';

export const CreateDatabaseModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (db: DatabaseRecord) => void;
}> = ({ isOpen, onClose, onSuccess }) => {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [maxSizeMb, setMaxSizeMb] = useState<string>('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; description?: string; maxSizeMb?: number; file?: File | null }) => {
      if (payload.file) {
        const formData = new FormData();
        formData.append('file', payload.file);
        if (payload.name) formData.append('name', payload.name);
        if (payload.description) formData.append('description', payload.description);

        const res = await fetch('/api/admin/databases/import-new', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error?.message || 'Failed to create database from file');
        }
        return data.data;
      }

      return apiRequest('/api/admin/databases', {
        method: 'POST',
        body: JSON.stringify({
          name: payload.name,
          description: payload.description,
          maxSizeMb: payload.maxSizeMb,
        }),
      });
    },
    onSuccess: (db: DatabaseRecord) => {
      queryClient.invalidateQueries({ queryKey: ['databases'] });
      setName('');
      setDescription('');
      setMaxSizeMb('');
      setImportFile(null);
      onSuccess(db);
      onClose();
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to create database');
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() && !importFile) return;
    setError(null);
    createMutation.mutate({
      name: name.trim() || (importFile ? importFile.name.replace(/\.[^/.]+$/, '') : ''),
      description: description.trim() || undefined,
      maxSizeMb: maxSizeMb.trim() ? parseInt(maxSizeMb.trim(), 10) : undefined,
      file: importFile,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-bold">{t('modal.createDb.title', 'Create Database')}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{t('modal.createDb.name', 'Database Name')}</label>
            <input
              type="text"
              required={!importFile}
              placeholder={importFile ? "Auto-derived from file or enter custom name..." : t('modal.createDb.namePlaceholder', 'e.g. Discord Bot Production')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{t('modal.createDb.desc', 'Description (Optional)')}</label>
            <textarea
              rows={2}
              placeholder={t('modal.createDb.descPlaceholder', 'Brief description for team context...')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-muted-foreground">{t('modal.createDb.quota', 'Disk Storage Quota (MB, Optional)')}</label>
              <button
                type="button"
                onClick={() => setMaxSizeMb('')}
                className="text-[10px] text-primary hover:underline font-semibold"
              >
                {t('modal.createDb.unlimited', 'Không giới hạn (Unlimited)')}
              </button>
            </div>
            <input
              type="number"
              min={0}
              placeholder={t('modal.createDb.quotaPlaceholder', 'e.g. 500 (Để trống = Không giới hạn)')}
              value={maxSizeMb}
              onChange={(e) => setMaxSizeMb(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-primary font-mono text-foreground"
            />
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {[
                { label: '∞ Không giới hạn', val: '' },
                { label: '100 MB', val: '100' },
                { label: '500 MB', val: '500' },
                { label: '1 GB', val: '1024' },
                { label: '5 GB', val: '5120' },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setMaxSizeMb(preset.val)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    maxSizeMb === preset.val
                      ? 'bg-primary/10 border-primary text-primary font-bold'
                      : 'border-border text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{t('modal.createDb.quotaHint', 'Giới hạn dung lượng tối đa. Để trống nếu muốn không giới hạn.')}</p>
          </div>

          <div className="pt-1">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              {t('modal.createDb.tabUpload', 'Upload SQLite File')} / Dump
            </label>
            <div className="border border-dashed border-border rounded-lg p-3 bg-muted/20 hover:bg-muted/40 transition-colors">
              <input
                type="file"
                accept=".sql,.sqlite,.db,.csv,.json,.ndjson,.dump"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setImportFile(f);
                  if (f && !name) {
                    setName(f.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_'));
                  }
                }}
                className="w-full text-xs text-muted-foreground file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
              />
              <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                <UploadCloud className="w-3 h-3 text-blue-500 shrink-0" />
                Supports MySQL dumps, PostgreSQL dumps, SQLite (.db), JSON, and CSV.
              </p>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs border border-border hover:bg-accent rounded-md font-medium text-muted-foreground"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || (!name.trim() && !importFile)}
              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md font-semibold transition-colors"
            >
              {createMutation.isPending ? t('common.creating', 'Creating...') : (importFile ? 'Import & Create' : t('modal.createDb.submit', 'Create Database'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
