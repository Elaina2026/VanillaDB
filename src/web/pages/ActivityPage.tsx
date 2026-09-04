import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Shield, Filter, RefreshCw, CheckCircle, XCircle, Terminal, Search, Database, Clock, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { formatDate } from '../lib/utils.js';
import { useI18n } from '../hooks/useI18n.js';
import type { ActivityRecord, AuditRecord } from '@shared/index.js';

export const ActivityPage: React.FC = () => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'activity' | 'audit'>('activity');
  const [filterSearch, setFilterSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data: activityData, isLoading: isActivityLoading, refetch: refetchActivity, isFetching: isActivityFetching } = useQuery<{ items: ActivityRecord[]; total: number }>({
    queryKey: ['activityLogs'],
    queryFn: () => apiRequest('/api/admin/activity?limit=500'),
    enabled: activeTab === 'activity',
    refetchInterval: 10000,
  });

  const { data: auditData, isLoading: isAuditLoading, refetch: refetchAudit, isFetching: isAuditFetching } = useQuery<{ items: AuditRecord[]; total: number }>({
    queryKey: ['auditLogs'],
    queryFn: () => apiRequest('/api/admin/audit?limit=500'),
    enabled: activeTab === 'audit',
    refetchInterval: 10000,
  });

  const filteredActivity = (activityData?.items || []).filter((item) => {
    if (!filterSearch.trim()) return true;
    const q = filterSearch.toLowerCase().trim();
    return (
      (item.operation && item.operation.toLowerCase().includes(q)) ||
      (item.database_id && item.database_id.toLowerCase().includes(q)) ||
      (item.token_id && item.token_id.toLowerCase().includes(q)) ||
      (item.status && item.status.toLowerCase().includes(q)) ||
      (item.error_message && item.error_message.toLowerCase().includes(q))
    );
  });

  const filteredAudit = (auditData?.items || []).filter((item) => {
    if (!filterSearch.trim()) return true;
    const q = filterSearch.toLowerCase().trim();
    return (
      (item.action && item.action.toLowerCase().includes(q)) ||
      (item.user && item.user.toLowerCase().includes(q)) ||
      (item.resource && item.resource.toLowerCase().includes(q)) ||
      (item.details && item.details.toLowerCase().includes(q)) ||
      (item.result && item.result.toLowerCase().includes(q))
    );
  });

  const currentList = activeTab === 'activity' ? filteredActivity : filteredAudit;
  const totalPages = Math.max(1, Math.ceil(currentList.length / pageSize));
  const paginatedItems = currentList.slice((page - 1) * pageSize, page * pageSize);

  const handleTabSwitch = (tab: 'activity' | 'audit') => {
    setActiveTab(tab);
    setPage(1);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-4 md:p-6 max-w-7xl mx-auto w-full space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-border gap-3 shrink-0">
        <div>
          <h1 className="text-lg md:text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            {t('activity.title', 'System & Security Logs')}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('activity.desc', 'Real-time API executions, SQL queries, and administrative audit trails.')}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex bg-muted p-0.5 rounded-md border border-border">
            <button
              onClick={() => handleTabSwitch('activity')}
              className={`px-2.5 sm:px-3 py-1 text-xs font-medium rounded transition-colors ${
                activeTab === 'activity' ? 'bg-card text-foreground shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('activity.tabActivity', 'API & SQL Activity')}
            </button>
            <button
              onClick={() => handleTabSwitch('audit')}
              className={`px-2.5 sm:px-3 py-1 text-xs font-medium rounded transition-colors ${
                activeTab === 'audit' ? 'bg-card text-foreground shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('activity.tabAudit', 'Security & Audit')}
            </button>
          </div>
          <button
            onClick={() => (activeTab === 'activity' ? refetchActivity() : refetchAudit())}
            className="p-1.5 bg-card border border-border hover:bg-accent rounded text-muted-foreground transition-colors"
            title="Refresh Logs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isActivityFetching || isAuditFetching ? 'animate-spin text-blue-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <input
            type="text"
            placeholder={activeTab === 'activity' ? "Filter operations, tokens, databases, errors..." : "Filter actions, users, resources, details..."}
            value={filterSearch}
            onChange={(e) => {
              setFilterSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-card border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground font-mono"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{currentList.length} total events</span>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="flex-1 min-h-0 border border-border rounded-lg bg-card overflow-hidden shadow-sm flex flex-col">
        <div className="flex-1 overflow-auto">
          {activeTab === 'activity' ? (
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-muted/60 border-b border-border font-medium text-muted-foreground sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Database</th>
                  <th className="py-2.5 px-3">Client / Token</th>
                  <th className="py-2.5 px-3">Operation</th>
                  <th className="py-2.5 px-3">Rows</th>
                  <th className="py-2.5 px-3">Duration</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isActivityLoading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">Loading activity stream...</td>
                  </tr>
                ) : paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground">No matching API activity recorded.</td>
                  </tr>
                ) : (
                  (paginatedItems as ActivityRecord[]).map((act) => (
                    <tr key={act.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3 text-[11px] text-muted-foreground whitespace-nowrap">{formatDate(act.timestamp)}</td>
                      <td className="py-2 px-3 text-[11px] text-blue-500 font-semibold">{act.database_id || '—'}</td>
                      <td className="py-2 px-3 text-[11px] text-foreground">{act.token_id || '—'}</td>
                      <td className="py-2 px-3 font-semibold text-foreground">{act.operation}</td>
                      <td className="py-2 px-3 text-muted-foreground">{act.row_count !== undefined ? act.row_count : '—'}</td>
                      <td className="py-2 px-3 text-muted-foreground">{act.duration_ms} ms</td>
                      <td className="py-2 px-3">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          act.status === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                        }`}>
                          {act.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-muted/60 border-b border-border font-medium text-muted-foreground sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Admin User</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Resource</th>
                  <th className="py-2.5 px-3">Details</th>
                  <th className="py-2.5 px-3">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isAuditLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">Loading audit records...</td>
                  </tr>
                ) : paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">No audit records found.</td>
                  </tr>
                ) : (
                  (paginatedItems as AuditRecord[]).map((aud) => (
                    <tr key={aud.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3 text-[11px] text-muted-foreground whitespace-nowrap">{formatDate(aud.timestamp)}</td>
                      <td className="py-2 px-3 font-semibold text-foreground">{aud.user}</td>
                      <td className="py-2 px-3 text-blue-500 font-semibold">{aud.action}</td>
                      <td className="py-2 px-3 text-[11px] text-muted-foreground">{aud.resource}</td>
                      <td className="py-2 px-3 text-[11px] text-muted-foreground max-w-sm truncate" title={aud.details || ''}>
                        {aud.details || '—'}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          aud.result === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                        }`}>
                          {aud.result}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Bar */}
        <div className="p-3 border-t border-border bg-card flex items-center justify-between text-xs text-muted-foreground shrink-0">
          <div>
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, currentList.length)} of {currentList.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 border border-border rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed text-foreground"
              title="Previous Page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-xs text-foreground px-1">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1.5 border border-border rounded hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed text-foreground"
              title="Next Page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
