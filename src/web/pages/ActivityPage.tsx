import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Shield, Filter, RefreshCw, CheckCircle, XCircle, Terminal, Search, Database, Clock } from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { formatDate } from '../lib/utils.js';
import type { ActivityRecord, AuditRecord } from '@shared/index.js';

export const ActivityPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'activity' | 'audit'>('activity');
  const [filterSearch, setFilterSearch] = useState('');

  const { data: activityData, isLoading: isActivityLoading, refetch: refetchActivity, isFetching: isActivityFetching } = useQuery<{ items: ActivityRecord[]; total: number }>({
    queryKey: ['activityLogs'],
    queryFn: () => apiRequest('/api/admin/activity?limit=200'),
    enabled: activeTab === 'activity',
    refetchInterval: 10000,
  });

  const { data: auditData, isLoading: isAuditLoading, refetch: refetchAudit, isFetching: isAuditFetching } = useQuery<{ items: AuditRecord[]; total: number }>({
    queryKey: ['auditLogs'],
    queryFn: () => apiRequest('/api/admin/audit?limit=200'),
    enabled: activeTab === 'audit',
    refetchInterval: 10000,
  });

  const filteredActivity = (activityData?.items || []).filter((item) => {
    if (!filterSearch.trim()) return true;
    const q = filterSearch.toLowerCase();
    return (
      (item.operation && item.operation.toLowerCase().includes(q)) ||
      (item.database_id && item.database_id.toLowerCase().includes(q)) ||
      (item.token_id && item.token_id.toLowerCase().includes(q)) ||
      (item.status && item.status.toLowerCase().includes(q))
    );
  });

  const filteredAudit = (auditData?.items || []).filter((item) => {
    if (!filterSearch.trim()) return true;
    const q = filterSearch.toLowerCase();
    return (
      (item.action && item.action.toLowerCase().includes(q)) ||
      (item.user && item.user.toLowerCase().includes(q)) ||
      (item.resource && item.resource.toLowerCase().includes(q)) ||
      (item.details && item.details.toLowerCase().includes(q)) ||
      (item.result && item.result.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 md:p-6 max-w-7xl mx-auto w-full space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border gap-3">
        <div>
          <h1 className="text-lg md:text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            System & Security Logs
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time API executions, SQL queries, and administrative audit trails.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex bg-muted p-0.5 rounded-md border border-border">
            <button
              onClick={() => setActiveTab('activity')}
              className={`px-2.5 sm:px-3 py-1 text-xs font-medium rounded transition-colors ${
                activeTab === 'activity' ? 'bg-card text-foreground shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              API & SQL Activity
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-2.5 sm:px-3 py-1 text-xs font-medium rounded transition-colors ${
                activeTab === 'audit' ? 'bg-card text-foreground shadow-sm font-semibold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Security & Audit
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
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <input
            type="text"
            placeholder={activeTab === 'activity' ? "Filter operations, tokens, databases..." : "Filter actions, users, resources..."}
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-card border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-foreground font-mono"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {activeTab === 'activity' ? `${filteredActivity.length} events` : `${filteredAudit.length} audit logs`}
        </div>
      </div>

      {/* Activity Table */}
      {activeTab === 'activity' ? (
        <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-muted/50 border-b border-border font-medium text-muted-foreground">
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
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">Loading activity stream...</td>
                  </tr>
                ) : filteredActivity.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">No matching API activity recorded.</td>
                  </tr>
                ) : (
                  filteredActivity.map((act) => (
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
          </div>
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-muted/50 border-b border-border font-medium text-muted-foreground">
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
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">Loading audit records...</td>
                  </tr>
                ) : filteredAudit.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">No audit records found.</td>
                  </tr>
                ) : (
                  filteredAudit.map((aud) => (
                    <tr key={aud.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3 text-[11px] text-muted-foreground whitespace-nowrap">{formatDate(aud.timestamp)}</td>
                      <td className="py-2 px-3 font-semibold text-foreground">{aud.user}</td>
                      <td className="py-2 px-3 text-blue-500 font-semibold">{aud.action}</td>
                      <td className="py-2 px-3 text-[11px] text-muted-foreground">{aud.resource}</td>
                      <td className="py-2 px-3 text-[11px] text-muted-foreground max-w-xs truncate" title={aud.details || ''}>
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
          </div>
        </div>
      )}
    </div>
  );
};
