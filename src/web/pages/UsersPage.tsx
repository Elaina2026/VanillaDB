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
  X
} from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { formatDate } from '../lib/utils.js';
import { useAuth } from '../hooks/useAuth.js';
import { useI18n } from '../hooks/useI18n.js';
import { ConfirmModal } from '../components/ConfirmModal.js';
import type { UserRecord, UserRole } from '@shared/index.js';

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Form states
  const [formData, setFormData] = useState<{
    username: string;
    password: string;
    role: UserRole;
    maxDatabases: number;
    rateLimitPerMinute: number;
    status: 'active' | 'disabled';
  }>({
    username: '',
    password: '',
    role: 'user',
    maxDatabases: 5,
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
      setFormError(err.message || 'Failed to create user');
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
      setFormError(err.message || 'Failed to update user');
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
    },
  });

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      role: 'user',
      maxDatabases: 5,
      rateLimitPerMinute: 60,
      status: 'active',
    });
    setFormError(null);
  };

  const handleOpenEdit = (u: UserRecord) => {
    setEditingUser(u);
    setFormData({
      username: u.username,
      password: '',
      role: u.role,
      maxDatabases: u.max_databases,
      rateLimitPerMinute: u.rate_limit_per_minute,
      status: u.status,
    });
    setFormError(null);
  };

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t('users.title', 'User Management')}</h1>
            <span className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded font-semibold uppercase tracking-wider">
              {t('users.superAdminBadge', 'Super Admin Control')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('users.desc', 'Manage sub-accounts, configure database creation caps, rate limiting quotas, and assign permission roles.')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border hover:bg-accent text-foreground rounded-md text-xs font-semibold shadow-sm transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{t('common.refresh', 'Refresh')}</span>
          </button>

          <button
            onClick={() => {
              resetForm();
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{t('users.create', 'Add New User')}</span>
          </button>
        </div>
      </div>

      {/* Search & Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">{t('users.totalAccounts', 'Total Accounts')}</span>
            <Users className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground">{users.length}</div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">{t('users.superAdmins', 'Super Admins')}</span>
            <Shield className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground">
            {users.filter(u => u.role === 'super_admin').length}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">{t('users.standardUsers', 'Standard Users')}</span>
            <Key className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground">
            {users.filter(u => u.role === 'user').length}
          </div>
        </div>
      </div>

      {/* User Table Card */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* Search Bar */}
        <div className="p-3 border-b border-border flex items-center gap-2 bg-muted/20">
          <Search className="w-4 h-4 text-muted-foreground" />
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
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    {t('users.noMatchingUsers', 'No users matching search criteria.')}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        {u.username}
                        {u.username === currentUser?.username && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-blue-500/10 text-blue-500 rounded font-normal">
                            {t('common.you', 'You')}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground">{u.id}</div>
                    </td>

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

                    <td className="py-3 px-4 font-mono">
                      {u.role === 'super_admin' ? (
                        <span className="text-emerald-500 font-semibold">{t('users.zeroUnlimited', 'Unlimited')}</span>
                      ) : (
                        <span>
                          <strong className="text-foreground">{u.database_count ?? 0}</strong> / {u.max_databases} {t('users.dbsUnit', 'DBs')}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono">
                      {u.rate_limit_per_minute > 0 ? (
                        <span>{u.rate_limit_per_minute} {t('users.reqPerMinUnit', 'req/min')}</span>
                      ) : (
                        <span className="text-emerald-500 font-semibold">{t('users.zeroUnlimited', 'Unlimited')}</span>
                      )}
                    </td>

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

                    <td className="py-3 px-4 text-muted-foreground text-[11px]">
                      {formatDate(u.created_at)}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(u)}
                          className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                          title={t('users.editUser', 'Edit User')}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingUserId(u.id)}
                          disabled={u.id === currentUser?.userId}
                          className="p-1.5 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-500 disabled:opacity-30 transition-colors"
                          title={t('users.deleteUser', 'Delete User')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit User Modal */}
      {(isCreateModalOpen || editingUser) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                {editingUser ? `${t('users.editUserPrefix', 'Edit User:')} ${editingUser.username}` : t('users.createNewAccount', 'Create New Account')}
              </h2>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setEditingUser(null);
                }}
                className="p-1 text-muted-foreground hover:text-foreground rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded text-xs">
                {formError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-muted-foreground font-medium mb-1">{t('users.username', 'Username')}</label>
                <input
                  type="text"
                  disabled={!!editingUser}
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder={t('users.usernamePlaceholder', 'e.g. developer_sub1')}
                  className="w-full bg-muted/40 border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-muted-foreground font-medium mb-1">
                  {editingUser ? t('users.newPasswordHint', 'New Password (leave empty to keep current)') : t('auth.password', 'Password')}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full bg-muted/40 border border-border rounded px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted-foreground font-medium mb-1">{t('users.role', 'Role')}</label>
                  <select
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
                  <label className="block text-muted-foreground font-medium mb-1">{t('users.accountStatus', 'Account Status')}</label>
                  <select
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
                  <label className="block text-muted-foreground font-medium mb-1">{t('users.maxDbsAllowed', 'Max DBs Allowed')}</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.maxDatabases}
                    onChange={(e) => setFormData({ ...formData, maxDatabases: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-muted/40 border border-border rounded px-3 py-2 text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">{t('users.noLimitAdmin', '0 = No limit for admin')}</span>
                </div>

                <div>
                  <label className="block text-muted-foreground font-medium mb-1">{t('users.rateLimit', 'Rate Limit (req/min)')}</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.rateLimitPerMinute}
                    onChange={(e) => setFormData({ ...formData, rateLimitPerMinute: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-muted/40 border border-border rounded px-3 py-2 text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-[10px] text-muted-foreground mt-0.5 block">{t('users.zeroUnlimited', '0 = Unlimited')}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setEditingUser(null);
                }}
                className="px-4 py-2 bg-card border border-border hover:bg-accent text-foreground rounded text-xs font-medium"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={() => {
                  if (editingUser) {
                    const updatePayload: any = {
                      role: formData.role,
                      maxDatabases: formData.maxDatabases,
                      rateLimitPerMinute: formData.rateLimitPerMinute,
                      status: formData.status,
                    };
                    if (formData.password) updatePayload.password = formData.password;
                    updateUserMutation.mutate({ id: editingUser.id, data: updatePayload });
                  } else {
                    createUserMutation.mutate(formData);
                  }
                }}
                disabled={createUserMutation.isPending || updateUserMutation.isPending || (!editingUser && (!formData.username || !formData.password))}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-sm"
              >
                {createUserMutation.isPending || updateUserMutation.isPending ? t('common.saving', 'Saving...') : editingUser ? t('users.updateUserBtn', 'Update User') : t('users.createUserBtn', 'Create User')}
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
};
