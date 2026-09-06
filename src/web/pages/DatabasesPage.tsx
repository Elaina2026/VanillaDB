import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Database,
  Plus,
  Search,
  ExternalLink,
  Trash2,
  Copy,
  Check,
  Clock,
  User,
  HardDrive,
  Sparkles,
  Layers,
  X,
  Share2,
  ShieldAlert,
  SlidersHorizontal
} from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { formatTimeAgo } from '../lib/utils.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { useAuth } from '../hooks/useAuth.js';
import { useI18n } from '../hooks/useI18n.js';
import type { DatabaseRecord } from '@shared/index.js';

export const DatabasesPage: React.FC<{
  onSelectDatabase: (id: string) => void;
  onOpenCreateModal: () => void;
}> = ({ onSelectDatabase, onOpenCreateModal }) => {
  const { user: currentUser } = useAuth();
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'mine' | 'shared'>('all');
  const [deletingDb, setDeletingDb] = useState<DatabaseRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: databases = [], isLoading } = useQuery<DatabaseRecord[]>({
    queryKey: ['databases'],
    queryFn: () => apiRequest('/api/admin/databases'),
  });

  const deleteDbMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/admin/databases/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databases'] });
      setDeletingDb(null);
    },
  });

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered = databases.filter((db) => {
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      db.name.toLowerCase().includes(q) ||
      db.slug.toLowerCase().includes(q) ||
      db.id.toLowerCase().includes(q) ||
      (db.owner_username && db.owner_username.toLowerCase().includes(q)) ||
      (db.description && db.description.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (filterType === 'mine') {
      return db.owner_id === currentUser?.userId || db.owner_username === currentUser?.username;
    }
    if (filterType === 'shared') {
      return (db as any).is_shared === 1 || (db.owner_id && db.owner_id !== currentUser?.userId);
    }
    return true;
  });

  const canDeleteDb = (db: DatabaseRecord) => {
    if (currentUser?.role === 'super_admin' || currentUser?.role === 'admin') return true;
    if (db.owner_id === currentUser?.userId) return true;
    if ((db as any).access_role === 'owner') return true;
    return false;
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
              <Database className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t('databases.title', 'Databases')}</h1>
            <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground border border-border rounded-full font-mono">
              {databases.length}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t('databases.desc', 'Manage your SQLite database instances and API endpoints.')}
          </p>
        </div>

        <button
          onClick={onOpenCreateModal}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm shadow-blue-500/25 hover:shadow-md hover:shadow-blue-500/35 transition-all cursor-pointer self-start sm:self-auto active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span>{t('databases.create', 'Create Database')}</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder={t('databases.search', 'Search by name, slug, ID, or creator...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2 text-xs bg-card border border-border hover:border-muted-foreground/40 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all placeholder:text-muted-foreground/70"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2.5 p-0.5 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors cursor-pointer"
              title={t('common.clear', 'Clear search')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border shrink-0 self-start sm:self-auto text-xs">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
              filterType === 'all'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('common.all', 'All')} ({databases.length})
          </button>
          <button
            onClick={() => setFilterType('mine')}
            className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
              filterType === 'mine'
                ? 'bg-card text-blue-500 shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('common.mine', 'Created by me')}
          </button>
          {databases.some((d: any) => d.is_shared === 1 || (d.owner_id && d.owner_id !== currentUser?.userId)) && (
            <button
              onClick={() => setFilterType('shared')}
              className={`px-3 py-1 rounded-md font-medium transition-all cursor-pointer ${
                filterType === 'shared'
                  ? 'bg-card text-purple-500 shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('common.shared', 'Shared with me')}
            </button>
          )}
        </div>
      </div>

      {/* Database Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="h-48 bg-card/60 border border-border rounded-xl p-5 animate-pulse flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-muted" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 bg-muted rounded w-2/3" />
                    <div className="h-3 bg-muted rounded w-1/3" />
                  </div>
                </div>
                <div className="h-3 bg-muted rounded w-full" />
              </div>
              <div className="h-8 bg-muted rounded w-full" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center border border-dashed border-border rounded-2xl bg-card/40 my-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-3 text-blue-500 shadow-inner">
            <Database className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold mb-1 text-foreground">
            {search ? t('databases.noDatabasesSearch', 'No matching databases found') : t('databases.noDatabases', 'No databases found')}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mb-5">
            {search
              ? t('databases.adjustSearch', 'Try searching by different keywords or clear the filter.')
              : t('databases.noDatabasesDesc', 'Create your first SQLite database to get started connecting applications.')}
          </p>
          {search ? (
            <button
              onClick={() => setSearch('')}
              className="px-3.5 py-1.5 bg-muted hover:bg-muted/80 text-foreground border border-border rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              {t('common.clearSearch', 'Clear Search')}
            </button>
          ) : (
            <button
              onClick={onOpenCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-sm shadow-blue-500/25"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('databases.create', 'Create Database')}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((db) => {
            const isOwner = db.owner_id === currentUser?.userId || db.owner_username === currentUser?.username;
            const isShared = (db as any).is_shared === 1;

            return (
              <div
                key={db.id}
                onClick={() => onSelectDatabase(db.id)}
                className="group relative bg-card hover:bg-card/90 border border-border hover:border-blue-500/40 rounded-xl p-5 cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/5 flex flex-col justify-between"
              >
                {/* Top Section */}
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/15 to-indigo-500/15 border border-blue-500/25 flex items-center justify-center text-blue-500 shrink-0 group-hover:scale-105 group-hover:border-blue-500/40 transition-all shadow-xs">
                        <Database className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold tracking-tight text-foreground group-hover:text-blue-500 transition-colors truncate">
                          {db.name}
                        </h3>
                        <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
                          {db.slug}
                        </p>
                      </div>
                    </div>

                    {/* Copy ID Button */}
                    <button
                      onClick={(e) => handleCopyId(e, db.id)}
                      className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground rounded-md border border-border shrink-0 transition-colors cursor-pointer"
                      title={t('databases.copyId', 'Copy Database ID')}
                    >
                      {copiedId === db.id ? (
                        <>
                          <Check className="w-2.5 h-2.5 text-emerald-500" />
                          <span className="text-emerald-500 font-semibold">{t('common.copied', 'Copied')}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-2.5 h-2.5" />
                          <span>{db.id}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Creator and Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                    {db.owner_username ? (
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md font-medium border ${
                          isOwner
                            ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                            : 'bg-muted/80 text-foreground border-border'
                        }`}
                        title={t('databases.creator', 'Creator')}
                      >
                        <User className="w-3 h-3" />
                        <span>
                          {isOwner ? `${t('common.you', 'You')} (${db.owner_username})` : db.owner_username}
                        </span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-muted text-muted-foreground border border-border rounded-md font-medium">
                        {t('common.system', 'System')}
                      </span>
                    )}

                    {isShared && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 bg-purple-500/10 text-purple-500 border border-purple-500/20 rounded-md font-medium">
                        <Share2 className="w-3 h-3" />
                        <span>{t('common.shared', 'Shared')}</span>
                      </span>
                    )}

                    {db.max_size_mb && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded border border-border font-mono">
                        <HardDrive className="w-2.5 h-2.5" />
                        {db.max_size_mb} MB
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-xs text-muted-foreground line-clamp-2 min-h-[32px] leading-relaxed">
                    {db.description || t('databases.noDescription', 'No description provided.')}
                  </p>
                </div>

                {/* Card Footer: Metadata & Actions */}
                <div className="pt-3.5 border-t border-border mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                    <Clock className="w-3 h-3 text-muted-foreground/70" />
                    <span>{formatTimeAgo(db.last_accessed_at || db.created_at)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Delete Action Button */}
                    {canDeleteDb(db) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingDb(db);
                        }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer"
                        title={t('databases.deleteDatabase', 'Delete Database')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Open Action Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDatabase(db.id);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600/10 hover:bg-blue-600 text-blue-600 hover:text-white rounded-lg text-xs font-semibold transition-all cursor-pointer border border-blue-500/20 hover:border-blue-600 shadow-2xs group/btn"
                    >
                      <span>{t('common.open', 'Open')}</span>
                      <ExternalLink className="w-3 h-3 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Database Confirm Modal */}
      <ConfirmModal
        isOpen={!!deletingDb}
        onClose={() => setDeletingDb(null)}
        onConfirm={() => {
          if (deletingDb) deleteDbMutation.mutate(deletingDb.id);
        }}
        title={`${t('databases.deleteModalTitle', 'Delete Database?')} (${deletingDb?.name})`}
        message={t('databases.deleteModalMessage', 'Are you sure you want to delete this database? All data, tables, files, and API tokens will be permanently removed.')}
        confirmText={t('common.delete', 'Delete')}
        cancelText={t('common.cancel', 'Cancel')}
        variant="danger"
        isLoading={deleteDbMutation.isPending}
      />
    </div>
  );
};
