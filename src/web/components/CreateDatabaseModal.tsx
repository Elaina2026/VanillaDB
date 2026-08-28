import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Database } from 'lucide-react';
import { apiRequest } from '../api/client.js';
import type { DatabaseRecord } from '@shared/index.js';

export const CreateDatabaseModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (db: DatabaseRecord) => void;
}> = ({ isOpen, onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; description?: string }) =>
      apiRequest('/api/admin/databases', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (db: DatabaseRecord) => {
      queryClient.invalidateQueries({ queryKey: ['databases'] });
      setName('');
      setDescription('');
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
    if (!name.trim()) return;
    setError(null);
    createMutation.mutate({ name: name.trim(), description: description.trim() || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-bold">Create Database</h2>
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
            <label className="block text-xs font-medium text-muted-foreground mb-1">Database Name</label>
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
            <label className="block text-xs font-medium text-muted-foreground mb-1">Description (Optional)</label>
            <textarea
              rows={3}
              placeholder="Brief description for team context..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs border border-border hover:bg-accent rounded-md font-medium text-muted-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || !name.trim()}
              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md font-semibold transition-colors"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Database'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
