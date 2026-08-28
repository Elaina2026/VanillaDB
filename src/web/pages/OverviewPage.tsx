import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Server, Database, HardDrive, Clock, CheckCircle2, FileText, Cpu, RefreshCw, AlertCircle } from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { formatBytes, formatTimeAgo } from '../lib/utils.js';
import type { SystemStatus, DatabaseRecord } from '@shared/index.js';

export const OverviewPage: React.FC<{
  onSelectDatabase: (id: string) => void;
  onOpenCreateModal: () => void;
}> = ({ onSelectDatabase, onOpenCreateModal }) => {
  const { data: status, isLoading: isStatusLoading, refetch: refetchStatus } = useQuery<SystemStatus>({
    queryKey: ['systemStatus'],
    queryFn: () => apiRequest('/api/system/status'),
  });

  const { data: databases = [] } = useQuery<DatabaseRecord[]>({
    queryKey: ['databases'],
    queryFn: () => apiRequest('/api/admin/databases'),
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-bold tracking-tight">System Overview</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Host status, storage statistics, and active database nodes.
          </p>
        </div>
        <button
          onClick={() => refetchStatus()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border hover:bg-accent text-foreground rounded-md text-xs font-medium transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Databases</span>
            <Database className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold tracking-tight">{status?.databaseCount ?? databases.length}</div>
          <span className="text-[11px] text-muted-foreground block mt-1">Active SQLite instances</span>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">DB Storage</span>
            <HardDrive className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold tracking-tight">
            {formatBytes(status?.totalDatabaseStorageBytes ?? 0)}
          </div>
          <span className="text-[11px] text-muted-foreground block mt-1">Total SQLite + WAL files</span>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Backups Storage</span>
            <HardDrive className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold tracking-tight">
            {formatBytes(status?.backupStorageBytes ?? 0)}
          </div>
          <span className="text-[11px] text-muted-foreground block mt-1">Snapshot archives</span>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between text-muted-foreground mb-2">
            <span className="text-xs font-medium">Server Uptime</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold tracking-tight font-mono text-lg">
            {status ? `${Math.floor(status.uptimeSeconds / 3600)}h ${Math.floor((status.uptimeSeconds % 3600) / 60)}m` : '0h 0m'}
          </div>
          <span className="text-[11px] text-muted-foreground block mt-1">VanillaDatabase v{status?.version}</span>
        </div>
      </div>

      {/* System Specs & Environment */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-500" /> Environment Details
          </h2>
          <div className="space-y-2 text-xs divide-y divide-border">
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">VanillaDatabase Version</span>
              <span className="font-mono font-medium">v{status?.version || '1.0.0'}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">SQLite Engine</span>
              <span className="font-mono font-medium">{status?.sqliteVersion || 'SQLite 3.x'}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">Node.js Runtime</span>
              <span className="font-mono font-medium">{status?.nodeVersion || 'Node.js 24+'}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">Host Platform</span>
              <span className="font-mono font-medium">{status?.platform}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">Process Memory RSS</span>
              <span className="font-mono font-medium">{formatBytes(status?.memoryUsage.rss ?? 0)}</span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-500" /> Quick Connect Info
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              To connect your bots, services, and apps, create a database and generate an API Bearer token.
            </p>
            <div className="p-3 bg-muted/60 border border-border rounded-md font-mono text-[11px] space-y-1">
              <div className="text-muted-foreground"># Example REST Query Endpoint:</div>
              <div className="text-blue-500 truncate">POST /v1/databases/:databaseId/query</div>
            </div>
          </div>

          <div className="pt-4 flex items-center gap-3">
            <button
              onClick={onOpenCreateModal}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium transition-colors"
            >
              Create Database
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
