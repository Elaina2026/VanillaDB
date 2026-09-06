import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Mail,
  Inbox,
  Check,
  X,
  Bell,
  AlertTriangle,
  Info,
  ShieldAlert,
  Sparkles,
  Plus,
  Trash2,
  ExternalLink,
  Clock,
  User as UserIcon,
  CheckCheck,
  CheckCircle2,
  Pin,
  Database,
  ArrowRight,
} from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { formatDate, formatTimeAgo } from '../lib/utils.js';
import { useAuth } from '../hooks/useAuth.js';
import { useI18n } from '../hooks/useI18n.js';
import type { UserInboxResponse, UserInboxInvite, SystemAnnouncement, MemberRole } from '@shared/index.js';

export const InboxPage: React.FC<{
  onSelectDatabase: (id: string) => void;
}> = ({ onSelectDatabase }) => {
  const { user } = useAuth();
  const { language, t } = useI18n();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'invites' | 'announcements'>('invites');
  const [acceptedDbId, setAcceptedDbId] = useState<{ id: string; name: string } | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Form state for creating announcements (admin only)
  const [newTitle, setNewTitle] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newType, setNewType] = useState<'announcement' | 'maintenance' | 'security' | 'update'>('announcement');
  const [newExpiresInDays, setNewExpiresInDays] = useState<number | ''>('');
  const [newPinned, setNewPinned] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), 5000);
  };
  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const { data: inbox, isLoading, refetch } = useQuery<UserInboxResponse>({
    queryKey: ['userInbox'],
    queryFn: () => apiRequest('/api/admin/inbox'),
    refetchInterval: 15000,
  });

  const acceptMutation = useMutation({
    mutationFn: (invite: UserInboxInvite) =>
      apiRequest(`/api/admin/inbox/invites/${invite.id}/accept`, { method: 'POST' }),
    onSuccess: (_, invite) => {
      setAcceptedDbId({ id: invite.database_id, name: invite.database_name });
      showSuccess(t('inbox.acceptedSuccess', 'Invitation accepted successfully'));
      queryClient.invalidateQueries({ queryKey: ['userInbox'] });
      queryClient.invalidateQueries({ queryKey: ['databases'] });
      queryClient.invalidateQueries({ queryKey: ['userDashboardStats'] });
    },
    onError: (err: any) => {
      showError(err.message || 'Failed to accept invitation');
    },
  });

  const declineMutation = useMutation({
    mutationFn: (inviteId: string) =>
      apiRequest(`/api/admin/inbox/invites/${inviteId}/decline`, { method: 'POST' }),
    onSuccess: () => {
      showSuccess(t('inbox.declinedSuccess', 'Invitation declined'));
      queryClient.invalidateQueries({ queryKey: ['userInbox'] });
      queryClient.invalidateQueries({ queryKey: ['databases'] });
    },
    onError: (err: any) => {
      showError(err.message || 'Failed to decline invitation');
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (announcementId: string) =>
      apiRequest(`/api/admin/inbox/announcements/${announcementId}/read`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userInbox'] });
    },
    onError: (err: any) => {
      showError(err.message || 'Failed to mark announcement as read');
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiRequest('/api/admin/inbox/read-all', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userInbox'] });
      showSuccess(t('inbox.allMarkedRead', 'All announcements marked as read'));
    },
    onError: (err: any) => {
      showError(err.message || 'Failed to mark all as read');
    },
  });

  const createAnnouncementMutation = useMutation({
    mutationFn: (payload: any) =>
      apiRequest('/api/admin/announcements', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setIsCreateModalOpen(false);
      setNewTitle('');
      setNewMessage('');
      setNewType('announcement');
      setNewExpiresInDays('');
      setNewPinned(false);
      setFormError(null);
      showSuccess(t('inbox.announcementCreated', 'Announcement posted successfully'));
      queryClient.invalidateQueries({ queryKey: ['userInbox'] });
    },
    onError: (err: any) => {
      setFormError(err.message || 'Failed to create announcement');
    },
  });

  const deleteAnnouncementMutation = useMutation({
    mutationFn: (announcementId: string) =>
      apiRequest(`/api/admin/announcements/${announcementId}`, { method: 'DELETE' }),
    onSuccess: () => {
      showSuccess(t('inbox.announcementDeleted', 'Announcement deleted'));
      queryClient.invalidateQueries({ queryKey: ['userInbox'] });
    },
    onError: (err: any) => {
      showError(err.message || 'Failed to delete announcement');
    },
  });

  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const pendingInvites = inbox?.invites || [];
  const announcements = inbox?.announcements || [];
  const unreadAnnouncementsCount = announcements.filter((a) => !a.is_read).length;

  const getRoleBadge = (role: MemberRole) => {
    switch (role) {
      case 'admin':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-red-500/10 text-red-500 border border-red-500/20">Admin</span>;
      case 'editor':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20">Editor</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-blue-500/10 text-blue-500 border border-blue-500/20">Viewer</span>;
    }
  };

  const getRoleExplanation = (role: MemberRole) => {
    switch (role) {
      case 'admin':
        return language === 'vi' ? 'Toàn quyền cấu hình schema, quản lý bảng, bản sao lưu và thành viên.' : 'Full schema, backups, files, and members management.';
      case 'editor':
        return language === 'vi' ? 'Thực thi truy vấn đọc ghi dữ liệu, thêm, sửa, xóa các dòng.' : 'Execute read and write queries, modify rows and upload media.';
      default:
        return language === 'vi' ? 'Quyền chỉ đọc schema và câu lệnh SELECT, không chỉnh sửa dữ liệu.' : 'Read-only access for SELECT queries and schema browsing.';
    }
  };

  const getAnnouncementBadge = (type: string) => {
    switch (type) {
      case 'maintenance':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <AlertTriangle className="w-3 h-3" />
            {t('inbox.annTypeMaintenance', 'Lịch bảo trì hệ thống')}
          </span>
        );
      case 'security':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-500 border border-red-500/20">
            <ShieldAlert className="w-3 h-3" />
            {t('inbox.annTypeSecurity', 'Cảnh báo bảo mật')}
          </span>
        );
      case 'update':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-500 border border-purple-500/20">
            <Sparkles className="w-3 h-3" />
            {t('inbox.annTypeUpdate', 'Cập nhật tính năng')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <Info className="w-3 h-3" />
            {t('inbox.annTypeGeneral', 'Thông báo chung')}
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto w-full space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-500 border border-blue-500/20 flex items-center justify-center shrink-0">
              <Inbox className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                {t('inbox.title', 'Hộp thư & Thông báo')}
                {inbox && inbox.unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                    {inbox.unreadCount}
                  </span>
                )}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('inbox.desc', 'Quản lý lời mời tham gia cơ sở dữ liệu và thông báo hệ thống.')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {unreadAnnouncementsCount > 0 && activeTab === 'announcements' && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>{t('inbox.markAllRead', 'Đánh dấu tất cả đã đọc')}</span>
              </button>
            )}

            {isAdmin && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('inbox.createAnnouncement', 'Tạo thông báo mới')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Success alert after accepting */}
        {acceptedDbId && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-emerald-500">
              <Check className="w-4 h-4 shrink-0" />
              <span>
                <strong>{t('inbox.acceptSuccess', 'Đã chấp nhận lời mời!')}</strong> Cơ sở dữ liệu{' '}
                <strong>{acceptedDbId.name}</strong> hiện đã sẵn sàng trong danh sách của bạn.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onSelectDatabase(acceptedDbId.id)}
                className="flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded text-xs transition-colors cursor-pointer"
              >
                <span>{t('inbox.openDb', 'Mở Database')}</span>
                <ArrowRight className="w-3 h-3" />
              </button>
              <button
                onClick={() => setAcceptedDbId(null)}
                className="p-1 text-muted-foreground hover:text-foreground rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-border">
          <button
            onClick={() => setActiveTab('invites')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'invites'
                ? 'border-blue-500 text-blue-500 font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>{t('inbox.tabInvites', 'Lời mời cơ sở dữ liệu')}</span>
            {pendingInvites.length > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-bold bg-blue-500 text-white rounded-full">
                {pendingInvites.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('announcements')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === 'announcements'
                ? 'border-blue-500 text-blue-500 font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>{t('inbox.tabAnnouncements', 'Thông báo hệ thống')}</span>
            {unreadAnnouncementsCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-bold bg-red-500 text-white rounded-full">
                {unreadAnnouncementsCount}
              </span>
            )}
          </button>
        </div>

        {/* Tab 1: Database Invitations */}
        {activeTab === 'invites' && (
          <div className="space-y-4">
            {pendingInvites.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-12 text-center space-y-3 shadow-xs">
                <Mail className="w-10 h-10 text-muted-foreground/50 mx-auto" />
                <p className="text-sm font-semibold text-foreground">
                  {t('inbox.noInvites', 'Hiện không có lời mời nào đang chờ xử lý.')}
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {language === 'vi'
                    ? 'Khi người dùng khác chia sẻ cơ sở dữ liệu cho bạn, lời mời sẽ xuất hiện tại đây để bạn chấp nhận hoặc từ chối.'
                    : 'When other users share a database with you, invitations will appear here for you to accept or decline.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingInvites.map((invite) => (
                  <div
                    key={invite.id}
                    className="bg-card border border-border rounded-xl p-5 shadow-xs hover:border-blue-500/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Database className="w-4 h-4 text-blue-500" />
                        <h3 className="font-bold text-sm text-foreground">{invite.database_name}</h3>
                        {getRoleBadge(invite.role)}
                      </div>

                      {invite.database_description && (
                        <p className="text-xs text-muted-foreground">{invite.database_description}</p>
                      )}

                      <p className="text-[11px] text-muted-foreground/80">
                        {getRoleExplanation(invite.role)}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground pt-1">
                        <span className="flex items-center gap-1">
                          <UserIcon className="w-3 h-3 text-muted-foreground" />
                          <span>
                            {t('inbox.invitationFrom', 'Người mời')}:{' '}
                            <strong className="text-foreground">{invite.invited_by}</strong>
                          </span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <span>{formatTimeAgo(invite.created_at, language)}</span>
                        </span>
                        <span>•</span>
                        <span className="text-[10px] text-muted-foreground/70">
                          {t('inbox.invitationExpires', 'Hết hạn vào')}: {formatDate(invite.expires_at, language)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-border">
                      <button
                        onClick={() => acceptMutation.mutate(invite)}
                        disabled={acceptMutation.isPending || declineMutation.isPending}
                        className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{t('inbox.accept', 'Chấp nhận')}</span>
                      </button>

                      <button
                        onClick={() => declineMutation.mutate(invite.id)}
                        disabled={acceptMutation.isPending || declineMutation.isPending}
                        className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-2 border border-border hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30 rounded-lg text-xs font-medium text-muted-foreground transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>{t('inbox.decline', 'Từ chối')}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: System Announcements */}
        {activeTab === 'announcements' && (
          <div className="space-y-4">
            {announcements.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-12 text-center space-y-3 shadow-xs">
                <Bell className="w-10 h-10 text-muted-foreground/50 mx-auto" />
                <p className="text-sm font-semibold text-foreground">
                  {t('inbox.noAnnouncements', 'Hiện không có thông báo hệ thống nào.')}
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {language === 'vi'
                    ? 'Các thông báo bảo trì, cảnh báo bảo mật hoặc cập nhật phiên bản mới sẽ xuất hiện tại đây.'
                    : 'System maintenance notices, security advisories, and feature updates will be displayed here.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {announcements.map((ann) => (
                  <div
                    key={ann.id}
                    className={`bg-card border rounded-xl p-5 shadow-xs transition-all space-y-3 ${
                      !ann.is_read
                        ? 'border-blue-500/50 ring-1 ring-blue-500/20 bg-blue-500/[0.02]'
                        : 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {getAnnouncementBadge(ann.type)}
                          {ann.pinned && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
                              <Pin className="w-2.5 h-2.5 text-blue-500" />
                              PINNED
                            </span>
                          )}
                          {!ann.is_read && (
                            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" title="Unread" />
                          )}
                        </div>
                        <h3 className="font-bold text-sm text-foreground pt-1">{ann.title}</h3>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {!ann.is_read && (
                          <button
                            onClick={() => markReadMutation.mutate(ann.id)}
                            className="p-1.5 text-xs text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 rounded transition-colors cursor-pointer"
                            title={t('inbox.markRead', 'Đánh dấu đã đọc')}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => deleteAnnouncementMutation.mutate(ann.id)}
                            className="p-1.5 text-xs text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                            title="Xóa thông báo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed bg-muted/30 p-3.5 rounded-lg border border-border/50 font-sans">
                      {ann.message}
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-[11px] text-muted-foreground pt-1">
                      <div className="flex items-center gap-2">
                        <span>
                          {t('inbox.invitationFrom', 'Đăng bởi')}: <strong className="text-foreground">{ann.author_username}</strong>
                        </span>
                        <span>•</span>
                        <span>{formatDate(ann.created_at, language)}</span>
                      </div>

                      {ann.is_read ? (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Check className="w-3 h-3 text-emerald-500" />
                          {language === 'vi' ? 'Đã đọc' : 'Read'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-blue-500 font-medium">
                          {language === 'vi' ? 'Chưa đọc' : 'Unread'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Admin Create Announcement Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-blue-500" />
                <h3 className="font-bold text-sm text-foreground">
                  {t('inbox.createAnnouncement', 'Tạo thông báo mới')}
                </h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTitle.trim() || !newMessage.trim()) return;
                createAnnouncementMutation.mutate({
                  title: newTitle.trim(),
                  message: newMessage.trim(),
                  type: newType,
                  expiresInDays: newExpiresInDays ? Number(newExpiresInDays) : null,
                  pinned: newPinned,
                });
              }}
              className="p-5 space-y-4 text-xs"
            >
              {formError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-500 text-xs">
                  {formError}
                </div>
              )}

              <div>
                <label className="block font-medium text-foreground mb-1">
                  {t('inbox.annTitle', 'Tiêu đề')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="VD: Lịch bảo trì nâng cấp SQLite Cloud định kỳ"
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1">
                  {t('inbox.annType', 'Loại thông báo')}
                </label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  <option value="announcement">{t('inbox.annTypeGeneral', 'Thông báo chung')}</option>
                  <option value="maintenance">{t('inbox.annTypeMaintenance', 'Lịch bảo trì hệ thống')}</option>
                  <option value="security">{t('inbox.annTypeSecurity', 'Cảnh báo bảo mật')}</option>
                  <option value="update">{t('inbox.annTypeUpdate', 'Cập nhật tính năng')}</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1">
                  {t('inbox.annMessage', 'Nội dung thông báo')} <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Mô tả chi tiết thời gian bảo trì, phạm vi ảnh hưởng hoặc các cập nhật mới..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground focus:ring-1 focus:ring-blue-500 outline-none resize-y"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-foreground mb-1">
                    {t('inbox.annExpiresIn', 'Hết hạn sau (ngày)')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={newExpiresInDays}
                    onChange={(e) => setNewExpiresInDays(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="VD: 7 (Bỏ trống nếu vĩnh viễn)"
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-foreground focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newPinned}
                      onChange={(e) => setNewPinned(e.target.checked)}
                      className="rounded border-border text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span className="font-medium text-foreground">{t('inbox.annPinned', 'Ghim lên đầu')}</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3.5 py-1.5 border border-border hover:bg-accent rounded-md text-muted-foreground hover:text-foreground font-medium transition-colors cursor-pointer"
                >
                  {t('common.cancel', 'Hủy')}
                </button>
                <button
                  type="submit"
                  disabled={createAnnouncementMutation.isPending}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition-colors cursor-pointer"
                >
                  {createAnnouncementMutation.isPending ? t('common.creating', 'Đang tạo...') : t('common.create', 'Tạo thông báo')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Toast notifications */}
      {successMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-card border border-border shadow-xl rounded-lg px-4 py-3 text-xs text-foreground flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-destructive text-destructive-foreground shadow-xl rounded-lg px-4 py-3 text-xs flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
