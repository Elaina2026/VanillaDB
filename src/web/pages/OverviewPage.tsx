import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Server,
  Database,
  HardDrive,
  Clock,
  CheckCircle2,
  FileText,
  Cpu,
  RefreshCw,
  AlertCircle,
  Activity,
  Shield,
  Folder,
  Radio,
  Zap,
  Layers,
  ArrowRight,
  TrendingUp,
  Percent,
  Terminal,
  Key
} from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { formatBytes, formatTimeAgo, formatDate } from '../lib/utils.js';
import type { SystemStatus, DatabaseRecord } from '@shared/index.js';

export const OverviewPage: React.FC<{
  onSelectDatabase: (id: string) => void;
  onOpenCreateModal: () => void;
}> = ({ onSelectDatabase, onOpenCreateModal }) => {
  const { data: status, isLoading: isStatusLoading, refetch: refetchStatus } = useQuery<SystemStatus>({
    queryKey: ['systemStatus'],
    queryFn: () => apiRequest('/api/system/status'),
    refetchInterval: 10000,
  });

  const { data: databases = [] } = useQuery<DatabaseRecord[]>({
    queryKey: ['databases'],
    queryFn: () => apiRequest('/api/admin/databases'),
  });

  const totalStorage =
    (status?.totalDatabaseStorageBytes ?? 0) +
    (status?.mediaStorageBytes ?? 0) +
    (status?.backupStorageBytes ?? 0);

  const ramUsedPercent =
    status?.osMemory.total && status.osMemory.total > 0
      ? Math.round((status.osMemory.used / status.osMemory.total) * 100)
      : 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 max-w-7xl mx-auto w-full space-y-6 select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">System Overview</h1>
            <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded font-semibold uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Healthy
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Host hardware telemetry, SQLite multi-tenant nodes, storage breakdown, and query throughput.
          </p>
        </div>
        <button
          onClick={() => refetchStatus()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border hover:bg-accent text-foreground rounded-md text-xs font-semibold shadow-sm transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Stats
        </button>
      </div>

      {/* Top 4 Primary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* 1. Databases */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-muted-foreground mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Databases</span>
            <Database className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground">
            {status?.databaseCount ?? databases.length}
          </div>
          <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
            <span className="text-emerald-500 font-semibold flex items-center">
              <CheckCircle2 className="w-3 h-3 mr-0.5" /> 100% WAL Mode
            </span>
          </div>
        </div>

        {/* 2. Queries 24h & QPS */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-muted-foreground mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider">24h Queries</span>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground">
            {(status?.totalQueries24h ?? 0).toLocaleString()}
          </div>
          <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
            <span>Avg Latency: <strong className="text-foreground">{status?.avgQueryDurationMs ?? 0}ms</strong></span>
          </div>
        </div>

        {/* 3. Total Combined Storage */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-muted-foreground mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Storage</span>
            <HardDrive className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground">
            {formatBytes(totalStorage)}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted-foreground">
            <span>DBs, Backups & Media</span>
          </div>
        </div>

        {/* 4. Server Uptime */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-muted-foreground mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider">Instance Uptime</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground font-mono">
            {status
              ? `${Math.floor(status.uptimeSeconds / 3600)}h ${Math.floor((status.uptimeSeconds % 3600) / 60)}m`
              : '0h 0m'}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-muted-foreground">
            <span>VanillaDB v{status?.version}</span>
          </div>
        </div>
      </div>

      {/* Storage Breakdown Section */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-blue-500" />
            Storage Allocation Breakdown
          </h2>
          <span className="text-xs font-mono font-semibold text-muted-foreground">
            Total Used: {formatBytes(totalStorage)}
          </span>
        </div>

        {/* Multi-segmented Progress Bar */}
        <div className="w-full h-3 bg-muted rounded-full overflow-hidden flex">
          <div
            style={{
              width: `${totalStorage > 0 ? ((status?.totalDatabaseStorageBytes ?? 0) / totalStorage) * 100 : 0}%`,
            }}
            className="bg-blue-500 transition-all duration-300"
            title="Database Tables Storage"
          />
          <div
            style={{
              width: `${totalStorage > 0 ? ((status?.mediaStorageBytes ?? 0) / totalStorage) * 100 : 0}%`,
            }}
            className="bg-emerald-500 transition-all duration-300"
            title="Media Storage"
          />
          <div
            style={{
              width: `${totalStorage > 0 ? ((status?.backupStorageBytes ?? 0) / totalStorage) * 100 : 0}%`,
            }}
            className="bg-purple-500 transition-all duration-300"
            title="Backup Snapshots"
          />
        </div>

        {/* Breakdown Legend Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div className="p-3 bg-muted/40 border border-border rounded-lg flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] text-muted-foreground block truncate">SQLite DB + WAL Files</span>
              <strong className="text-xs text-foreground font-mono">{formatBytes(status?.totalDatabaseStorageBytes ?? 0)}</strong>
            </div>
          </div>

          <div className="p-3 bg-muted/40 border border-border rounded-lg flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] text-muted-foreground block truncate">Media & Uploads (Range 206)</span>
              <strong className="text-xs text-foreground font-mono">{formatBytes(status?.mediaStorageBytes ?? 0)}</strong>
            </div>
          </div>

          <div className="p-3 bg-muted/40 border border-border rounded-lg flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-purple-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] text-muted-foreground block truncate">Snapshot Backups Archive</span>
              <strong className="text-xs text-foreground font-mono">{formatBytes(status?.backupStorageBytes ?? 0)}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Host Hardware Telemetry & Runtime Specs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Host Hardware & Resources */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-500" /> Host Hardware & System Resources
          </h2>

          <div className="space-y-3 text-xs">
            {/* CPU */}
            <div className="p-3 bg-muted/40 border border-border rounded-lg space-y-1.5">
              <div className="flex justify-between items-center text-muted-foreground">
                <span className="font-medium">Processor (CPU)</span>
                <span className="font-mono text-foreground font-semibold">{status?.cpuCount ?? 1} Cores</span>
              </div>
              <p className="text-[11px] font-mono text-foreground truncate">
                {status?.cpuModel || 'Host CPU Architecture'}
              </p>
            </div>

            {/* RAM Progress */}
            <div className="p-3 bg-muted/40 border border-border rounded-lg space-y-2">
              <div className="flex justify-between items-center text-muted-foreground">
                <span className="font-medium">OS Physical RAM</span>
                <span className="font-mono text-foreground font-semibold">
                  {formatBytes(status?.osMemory.used ?? 0)} / {formatBytes(status?.osMemory.total ?? 0)} ({ramUsedPercent}%)
                </span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  style={{ width: `${ramUsedPercent}%` }}
                  className={`h-full transition-all duration-300 ${
                    ramUsedPercent > 85 ? 'bg-red-500' : ramUsedPercent > 65 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                />
              </div>
            </div>

            {/* Memory breakdown items */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 bg-muted/40 border border-border rounded flex justify-between">
                <span className="text-muted-foreground">Node.js RSS:</span>
                <strong className="font-mono">{formatBytes(status?.memoryUsage.rss ?? 0)}</strong>
              </div>
              <div className="p-2.5 bg-muted/40 border border-border rounded flex justify-between">
                <span className="text-muted-foreground">Heap Used:</span>
                <strong className="font-mono">{formatBytes(status?.memoryUsage.heapUsed ?? 0)}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Runtime Stack & Engine Details */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Server className="w-4 h-4 text-emerald-500" /> Platform & Engine Specifications
          </h2>

          <div className="space-y-2 text-xs divide-y divide-border">
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">SQLite Core Engine</span>
              <span className="font-mono font-semibold text-foreground">
                {status?.sqliteVersion || 'SQLite 3.x'} (WAL Mode)
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">Node.js JavaScript Runtime</span>
              <span className="font-mono font-semibold text-foreground">{status?.nodeVersion || 'v22.x'}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">Host Operating System</span>
              <span className="font-mono font-medium text-foreground">{status?.platform}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">Active API Tokens</span>
              <span className="font-mono font-semibold text-blue-500">{status?.totalTokensCount ?? 0}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">Active Webhook Listeners</span>
              <span className="font-mono font-semibold text-purple-500">{status?.activeWebhooksCount ?? 0}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">24h Error Rate</span>
              <span className={`font-mono font-semibold ${(status?.errorRatePercent ?? 0) > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                {status?.errorRatePercent ?? 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Launch Databases Grid */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-500" />
              Tenant Databases Quick Access
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select a database to browse tables, execute SQL, upload media, or manage backups.
            </p>
          </div>

          <button
            onClick={onOpenCreateModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
          >
            Create Database
          </button>
        </div>

        {databases.length === 0 ? (
          <div className="p-8 border border-dashed border-border rounded-lg text-center space-y-2">
            <Database className="w-8 h-8 text-muted-foreground/40 mx-auto" />
            <p className="text-xs text-muted-foreground">No databases created yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {databases.slice(0, 6).map((db) => (
              <div
                key={db.id}
                onClick={() => onSelectDatabase(db.id)}
                className="p-3.5 border border-border bg-muted/20 hover:bg-accent/40 rounded-lg cursor-pointer transition-all hover:border-blue-500/50 group flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground group-hover:text-blue-500 transition-colors">
                      {db.name}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 bg-muted rounded text-muted-foreground">
                      {db.id}
                    </span>
                  </div>
                  {db.description && (
                    <p className="text-[11px] text-muted-foreground line-clamp-1 mt-1">
                      {db.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t border-border/60">
                  <span>Created {formatDate(db.created_at)}</span>
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
