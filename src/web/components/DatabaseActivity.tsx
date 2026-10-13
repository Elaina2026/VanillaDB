import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  RotateCw,
  Play,
  Pause,
  Copy,
  Check,
  Activity as ActivityIcon,
  Clock,
  Terminal,
  Archive,
  Folder,
  Calendar,
  X
} from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../hooks/useI18n.js';
import type { DatabaseActivityItem } from '@shared/index.js';

interface DatabaseActivityProps {
  databaseId: string;
}

export const DatabaseActivity: React.FC<DatabaseActivityProps> = ({ databaseId }) => {
  const { language } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [isLivePolling, setIsLivePolling] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch database activity stream
  const { data, isLoading, isFetching, refetch } = useQuery<{ items: DatabaseActivityItem[]; total: number }>({
    queryKey: ['dbActivity', databaseId, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      params.append('limit', '80');
      const res = await apiRequest<any>(`/api/admin/databases/${databaseId}/activity?${params.toString()}`);
      if (res && Array.isArray(res.items)) return res;
      if (res && res.data && Array.isArray(res.data.items)) return res.data;
      if (Array.isArray(res)) return { items: res, total: res.length };
      return { items: [], total: 0 };
    },
    refetchInterval: isLivePolling ? 10000 : false,
    staleTime: 8000,
  });

  const items = data?.items || [];

  // Group items by day
  const groupedEvents = useMemo(() => {
    const groups: { [dateKey: string]: { label: string; date: Date; events: DatabaseActivityItem[] } } = {};
    const now = new Date();
    const todayStr = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStr = todayStr - 86400000;

    for (const item of items) {
      const d = new Date(item.timestamp);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

      let label = '';
      if (dayStart === todayStr) {
        label = language === 'vi' ? 'Hôm nay' : 'Today';
      } else if (dayStart === yesterdayStr) {
        label = language === 'vi' ? 'Hôm qua' : 'Yesterday';
      } else {
        label = d.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US', {
          month: 'short',
          day: 'numeric',
          year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        });
      }

      const key = `${dayStart}`;
      if (!groups[key]) {
        groups[key] = { label, date: d, events: [] };
      }
      groups[key].events.push(item);
    }

    // Sort days descending
    return Object.keys(groups)
      .sort((a, b) => Number(b) - Number(a))
      .map(k => groups[k]);
  }, [items, language]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getActionBadgeClass = (action: string): string => {
    const act = action.toLowerCase();
    if (act.includes('delete') || act.includes('drop')) {
      return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
    }
    if (act.includes('create') || act.includes('uploaded')) {
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    }
    if (act.includes('backup') || act.includes('restore')) {
      return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    }
    if (act.includes('query') || act.includes('sql') || act.includes('exec')) {
      return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    }
    if (act.includes('maintenance') || act.includes('vacuum') || act.includes('reindex')) {
      return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
    }
    return 'bg-muted/80 text-muted-foreground border-border';
  };

  const formatEventTime = (timestamp: number): string => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString(language === 'vi' ? 'vi-VN' : 'en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-in fade-in duration-150">
      {/* Top Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <ActivityIcon className="w-4 h-4 text-blue-500" />
            {language === 'vi' ? 'Hoạt động' : 'Activity'}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {language === 'vi'
              ? 'Toàn bộ thao tác cơ sở dữ liệu, truy vấn SQL, thay đổi lịch trình và sao lưu theo thời gian thực.'
              : 'Audit trail of database operations, SQL executions, schedule triggers, and backups.'}
          </p>
        </div>

        {/* Filter by username / action search */}
        <div className="relative min-w-[240px] sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={language === 'vi' ? 'Lọc theo tên người dùng...' : 'Filter by username...'}
            className="w-full pl-9 pr-8 py-2 bg-card border border-border rounded-xl text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500 transition-colors shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Timeline View */}
      {isLoading ? (
        <div className="p-16 text-center text-muted-foreground text-xs space-y-3">
          <RotateCw className="w-5 h-5 mx-auto animate-spin text-blue-500" />
          <p>{language === 'vi' ? 'Đang tải nhật ký hoạt động...' : 'Loading activity timeline...'}</p>
        </div>
      ) : groupedEvents.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-14 text-center space-y-2 shadow-xs">
          <Clock className="w-8 h-8 text-muted-foreground/60 mx-auto" />
          <h3 className="text-sm font-bold text-foreground">
            {language === 'vi' ? 'Chưa có hoạt động nào' : 'No Activity Found'}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {searchQuery
              ? (language === 'vi' ? `Không tìm thấy hoạt động nào khớp với "${searchQuery}"` : `No activity matches filter "${searchQuery}"`)
              : (language === 'vi' ? 'Các thao tác truy vấn, sao lưu hoặc thay đổi lịch trình sẽ được lưu tại đây.' : 'Operations, schedules, and queries will appear here.')}
          </p>
        </div>
      ) : (
        <div className="relative space-y-8 pl-4 sm:pl-28">
          {/* Continuous vertical timeline guide line */}
          <div className="absolute left-[20px] sm:left-[96px] top-3 bottom-3 w-0.5 bg-border pointer-events-none" />

          {groupedEvents.map((group, groupIdx) => (
            <div key={groupIdx} className="relative space-y-3">
              {/* Day Header with node dot */}
              <div className="flex items-center gap-3">
                {/* Desktop Day label on the left */}
                <span className="hidden sm:block absolute left-[-96px] w-[80px] text-right text-xs font-bold text-muted-foreground truncate">
                  {group.label}
                </span>

                {/* Timeline node dot */}
                <div className="relative z-10 w-3 h-3 rounded-full bg-blue-600 ring-4 ring-card shrink-0 -translate-x-[5px] sm:-translate-x-[5px]" />

                {/* Mobile Day label inline */}
                <span className="sm:hidden text-xs font-bold text-foreground">
                  {group.label}
                </span>
              </div>

              {/* Event Cards under this day */}
              <div className="space-y-2.5 pt-1">
                {group.events.map((event) => {
                  const copyText = `${event.user} [${event.action}] ${event.description} (${new Date(event.timestamp).toISOString()})`;
                  const isCopied = copiedId === event.id;

                  return (
                    <div
                      key={event.id}
                      className="group bg-card border border-border hover:border-blue-500/40 rounded-xl p-3.5 transition-all shadow-xs space-y-1.5"
                    >
                      {/* Top Row: User & Action Pill */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-bold text-xs text-foreground truncate">
                            {event.user}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${getActionBadgeClass(
                              event.action
                            )}`}
                          >
                            {event.action}
                          </span>
                        </div>

                        {/* Quick Copy Button */}
                        <button
                          onClick={() => handleCopy(event.id, copyText)}
                          title={language === 'vi' ? 'Sao chép chi tiết' : 'Copy details'}
                          className="p-1 text-muted-foreground hover:text-foreground opacity-60 group-hover:opacity-100 transition-opacity rounded hover:bg-accent shrink-0 cursor-pointer"
                        >
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-foreground/90 leading-relaxed font-normal">
                        {event.description}
                      </p>

                      {/* Metadata Footer: Time & IP */}
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                        <span>{formatEventTime(event.timestamp)}</span>
                        {event.ip && (
                          <>
                            <span>•</span>
                            <span className="opacity-80">{event.ip}</span>
                          </>
                        )}
                        {event.status === 'failure' && (
                          <>
                            <span>•</span>
                            <span className="text-rose-500 font-sans font-medium">
                              {language === 'vi' ? 'Thất bại' : 'Failed'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating Bottom Control Bar (matching Image 2) */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-card/90 dark:bg-card/95 backdrop-blur-md border border-border rounded-2xl shadow-xl px-4 py-2 flex items-center gap-3 text-xs text-foreground">
        {/* Play / Pause Live Polling */}
        <button
          onClick={() => setIsLivePolling(!isLivePolling)}
          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
            isLivePolling
              ? 'text-emerald-500 hover:bg-emerald-500/10'
              : 'text-muted-foreground hover:bg-accent'
          }`}
          title={
            isLivePolling
              ? (language === 'vi' ? 'Tạm dừng cập nhật thời gian thực' : 'Pause live stream')
              : (language === 'vi' ? 'Tiếp tục tự động làm mới' : 'Resume live stream')
          }
        >
          {isLivePolling ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>

        {/* Manual Refresh */}
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          title={language === 'vi' ? 'Làm mới ngay' : 'Refresh activity'}
        >
          <RotateCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-blue-500' : ''}`} />
        </button>

        <div className="h-4 w-px bg-border" />

        {/* Count indicator */}
        <span className="text-[11px] font-mono text-muted-foreground">
          {items.length} {language === 'vi' ? 'hoạt động' : 'events'}
        </span>
      </div>
    </div>
  );
};
