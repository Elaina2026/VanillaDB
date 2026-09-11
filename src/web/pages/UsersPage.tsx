import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  UserPlus,
  Shield,
  Key,
  Database,
  Sliders,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Lock,
  Gauge,
  X,
  LogOut,
  Activity,
  CheckSquare,
  Square,
  MinusSquare,
  Zap,
  Sparkles,
  Layers,
} from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { formatDate } from '../lib/utils.js';
import { useAuth } from '../hooks/useAuth.js';
import { useI18n } from '../hooks/useI18n.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { UserAuditDrawer, getAvatarStyle, getInitials } from '../components/UserAuditDrawer.js';
import type { UserRecord, UserRole } from '@shared/index.js';

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Bulk actions state
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkRoleModalOpen, setBulkRoleModalOpen] = useState(false);

  // Revoke session state
  const [revokingUser, setRevokingUser] = useState<{ id: string; username: string } | null>(null);

  // Audit drawer state
  const [drawerUserId, setDrawerUserId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Form states
  const [formData, setFormData] = useState<{
    username: string;
    email: string;
    password: string;
    role: UserRole;
    maxDatabases: number;
    rateLimitPerMinute: number;
    status: 'active' | 'disabled';
  }>({
    username: '',
    email: '',
    password: '',
    role: 'user',
    maxDatabases: 2,
    rateLimitPerMinute: 60,
    status: 'active',
  });

  const [formError, setFormError] = useState<string | null>(null);

  const { data: users = [], isLoading, refetch } = useQuery<UserRecord[]>({
    queryKey: ['users'],
    queryFn: () => apiRequest('/api/admin/users'),
  });

  const createUserMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      apiRequest('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsCreateModalOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      setFormError(err.message || t('users.createError', 'Failed to create user'));
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof formData> }) =>
      apiRequest(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditingUser(null);
      resetForm();
    },
    onError: (err: any) => {
      setFormError(err.message || t('users.updateError', 'Failed to update user'));
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/admin/users/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeletingUserId(null);
      setDeleteError(null);
    },
    onError: (err: any) => {
      setDeletingUserId(null);
      setDeleteError(err.message || 'Failed to delete user');
    },
  });

  const revokeSessionsMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/admin/users/${id}/revoke-sessions`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['user-summary'] });
      setRevokingUser(null);
    },
    onError: (err: any) => {
      alert(err.message || t('users.revokeSessionsError', 'Failed to revoke sessions'));
      setRevokingUser(null);
    },
  });

  const bulkActionMutation = useMutation({
    mutationFn: (data: { userIds: string[]; action: 'activate' | 'disable' | 'revoke_sessions' | 'set_role'; role?: UserRole }) =>
      apiRequest('/api/admin/users/bulk', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['user-summary'] });
      setSelectedUserIds(new Set());
      setBulkRoleModalOpen(false);
    },
    onError: (err: any) => {
      alert(err.message || t('users.bulkError', 'Bulk action failed'));
    },
  });

  const resetForm = () => {
    setFormData({
      username: '',
      email: '',
      password: '',
      role: 'user',
      maxDatabases: 2,
      rateLimitPerMinute: 60,
      status: 'active',
    });
    setFormError(null);
  };

  const handleOpenEdit = (u: UserRecord) => {
    setEditingUser(u);
    setFormData({
      username: u.username,
      email: u.email || '',
      password: '',
      role: u.role,
      maxDatabases: u.max_databases,
      rateLimitPerMinute: u.rate_limit_per_minute,
      status: u.status,
    });
    setFormError(null);
  };

  const handleApplyPreset = (tier: 'free' | 'developer' | 'enterprise') => {
    if (tier === 'free') {
      setFormData((prev) => ({
        ...prev,
        role: 'user',
        maxDatabases: 2,
        rateLimitPerMinute: 60,
      }));
    } else if (tier === 'developer') {
      setFormData((prev) => ({
        ...prev,
        role: 'user',
        maxDatabases: 10,
        rateLimitPerMinute: 300,
      }));
    } else if (tier === 'enterprise') {
      setFormData((prev) => ({
        ...prev,
        role: 'admin',
        maxDatabases: 0,
        rateLimitPerMinute: 0,
      }));
    }
  };

  const handleOpenSummary = (userId: string) => {
    setDrawerUserId(userId);
    setIsDrawerOpen(true);
  };

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const selectableUsers = filteredUsers.filter((u) => u.id !== currentUser?.userId);
  const isAllSelected = selectableUsers.length > 0 && selectableUsers.every((u) => selectedUserIds.has(u.id));
  const isSomeSelected = selectableUsers.some((u) => selectedUserIds.has(u.id)) && !isAllSelected;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(selectableUsers.map((u) => u.id)));
    }
  };

  const handleToggleSelectRow = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              {t('users.title', 'User Management')}
            </h1>
            {isSuperAdmin && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/20">
                <Shield className="w-3 h-3" /> {t('users.superAdminBadge', 'Super Admin Control')}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t('users.desc', 'Manage administrator accounts, assign tenant database quotas, and configure access permissions.')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="px-3 py-1.5 bg-card border border-border hover:bg-accent text-muted-foreground hover:text-foreground rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
            title={t('common.refresh', 'Refresh')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('common.refresh', 'Refresh')}</span>
          </button>

          {isSuperAdmin && (
            <button
              onClick={() => {
                resetForm();
                setIsCreateModalOpen(true);
              }}
              className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{t('users.create', 'Add User')}</span>
            </button>
          )}
        </div>
      </div>

      {deleteError && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{deleteError}</span>
        </div>
      )}

      {/* Quota & Role Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-muted-foreground">{t('users.totalAccounts', 'Total Accounts')}</div>
            <div className="text-lg font-bold text-foreground mt-0.5">{users.length}</div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-muted-foreground">{t('users.superAdmins', 'Super Admins')}</div>
            <div className="text-lg font-bold text-foreground mt-0.5">
              {users.filter(u => u.role === 'super_admin').length}
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-muted-foreground">{t('users.standardUsers', 'Standard Users')}</div>
            <div className="text-lg font-bold text-foreground mt-0.5">
              {users.filter(u => u.role === 'user').length}
            </div>
          </div>
        </div>
      </div>

      {/* Users Table Card */}
      <div className="bg-card border border-border rounded-xl shadow-xs overflow-hidden flex flex-col">
        {/* Search Toolbar */}
        <div className="p-3 border-b border-border bg-muted/20 flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground shrink-0 ml-1" />
          <input
            type="text"
            placeholder={t('users.searchPlaceholder', 'Search users by username or role...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-transparent border-none text-xs text-foreground placeholder:text-muted-foreground focus:outline-none w-full"
          />
        </div>

        {/* Table list */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                {isSuperAdmin && (
                  <th className="py-3 px-3 w-10 text-center">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      disabled={selectableUsers.length === 0}
                      className="p-1 hover:text-foreground transition-colors disabled:opacity-30"
                      title={isAllSelected ? t('users.clearSelection', 'Clear Selection') : t('common.selectAll', 'Select All')}
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : isSomeSelected ? (
                        <MinusSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                )}
                <th className="py-3 px-4">{t('users.username', 'Username')}</th>
                <th className="py-3 px-4">{t('users.role', 'Role')}</th>
                <th className="py-3 px-4">{t('users.dbQuota', 'DB Quota')}</th>
                <th className="py-3 px-4">{t('users.rateLimitHeader', 'Rate Limit')}</th>
                <th className="py-3 px-4">{t('common.status', 'Status')}</th>
                <th className="py-3 px-4">{t('common.created', 'Created At')}</th>
                <th className="py-3 px-4 text-right">{t('common.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 8 : 7} className="py-8 text-center text-muted-foreground">
                    {t('users.noMatchingUsers', 'No users matching search criteria.')}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isCurrent = u.id === currentUser?.userId;
                  const isSelected = selectedUserIds.has(u.id);

                  // Quota percentage calculation
                  const percent = u.max_databases > 0
                    ? Math.min(100, Math.round(((u.database_count ?? 0) / u.max_databases) * 100))
                    : 0;

                  const quotaColor = percent >= 90
                    ? 'bg-red-500'
                    : percent >= 70
                    ? 'bg-amber-500'
                    : 'bg-emerald-500';

                  const quotaTextColor = percent >= 90
                    ? 'text-red-500'
                    : percent >= 70
                    ? 'text-amber-500'
                    : 'text-emerald-500';

                  return (
                    <tr
                      key={u.id}
                      className={`hover:bg-muted/30 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                    >
                      {/* Checkbox Column */}
                      {isSuperAdmin && (
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleSelectRow(u.id)}
                            disabled={isCurrent}
                            className="p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-primary" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                      )}

                      {/* Username with Avatar */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            onClick={() => handleOpenSummary(u.id)}
                            className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-border flex items-center justify-center font-bold text-xs cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all shadow-xs"
                            title={t('users.viewAuditStats', 'View Audit & Stats')}
                          >
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt={u.username} className="w-full h-full object-cover" />
                            ) : (
                              <div className={`w-full h-full flex items-center justify-center font-semibold text-xs border ${getAvatarStyle(u.username)}`}>
                                {getInitials(u.username)}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="font-semibold text-foreground flex items-center gap-1.5">
                              <button
                                onClick={() => handleOpenSummary(u.id)}
                                className="hover:text-primary transition-colors text-left truncate font-semibold"
                                title={t('users.viewAuditStats', 'View Audit & Stats')}
                              >
                                {u.username}
                              </button>
                              {isCurrent && (
                                <span className="text-[10px] px-1.5 py-0.2 bg-blue-500/10 text-blue-500 rounded font-normal shrink-0">
                                  {t('common.you', 'You')}
                                </span>
                              )}
                            </div>
                            {u.email && <div className="text-[10px] text-muted-foreground truncate">{u.email}</div>}
                            <div className="text-[10px] font-mono text-muted-foreground/70">{u.id}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role Column */}
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                          u.role === 'super_admin'
                            ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                            : u.role === 'admin'
                            ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                            : 'bg-muted text-muted-foreground border border-border'
                        }`}>
                          {u.role}
                        </span>
                      </td>

                      {/* Visual Quota Usage Bars */}
                      <td className="py-3 px-4 font-mono">
                        {u.role === 'super_admin' || u.max_databases === 0 ? (
                          <div className="flex flex-col gap-1 w-28">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-foreground">{u.database_count ?? 0} DBs</span>
                              <span className="text-emerald-500 font-semibold text-[10px]">{t('common.unlimited', 'Unlimited')}</span>
                            </div>
                            <div className="w-full h-1.5 bg-emerald-500/20 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full w-full" />
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1 w-28">
                            <div className="flex items-center justify-between text-[11px]">
                              <span>
                                <strong className="text-foreground">{u.database_count ?? 0}</strong>
                                <span className="text-muted-foreground">/{u.max_databases} DBs</span>
                              </span>
                              <span className={`text-[10px] font-bold ${quotaTextColor}`}>{percent}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${quotaColor}`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Rate Limit Column */}
                      <td className="py-3 px-4 font-mono">
                        {u.rate_limit_per_minute > 0 ? (
                          <span>{u.rate_limit_per_minute} {t('users.reqPerMinUnit', 'req/min')}</span>
                        ) : (
                          <span className="text-emerald-500 font-semibold">{t('users.zeroUnlimited', 'Unlimited')}</span>
                        )}
                      </td>

                      {/* Status Column */}
                      <td className="py-3 px-4">
                        {u.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-500 font-medium text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" /> {t('common.active', 'Active')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-500 font-medium text-[11px]">
                            <XCircle className="w-3.5 h-3.5" /> {t('common.disabled', 'Disabled')}
                          </span>
                        )}
                      </td>

                      {/* Created At */}
                      <td className="py-3 px-4 text-muted-foreground text-[11px]">
                        {formatDate(u.created_at)}
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* View Audit & Stats */}
                          <button
                            onClick={() => handleOpenSummary(u.id)}
                            className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                            title={t('users.viewAuditStats', 'View Audit & Stats')}
                            aria-label={`${t('users.viewAuditStats', 'View Audit & Stats')}: ${u.username}`}
                          >
                            <Activity className="w-3.5 h-3.5 text-primary" />
                          </button>

                          {isSuperAdmin ? (
                            <>
                              {/* Force Revoke Sessions */}
                              <button
                                onClick={() => setRevokingUser({ id: u.id, username: u.username })}
                                disabled={isCurrent}
                                className="p-1.5 hover:bg-amber-500/10 rounded text-muted-foreground hover:text-amber-500 disabled:opacity-30 transition-colors"
                                title={t('users.revokeSessions', 'Force Revoke Sessions')}
                                aria-label={`${t('users.revokeSessions', 'Force Revoke Sessions')}: ${u.username}`}
                              >
                                <LogOut className="w-3.5 h-3.5" />
                              </button>

                              {/* Edit User */}
                              <button
                                onClick={() => handleOpenEdit(u)}
                                className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                                title={t('users.editUser', 'Edit User')}
                                aria-label={`${t('users.editUser', 'Edit User')}: ${u.username}`}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete User */}
                              <button
                                onClick={() => setDeletingUserId(u.id)}
                                disabled={isCurrent}
                                className="p-1.5 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-500 disabled:opacity-30 transition-colors"
                                title={t('users.deleteUser', 'Delete User')}
                                aria-label={`${t('users.deleteUser', 'Delete User')}: ${u.username}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">Read-only</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Bulk Actions Toolbar */}
      {isSuperAdmin && selectedUserIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-card/95 backdrop-blur-md border border-primary/40 rounded-xl px-4 py-2.5 shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="text-xs font-bold text-foreground flex items-center gap-2 pr-3 border-r border-border">
            <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px]">
              {selectedUserIds.size}
            </span>
            <span>{t('users.selectedCount', 'selected')}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Bulk Activate */}
            <button
              onClick={() => bulkActionMutation.mutate({ userIds: [...selectedUserIds], action: 'activate' })}
              disabled={bulkActionMutation.isPending}
              className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{t('users.bulkActivate', 'Activate')}</span>
            </button>

            {/* Bulk Disable */}
            <button
              onClick={() => bulkActionMutation.mutate({ userIds: [...selectedUserIds], action: 'disable' })}
              disabled={bulkActionMutation.isPending}
              className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>{t('users.bulkDisable', 'Disable')}</span>
            </button>

            {/* Bulk Revoke Sessions */}
            <button
              onClick={() => bulkActionMutation.mutate({ userIds: [...selectedUserIds], action: 'revoke_sessions' })}
              disabled={bulkActionMutation.isPending}
              className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t('users.bulkRevoke', 'Revoke Sessions')}</span>
            </button>

            {/* Bulk Role Change */}
            <button
              onClick={() => setBulkRoleModalOpen(true)}
              disabled={bulkActionMutation.isPending}
              className="px-2.5 py-1.5 bg-muted hover:bg-muted/80 text-foreground border border-border rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <Shield className="w-3.5 h-3.5 text-primary" />
              <span>{t('users.bulkRoleChange', 'Change Role')}</span>
            </button>
          </div>

          <button
            onClick={() => setSelectedUserIds(new Set())}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors ml-2"
            title={t('users.clearSelection', 'Clear Selection')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bulk Role Selection Modal */}
      {bulkRoleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <div className="bg-card border border-border rounded-xl p-5 max-w-sm w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                {t('users.bulkRoleChange', 'Change Role')} ({selectedUserIds.size} users)
              </h3>
              <button onClick={() => setBulkRoleModalOpen(false)} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Select the new role to assign to all selected user accounts:
            </p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => bulkActionMutation.mutate({ userIds: [...selectedUserIds], action: 'set_role', role: 'user' })}
                className="w-full p-2.5 rounded-lg border border-border bg-muted/20 hover:bg-muted/50 text-left text-xs font-semibold flex items-center justify-between transition-colors"
              >
                <span>{t('users.roleUserStandard', 'User (Standard)')}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">user</span>
              </button>

              <button
                type="button"
                onClick={() => bulkActionMutation.mutate({ userIds: [...selectedUserIds], action: 'set_role', role: 'admin' })}
                className="w-full p-2.5 rounded-lg border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-left text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center justify-between transition-colors"
              >
                <span>{t('users.roleAdmin', 'Admin')}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-500 font-mono">admin</span>
              </button>

              <button
                type="button"
                onClick={() => bulkActionMutation.mutate({ userIds: [...selectedUserIds], action: 'set_role', role: 'super_admin' })}
                className="w-full p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 text-left text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center justify-between transition-colors"
              >
                <span>{t('users.roleSuperAdmin', 'Super Admin')}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 font-mono">super_admin</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit User Modal */}
      {(isCreateModalOpen || editingUser) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs">
          <div className="bg-card border border-border rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                {editingUser ? `${t('users.editUserPrefix', 'Edit User:')} ${editingUser.username}` : t('users.createNewAccount', 'Create New Account')}
              </h2>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setEditingUser(null);
                }}
                className="p-1 rounded text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Quota Presets Buttons */}
            <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
              <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span>{t('users.presetsTitle', 'Quick Quota Presets')}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleApplyPreset('free')}
                  className="px-2.5 py-2 rounded-lg border border-border bg-card hover:border-primary/40 text-left transition-colors flex flex-col"
                >
                  <span className="font-bold text-xs text-foreground">{t('users.tierFree', 'Free')}</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">2 DBs &bull; 60/m</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset('developer')}
                  className="px-2.5 py-2 rounded-lg border border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 text-left transition-colors flex flex-col"
                >
                  <span className="font-bold text-xs text-blue-600 dark:text-blue-400">{t('users.tierDeveloper', 'Developer')}</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">10 DBs &bull; 300/m</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset('enterprise')}
                  className="px-2.5 py-2 rounded-lg border border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10 text-left transition-colors flex flex-col"
                >
                  <span className="font-bold text-xs text-purple-600 dark:text-purple-400">{t('users.tierEnterprise', 'Enterprise')}</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">Unlimited</span>
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editingUser) {
                  const updatePayload: any = {
                    role: formData.role,
                    maxDatabases: formData.maxDatabases,
                    rateLimitPerMinute: formData.rateLimitPerMinute,
                    status: formData.status,
                    email: formData.email || null,
                  };
                  if (formData.password) updatePayload.password = formData.password;
                  updateUserMutation.mutate({ id: editingUser.id, data: updatePayload });
                } else {
                  createUserMutation.mutate(formData);
                }
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label htmlFor="user-username" className="block text-muted-foreground font-medium mb-1">
                  {t('users.username', 'Username')}
                </label>
                <input
                  id="user-username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  disabled={!!editingUser}
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder={t('users.usernamePlaceholder', 'e.g. developer_sub1')}
                  className="w-full bg-muted/40 border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
              </div>

              <div>
                <label htmlFor="user-email" className="block text-muted-foreground font-medium mb-1">
                  Email
                </label>
                <input
                  id="user-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="developer@example.com"
                  className="w-full bg-muted/40 border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label htmlFor="user-password" className="block text-muted-foreground font-medium mb-1">
                  {editingUser ? t('users.newPasswordHint', 'New Password (leave empty to keep current)') : t('auth.password', 'Password')}
                </label>
                <input
                  id="user-password"
                  name="password"
                  type="password"
                  autoComplete={editingUser ? 'new-password' : 'current-password'}
                  required={!editingUser}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full bg-muted/40 border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="user-role" className="block text-muted-foreground font-medium mb-1">
                    {t('users.role', 'Role')}
                  </label>
                  <select
                    id="user-role"
                    name="role"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full bg-muted/40 border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="user">{t('users.roleUserStandard', 'User (Standard)')}</option>
                    <option value="admin">{t('users.roleAdmin', 'Admin')}</option>
                    <option value="super_admin">{t('users.roleSuperAdmin', 'Super Admin')}</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="user-status" className="block text-muted-foreground font-medium mb-1">
                    {t('users.accountStatus', 'Account Status')}
                  </label>
                  <select
                    id="user-status"
                    name="status"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'disabled' })}
                    className="w-full bg-muted/40 border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="active">{t('common.active', 'Active')}</option>
                    <option value="disabled">{t('users.disabledLocked', 'Disabled (Locked)')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="user-max-databases" className="block text-muted-foreground font-medium mb-1">
                    {t('users.maxDbsAllowed', 'Max DBs Allowed')}
                  </label>
                  <input
                    id="user-max-databases"
                    name="maxDatabases"
                    type="number"
                    min={0}
                    value={formData.maxDatabases}
                    onChange={(e) => setFormData({ ...formData, maxDatabases: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-muted/40 border border-border rounded px-3 py-2 text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">{t('users.noLimitAdmin', '0 = No limit for admin')}</span>
                </div>

                <div>
                  <label htmlFor="user-rate-limit" className="block text-muted-foreground font-medium mb-1">
                    {t('users.rateLimit', 'Rate Limit (req/min)')}
                  </label>
                  <input
                    id="user-rate-limit"
                    name="rateLimitPerMinute"
                    type="number"
                    min={0}
                    value={formData.rateLimitPerMinute}
                    onChange={(e) => setFormData({ ...formData, rateLimitPerMinute: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-muted/40 border border-border rounded px-3 py-2 text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">{t('users.zeroUnlimited', '0 = Unlimited')}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setEditingUser(null);
                  }}
                  className="px-4 py-2 bg-card border border-border hover:bg-accent text-foreground rounded text-xs font-medium"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending || updateUserMutation.isPending || (!editingUser && (!formData.username || !formData.password))}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-xs"
                >
                  {createUserMutation.isPending || updateUserMutation.isPending
                    ? t('common.saving', 'Saving...')
                    : editingUser
                    ? t('users.updateUserBtn', 'Update User')
                    : t('users.createUserBtn', 'Create User')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revoke Sessions Confirmation Modal */}
      <ConfirmModal
        isOpen={!!revokingUser}
        onClose={() => setRevokingUser(null)}
        onConfirm={() => {
          if (revokingUser) revokeSessionsMutation.mutate(revokingUser.id);
        }}
        title={t('users.revokeSessionsTitle', 'Revoke Active Sessions?')}
        message={t('users.revokeSessionsConfirm', 'Are you sure you want to invalidate all active sessions for this user? They will be logged out immediately across all devices.')}
        confirmText={t('users.revokeSessions', 'Force Revoke Sessions')}
        cancelText={t('common.cancel', 'Cancel')}
        variant="warning"
        isLoading={revokeSessionsMutation.isPending}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingUserId}
        onClose={() => setDeletingUserId(null)}
        onConfirm={() => {
          if (deletingUserId) deleteUserMutation.mutate(deletingUserId);
        }}
        title={t('users.deleteAccountTitle', 'Delete Account?')}
        message={t('users.deleteAccountConfirm', 'Are you sure you want to permanently delete this user account? Their created databases will remain intact but ownership will be detached.')}
        confirmText={t('users.confirmDelete', 'Confirm Delete')}
        cancelText={t('common.cancel', 'Cancel')}
        variant="danger"
        isLoading={deleteUserMutation.isPending}
      />

      {/* User Audit & Stats Drawer */}
      <UserAuditDrawer
        userId={drawerUserId}
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setDrawerUserId(null);
        }}
        onRevokeSessions={(id, username) => setRevokingUser({ id, username })}
        onEditUser={(u) => handleOpenEdit(u)}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
};
