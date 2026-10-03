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
  HardDrive,
  Info,
} from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { formatDate } from '../lib/utils.js';
import { useAuth } from '../hooks/useAuth.js';
import { useI18n } from '../hooks/useI18n.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import { UserAuditDrawer, getAvatarStyle, getInitials } from '../components/UserAuditDrawer.js';
import { SYSTEM_PERMISSIONS, isOwnerRole, isAdminRole, type UserRecord, type UserRole, type RoleRecord } from '@shared/index.js';

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const isSuperAdmin = isOwnerRole(currentUser?.role);
  const canManageUsers = isAdminRole(currentUser?.role);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Roles Management state
  const [isRolesModalOpen, setIsRolesModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleRecord | null>(null);
  const [roleForm, setRoleForm] = useState<{
    id: string;
    name: string;
    description: string;
    max_storage_mb: number;
    max_databases: number;
    rate_limit_per_minute: number;
    permissions: string[];
  }>({
    id: '',
    name: '',
    description: '',
    max_storage_mb: 500,
    max_databases: 5,
    rate_limit_per_minute: 180,
    permissions: ['databases:read', 'databases:write', 'databases:query'],
  });
  const [roleFormError, setRoleFormError] = useState<string | null>(null);

  const resetRoleForm = () => {
    setRoleForm({
      id: '',
      name: '',
      description: '',
      max_storage_mb: 500,
      max_databases: 5,
      rate_limit_per_minute: 180,
      permissions: ['databases:read', 'databases:write', 'databases:query'],
    });
    setEditingRole(null);
    setRoleFormError(null);
  };

  const { data: roles = [], isFetching: isRolesFetching, refetch: refetchRoles } = useQuery<RoleRecord[]>({
    queryKey: ['roles'],
    queryFn: () => apiRequest('/api/admin/roles'),
  });

  const createRoleMutation = useMutation({
    mutationFn: (data: {
      id?: string;
      name: string;
      description?: string;
      max_storage_mb?: number;
      max_databases?: number;
      rate_limit_per_minute?: number;
      permissions?: string[];
    }) =>
      apiRequest('/api/admin/roles', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      resetRoleForm();
    },
    onError: (err: any) => {
      setRoleFormError(err.message || 'Failed to create role');
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ roleId, data }: { roleId: string; data: any }) =>
      apiRequest(`/api/admin/roles/${roleId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      resetRoleForm();
    },
    onError: (err: any) => {
      setRoleFormError(err.message || 'Failed to update role');
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (roleId: string) =>
      apiRequest(`/api/admin/roles/${roleId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to delete role');
    },
  });

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

  const { data: users = [], isLoading: isUsersLoading, isFetching: isUsersFetching, refetch: refetchUsers } = useQuery<UserRecord[]>({
    queryKey: ['users'],
    queryFn: () => apiRequest('/api/admin/users'),
  });

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['users'] }),
        queryClient.invalidateQueries({ queryKey: ['roles'] }),
        queryClient.invalidateQueries({ queryKey: ['user-summary'] }),
        refetchUsers(),
        refetchRoles(),
      ]);
    } finally {
      setTimeout(() => setIsManualRefreshing(false), 450);
    }
  };

  const isRefreshing = isManualRefreshing || isUsersFetching || isRolesFetching;

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
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-3 py-1.5 bg-card border border-border hover:bg-accent text-muted-foreground hover:text-foreground rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title={t('common.refresh', 'Refresh')}
            aria-label={t('common.refresh', 'Refresh')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
            <span className="hidden sm:inline">
              {isRefreshing ? t('common.refreshing', 'Refreshing...') : t('common.refresh', 'Refresh')}
            </span>
          </button>

          <button
            onClick={() => setIsRolesModalOpen(true)}
            className="px-3 py-1.5 bg-muted/60 hover:bg-muted text-foreground border border-border rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title={t('users.manageRoles', 'Manage Roles')}
          >
            <Shield className="w-3.5 h-3.5 text-primary" />
            <span>{t('users.manageRoles', 'Manage Roles')}</span>
          </button>

          {canManageUsers && (
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
            <div className="text-[11px] font-medium text-muted-foreground">{t('users.superAdmins', 'Platform Owners')}</div>
            <div className="text-lg font-bold text-foreground mt-0.5">
              {users.filter(u => isOwnerRole(u.role)).length}
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-muted-foreground">{t('users.roleDeveloper', 'Database Engineers')}</div>
            <div className="text-lg font-bold text-foreground mt-0.5">
              {users.filter(u => u.role === 'developer').length}
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-card shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-muted-foreground">{t('users.standardUsers', 'Standard Members')}</div>
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
                {canManageUsers && (
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
                  <td colSpan={canManageUsers ? 8 : 7} className="py-8 text-center text-muted-foreground">
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
                      {canManageUsers && (
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
                        {canManageUsers ? (
                          <div className="relative inline-block">
                            <select
                              value={u.role}
                              disabled={isCurrent && u.role === 'super_admin'}
                              onChange={(e) => {
                                const newRole = e.target.value as UserRole;
                                if (newRole === u.role) return;
                                if (confirm(`Change role of user "${u.username}" to "${newRole}"?`)) {
                                  updateUserMutation.mutate({
                                    id: u.id,
                                    data: { role: newRole },
                                  });
                                }
                              }}
                              className={`cursor-pointer pl-2.5 pr-6 py-1 rounded text-[11px] font-bold uppercase tracking-wider border focus:outline-none focus:ring-1 focus:ring-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                                isOwnerRole(u.role)
                                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500/20'
                                  : isAdminRole(u.role)
                                  ? 'bg-blue-500/10 text-blue-500 border-blue-500/30 hover:bg-blue-500/20'
                                  : u.role === 'developer'
                                  ? 'bg-purple-500/10 text-purple-500 border-purple-500/30 hover:bg-purple-500/20'
                                  : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                              }`}
                              title={isCurrent && isOwnerRole(u.role) ? t('users.cannotDemoteSelf', 'Cannot change your own role') : t('users.changeUserRole', 'Click to change role')}
                            >
                              {roles && roles.length > 0 ? (
                                roles.map((r) => (
                                  <option key={r.id} value={r.id} className="bg-card text-foreground normal-case font-normal text-xs">
                                    {r.name} ({r.id})
                                  </option>
                                ))
                              ) : (
                                <>
                                  <option value="super_admin" className="bg-card text-foreground normal-case font-normal text-xs">{t('users.roleSuperAdmin', 'Platform Owner')}</option>
                                  <option value="admin" className="bg-card text-foreground normal-case font-normal text-xs">{t('users.roleAdmin', 'Platform Administrator')}</option>
                                  <option value="developer" className="bg-card text-foreground normal-case font-normal text-xs">{t('users.roleDeveloper', 'Database Engineer')}</option>
                                  <option value="user" className="bg-card text-foreground normal-case font-normal text-xs">{t('users.roleUserStandard', 'Standard Member')}</option>
                                </>
                              )}
                            </select>
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-[8px] opacity-60">▼</span>
                          </div>
                        ) : (
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                            isOwnerRole(u.role)
                              ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                              : isAdminRole(u.role)
                              ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                              : u.role === 'developer'
                              ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20'
                              : 'bg-muted text-muted-foreground border border-border'
                          }`}>
                            {roles.find(r => r.id === u.role)?.name || u.role}
                          </span>
                        )}
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

                          {canManageUsers ? (
                            <>
                              {/* Force Revoke Sessions */}
                              <button
                                onClick={() => setRevokingUser({ id: u.id, username: u.username })}
                                disabled={isCurrent || (!isSuperAdmin && isOwnerRole(u.role))}
                                className="p-1.5 hover:bg-amber-500/10 rounded text-muted-foreground hover:text-amber-500 disabled:opacity-30 transition-colors"
                                title={t('users.revokeSessions', 'Force Revoke Sessions')}
                                aria-label={`${t('users.revokeSessions', 'Force Revoke Sessions')}: ${u.username}`}
                              >
                                <LogOut className="w-3.5 h-3.5" />
                              </button>

                              {/* Edit User */}
                              <button
                                onClick={() => handleOpenEdit(u)}
                                disabled={!isSuperAdmin && isOwnerRole(u.role)}
                                className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                                title={t('users.editUser', 'Edit User')}
                                aria-label={`${t('users.editUser', 'Edit User')}: ${u.username}`}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete User */}
                              <button
                                onClick={() => setDeletingUserId(u.id)}
                                disabled={isCurrent || (!isSuperAdmin && isOwnerRole(u.role))}
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
      {canManageUsers && selectedUserIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-card/95 backdrop-blur-md border border-primary/40 rounded-xl px-4 py-2.5 shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200 max-w-[calc(100vw-2rem)] overflow-x-auto">
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

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {roles && roles.length > 0 ? (
                roles.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => bulkActionMutation.mutate({ userIds: [...selectedUserIds], action: 'set_role', role: r.id as any })}
                    disabled={bulkActionMutation.isPending || (!isSuperAdmin && isOwnerRole(r.id))}
                    className="w-full p-2.5 rounded-lg border border-border bg-muted/20 hover:bg-muted/50 disabled:opacity-40 text-left text-xs font-semibold flex items-center justify-between transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{r.name}</span>
                      {r.is_system ? (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-normal">System</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-500 font-normal">Custom</span>
                      )}
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">{r.id}</span>
                  </button>
                ))
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => bulkActionMutation.mutate({ userIds: [...selectedUserIds], action: 'set_role', role: 'user' })}
                    className="w-full p-2.5 rounded-lg border border-border bg-muted/20 hover:bg-muted/50 text-left text-xs font-semibold flex items-center justify-between transition-colors"
                  >
                    <span>{t('users.roleUserStandard', 'Standard Member')}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">user</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => bulkActionMutation.mutate({ userIds: [...selectedUserIds], action: 'set_role', role: 'developer' })}
                    className="w-full p-2.5 rounded-lg border border-purple-500/20 bg-purple-500/10 hover:bg-purple-500/20 text-left text-xs font-semibold text-purple-600 dark:text-purple-400 flex items-center justify-between transition-colors"
                  >
                    <span>{t('users.roleDeveloper', 'Database Engineer')}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-500 font-mono">developer</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => bulkActionMutation.mutate({ userIds: [...selectedUserIds], action: 'set_role', role: 'admin' })}
                    className="w-full p-2.5 rounded-lg border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-left text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center justify-between transition-colors"
                  >
                    <span>{t('users.roleAdmin', 'Platform Administrator')}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-500 font-mono">admin</span>
                  </button>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => bulkActionMutation.mutate({ userIds: [...selectedUserIds], action: 'set_role', role: 'super_admin' })}
                      className="w-full p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 text-left text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center justify-between transition-colors"
                    >
                      <span>{t('users.roleSuperAdmin', 'Platform Owner')}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 font-mono">super_admin</span>
                    </button>
                  )}
                </>
              )}
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
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="user-role" className="block text-muted-foreground font-medium">
                      {t('users.role', 'Role')}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const matchedRole = roles.find((r) => r.id === formData.role);
                        if (matchedRole) {
                          setFormData({
                            ...formData,
                            maxDatabases: matchedRole.max_databases ?? 2,
                            rateLimitPerMinute: matchedRole.rate_limit_per_minute ?? 180,
                          });
                        }
                      }}
                      className="text-[10px] text-primary hover:underline font-semibold"
                      title={t('users.applyRoleQuotas', 'Sync Quotas from Role')}
                    >
                      {t('users.applyRoleQuotas', 'Sync Quotas from Role')}
                    </button>
                  </div>
                  <select
                    id="user-role"
                    name="role"
                    value={formData.role}
                    onChange={(e) => {
                      const newRole = e.target.value as UserRole;
                      const matchedRole = roles.find((r) => r.id === newRole);
                      setFormData({
                        ...formData,
                        role: newRole,
                        ...(matchedRole ? {
                          maxDatabases: matchedRole.max_databases ?? formData.maxDatabases,
                          rateLimitPerMinute: matchedRole.rate_limit_per_minute ?? formData.rateLimitPerMinute,
                        } : {}),
                      });
                    }}
                    className="w-full bg-muted/40 border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {roles && roles.length > 0 ? (
                      roles.map((r) => (
                        <option key={r.id} value={r.id} disabled={!isSuperAdmin && isOwnerRole(r.id)}>
                          {r.name} ({r.id}) {!isSuperAdmin && isOwnerRole(r.id) ? '— Platform Owner only' : ''}
                        </option>
                      ))
                    ) : (
                      <>
                        {isSuperAdmin && <option value="super_admin">{t('users.roleSuperAdmin', 'Platform Owner')}</option>}
                        <option value="admin">{t('users.roleAdmin', 'Platform Administrator')}</option>
                        <option value="developer">{t('users.roleDeveloper', 'Database Engineer')}</option>
                        <option value="user">{t('users.roleUserStandard', 'Standard Member')}</option>
                      </>
                    )}
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
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="user-max-databases" className="text-muted-foreground font-medium">
                      {t('users.maxDbsAllowed', 'Max DBs Allowed')}
                    </label>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, maxDatabases: 0 })}
                      className="text-[10px] text-primary hover:underline font-semibold"
                    >
                      {t('users.setUnlimited', 'Không giới hạn (0)')}
                    </button>
                  </div>
                  <input
                    id="user-max-databases"
                    name="maxDatabases"
                    type="number"
                    min={0}
                    value={formData.maxDatabases}
                    onChange={(e) => setFormData({ ...formData, maxDatabases: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-muted/40 border border-border rounded px-3 py-2 text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {[0, 5, 20, 50].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setFormData({ ...formData, maxDatabases: num })}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                          formData.maxDatabases === num
                            ? 'bg-primary/10 border-primary text-primary font-bold'
                            : 'border-border text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        {num === 0 ? t('users.unlimitedShort', '∞ Vô hạn') : `${num} DBs`}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="user-rate-limit" className="text-muted-foreground font-medium">
                      {t('users.rateLimit', 'Rate Limit (req/min)')}
                    </label>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, rateLimitPerMinute: 0 })}
                      className="text-[10px] text-primary hover:underline font-semibold"
                    >
                      {t('users.setUnlimited', 'Không giới hạn (0)')}
                    </button>
                  </div>
                  <input
                    id="user-rate-limit"
                    name="rateLimitPerMinute"
                    type="number"
                    min={0}
                    value={formData.rateLimitPerMinute}
                    onChange={(e) => setFormData({ ...formData, rateLimitPerMinute: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-muted/40 border border-border rounded px-3 py-2 text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {[0, 60, 180, 300, 1000].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setFormData({ ...formData, rateLimitPerMinute: num })}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                          formData.rateLimitPerMinute === num
                            ? 'bg-primary/10 border-primary text-primary font-bold'
                            : 'border-border text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        {num === 0 ? t('users.unlimitedShort', '∞ Vô hạn') : `${num}/m`}
                      </button>
                    ))}
                  </div>
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
        isSuperAdmin={canManageUsers}
      />

      {/* Role Management Modal */}
      {isRolesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-xs">
          <div className="bg-card border border-border rounded-xl max-w-2xl w-full p-4 sm:p-6 shadow-xl max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    {t('roles.title', 'Role & Permission Management')}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {t('roles.subtitle', 'Manage system and custom RBAC roles with scoped privileges')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsRolesModalOpen(false);
                  resetRoleForm();
                }}
                className="p-1 rounded text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 pt-1">
              {/* Existing Roles List */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('roles.existingRoles', 'Active Platform Roles')} ({roles.length})
                </h3>
                <div className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-muted/10">
                  {roles.map((r) => (
                    <div key={r.id} className="p-3 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-foreground">{r.name}</span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {r.id}
                          </span>
                          {r.is_system ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium">
                              {t('roles.systemRole', 'System')}
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 font-medium">
                              {t('roles.customRole', 'Custom')}
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground text-[11px]">{r.description || 'No description'}</p>

                        {/* Quota badges */}
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap pt-0.5">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/40 border border-border font-mono">
                            <HardDrive className="w-3 h-3 text-primary" />
                            {r.max_storage_mb === 0 ? '∞ Unlimited' : `${r.max_storage_mb ?? 500} MB`}
                          </span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/40 border border-border font-mono">
                            <Database className="w-3 h-3 text-primary" />
                            {r.max_databases === 0 ? '∞ Unlimited' : `${r.max_databases ?? 5} DBs`}
                          </span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/40 border border-border font-mono">
                            <Gauge className="w-3 h-3 text-primary" />
                            {r.rate_limit_per_minute === 0 ? '∞ Unlimited' : `${r.rate_limit_per_minute ?? 180} req/m`}
                          </span>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/40 border border-border font-mono">
                            <Shield className="w-3 h-3 text-primary" />
                            {r.permissions?.includes('*')
                              ? 'All (*)'
                              : `${r.permissions?.length || 0} perms`}
                          </span>
                        </div>
                      </div>

                      {canManageUsers && (
                        <div className="flex items-center gap-1 shrink-0 self-end sm:self-start">
                          <button
                            onClick={() => {
                              setEditingRole(r);
                              setRoleForm({
                                id: r.id,
                                name: r.name,
                                description: r.description || '',
                                max_storage_mb: r.max_storage_mb ?? 500,
                                max_databases: r.max_databases ?? 5,
                                rate_limit_per_minute: r.rate_limit_per_minute ?? 180,
                                permissions: r.permissions || [],
                              });
                              setRoleFormError(null);
                            }}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
                            title={t('roles.editRole', 'Edit Role')}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {!r.is_system && (
                            <button
                              onClick={() => {
                                if (confirm(`Delete custom role "${r.name}"?`)) {
                                  deleteRoleMutation.mutate(r.id);
                                }
                              }}
                              disabled={deleteRoleMutation.isPending}
                              className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                              title="Delete Role"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Create or Edit Role Form */}
              {canManageUsers && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!roleForm.name.trim()) return;
                    if (editingRole) {
                      updateRoleMutation.mutate({
                        roleId: editingRole.id,
                        data: {
                          name: roleForm.name.trim(),
                          description: roleForm.description.trim() || null,
                          max_storage_mb: roleForm.max_storage_mb,
                          max_databases: roleForm.max_databases,
                          rate_limit_per_minute: roleForm.rate_limit_per_minute,
                          permissions: roleForm.permissions,
                        },
                      });
                    } else {
                      createRoleMutation.mutate({
                        id: roleForm.id.trim() || undefined,
                        name: roleForm.name.trim(),
                        description: roleForm.description.trim() || undefined,
                        max_storage_mb: roleForm.max_storage_mb,
                        max_databases: roleForm.max_databases,
                        rate_limit_per_minute: roleForm.rate_limit_per_minute,
                        permissions: roleForm.permissions,
                      });
                    }
                  }}
                  className="space-y-4 pt-3 border-t border-border"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      {editingRole ? (
                        <>
                          <Edit2 className="w-3.5 h-3.5 text-primary" />
                          {t('roles.editRole', 'Edit Role')}: <span className="font-mono text-primary">{editingRole.id}</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5 text-primary" />
                          {t('roles.createNew', 'Create New Role')}
                        </>
                      )}
                    </h3>
                    {editingRole && (
                      <button
                        type="button"
                        onClick={resetRoleForm}
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                      >
                        {t('common.cancel', 'Cancel Edit')}
                      </button>
                    )}
                  </div>

                  {roleFormError && (
                    <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-xs">
                      {roleFormError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                        {t('roles.roleName', 'Role Display Name')} *
                      </label>
                      <input
                        type="text"
                        required
                        value={roleForm.name}
                        onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                        placeholder="e.g. QA Engineer"
                        className="w-full bg-muted/40 border border-border rounded px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                        {t('roles.roleId', 'Role Identifier (slug)')}
                      </label>
                      <input
                        type="text"
                        disabled={Boolean(editingRole)}
                        value={roleForm.id}
                        onChange={(e) => setRoleForm({ ...roleForm, id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_') })}
                        placeholder="e.g. qa_engineer"
                        className="w-full bg-muted/40 border border-border rounded px-3 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                      {t('roles.roleDesc', 'Description')}
                    </label>
                    <input
                      type="text"
                      value={roleForm.description}
                      onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                      placeholder="e.g. Quality assurance tester with read and query inspection rights"
                      className="w-full bg-muted/40 border border-border rounded px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  {/* Quotas & Limits */}
                  <div className="p-3 bg-muted/20 border border-border rounded-lg space-y-3">
                    <h4 className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-primary" />
                      {t('roles.quotasSummary', 'Storage & Resource Limits')}
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Disk Quota */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-medium text-muted-foreground">
                            {t('roles.diskQuota', 'Disk Quota per DB (MB)')}
                          </label>
                          <button
                            type="button"
                            onClick={() => setRoleForm({ ...roleForm, max_storage_mb: 0 })}
                            className="text-[10px] text-primary hover:underline font-semibold"
                          >
                            {t('users.setUnlimited', 'Không giới hạn (0)')}
                          </button>
                        </div>
                        <input
                          type="number"
                          min={0}
                          value={roleForm.max_storage_mb}
                          onChange={(e) => setRoleForm({ ...roleForm, max_storage_mb: parseInt(e.target.value, 10) || 0 })}
                          className="w-full bg-muted/40 border border-border rounded px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {[0, 100, 500, 2048, 10240].map((num) => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => setRoleForm({ ...roleForm, max_storage_mb: num })}
                              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                roleForm.max_storage_mb === num
                                  ? 'bg-primary/10 border-primary text-primary font-bold'
                                  : 'border-border text-muted-foreground hover:bg-accent'
                              }`}
                            >
                              {num === 0 ? '∞' : num >= 1024 ? `${num / 1024}G` : `${num}M`}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Max DBs */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-medium text-muted-foreground">
                            {t('roles.maxDatabases', 'Max Databases')}
                          </label>
                          <button
                            type="button"
                            onClick={() => setRoleForm({ ...roleForm, max_databases: 0 })}
                            className="text-[10px] text-primary hover:underline font-semibold"
                          >
                            {t('users.setUnlimited', 'Không giới hạn (0)')}
                          </button>
                        </div>
                        <input
                          type="number"
                          min={0}
                          value={roleForm.max_databases}
                          onChange={(e) => setRoleForm({ ...roleForm, max_databases: parseInt(e.target.value, 10) || 0 })}
                          className="w-full bg-muted/40 border border-border rounded px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {[0, 2, 5, 20, 50].map((num) => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => setRoleForm({ ...roleForm, max_databases: num })}
                              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                roleForm.max_databases === num
                                  ? 'bg-primary/10 border-primary text-primary font-bold'
                                  : 'border-border text-muted-foreground hover:bg-accent'
                              }`}
                            >
                              {num === 0 ? '∞' : `${num}`}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Rate Limit */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-medium text-muted-foreground">
                            {t('roles.rateLimit', 'Rate Limit (req/min)')}
                          </label>
                          <button
                            type="button"
                            onClick={() => setRoleForm({ ...roleForm, rate_limit_per_minute: 0 })}
                            className="text-[10px] text-primary hover:underline font-semibold"
                          >
                            {t('users.setUnlimited', 'Không giới hạn (0)')}
                          </button>
                        </div>
                        <input
                          type="number"
                          min={0}
                          value={roleForm.rate_limit_per_minute}
                          onChange={(e) => setRoleForm({ ...roleForm, rate_limit_per_minute: parseInt(e.target.value, 10) || 0 })}
                          className="w-full bg-muted/40 border border-border rounded px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {[0, 60, 180, 600, 1200].map((num) => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => setRoleForm({ ...roleForm, rate_limit_per_minute: num })}
                              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                roleForm.rate_limit_per_minute === num
                                  ? 'bg-primary/10 border-primary text-primary font-bold'
                                  : 'border-border text-muted-foreground hover:bg-accent'
                              }`}
                            >
                              {num === 0 ? '∞' : `${num}`}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Permissions Checklist */}
                  <div className="p-3 bg-muted/20 border border-border rounded-lg space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h4 className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-primary" />
                        {t('roles.permissions', 'Granular Permissions')}
                      </h4>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setRoleForm({ ...roleForm, permissions: SYSTEM_PERMISSIONS.map(p => p.id) })}
                          className="text-[10px] text-primary hover:underline font-medium"
                        >
                          {t('roles.selectAll', 'Select All')}
                        </button>
                        <span className="text-muted-foreground text-[10px]">•</span>
                        <button
                          type="button"
                          onClick={() => setRoleForm({ ...roleForm, permissions: [] })}
                          className="text-[10px] text-muted-foreground hover:underline font-medium"
                        >
                          {t('roles.deselectAll', 'Deselect All')}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {(['Databases', 'API Tokens', 'Backups & Storage', 'Administration'] as const).map((cat) => {
                        const perms = SYSTEM_PERMISSIONS.filter(p => p.category === cat);
                        return (
                          <div key={cat} className="space-y-1.5">
                            <h5 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                              {cat}
                            </h5>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {perms.map((p) => {
                                const isChecked = roleForm.permissions.includes('*') || roleForm.permissions.includes(p.id);
                                return (
                                  <label
                                    key={p.id}
                                    className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-colors ${
                                      isChecked
                                        ? 'bg-primary/5 border-primary/40 text-foreground'
                                        : 'bg-muted/10 border-border text-muted-foreground hover:bg-muted/30'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        let updated: string[];
                                        if (roleForm.permissions.includes('*')) {
                                          updated = SYSTEM_PERMISSIONS.map(x => x.id).filter(id => id !== p.id);
                                        } else if (roleForm.permissions.includes(p.id)) {
                                          updated = roleForm.permissions.filter(id => id !== p.id);
                                        } else {
                                          updated = [...roleForm.permissions, p.id];
                                        }
                                        setRoleForm({ ...roleForm, permissions: updated });
                                      }}
                                      className="mt-0.5 rounded border-border text-primary focus:ring-primary"
                                    />
                                    <div className="text-[11px] leading-tight min-w-0">
                                      <div className="font-semibold text-foreground">{p.label}</div>
                                      <div className="text-[10px] text-muted-foreground mt-0.5">{p.description}</div>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    {editingRole && (
                      <button
                        type="button"
                        onClick={resetRoleForm}
                        className="px-3 py-1.5 border border-border hover:bg-accent text-foreground rounded-lg text-xs font-medium transition-colors"
                      >
                        {t('common.cancel', 'Cancel')}
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={createRoleMutation.isPending || updateRoleMutation.isPending || !roleForm.name.trim()}
                      className="px-3.5 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg text-xs font-semibold shadow-xs transition-colors"
                    >
                      {createRoleMutation.isPending || updateRoleMutation.isPending
                        ? t('common.saving', 'Saving...')
                        : editingRole
                        ? t('roles.editRole', 'Update Role')
                        : t('roles.createNew', 'Create Role')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
