import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  Activity,
  Globe,
  Database,
  LogOut,
  Edit2,
  Clock,
  CheckCircle2,
  XCircle,
  HardDrive,
  Calendar,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { formatBytes, formatDate } from '../lib/utils.js';
import { useI18n } from '../hooks/useI18n.js';
import type { UserSummaryResponse, UserRecord } from '../../shared/index.js';

interface UserAuditDrawerProps {
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onRevokeSessions?: (userId: string, username: string) => void;
  onEditUser?: (user: UserRecord) => void;
  isSuperAdmin: boolean;
}

const AVATAR_PALETTES = [
  'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
  'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
  'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
  'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
  'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
  'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30',
];

export function getAvatarStyle(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
}

export function getInitials(username: string): string {
  if (!username) return '?';
  const clean = username.trim();
  const parts = clean.split(/[-_.\s]+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export const UserAuditDrawer: React.FC<UserAuditDrawerProps> = ({
  userId,
  isOpen,
  onClose,
  onRevokeSessions,
  onEditUser,
  isSuperAdmin,
}) => {
  const { t, language } = useI18n();

  const { data: summary, isLoading, error } = useQuery({
    queryKey: ['user-summary', userId],
    queryFn: () => apiRequest<UserSummaryResponse>(`/api/admin/users/${userId}/summary`),
    enabled: Boolean(isOpen && userId),
    staleTime: 5000,
  });

  if (!isOpen) return null;

  const user = summary?.user;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div className="relative w-full max-w-lg bg-card border-l border-border h-full flex flex-col shadow-2xl z-10 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                {t('users.auditDrawerTitle', 'User Audit & Activity Stats')}
              </h2>
              <div className="text-xs text-muted-foreground font-mono">
                {userId}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="space-y-4 py-8">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-muted animate-pulse shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-muted animate-pulse rounded w-1/3" />
                  <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-4">
                <div className="h-20 bg-muted/50 animate-pulse rounded-lg" />
                <div className="h-20 bg-muted/50 animate-pulse rounded-lg" />
                <div className="h-20 bg-muted/50 animate-pulse rounded-lg" />
              </div>
            </div>
          ) : error || !summary || !user ? (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <XCircle className="w-8 h-8 text-red-500 mx-auto" />
              <p className="text-sm font-medium">
                {error instanceof Error ? error.message : t('common.error', 'An error occurred')}
              </p>
            </div>
          ) : (
            <>
              {/* User Profile Card */}
              <div className="p-4 rounded-xl border border-border bg-muted/20 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border border-border flex items-center justify-center font-bold text-base shadow-xs">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center font-bold text-sm border ${getAvatarStyle(user.username)}`}>
                        {getInitials(user.username)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-base text-foreground truncate">
                      {user.username}
                    </h3>
                    <div className="text-xs text-muted-foreground truncate">
                      {user.email || t('common.noEmail', 'No email registered')}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                    user.role === 'super_admin'
                      ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                      : user.role === 'admin'
                      ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                      : 'bg-muted text-muted-foreground border border-border'
                  }`}>
                    {user.role}
                  </span>

                  {user.status === 'active' ? (
                    <span className="inline-flex items-center gap-1 text-emerald-500 font-medium text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {t('common.active', 'Active')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-500 font-medium text-[11px]">
                      <XCircle className="w-3.5 h-3.5" /> {t('common.disabled', 'Disabled')}
                    </span>
                  )}
                </div>
              </div>

              {/* 3 Metrics Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs flex flex-col">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <Globe className="w-3.5 h-3.5 text-blue-500" />
                    <span>{t('users.recentIp', 'Recent IP')}</span>
                  </div>
                  <div className="mt-2 text-sm font-bold font-mono text-foreground truncate" title={summary.recentIp}>
                    {summary.recentIp}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs flex flex-col">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <Activity className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{t('users.queries24h', 'Queries (24h)')}</span>
                  </div>
                  <div className="mt-2 text-lg font-bold font-mono text-foreground">
                    {summary.sqlQueries24h.toLocaleString()}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs flex flex-col">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <Database className="w-3.5 h-3.5 text-purple-500" />
                    <span>{t('users.ownedDatabases', 'Databases')}</span>
                  </div>
                  <div className="mt-2 text-lg font-bold font-mono text-foreground">
                    {summary.databases.length}
                  </div>
                </div>
              </div>

              {/* Owned Databases Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-primary" />
                    <span>{t('users.ownedDatabases', 'Owned Databases')} ({summary.databases.length})</span>
                  </h4>
                </div>

                {summary.databases.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
                    {t('users.noDatabases', 'No databases owned by this user.')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {summary.databases.map((db) => (
                      <div
                        key={db.id}
                        className="p-3 rounded-lg border border-border bg-card hover:border-primary/40 transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <a
                            href={`#/databases/${db.id}`}
                            className="font-semibold text-sm text-foreground hover:text-primary transition-colors flex items-center gap-1"
                          >
                            <span className="truncate">{db.name}</span>
                            <ArrowUpRight className="w-3 h-3 shrink-0 text-muted-foreground" />
                          </a>
                          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                            {db.slug} &bull; {formatBytes(db.sizeBytes)}
                          </div>
                        </div>

                        <div className="text-[10px] text-muted-foreground shrink-0 text-right">
                          <Calendar className="w-3 h-3 inline mr-1 text-muted-foreground/80" />
                          {formatDate(db.createdAt, language as 'vi' | 'en')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Audit Events Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-primary" />
                    <span>{t('users.recentAuditEvents', 'Recent Security Events')}</span>
                  </h4>
                </div>

                {summary.recentAuditEvents.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
                    {t('users.noAuditLogs', 'No recent audit events.')}
                  </div>
                ) : (
                  <div className="divide-y divide-border border border-border rounded-xl bg-card overflow-hidden">
                    {summary.recentAuditEvents.map((evt, idx) => (
                      <div key={evt.id || idx} className="p-3 text-xs flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-foreground flex items-center gap-1.5">
                            <span className="font-mono text-primary text-[11px]">{evt.action}</span>
                            <span className={`text-[9px] px-1 py-0.2 rounded font-bold uppercase ${
                              evt.result === 'success'
                                ? 'bg-emerald-500/10 text-emerald-500'
                                : 'bg-red-500/10 text-red-500'
                            }`}>
                              {evt.result}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate font-mono mt-0.5">
                            {evt.resource || 'system'}
                          </div>
                        </div>

                        <div className="text-[10px] text-muted-foreground shrink-0 font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(evt.timestamp, language as 'vi' | 'en')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        {user && isSuperAdmin && (
          <div className="p-4 border-t border-border bg-muted/10 shrink-0 flex items-center justify-between gap-3">
            <button
              onClick={() => {
                onClose();
                onRevokeSessions?.(user.id, user.username);
              }}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition-colors flex items-center gap-1.5"
              title={t('users.revokeSessions', 'Force Revoke Sessions')}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t('users.revokeSessions', 'Revoke Sessions')}</span>
            </button>

            <button
              onClick={() => {
                onClose();
                onEditUser?.(user);
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>{t('users.editUser', 'Edit User')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
