import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Server,
  HardDrive,
  Cpu,
  Activity,
  Wifi,
  Plus,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ArrowRightLeft,
  X,
  Layers,
  Database,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { formatBytes, formatTimeAgo } from '../lib/utils.js';
import { useI18n } from '../hooks/useI18n.js';
import type { ClusterStatus, StorageNodeRecord, DatabaseRecord } from '../../../shared/index.js';

export const ClusterPage: React.FC = () => {
  const { t, language } = useI18n();
  const queryClient = useQueryClient();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [nodeName, setNodeName] = useState('');
  const [nodeUrl, setNodeUrl] = useState('');
  const [nodeSecret, setNodeSecret] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const [isMigrateModalOpen, setIsMigrateModalOpen] = useState(false);
  const [selectedDbId, setSelectedDbId] = useState<string>('');
  const [targetNodeId, setTargetNodeId] = useState<string>('');
  const [migrateMessage, setMigrateMessage] = useState<string | null>(null);
  const [migrateError, setMigrateError] = useState<string | null>(null);

  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null);

  // 1. Fetch Cluster Status and telemetry
  const { data: clusterStatus, isLoading, isFetching, refetch } = useQuery<ClusterStatus>({
    queryKey: ['clusterStatus'],
    queryFn: () => apiRequest('/api/admin/cluster/status'),
    refetchInterval: 8000,
  });

  // 2. Fetch Databases list for migration dropdown
  const { data: databases } = useQuery<DatabaseRecord[]>({
    queryKey: ['databases'],
    queryFn: () => apiRequest('/api/admin/databases'),
    enabled: isMigrateModalOpen,
  });

  // 3. Poll heartbeats mutation
  const pollMutation = useMutation({
    mutationFn: () => apiRequest('/api/admin/cluster/poll', { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.setQueryData(['clusterStatus'], data);
    },
  });

  // 4. Add Node mutation
  const addNodeMutation = useMutation({
    mutationFn: (payload: { name: string; baseUrl: string; authToken?: string }) =>
      apiRequest('/api/admin/cluster/nodes', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setIsAddModalOpen(false);
      setNodeName('');
      setNodeUrl('');
      setNodeSecret('');
      setAddError(null);
      queryClient.invalidateQueries({ queryKey: ['clusterStatus'] });
    },
    onError: (err: any) => {
      setAddError(err.message || 'Failed to connect to worker node');
    },
  });

  // 5. Delete Node mutation
  const deleteNodeMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/admin/cluster/nodes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDeletingNodeId(null);
      queryClient.invalidateQueries({ queryKey: ['clusterStatus'] });
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to delete worker node');
      setDeletingNodeId(null);
    },
  });

  // 6. Migrate Database mutation
  const migrateMutation = useMutation({
    mutationFn: (payload: { databaseId: string; targetNodeId: string }) =>
      apiRequest('/api/admin/cluster/migrate', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data: any) => {
      setMigrateMessage(data.message || 'Database migrated successfully');
      setMigrateError(null);
      queryClient.invalidateQueries({ queryKey: ['clusterStatus'] });
      queryClient.invalidateQueries({ queryKey: ['databases'] });
      setTimeout(() => {
        setIsMigrateModalOpen(false);
        setMigrateMessage(null);
      }, 2000);
    },
    onError: (err: any) => {
      setMigrateError(err.message || 'Database migration failed');
    },
  });

  const handleAddNodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeName.trim() || !nodeUrl.trim()) return;
    setAddError(null);
    addNodeMutation.mutate({
      name: nodeName.trim(),
      baseUrl: nodeUrl.trim(),
      authToken: nodeSecret.trim() || undefined,
    });
  };

  const handleMigrateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDbId || !targetNodeId) return;
    setMigrateError(null);
    setMigrateMessage(null);
    migrateMutation.mutate({
      databaseId: selectedDbId,
      targetNodeId,
    });
  };

  if (isLoading && !clusterStatus) {
    return (
      <div className="flex-1 flex items-center justify-center h-full min-h-[400px]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>{t('cluster.loading', 'Loading cluster telemetry...')}</span>
        </div>
      </div>
    );
  }

  const nodes = clusterStatus?.nodes || [];
  const spilloverActive = clusterStatus?.spilloverActive || false;
  const localNodeFull = clusterStatus?.localNodeFull || false;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Server className="w-6 h-6 text-blue-500" />
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t('cluster.title', 'Cluster & Storage Nodes')}
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t('cluster.subtitle', 'Multi-host Node.js telemetry monitoring & automated disk storage spillover')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => pollMutation.mutate()}
            disabled={pollMutation.isPending || isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg border border-border transition-colors disabled:opacity-50"
            title="Poll Heartbeats"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${pollMutation.isPending || isFetching ? 'animate-spin' : ''}`} />
            <span>{t('cluster.refresh', 'Check Heartbeats')}</span>
          </button>

          <button
            onClick={() => setIsMigrateModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg border border-border transition-colors"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-blue-500" />
            <span>{t('cluster.migrateDb', 'Migrate Database')}</span>
          </button>

          <button
            onClick={() => {
              setAddError(null);
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('cluster.addNode', 'Add Worker Node')}</span>
          </button>
        </div>
      </div>

      {/* Spillover Status Alert Banner */}
      {spilloverActive ? (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-amber-500 uppercase tracking-wider">
              {t('cluster.spilloverActiveTitle', 'Auto-Spillover Active')}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t(
                'cluster.spilloverActiveDesc',
                'Primary host disk capacity is over 85% full (or < 5GB free). All new databases are automatically provisioned onto healthy worker nodes with sufficient storage.'
              )}
            </p>
          </div>
        </div>
      ) : localNodeFull ? (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-red-500 uppercase tracking-wider">
              {t('cluster.storageExhaustedTitle', 'Storage Capacity Warning')}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t(
                'cluster.storageExhaustedDesc',
                'Primary host disk is nearing full capacity, and no healthy worker nodes with >= 5GB free space were found. Please attach additional Node.js storage nodes immediately.'
              )}
            </p>
          </div>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl border border-border bg-card/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-xs text-muted-foreground">
              <strong className="text-foreground font-semibold">
                {t('cluster.spilloverStandby', 'Spillover Standby')}:{' '}
              </strong>
              {t(
                'cluster.spilloverStandbyDesc',
                'Primary host disk storage is healthy. Auto-spillover activates when primary exceeds 85% capacity.'
              )}
            </span>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium shrink-0">
            {t('cluster.healthyStatus', 'OPTIMAL')}
          </span>
        </div>
      )}

      {/* Cluster KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">{t('cluster.nodesTotal', 'Total Nodes')}</span>
            <Server className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {clusterStatus?.healthyNodes} <span className="text-xs font-normal text-muted-foreground">/ {clusterStatus?.totalNodes}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {clusterStatus?.healthyNodes === clusterStatus?.totalNodes
              ? t('cluster.allNodesOnline', 'All nodes healthy')
              : `${(clusterStatus?.totalNodes || 0) - (clusterStatus?.healthyNodes || 0)} ${t('cluster.nodesOffline', 'offline / unreachable')}`}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">{t('cluster.clusterStorage', 'Cluster Storage')}</span>
            <HardDrive className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {formatBytes(clusterStatus?.freeClusterDiskBytes || 0)}
          </div>
          <div className="mt-2 space-y-1">
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  (clusterStatus?.usedClusterDiskPercent || 0) > 85
                    ? 'bg-red-500'
                    : (clusterStatus?.usedClusterDiskPercent || 0) > 70
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, clusterStatus?.usedClusterDiskPercent || 0)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{clusterStatus?.usedClusterDiskPercent}% used</span>
              <span>{formatBytes(clusterStatus?.totalClusterDiskBytes || 0)} total</span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">{t('cluster.hostedDbs', 'Databases Hosted')}</span>
            <Database className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {nodes.reduce((acc, n) => acc + (n.database_count || 0), 0)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {t('cluster.shardedAcrossNodes', 'Sharded across storage nodes')}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">{t('cluster.networkIO', 'Cluster Network')}</span>
            <Wifi className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {formatBytes(nodes.reduce((acc, n) => acc + (n.network_rate_bps || 0), 0))}/s
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {t('cluster.aggregateThroughput', 'Live cluster traffic')}
          </p>
        </div>
      </div>

      {/* Storage Nodes List / Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-500" />
            <span>{t('cluster.nodesTitle', 'Node Hardware & Telemetry')}</span>
          </h2>
          <span className="text-xs text-muted-foreground">
            {nodes.length} {t('cluster.nodesCount', 'active storage machines')}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {nodes.map((node) => {
            const isLocal = node.is_local;
            const isHealthy = node.status === 'healthy';
            const isUnhealthy = node.status === 'unhealthy';
            const isOffline = node.status === 'offline';

            return (
              <div
                key={node.id}
                className="p-5 rounded-xl bg-card border border-border hover:border-border/80 transition-shadow space-y-4 shadow-sm"
              >
                {/* Node Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-foreground truncate">{node.name}</h3>
                      {isLocal ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 font-semibold">
                          {t('cluster.primaryGateway', 'PRIMARY GATEWAY')}
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-500 border border-purple-500/20 font-medium">
                          {t('cluster.workerStorage', 'WORKER STORAGE')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                      <span>{node.base_url}</span>
                      <span>•</span>
                      <span>{formatTimeAgo(node.last_heartbeat_at, language)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium ${
                        isHealthy
                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                          : isUnhealthy
                          ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                          : 'bg-red-500/10 text-red-500 border border-red-500/20'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isHealthy ? 'bg-emerald-500' : isUnhealthy ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                      />
                      {node.status.toUpperCase()}
                    </span>

                    {!isLocal && (
                      <button
                        onClick={() => {
                          if (confirm(t('cluster.confirmDelete', `Are you sure you want to remove node "${node.name}"?`))) {
                            deleteNodeMutation.mutate(node.id);
                          }
                        }}
                        className="p-1 text-muted-foreground hover:text-red-500 rounded hover:bg-red-500/10 transition-colors"
                        title="Remove Worker Node"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Telemetry Resource Bars: CPU, RAM, Disk, Network */}
                <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
                  {/* CPU Usage */}
                  <div className="space-y-1.5 p-2.5 rounded-lg bg-muted/40 border border-border/50">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1.5 text-[11px]">
                        <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                        <span>CPU</span>
                      </span>
                      <span className="font-mono font-bold text-foreground">{node.cpu_percent}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          node.cpu_percent > 80 ? 'bg-red-500' : node.cpu_percent > 60 ? 'bg-amber-500' : 'bg-indigo-500'
                        }`}
                        style={{ width: `${Math.min(100, node.cpu_percent)}%` }}
                      />
                    </div>
                  </div>

                  {/* RAM Usage */}
                  <div className="space-y-1.5 p-2.5 rounded-lg bg-muted/40 border border-border/50">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1.5 text-[11px]">
                        <Activity className="w-3.5 h-3.5 text-amber-400" />
                        <span>RAM</span>
                      </span>
                      <span className="font-mono font-bold text-foreground">{node.ram_percent}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          node.ram_percent > 85 ? 'bg-red-500' : node.ram_percent > 70 ? 'bg-amber-500' : 'bg-amber-400'
                        }`}
                        style={{ width: `${Math.min(100, node.ram_percent)}%` }}
                      />
                    </div>
                  </div>

                  {/* Disk Storage Capacity */}
                  <div className="col-span-2 space-y-1.5 p-2.5 rounded-lg bg-muted/40 border border-border/50">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1.5 text-[11px]">
                        <HardDrive className="w-3.5 h-3.5 text-blue-400" />
                        <span>{t('cluster.diskStorage', 'Disk Storage')}</span>
                      </span>
                      <span className="font-mono font-semibold text-foreground">
                        {formatBytes(node.disk_total_bytes - node.disk_free_bytes)} / {formatBytes(node.disk_total_bytes)}{' '}
                        <span className="text-muted-foreground">({node.disk_used_percent}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          node.disk_used_percent > 85
                            ? 'bg-red-500'
                            : node.disk_used_percent > 70
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, node.disk_used_percent)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{formatBytes(node.disk_free_bytes)} {t('cluster.freeSpace', 'free space')}</span>
                      <span>{node.database_count} {t('cluster.databases', 'databases')}</span>
                    </div>
                  </div>
                </div>

                {/* Card Footer info */}
                <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Wifi className="w-3 h-3 text-muted-foreground" />
                    <span>I/O: {formatBytes(node.network_rate_bps)}/s</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedDbId('');
                        setTargetNodeId(node.id);
                        setIsMigrateModalOpen(true);
                      }}
                      className="text-blue-500 hover:text-blue-400 font-medium hover:underline"
                    >
                      {t('cluster.migrateTarget', 'Migrate DB to here')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Worker Node Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-blue-500" />
                <h3 className="text-sm font-bold text-foreground">
                  {t('cluster.modalAddTitle', 'Connect Node.js Storage Worker')}
                </h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddNodeSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  {t('cluster.nodeName', 'Machine Name / Host Identifier')}
                </label>
                <input
                  type="text"
                  required
                  value={nodeName}
                  onChange={(e) => setNodeName(e.target.value)}
                  placeholder="e.g. Node-Storage-02 (Frankfurt)"
                  className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  {t('cluster.nodeUrl', 'Base URL (Node.js API)')}
                </label>
                <input
                  type="url"
                  required
                  value={nodeUrl}
                  onChange={(e) => setNodeUrl(e.target.value)}
                  placeholder="http://192.168.1.100:3000"
                  className="w-full px-3 py-1.5 text-xs font-mono bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-[10px] text-muted-foreground">
                  {t('cluster.nodeUrlDesc', 'Reachable HTTP/HTTPS address where the worker VanillaDatabase instance is running.')}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  {t('cluster.clusterSecret', 'Cluster Secret / Auth Token')}
                </label>
                <input
                  type="password"
                  value={nodeSecret}
                  onChange={(e) => setNodeSecret(e.target.value)}
                  placeholder="Leave blank to use default VDB_CLUSTER_SECRET"
                  className="w-full px-3 py-1.5 text-xs font-mono bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-muted-foreground flex gap-2">
                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p>
                  {t(
                    'cluster.addNote',
                    'The gateway will ping /api/internal/node/stats on the target host to verify connectivity and validate telemetry metrics before registration.'
                  )}
                </p>
              </div>

              {addError && (
                <div className="p-2.5 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-500">
                  {addError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={addNodeMutation.isPending}
                  className="px-4 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {addNodeMutation.isPending && <RefreshCw className="w-3 h-3 animate-spin" />}
                  <span>{t('cluster.connectAndRegister', 'Connect & Register')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Migrate Database Modal */}
      {isMigrateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-blue-500" />
                <h3 className="text-sm font-bold text-foreground">
                  {t('cluster.migrateModalTitle', 'Zero-Downtime Database Migration')}
                </h3>
              </div>
              <button
                onClick={() => setIsMigrateModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleMigrateSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  {t('cluster.selectDb', 'Select Database to Move')}
                </label>
                <select
                  required
                  value={selectedDbId}
                  onChange={(e) => setSelectedDbId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- {t('cluster.chooseDatabase', 'Choose a Database')} --</option>
                  {(databases || []).map((db) => (
                    <option key={db.id} value={db.id}>
                      {db.name} ({db.id}) - Currently on {db.node_id || 'local'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  {t('cluster.selectTargetNode', 'Destination Storage Node')}
                </label>
                <select
                  required
                  value={targetNodeId}
                  onChange={(e) => setTargetNodeId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- {t('cluster.chooseTargetNode', 'Choose Target Node')} --</option>
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id} disabled={n.status !== 'healthy'}>
                      {n.name} ({n.id}) - {formatBytes(n.disk_free_bytes)} free [
                      {n.status.toUpperCase()}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-muted-foreground flex gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <p>
                  {t(
                    'cluster.migrateNote',
                    'Uses atomic SQLite VACUUM INTO snapshot streaming. Data integrity is cryptographically verified before removing the source copy.'
                  )}
                </p>
              </div>

              {migrateMessage && (
                <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-500">
                  {migrateMessage}
                </div>
              )}

              {migrateError && (
                <div className="p-2.5 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-500">
                  {migrateError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMigrateModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={migrateMutation.isPending || !selectedDbId || !targetNodeId}
                  className="px-4 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {migrateMutation.isPending && <RefreshCw className="w-3 h-3 animate-spin" />}
                  <span>{t('cluster.executeMigration', 'Start Safe Migration')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
