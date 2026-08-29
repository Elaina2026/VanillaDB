import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Database,
  ArrowLeft,
  Table as TableIcon,
  Terminal,
  FileCode,
  Key,
  Archive,
  Shield,
  Sliders,
  Play,
  Copy,
  Check,
  Plus,
  Trash2,
  RefreshCw,
  Clock,
  Layers,
  HardDrive,
  RotateCcw,
  AlertTriangle,
  Edit2,
  PieChart,
  Activity,
  Cpu,
  CheckCircle2,
  XCircle,
  FileText,
  BarChart3,
  Server,
  ExternalLink,
  Folder,
  Image as ImageIcon,
  Film,
  UploadCloud,
  Download,
  Webhook as WebhookIcon,
  ToggleLeft,
  ToggleRight,
  Radio
} from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { formatBytes, formatTimeAgo, formatDate } from '../lib/utils.js';
import { CreateTableModal } from '../components/CreateTableModal.js';
import { RowModal } from '../components/RowModal.js';
import { ImportExportModal } from '../components/ImportExportModal.js';
import type {
  DatabaseOverviewStats,
  TableSchemaDetail,
  ApiTokenRecord,
  BackupRecord,
  FileRecord,
  WebhookRecord,
  SqlQueryResult,
  SqlWriteResult
} from '@shared/index.js';

export const DatabaseDetailPage: React.FC<{
  databaseId: string;
  initialTab?: 'overview' | 'tables' | 'editor' | 'schema' | 'storage' | 'realtime' | 'webhooks' | 'api' | 'tokens' | 'backups' | 'settings';
  onTabChange?: (tab: string) => void;
  onBack: () => void;
  onOpenCreateToken: (dbId: string) => void;
}> = ({ databaseId, initialTab = 'overview', onTabChange, onBack, onOpenCreateToken }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'tables' | 'editor' | 'schema' | 'storage' | 'realtime' | 'webhooks' | 'api' | 'tokens' | 'backups' | 'settings'>(initialTab);
  const queryClient = useQueryClient();

  const [isImportExportOpen, setIsImportExportOpen] = useState(false);

  useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  // Queries
  const { data: stats, isLoading: isStatsLoading, refetch: refetchStats } = useQuery<DatabaseOverviewStats>({
    queryKey: ['dbStats', databaseId],
    queryFn: () => apiRequest(`/api/admin/databases/${databaseId}`),
  });

  const { data: schema = [], isLoading: isSchemaLoading, refetch: refetchSchema } = useQuery<TableSchemaDetail[]>({
    queryKey: ['dbSchema', databaseId],
    queryFn: () => apiRequest(`/api/admin/databases/${databaseId}/schema`),
  });

  const { data: tokens = [], isLoading: isTokensLoading, refetch: refetchTokens } = useQuery<ApiTokenRecord[]>({
    queryKey: ['dbTokens', databaseId],
    queryFn: () => apiRequest(`/api/admin/databases/${databaseId}/tokens`),
    enabled: activeTab === 'tokens' || activeTab === 'overview',
  });

  const { data: backups = [], isLoading: isBackupsLoading, refetch: refetchBackups } = useQuery<BackupRecord[]>({
    queryKey: ['dbBackups', databaseId],
    queryFn: () => apiRequest(`/api/admin/databases/${databaseId}/backups`),
    enabled: activeTab === 'backups' || activeTab === 'overview',
  });

  const { data: files = [], isLoading: isFilesLoading, refetch: refetchFiles } = useQuery<FileRecord[]>({
    queryKey: ['dbFiles', databaseId],
    queryFn: () => apiRequest(`/api/admin/databases/${databaseId}/files`),
    enabled: activeTab === 'storage' || activeTab === 'overview',
  });

  const { data: webhooks = [], isLoading: isWebhooksLoading, refetch: refetchWebhooks } = useQuery<WebhookRecord[]>({
    queryKey: ['dbWebhooks', databaseId],
    queryFn: () => apiRequest(`/api/admin/databases/${databaseId}/webhooks`),
    enabled: activeTab === 'webhooks' || activeTab === 'overview',
  });

  // Webhook form states
  const [isCreateWebhookOpen, setIsCreateWebhookOpen] = useState(false);
  const [webhookName, setWebhookName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [webhookTable, setWebhookTable] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<string[]>(['insert', 'update', 'delete']);

  const createWebhookMutation = useMutation({
    mutationFn: (payload: any) =>
      apiRequest(`/api/admin/databases/${databaseId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setIsCreateWebhookOpen(false);
      setWebhookName('');
      setWebhookUrl('');
      setWebhookSecret('');
      setWebhookTable('');
      refetchWebhooks();
    },
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: (webhookId: string) =>
      apiRequest(`/api/admin/webhooks/${webhookId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      refetchWebhooks();
    },
  });

  // Realtime Live Event Stream state
  const [realtimeEvents, setRealtimeEvents] = useState<any[]>([]);
  const [isRealtimeListening, setIsRealtimeListening] = useState(false);
  const [realtimeTableFilter, setRealtimeTableFilter] = useState('');

  useEffect(() => {
    if (activeTab !== 'realtime' || !isRealtimeListening) return;

    let url = `/v1/databases/${databaseId}/realtime`;
    if (realtimeTableFilter) {
      url += `?table=${encodeURIComponent(realtimeTableFilter)}`;
    }

    const es = new EventSource(url);

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type !== 'ping') {
          setRealtimeEvents((prev) => [payload, ...prev.slice(0, 49)]);
        }
      } catch {}
    };

    ['insert', 'update', 'delete', 'schema'].forEach((t) => {
      es.addEventListener(t, (e: any) => {
        try {
          const payload = JSON.parse(e.data);
          setRealtimeEvents((prev) => [payload, ...prev.slice(0, 49)]);
        } catch {}
      });
    });

    return () => {
      es.close();
    };
  }, [activeTab, isRealtimeListening, realtimeTableFilter, databaseId]);

  const deleteFileMutation = useMutation({
    mutationFn: (fileId: string) => apiRequest(`/api/admin/files/${fileId}`, { method: 'DELETE' }),
    onSuccess: () => {
      refetchFiles();
      refetchStats();
      queryClient.invalidateQueries({ queryKey: ['dbStats', databaseId] });
    },
  });

  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFileForPreview, setSelectedFileForPreview] = useState<FileRecord | null>(null);

  const handleFileUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setIsUploading(true);
    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const formData = new FormData();
        formData.append('file', file);

        await fetch(`/api/admin/databases/${databaseId}/files`, {
          method: 'POST',
          body: formData,
        });
      }
      refetchFiles();
      refetchStats();
      queryClient.invalidateQueries({ queryKey: ['dbStats', databaseId] });
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  // Table browser states
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableLimit, setTableLimit] = useState<number>(50);
  const [tableOffset, setTableOffset] = useState<number>(0);
  const [selectedRowIds, setSelectedRowIds] = useState<any[]>([]);

  // Modals for Table tab
  const [isInsertModalOpen, setIsInsertModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, any> | null>(null);
  const [isRenameTableOpen, setIsRenameTableOpen] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [isCreateTableOpen, setIsCreateTableOpen] = useState(false);

  const { data: tableRows, isLoading: isRowsLoading, refetch: refetchRows } = useQuery<SqlQueryResult>({
    queryKey: ['tableRows', databaseId, selectedTable, tableLimit, tableOffset],
    queryFn: () => apiRequest(`/api/admin/databases/${databaseId}/tables/${selectedTable}/rows?limit=${tableLimit}&offset=${tableOffset}`),
    enabled: !!selectedTable && activeTab === 'tables',
  });

  // Current table schema detail
  const currentTableSchema = schema.find((s) => s.name === selectedTable);
  const primaryKeyCol = currentTableSchema?.columns.find((c) => c.pk === 1)?.name || tableRows?.columns?.[0] || 'id';

  // Table mutations
  const deleteBulkMutation = useMutation({
    mutationFn: (pkValues: any[]) =>
      apiRequest(`/api/admin/databases/${databaseId}/tables/${selectedTable}/delete-bulk`, {
        method: 'POST',
        body: JSON.stringify({ pkCol: primaryKeyCol, pkValues }),
      }),
    onSuccess: () => {
      setSelectedRowIds([]);
      refetchRows();
      refetchSchema();
      refetchStats();
    },
  });

  const renameTableMutation = useMutation({
    mutationFn: (newName: string) =>
      apiRequest(`/api/admin/databases/${databaseId}/tables/${selectedTable}/rename`, {
        method: 'POST',
        body: JSON.stringify({ newName }),
      }),
    onSuccess: (data) => {
      setIsRenameTableOpen(false);
      setSelectedTable(data.name);
      refetchSchema();
      refetchStats();
    },
  });

  const dropTableMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/admin/databases/${databaseId}/tables/${selectedTable}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      setSelectedTable(null);
      refetchSchema();
      refetchStats();
    },
  });

  const truncateTableMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/admin/databases/${databaseId}/tables/${selectedTable}/truncate`, {
        method: 'POST',
      }),
    onSuccess: () => {
      setSelectedRowIds([]);
      refetchRows();
      refetchSchema();
      refetchStats();
    },
  });

  const insertRowMutation = useMutation({
    mutationFn: (row: Record<string, any>) =>
      apiRequest(`/api/admin/databases/${databaseId}/tables/${selectedTable}/rows`, {
        method: 'POST',
        body: JSON.stringify(row),
      }),
    onSuccess: () => {
      setIsInsertModalOpen(false);
      refetchRows();
      refetchSchema();
      refetchStats();
    },
  });

  const updateRowMutation = useMutation({
    mutationFn: (payload: { pkCol: string; pkVal: any; values: Record<string, any> }) =>
      apiRequest(`/api/admin/databases/${databaseId}/tables/${selectedTable}/rows`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setEditingRow(null);
      refetchRows();
      refetchSchema();
      refetchStats();
    },
  });

  // Set default selected table when schema loads
  useEffect(() => {
    if (schema.length > 0) {
      const exists = schema.some((s) => s.name === selectedTable);
      if (!selectedTable || !exists) {
        const firstTable = schema.find((s) => s.type === 'table') || schema[0];
        setSelectedTable(firstTable.name);
      }
    } else {
      setSelectedTable(null);
    }
  }, [schema, selectedTable]);

  // SQL Editor state
  const [sqlText, setSqlText] = useState('CREATE TABLE IF NOT EXISTS users (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  username TEXT NOT NULL UNIQUE,\n  created_at INTEGER NOT NULL\n);');
  const [queryResult, setQueryResult] = useState<SqlQueryResult | SqlWriteResult | null>(null);
  const [explainResult, setExplainResult] = useState<{
    plan: Array<{ id: number; parent: number; notused: number; detail: string }>;
    analysis: {
      hasFullTableScan: boolean;
      scannedTables: string[];
      usesIndex: boolean;
      recommendation?: string;
    };
  } | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleExecuteSql = async () => {
    if (!sqlText.trim()) return;
    setIsExecuting(true);
    setQueryError(null);
    setExplainResult(null);
    try {
      const res = await apiRequest(`/api/admin/databases/${databaseId}/query`, {
        method: 'POST',
        body: JSON.stringify({ sql: sqlText }),
      });
      setQueryResult(res);
      refetchSchema();
      refetchStats();
    } catch (err: any) {
      setQueryError(err.message || 'Execution error');
      setQueryResult(null);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleExplainQuery = async () => {
    if (!sqlText.trim()) return;
    setIsExecuting(true);
    setQueryError(null);
    setQueryResult(null);
    try {
      const res = await apiRequest(`/api/admin/databases/${databaseId}/explain`, {
        method: 'POST',
        body: JSON.stringify({ sql: sqlText }),
      });
      setExplainResult(res);
    } catch (err: any) {
      setQueryError(err.message || 'Explain error');
      setExplainResult(null);
    } finally {
      setIsExecuting(false);
    }
  };

  // Backup actions
  const createBackupMutation = useMutation({
    mutationFn: () => apiRequest(`/api/admin/databases/${databaseId}/backups`, { method: 'POST' }),
    onSuccess: () => {
      refetchBackups();
      refetchStats();
    },
  });

  const restoreBackupMutation = useMutation({
    mutationFn: (backupId: string) =>
      apiRequest(`/api/admin/databases/${databaseId}/backups/${backupId}/restore`, { method: 'POST' }),
    onSuccess: () => {
      refetchStats();
      refetchSchema();
      if (selectedTable) refetchRows();
    },
  });

  const deleteBackupMutation = useMutation({
    mutationFn: (backupId: string) =>
      apiRequest(`/api/admin/backups/${backupId}`, { method: 'DELETE' }),
    onSuccess: () => refetchBackups(),
  });

  // Token actions
  const revokeTokenMutation = useMutation({
    mutationFn: (tokenId: string) => apiRequest(`/api/admin/tokens/${tokenId}/revoke`, { method: 'POST' }),
    onSuccess: () => refetchTokens(),
  });

  const deleteTokenMutation = useMutation({
    mutationFn: (tokenId: string) => apiRequest(`/api/admin/tokens/${tokenId}`, { method: 'DELETE' }),
    onSuccess: () => refetchTokens(),
  });

  // Maintenance action
  const [maintenanceMessage, setMaintenanceMessage] = useState<string | null>(null);
  const maintenanceMutation = useMutation({
    mutationFn: (action: string) =>
      apiRequest(`/api/admin/databases/${databaseId}/maintenance`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      }),
    onSuccess: (data, action) => {
      refetchStats();
      setMaintenanceMessage(`Maintenance "${action}" finished successfully.`);
      setTimeout(() => setMaintenanceMessage(null), 4000);
    },
  });

  // Clone database
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [cloneNewName, setCloneNewName] = useState('');
  const cloneDbMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest(`/api/admin/databases/${databaseId}/clone`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    onSuccess: (newDb) => {
      setIsCloneModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['databases'] });
      alert(`Database successfully cloned to "${newDb.name}" (${newDb.id})`);
    },
  });

  // Danger zone: delete database
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const deleteDbMutation = useMutation({
    mutationFn: () => apiRequest(`/api/admin/databases/${databaseId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databases'] });
      onBack();
    },
  });

  // Copy helper
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const currentDbName = stats?.database.name || 'Database';

  // Calculate statistics metrics
  const totalPages = stats?.pageCount || 0;
  const freePages = stats?.freelistCount || 0;
  const activePages = Math.max(0, totalPages - freePages);
  const fragmentationPercent = totalPages > 0 ? Math.round((freePages / totalPages) * 100) : 0;
  const totalDbStorage = (stats?.fileSizeBytes || 0) + (stats?.walSizeBytes || 0);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Top Header Information */}
      <div className="h-14 border-b border-border bg-card px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-accent rounded-md text-muted-foreground hover:text-foreground transition-colors md:hidden"
            title="Back to databases"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-foreground">{currentDbName}</h1>
              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-muted text-muted-foreground rounded border border-border">
                {databaseId}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground truncate max-w-md">
              {stats?.database.description || 'Native SQLite Engine (WAL Mode)'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded font-medium">
            WAL Active
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {formatBytes(totalDbStorage)}
          </span>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto bg-background p-6">
        {/* OVERVIEW & FULL STATISTICAL DASHBOARD */}
        {activeTab === 'overview' && (
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between text-muted-foreground mb-1">
                  <span className="text-xs font-medium">Total Storage</span>
                  <HardDrive className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-2xl font-bold text-foreground">{formatBytes(totalDbStorage)}</div>
                <div className="text-[10px] text-muted-foreground flex justify-between mt-1">
                  <span>Main: {formatBytes(stats?.fileSizeBytes ?? 0)}</span>
                  <span>WAL: {formatBytes(stats?.walSizeBytes ?? 0)}</span>
                </div>
              </div>

              <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between text-muted-foreground mb-1">
                  <span className="text-xs font-medium">Schema Entities</span>
                  <Layers className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-2xl font-bold text-foreground">{stats?.tableCount ?? 0} Tables</div>
                <div className="text-[10px] text-muted-foreground flex justify-between mt-1">
                  <span>{stats?.indexCount ?? 0} Indexes</span>
                  <span>{stats?.viewCount ?? 0} Views</span>
                </div>
              </div>

              <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between text-muted-foreground mb-1">
                  <span className="text-xs font-medium">B-Tree Page Utilization</span>
                  <PieChart className="w-4 h-4 text-purple-500" />
                </div>
                <div className="text-2xl font-bold text-foreground font-mono">
                  {totalPages > 0 ? `${100 - fragmentationPercent}%` : '100%'}
                </div>
                <div className="text-[10px] text-muted-foreground flex justify-between mt-1">
                  <span>{activePages} Active pages</span>
                  <span>{freePages} Free pages</span>
                </div>
              </div>

              <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between text-muted-foreground mb-1">
                  <span className="text-xs font-medium">API Tokens & Access</span>
                  <Shield className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-2xl font-bold text-foreground">{stats?.tokenCount ?? tokens.length} Active</div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  Zero Rate Limiting Enabled
                </div>
              </div>
            </div>

            {/* B-Tree & Storage Visual Breakdown */}
            <div className="bg-card border border-border rounded-lg p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground">SQLite Storage & B-Tree Page Allocation</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Physical disk allocation per 4096-byte database page.
                  </p>
                </div>
                <span className="text-xs font-mono px-2 py-1 bg-muted rounded border border-border text-foreground">
                  Page Size: {stats?.pageSize || 4096} bytes
                </span>
              </div>

              {/* Visual Storage Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Disk Storage Breakdown</span>
                  <span className="font-mono">{formatBytes(totalDbStorage)} total</span>
                </div>
                <div className="h-4 w-full bg-muted rounded-full overflow-hidden flex border border-border">
                  <div
                    style={{ width: `${totalDbStorage > 0 ? ((stats?.fileSizeBytes || 0) / totalDbStorage) * 100 : 100}%` }}
                    className="bg-blue-600 h-full"
                    title={`Main DB File: ${formatBytes(stats?.fileSizeBytes || 0)}`}
                  />
                  <div
                    style={{ width: `${totalDbStorage > 0 ? ((stats?.walSizeBytes || 0) / totalDbStorage) * 100 : 0}%` }}
                    className="bg-emerald-500 h-full"
                    title={`Write-Ahead Log (WAL): ${formatBytes(stats?.walSizeBytes || 0)}`}
                  />
                </div>
                <div className="flex items-center gap-6 text-[11px] text-muted-foreground pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    <span>Main Database File ({formatBytes(stats?.fileSizeBytes || 0)})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span>Write-Ahead Log ({formatBytes(stats?.walSizeBytes || 0)})</span>
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-muted-foreground">Fragmentation:</span>
                    <span className={`font-semibold font-mono ${fragmentationPercent > 20 ? 'text-amber-500' : 'text-emerald-500'}`}>
                      {fragmentationPercent}% free list
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Diagnostics & Pragmas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pragma Parameters */}
              <div className="bg-card border border-border rounded-lg p-5 shadow-sm space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2 flex items-center justify-between">
                  <span>SQLite Engine Parameters</span>
                  <Cpu className="w-4 h-4 text-blue-500" />
                </h3>
                <div className="divide-y divide-border text-xs">
                  <div className="py-2 flex justify-between items-center">
                    <span className="text-muted-foreground">SQLite Engine Version</span>
                    <span className="font-mono font-medium text-foreground">{stats?.sqliteVersion}</span>
                  </div>
                  <div className="py-2 flex justify-between items-center">
                    <span className="text-muted-foreground">Journal Mode</span>
                    <span className="font-mono uppercase font-semibold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                      {stats?.journalMode || 'WAL'}
                    </span>
                  </div>
                  <div className="py-2 flex justify-between items-center">
                    <span className="text-muted-foreground">Synchronous Safety Level</span>
                    <span className="font-mono uppercase font-medium text-foreground">{stats?.synchronous || 'NORMAL'}</span>
                  </div>
                  <div className="py-2 flex justify-between items-center">
                    <span className="text-muted-foreground">Lock / Busy Timeout</span>
                    <span className="font-mono text-foreground">{stats?.busyTimeout || 5000} ms</span>
                  </div>
                  <div className="py-2 flex justify-between items-center">
                    <span className="text-muted-foreground">Page Count & Freelist</span>
                    <span className="font-mono text-foreground">
                      {stats?.pageCount || 0} pages ({stats?.freelistCount || 0} free)
                    </span>
                  </div>
                  <div className="py-2 flex justify-between items-center">
                    <span className="text-muted-foreground">Foreign Key Constraints</span>
                    <span className="font-mono font-semibold text-emerald-500">ENABLED (ON)</span>
                  </div>
                </div>
              </div>

              {/* Maintenance Tools */}
              <div className="bg-card border border-border rounded-lg p-5 shadow-sm space-y-3 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2 flex items-center justify-between">
                    <span>Engine Maintenance & Optimization</span>
                    <Activity className="w-4 h-4 text-emerald-500" />
                  </h3>
                  <p className="text-xs text-muted-foreground my-2">
                    Execute internal SQLite maintenance routines, WAL sync flushes, and integrity checks.
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      onClick={() => maintenanceMutation.mutate('quick_check')}
                      disabled={maintenanceMutation.isPending}
                      className="px-3 py-2 bg-muted hover:bg-accent text-xs font-medium rounded-md border border-border transition-colors text-foreground text-left"
                    >
                      <div className="font-semibold">Quick Check</div>
                      <div className="text-[10px] text-muted-foreground">Verify B-Tree structure</div>
                    </button>
                    <button
                      onClick={() => maintenanceMutation.mutate('integrity_check')}
                      disabled={maintenanceMutation.isPending}
                      className="px-3 py-2 bg-muted hover:bg-accent text-xs font-medium rounded-md border border-border transition-colors text-foreground text-left"
                    >
                      <div className="font-semibold">Integrity Check</div>
                      <div className="text-[10px] text-muted-foreground">Full DB validation</div>
                    </button>
                    <button
                      onClick={() => maintenanceMutation.mutate('wal_checkpoint')}
                      disabled={maintenanceMutation.isPending}
                      className="px-3 py-2 bg-muted hover:bg-accent text-xs font-medium rounded-md border border-border transition-colors text-foreground text-left"
                    >
                      <div className="font-semibold">Checkpoint WAL</div>
                      <div className="text-[10px] text-muted-foreground">Flush WAL to main DB</div>
                    </button>
                    <button
                      onClick={() => maintenanceMutation.mutate('optimize')}
                      disabled={maintenanceMutation.isPending}
                      className="px-3 py-2 bg-muted hover:bg-accent text-xs font-medium rounded-md border border-border transition-colors text-foreground text-left"
                    >
                      <div className="font-semibold">Optimize</div>
                      <div className="text-[10px] text-muted-foreground">Run query optimizer</div>
                    </button>
                  </div>
                </div>

                {maintenanceMessage && (
                  <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs rounded font-mono flex items-center gap-2 mt-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{maintenanceMessage}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Table Storage & Row Distribution */}
            <div className="bg-card border border-border rounded-lg p-5 shadow-sm space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                Table Row & Index Distribution
              </h3>
              {schema.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No tables created in this database yet.
                </div>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                      <tr>
                        <th className="py-2 px-3">Table Name</th>
                        <th className="py-2 px-3">Type</th>
                        <th className="py-2 px-3">Columns</th>
                        <th className="py-2 px-3">Indexes</th>
                        <th className="py-2 px-3">Foreign Keys</th>
                        <th className="py-2 px-3 text-right">Row Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {schema.map((t) => (
                        <tr key={t.name} className="hover:bg-muted/20">
                          <td className="py-2 px-3 font-semibold text-foreground flex items-center gap-1.5">
                            <TableIcon className="w-3.5 h-3.5 text-blue-500" />
                            {t.name}
                          </td>
                          <td className="py-2 px-3 text-muted-foreground uppercase text-[10px]">{t.type}</td>
                          <td className="py-2 px-3 text-muted-foreground">{t.columns.length} cols</td>
                          <td className="py-2 px-3 text-muted-foreground">{t.indexes?.length || 0} idx</td>
                          <td className="py-2 px-3 text-muted-foreground">{t.foreignKeys?.length || 0} fks</td>
                          <td className="py-2 px-3 text-right font-bold text-foreground">
                            {t.rowCountEstimate !== undefined ? t.rowCountEstimate.toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TABLES BROWSER TAB */}
        {activeTab === 'tables' && (
          <div className="h-full flex gap-4 overflow-hidden -m-6 p-6">
            {/* Table Sidebar */}
            <div className="w-56 bg-card border border-border rounded-lg flex flex-col shrink-0 overflow-hidden shadow-sm">
              <div className="p-3 border-b border-border font-semibold text-xs text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                <span>Tables ({schema.filter((s) => s.type === 'table').length})</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setIsCreateTableOpen(true)}
                    className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
                    title="Create Table"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => refetchSchema()} className="p-1 hover:bg-accent rounded transition-colors" title="Refresh Schema">
                    <RefreshCw className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {schema
                  .filter((s) => s.type === 'table')
                  .map((t) => (
                    <button
                      key={t.name}
                      onClick={() => {
                        setSelectedTable(t.name);
                        setTableOffset(0);
                        setSelectedRowIds([]);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded text-xs flex items-center justify-between font-mono transition-colors ${
                        selectedTable === t.name
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'hover:bg-accent text-foreground'
                      }`}
                    >
                      <span className="truncate">{t.name}</span>
                      <span className="text-[10px] opacity-70">
                        {t.rowCountEstimate !== undefined ? t.rowCountEstimate : ''}
                      </span>
                    </button>
                  ))}
              </div>
            </div>

            {/* Table Rows Viewer */}
            <div className="flex-1 bg-card border border-border rounded-lg flex flex-col overflow-hidden shadow-sm">
              {/* Table Toolbar */}
              <div className="min-h-12 border-b border-border px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0 bg-muted/20">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-foreground">{selectedTable}</span>
                  <span className="text-xs text-muted-foreground">
                    {tableRows?.rowCount ?? 0} rows displayed
                  </span>
                </div>

                {/* Table Actions Toolbar */}
                {selectedTable && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Bulk Delete Button */}
                    {selectedRowIds.length > 0 && (
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${selectedRowIds.length} selected row(s)?`)) {
                            deleteBulkMutation.mutate(selectedRowIds);
                          }
                        }}
                        disabled={deleteBulkMutation.isPending}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold shadow-sm transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete ({selectedRowIds.length})
                      </button>
                    )}

                    {/* Add Row Button */}
                    <button
                      onClick={() => setIsInsertModalOpen(true)}
                      className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Insert Row
                    </button>

                    {/* Rename Table */}
                    <button
                      onClick={() => {
                        setNewTableName(selectedTable);
                        setIsRenameTableOpen(true);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 bg-background border border-border hover:bg-accent rounded text-xs font-medium transition-colors text-foreground"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                      Rename
                    </button>

                    {/* Truncate Table */}
                    <button
                      onClick={() => {
                        if (confirm(`Truncate table "${selectedTable}"? All data will be deleted.`)) {
                          truncateTableMutation.mutate();
                        }
                      }}
                      disabled={truncateTableMutation.isPending}
                      className="px-2.5 py-1 bg-background border border-border hover:bg-accent rounded text-xs font-medium transition-colors text-muted-foreground hover:text-red-500"
                    >
                      Truncate
                    </button>

                    {/* Drop Table */}
                    <button
                      onClick={() => {
                        if (confirm(`Are you sure you want to drop table "${selectedTable}"?`)) {
                          dropTableMutation.mutate();
                        }
                      }}
                      disabled={dropTableMutation.isPending}
                      className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                      title="Drop Table"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Pagination limit */}
                    <select
                      value={tableLimit}
                      onChange={(e) => setTableLimit(parseInt(e.target.value, 10))}
                      className="px-2 py-1 text-xs bg-background border border-border rounded text-foreground"
                    >
                      <option value={25}>25 / page</option>
                      <option value={50}>50 / page</option>
                      <option value={100}>100 / page</option>
                      <option value={250}>250 / page</option>
                    </select>

                    <button
                      onClick={() => refetchRows()}
                      className="p-1.5 bg-background border border-border hover:bg-accent rounded text-muted-foreground transition-colors"
                      title="Refresh"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Data Table with Checkboxes & Action buttons */}
              <div className="flex-1 overflow-auto bg-[#09090b]">
                {!selectedTable ? (
                  <div className="p-8 text-center text-xs text-muted-foreground flex flex-col items-center justify-center h-full gap-2">
                    <TableIcon className="w-8 h-8 opacity-40" />
                    <div>No tables created yet.</div>
                    <button
                      onClick={() => setIsCreateTableOpen(true)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium mt-1"
                    >
                      Create First Table
                    </button>
                  </div>
                ) : isRowsLoading ? (
                  <div className="p-8 text-center text-xs text-muted-foreground">Loading rows...</div>
                ) : !tableRows?.rows?.length ? (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    Table is empty. Use "Insert Row" or SQL Editor to add data.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse font-mono bg-[#09090b] text-[#f4f4f5]">
                    <thead className="bg-[#18181b] border-b border-[#27272a] sticky top-0 z-10 text-[#a1a1aa]">
                      <tr>
                        {/* Select All Checkbox */}
                        <th className="w-10 py-2.5 px-3 border-r border-[#27272a] text-center">
                          <input
                            type="checkbox"
                            checked={
                              tableRows.rows.length > 0 &&
                              tableRows.rows.every((r) => selectedRowIds.includes(r[primaryKeyCol]))
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRowIds(tableRows.rows.map((r) => r[primaryKeyCol]));
                              } else {
                                setSelectedRowIds([]);
                              }
                            }}
                            className="rounded border-[#3f3f46] text-blue-600 bg-[#27272a]"
                          />
                        </th>
                        {/* Row Action Column */}
                        <th className="w-16 py-2.5 px-2 border-r border-[#27272a] text-center">Actions</th>
                        {tableRows.columns.map((col) => (
                          <th key={col} className="py-2.5 px-3 font-semibold text-[#60a5fa] border-r border-[#27272a] last:border-r-0">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#27272a]">
                      {tableRows.rows.map((row, idx) => {
                        const pkVal = row[primaryKeyCol];
                        const isSelected = selectedRowIds.includes(pkVal);
                        return (
                          <tr key={idx} className={`hover:bg-[#1e1e24] ${isSelected ? 'bg-blue-950/40' : ''}`}>
                            {/* Checkbox */}
                            <td className="py-2 px-3 border-r border-[#27272a] text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedRowIds([...selectedRowIds, pkVal]);
                                  } else {
                                    setSelectedRowIds(selectedRowIds.filter((id) => id !== pkVal));
                                  }
                                }}
                                className="rounded border-[#3f3f46] text-blue-600 bg-[#27272a]"
                              />
                            </td>
                            {/* Row Action Buttons */}
                            <td className="py-1 px-2 border-r border-[#27272a] text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => setEditingRow(row)}
                                  className="p-1 hover:bg-[#27272a] rounded text-[#a1a1aa] hover:text-[#ffffff] transition-colors"
                                  title="Edit Row"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Delete this row?')) {
                                      deleteBulkMutation.mutate([pkVal]);
                                    }
                                  }}
                                  className="p-1 hover:bg-red-500/20 rounded text-[#a1a1aa] hover:text-red-400 transition-colors"
                                  title="Delete Row"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                            {tableRows.columns.map((col) => {
                              const val = row[col];
                              return (
                                <td
                                  key={col}
                                  className="py-2 px-3 border-r border-[#27272a] last:border-r-0 truncate max-w-xs text-[#f4f4f5]"
                                  title={typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                >
                                  {val === null ? (
                                    <span className="text-[#71717a] italic">NULL</span>
                                  ) : typeof val === 'object' ? (
                                    <span className="text-[#c084fc] font-semibold">{JSON.stringify(val)}</span>
                                  ) : (
                                    String(val)
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Table Pagination */}
              <div className="h-10 border-t border-border px-4 flex items-center justify-between text-xs text-muted-foreground shrink-0 bg-muted/10">
                <span>Offset: {tableOffset}</span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={tableOffset === 0}
                    onClick={() => {
                      setTableOffset(Math.max(0, tableOffset - tableLimit));
                      setSelectedRowIds([]);
                    }}
                    className="px-2 py-1 bg-background border border-border hover:bg-accent disabled:opacity-50 rounded"
                  >
                    Previous
                  </button>
                  <button
                    disabled={!tableRows?.rows || tableRows.rows.length < tableLimit}
                    onClick={() => {
                      setTableOffset(tableOffset + tableLimit);
                      setSelectedRowIds([]);
                    }}
                    className="px-2 py-1 bg-background border border-border hover:bg-accent disabled:opacity-50 rounded"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* HIGH-CONTRAST PURE DARK SQL EDITOR TAB */}
        {activeTab === 'editor' && (
          <div className="h-full flex flex-col space-y-3 -m-6 p-6 overflow-hidden">
            {/* Editor Console Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExecuteSql}
                  disabled={isExecuting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Run (Ctrl+Enter)
                </button>
                <button
                  onClick={handleExplainQuery}
                  disabled={isExecuting}
                  className="px-3 py-1.5 bg-card border border-border hover:bg-accent text-foreground rounded-md text-xs font-medium transition-colors"
                >
                  Explain Query
                </button>
                <button
                  onClick={() => setSqlText('')}
                  className="px-3 py-1.5 bg-card border border-border hover:bg-accent text-muted-foreground rounded-md text-xs font-medium transition-colors"
                >
                  Clear
                </button>
              </div>

              {queryResult && (
                <div className="text-xs text-muted-foreground font-mono">
                  Executed in {queryResult.durationMs} ms
                  {'rowCount' in queryResult ? ` • ${queryResult.rowCount} rows` : ` • ${queryResult.changes} changes`}
                </div>
              )}
            </div>

            {/* SQL Editor Area: Pure Dark High-Contrast */}
            <div className="h-56 border border-[#27272a] rounded-lg overflow-hidden shrink-0 relative bg-[#09090b] shadow-inner">
              <textarea
                value={sqlText}
                onChange={(e) => setSqlText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleExecuteSql();
                  }
                }}
                placeholder="-- Write SQLite queries here (e.g. SELECT * FROM users;)&#10;-- Press Ctrl+Enter to execute"
                className="w-full h-full p-3 font-mono text-xs text-[#ffffff] bg-[#09090b] resize-none focus:outline-none leading-relaxed selection:bg-blue-700"
                spellCheck={false}
              />
            </div>

            {/* Results Viewer: Pure Dark High-Contrast Background & Crisp White Text */}
            <div className="flex-1 bg-[#09090b] border border-[#27272a] rounded-lg overflow-hidden flex flex-col shadow-sm">
              <div className="h-8 border-b border-[#27272a] px-3 flex items-center justify-between bg-[#18181b] text-xs font-semibold text-[#a1a1aa]">
                <span className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-blue-400" />
                  Query Results
                </span>
                {queryResult && 'rows' in queryResult && (
                  <span className="font-mono text-[11px] text-[#71717a]">
                    {queryResult.rows.length} rows returned
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-auto p-2 bg-[#09090b]">
                {queryError ? (
                  <div className="p-3 bg-red-950/50 border border-red-800/50 text-red-300 text-xs font-mono rounded flex items-start gap-2">
                    <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-bold text-red-200">SQLite Execution Error</div>
                      <div className="mt-0.5">{queryError}</div>
                    </div>
                  </div>
                ) : explainResult ? (
                  <div className="p-4 space-y-4 font-mono text-xs">
                    {/* Profiler Analysis Header */}
                    <div
                      className={`p-3 rounded-lg border ${
                        explainResult.analysis.hasFullTableScan
                          ? 'bg-amber-950/40 border-amber-800/50 text-amber-300'
                          : 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300'
                      }`}
                    >
                      <div className="font-bold flex items-center gap-2 text-sm mb-1">
                        {explainResult.analysis.hasFullTableScan ? (
                          <>
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                            <span>Slow Query Warning: Full Table Scan Detected</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>Optimized Execution Plan</span>
                          </>
                        )}
                      </div>
                      <p className="text-[11px] opacity-90">{explainResult.analysis.recommendation}</p>
                    </div>

                    {/* Step-by-step query execution tree */}
                    <div className="border border-[#27272a] rounded-lg overflow-hidden">
                      <div className="bg-[#18181b] px-3 py-1.5 border-b border-[#27272a] text-[#a1a1aa] font-semibold text-[11px]">
                        EXPLAIN QUERY PLAN Details
                      </div>
                      <div className="divide-y divide-[#27272a] bg-[#09090b]">
                        {explainResult.plan.map((step, idx) => (
                          <div key={idx} className="p-2.5 flex items-center gap-3 text-xs">
                            <span className="px-1.5 py-0.5 bg-[#27272a] text-[#a1a1aa] rounded text-[10px]">
                              Step {step.id}
                            </span>
                            <span
                              className={`font-mono ${
                                step.detail.includes('SCAN')
                                  ? 'text-amber-400 font-semibold'
                                  : step.detail.includes('INDEX')
                                  ? 'text-emerald-400'
                                  : 'text-zinc-200'
                              }`}
                            >
                              {step.detail}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : !queryResult ? (
                  <div className="p-8 text-center text-xs text-[#71717a] font-mono flex flex-col items-center justify-center h-full gap-2">
                    <Terminal className="w-8 h-8 opacity-30" />
                    <span>Press "Run" or press Ctrl+Enter to execute SQL statement.</span>
                  </div>
                ) : 'rows' in queryResult ? (
                  <table className="w-full text-left text-xs border-collapse font-mono bg-[#09090b] text-[#f4f4f5]">
                    <thead className="bg-[#18181b] border-b border-[#27272a] sticky top-0 z-10 text-[#a1a1aa]">
                      <tr>
                        {queryResult.columns.map((col) => (
                          <th key={col} className="py-2 px-3 font-semibold text-[#60a5fa] border-r border-[#27272a] last:border-r-0">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#27272a]">
                      {queryResult.rows.length === 0 ? (
                        <tr>
                          <td colSpan={queryResult.columns.length} className="py-6 text-center text-[#71717a]">
                            (0 rows returned)
                          </td>
                        </tr>
                      ) : (
                        queryResult.rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-[#18181b] transition-colors">
                            {queryResult.columns.map((col) => {
                              const val = row[col];
                              return (
                                <td key={col} className="py-1.5 px-3 border-r border-[#27272a] last:border-r-0 truncate max-w-sm text-[#f4f4f5]">
                                  {val === null ? (
                                    <span className="text-[#71717a] italic">NULL</span>
                                  ) : typeof val === 'object' ? (
                                    <span className="text-[#c084fc] font-semibold">{JSON.stringify(val)}</span>
                                  ) : (
                                    String(val)
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-4 text-xs font-mono text-emerald-400 space-y-1 bg-emerald-950/20 border border-emerald-800/40 rounded">
                    <div className="font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Query executed successfully.
                    </div>
                    <div className="text-emerald-300">Changes: {queryResult.changes}</div>
                    <div className="text-emerald-300">Last Insert Row ID: {String(queryResult.lastInsertRowid)}</div>
                    <div className="text-emerald-300">Duration: {queryResult.durationMs} ms</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STORAGE & MEDIA TAB */}
        {activeTab === 'storage' && (
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Header & Drag and Drop Upload */}
            <div className="flex items-center justify-between pb-2">
              <div>
                <h3 className="text-sm font-bold text-foreground">Media & File Storage</h3>
                <p className="text-xs text-muted-foreground">Database-scoped binary media files with range-streaming support.</p>
              </div>
            </div>

            {/* Drag & Drop Upload Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                handleFileUpload(e.dataTransfer.files);
              }}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                isDragOver ? 'border-blue-500 bg-blue-500/10' : 'border-border hover:border-blue-500/50 bg-card'
              }`}
            >
              <input
                type="file"
                multiple
                id="file-upload-input"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files)}
              />
              <label htmlFor="file-upload-input" className="cursor-pointer flex flex-col items-center justify-center gap-2">
                <div className="p-3 bg-muted rounded-full text-muted-foreground">
                  <UploadCloud className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-foreground">Click to upload files</span>
                  <span className="text-xs text-muted-foreground"> or drag and drop</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Images, Videos, Audio, Documents (Max 1GB per file)</p>
              </label>
              {isUploading && (
                <div className="mt-3 text-xs text-blue-500 font-medium flex items-center justify-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Uploading file(s)...
                </div>
              )}
            </div>

            {/* Files Grid / List */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Stored Files ({files.length})
              </h4>

              {isFilesLoading ? (
                <div className="p-8 text-center text-xs text-muted-foreground">Loading files...</div>
              ) : files.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg bg-card/50">
                  No files uploaded yet. Drag and drop files above to store media.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {files.map((file) => {
                    const viewUrl = `${window.location.origin}/v1/files/${file.id}/view`;
                    const publicStorageUrl = `${window.location.origin}/v1/databases/${databaseId}/storage/${file.filename}`;
                    const isImage = file.mime_type.startsWith('image/');
                    const isVideo = file.mime_type.startsWith('video/');
                    const isAudio = file.mime_type.startsWith('audio/');

                    return (
                      <div key={file.id} className="bg-card border border-border rounded-lg overflow-hidden flex flex-col justify-between shadow-sm">
                        {/* Media Preview Box */}
                        <div className="h-40 bg-muted/40 flex items-center justify-center relative overflow-hidden border-b border-border">
                          {isImage ? (
                            <img
                              src={viewUrl}
                              alt={file.original_name}
                              className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                              onClick={() => setSelectedFileForPreview(file)}
                            />
                          ) : isVideo ? (
                            <video
                              src={viewUrl}
                              controls
                              preload="metadata"
                              className="w-full h-full object-contain bg-black"
                            />
                          ) : isAudio ? (
                            <div className="w-full p-3 flex flex-col items-center justify-center gap-2">
                              <Film className="w-8 h-8 text-purple-500" />
                              <audio src={viewUrl} controls className="w-full h-8" />
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center text-muted-foreground gap-1">
                              <FileText className="w-10 h-10 opacity-50" />
                              <span className="text-[10px] uppercase font-mono">{file.mime_type.split('/')[1] || 'BINARY'}</span>
                            </div>
                          )}
                        </div>

                        {/* File Details */}
                        <div className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h5 className="text-xs font-semibold text-foreground truncate" title={file.original_name}>
                              {file.original_name}
                            </h5>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-muted text-muted-foreground rounded shrink-0">
                              {formatBytes(file.size_bytes)}
                            </span>
                          </div>

                          <div className="text-[10px] text-muted-foreground font-mono truncate">
                            ID: {file.id}
                          </div>

                          {/* Action Buttons: Copy URL & Delete */}
                          <div className="pt-2 border-t border-border flex items-center justify-between gap-1 text-xs">
                            <button
                              onClick={() => copyToClipboard(viewUrl, file.id)}
                              className="flex items-center gap-1 px-2 py-1 bg-muted hover:bg-accent rounded text-[11px] font-mono text-foreground transition-colors"
                            >
                              {copiedKey === file.id ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3 text-muted-foreground" />
                              )}
                              Copy URL
                            </button>

                            <a
                              href={viewUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
                              title="Open file in new tab"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>

                            <button
                              onClick={() => {
                                if (confirm(`Delete file "${file.original_name}"?`)) {
                                  deleteFileMutation.mutate(file.id);
                                }
                              }}
                              className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                              title="Delete file"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Image Preview Modal */}
            {selectedFileForPreview && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                onClick={() => setSelectedFileForPreview(null)}
              >
                <div className="max-w-4xl max-h-[90vh] bg-card border border-border rounded-xl p-4 overflow-hidden relative shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between pb-3 mb-2 border-b border-border">
                    <span className="text-xs font-bold font-mono">{selectedFileForPreview.original_name}</span>
                    <button onClick={() => setSelectedFileForPreview(null)} className="p-1 hover:bg-accent rounded text-sm font-bold">
                      ✕
                    </button>
                  </div>
                  <img
                    src={`${window.location.origin}/v1/files/${selectedFileForPreview.id}/view`}
                    alt={selectedFileForPreview.original_name}
                    className="max-h-[75vh] w-auto mx-auto object-contain rounded"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* REALTIME EVENT STREAM TAB */}
        {activeTab === 'realtime' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Radio className="w-5 h-5 text-blue-500" />
                  Realtime Event Stream
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Server-Sent Events (SSE) stream for table mutations and schema changes.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Filter by table name..."
                  value={realtimeTableFilter}
                  onChange={(e) => setRealtimeTableFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground w-48"
                />

                <button
                  onClick={() => setIsRealtimeListening((prev) => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-colors ${
                    isRealtimeListening
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  <Radio className={`w-3.5 h-3.5 ${isRealtimeListening ? 'animate-pulse' : ''}`} />
                  {isRealtimeListening ? 'Disconnect Stream' : 'Connect Live Stream'}
                </button>

                {realtimeEvents.length > 0 && (
                  <button
                    onClick={() => setRealtimeEvents([])}
                    className="px-2.5 py-1.5 text-xs border border-border hover:bg-accent text-muted-foreground hover:text-foreground rounded-md transition-colors"
                  >
                    Clear Feed
                  </button>
                )}
              </div>
            </div>

            {/* Event List Feed */}
            <div className="space-y-3">
              {realtimeEvents.length === 0 ? (
                <div className="bg-card border border-border rounded-lg p-12 text-center">
                  <Radio className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-foreground">
                    {isRealtimeListening ? 'Waiting for database mutations...' : 'Realtime Stream is disconnected'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    {isRealtimeListening
                      ? 'Perform an INSERT, UPDATE, or DELETE via SQL Editor, REST API, or Client SDK to see live events.'
                      : 'Click "Connect Live Stream" to open an SSE listener and watch live events.'}
                  </p>
                </div>
              ) : (
                realtimeEvents.map((evt, idx) => (
                  <div key={idx} className="bg-card border border-border rounded-lg p-4 shadow-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                            evt.type === 'insert'
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                              : evt.type === 'update'
                              ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                              : evt.type === 'delete'
                              ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                              : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                          }`}
                        >
                          {evt.type}
                        </span>
                        {evt.table && (
                          <span className="text-xs font-semibold text-foreground font-mono">
                            table: <span className="text-blue-500">{evt.table}</span>
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {formatDate(evt.timestamp)}
                      </span>
                    </div>

                    <pre className="p-2.5 bg-muted/70 rounded text-[11px] font-mono overflow-x-auto text-foreground border border-border">
                      {JSON.stringify(evt.data, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* WEBHOOKS MANAGEMENT TAB */}
        {activeTab === 'webhooks' && (
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <WebhookIcon className="w-5 h-5 text-purple-500" />
                  Webhooks
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Receive HTTP POST notifications with HMAC-SHA256 signatures when data changes.
                </p>
              </div>

              <button
                onClick={() => setIsCreateWebhookOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Webhook
              </button>
            </div>

            {/* Create Webhook Form Modal */}
            {isCreateWebhookOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <WebhookIcon className="w-4 h-4 text-purple-500" />
                      Configure New Webhook
                    </h3>
                    <button
                      onClick={() => setIsCreateWebhookOpen(false)}
                      className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Webhook Name</label>
                      <input
                        type="text"
                        placeholder="Discord Bot / Notification Server"
                        value={webhookName}
                        onChange={(e) => setWebhookName(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md text-foreground"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Payload URL</label>
                      <input
                        type="url"
                        placeholder="https://api.example.com/webhooks/vanilla"
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md text-foreground"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Secret (Optional HMAC-SHA256)</label>
                      <input
                        type="text"
                        placeholder="Leave empty or provide secret string"
                        value={webhookSecret}
                        onChange={(e) => setWebhookSecret(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md text-foreground"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Target Table Filter (Optional)</label>
                      <select
                        value={webhookTable}
                        onChange={(e) => setWebhookTable(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md text-foreground"
                      >
                        <option value="">All Tables</option>
                        {schema
                          .filter((s) => s.type === 'table')
                          .map((t) => (
                            <option key={t.name} value={t.name}>
                              {t.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Events</label>
                      <div className="flex gap-4">
                        {['insert', 'update', 'delete'].map((evt) => (
                          <label key={evt} className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                            <input
                              type="checkbox"
                              checked={webhookEvents.includes(evt)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setWebhookEvents([...webhookEvents, evt]);
                                } else {
                                  setWebhookEvents(webhookEvents.filter((item) => item !== evt));
                                }
                              }}
                              className="rounded border-border text-blue-600 focus:ring-0"
                            />
                            <span className="capitalize">{evt}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border flex justify-end gap-2">
                    <button
                      onClick={() => setIsCreateWebhookOpen(false)}
                      className="px-3 py-1.5 text-xs border border-border hover:bg-accent rounded-md"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={!webhookName.trim() || !webhookUrl.trim() || webhookEvents.length === 0 || createWebhookMutation.isPending}
                      onClick={() =>
                        createWebhookMutation.mutate({
                          name: webhookName,
                          url: webhookUrl,
                          secret: webhookSecret || undefined,
                          tableName: webhookTable || undefined,
                          events: webhookEvents,
                        })
                      }
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
                    >
                      {createWebhookMutation.isPending ? 'Saving...' : 'Save Webhook'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Webhook Records List */}
            <div className="space-y-3">
              {webhooks.length === 0 ? (
                <div className="bg-card border border-border rounded-lg p-12 text-center">
                  <WebhookIcon className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-foreground">No Webhooks configured</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Configure webhooks to receive real-time push alerts on external systems.
                  </p>
                </div>
              ) : (
                webhooks.map((wh) => (
                  <div key={wh.id} className="bg-card border border-border rounded-lg p-4 shadow-sm flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground">{wh.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
                          {wh.url}
                        </span>
                        {wh.table_name && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded">
                            {wh.table_name}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>Events: <strong>{wh.events.join(', ')}</strong></span>
                        <span>•</span>
                        <span>Failures: <strong className={wh.failure_count > 0 ? 'text-red-500' : 'text-emerald-500'}>{wh.failure_count}</strong></span>
                        {wh.last_triggered_at && (
                          <>
                            <span>•</span>
                            <span>Last Trigger: {formatDate(wh.last_triggered_at)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          try {
                            await apiRequest(`/api/admin/webhooks/${wh.id}/test`, { method: 'POST' });
                            refetchWebhooks();
                          } catch (err: any) {
                            alert(err.message || 'Failed to send test webhook');
                          }
                        }}
                        className="px-2.5 py-1 text-xs border border-border hover:bg-accent rounded text-muted-foreground hover:text-foreground font-medium transition-colors"
                        title="Send test ping to webhook URL"
                      >
                        Test
                      </button>

                      {wh.failure_count > 0 && (
                        <button
                          onClick={async () => {
                            try {
                              await apiRequest(`/api/admin/webhooks/${wh.id}/reset-failures`, { method: 'POST' });
                              refetchWebhooks();
                            } catch (err: any) {
                              alert(err.message || 'Failed to reset failure count');
                            }
                          }}
                          className="px-2.5 py-1 text-xs border border-border hover:bg-accent rounded text-amber-500 hover:text-amber-400 font-medium transition-colors"
                          title="Reset failure count to 0"
                        >
                          Reset Failures
                        </button>
                      )}

                      <button
                        onClick={() => deleteWebhookMutation.mutate(wh.id)}
                        disabled={deleteWebhookMutation.isPending}
                        className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                        title="Delete webhook"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* SCHEMA VIEWER TAB */}
        {activeTab === 'schema' && (
          <div className="max-w-5xl mx-auto space-y-4">
            {isSchemaLoading ? (
              <div className="flex flex-col items-center justify-center p-12 bg-card border border-border rounded-lg text-muted-foreground">
                <RefreshCw className="w-6 h-6 animate-spin mb-2 text-blue-500" />
                <span className="text-xs">Loading database schema...</span>
              </div>
            ) : schema.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 bg-card border border-border rounded-lg text-center space-y-3">
                <div className="p-3 bg-muted rounded-full">
                  <Layers className="w-8 h-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">No Schema Objects Found</h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    This database has no tables or views defined yet. Create your first table or run SQL migrations to inspect the schema.
                  </p>
                </div>
                <button
                  onClick={() => setIsCreateTableOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold shadow-sm transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create Table
                </button>
              </div>
            ) : (
              schema.map((item) => (
                <div key={item.name} className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
                  <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TableIcon className="w-4 h-4 text-blue-500" />
                      <span className="font-mono font-bold text-xs">{item.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-muted text-muted-foreground rounded uppercase font-medium">
                        {item.type}
                      </span>
                    </div>
                    {item.rowCountEstimate !== undefined && (
                      <span className="text-[11px] text-muted-foreground">
                        ~{item.rowCountEstimate} rows
                      </span>
                    )}
                  </div>

                  <div className="p-4 space-y-4">
                    {/* Columns */}
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Columns ({item.columns.length})</h4>
                      <div className="border border-border rounded overflow-hidden">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-muted/40 text-muted-foreground border-b border-border">
                            <tr>
                              <th className="py-1.5 px-3">Name</th>
                              <th className="py-1.5 px-3">Type</th>
                              <th className="py-1.5 px-3">PK</th>
                              <th className="py-1.5 px-3">Not Null</th>
                              <th className="py-1.5 px-3">Default</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {item.columns.map((c) => (
                              <tr key={c.name} className="hover:bg-muted/20">
                                <td className="py-1.5 px-3 font-semibold">{c.name}</td>
                                <td className="py-1.5 px-3 text-blue-500">{c.type || 'BLOB/ANY'}</td>
                                <td className="py-1.5 px-3">{c.pk ? '✓ PK' : '—'}</td>
                                <td className="py-1.5 px-3">{c.notnull ? 'NOT NULL' : '—'}</td>
                                <td className="py-1.5 px-3 text-muted-foreground">{c.dflt_value || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Indexes */}
                    {item.indexes && item.indexes.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Indexes ({item.indexes.length})</h4>
                        <div className="border border-border rounded overflow-hidden">
                          <table className="w-full text-left text-xs font-mono">
                            <thead className="bg-muted/40 text-muted-foreground border-b border-border">
                              <tr>
                                <th className="py-1.5 px-3">Index Name</th>
                                <th className="py-1.5 px-3">Unique</th>
                                <th className="py-1.5 px-3">Columns</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {item.indexes.map((idx) => (
                                <tr key={idx.name} className="hover:bg-muted/20">
                                  <td className="py-1.5 px-3 font-semibold">{idx.name}</td>
                                  <td className="py-1.5 px-3">{idx.unique ? '✓ UNIQUE' : '—'}</td>
                                  <td className="py-1.5 px-3 text-blue-500">{idx.columns?.join(', ') || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Foreign Keys */}
                    {item.foreignKeys && item.foreignKeys.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Foreign Keys ({item.foreignKeys.length})</h4>
                        <div className="border border-border rounded overflow-hidden">
                          <table className="w-full text-left text-xs font-mono">
                            <thead className="bg-muted/40 text-muted-foreground border-b border-border">
                              <tr>
                                <th className="py-1.5 px-3">From Column</th>
                                <th className="py-1.5 px-3">Referenced Table</th>
                                <th className="py-1.5 px-3">Target Column</th>
                                <th className="py-1.5 px-3">On Update / Delete</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {item.foreignKeys.map((fk, fIdx) => (
                                <tr key={fIdx} className="hover:bg-muted/20">
                                  <td className="py-1.5 px-3 font-semibold">{fk.from}</td>
                                  <td className="py-1.5 px-3 text-blue-500">{fk.table}</td>
                                  <td className="py-1.5 px-3">{fk.to}</td>
                                  <td className="py-1.5 px-3 text-muted-foreground">{fk.on_update} / {fk.on_delete}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* SQL DDL */}
                    {item.sql && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">DDL Definition</h4>
                        <pre className="p-3 bg-muted/60 border border-border rounded text-[11px] font-mono overflow-x-auto text-foreground">
                          {item.sql}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* API DOCUMENTATION & QUICKSTART EXAMPLES TAB */}
        {activeTab === 'api' && (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="bg-card border border-border rounded-lg p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Key className="w-4 h-4 text-blue-500" />
                    Unified Database API & Master Token Access
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Chỉ cần 1 Database Base URL duy nhất. Mọi quyền truy cập (Query, Batch, Realtime SSE, Media Storage) được điều khiển và kích hoạt trực tiếp thông qua API Token.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px] font-sans font-medium">1. Database API Base URL (Duy nhất)</span>
                  <div className="flex items-center justify-between p-2.5 bg-muted/60 border border-border rounded mt-1.5">
                    <span className="truncate text-blue-400 font-semibold">{window.location.origin}/v1/databases/{databaseId}</span>
                    <button
                      onClick={() => copyToClipboard(`${window.location.origin}/v1/databases/${databaseId}`, 'dbUrl')}
                      className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors ml-2"
                      title="Copy Database Base URL"
                    >
                      {copiedKey === 'dbUrl' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <span className="text-muted-foreground block text-[11px] font-sans font-medium">2. API Token Authorization Header</span>
                  <div className="flex items-center justify-between p-2.5 bg-muted/60 border border-border rounded mt-1.5">
                    <span className="truncate text-foreground">Authorization: Bearer <span className="text-emerald-400 font-semibold">vdb_live_...</span></span>
                    <button
                      onClick={() => copyToClipboard(`Authorization: Bearer vdb_live_your_token`, 'authHeader')}
                      className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors ml-2"
                      title="Copy Header format"
                    >
                      {copiedKey === 'authHeader' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Feature capabilities unlocked by Key */}
              <div className="pt-3 border-t border-border space-y-2">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Các tính năng tự động kích hoạt theo Token Permissions:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 bg-muted/40 border border-border rounded">
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500" /> SQL Queries
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5"><code>/query</code> • Read/Write</div>
                  </div>
                  <div className="p-2 bg-muted/40 border border-border rounded">
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" /> Transactions
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5"><code>/batch</code> • Atomic ACID</div>
                  </div>
                  <div className="p-2 bg-muted/40 border border-border rounded">
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" /> Realtime SSE
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5"><code>/realtime</code> • Live stream</div>
                  </div>
                  <div className="p-2 bg-muted/40 border border-border rounded">
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-500" /> Media Storage
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5"><code>/files</code> • Range 206</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Official SDK Quickstarts */}
            <div className="bg-card border border-border rounded-lg p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-blue-500" />
                  Client SDK Quickstart (TypeScript / Node.js & Python)
                </h3>
              </div>

              {/* Node / TS SDK */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">1. TypeScript / Node.js Client</span>
                  <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    npm i @nullex/vanilladb
                  </span>
                </div>
                <pre className="p-4 bg-muted/60 border border-border rounded text-xs font-mono overflow-x-auto text-foreground">
{`import { VanillaDatabase } from '@nullex/vanilladb';

const db = new VanillaDatabase({
  url: '${window.location.origin}/v1/databases/${databaseId}',
  token: 'vdb_live_your_api_token'
});

// 1. Parameterized SQL Query
const { rows } = await db.query('SELECT * FROM users WHERE active = ?', [1]);
console.log('Users:', rows);

// 2. Atomic Batch Transaction
await db.batch([
  { sql: 'INSERT INTO users (username) VALUES (?)', params: ['alice'] },
  { sql: 'INSERT INTO logs (event) VALUES (?)', params: ['user_created'] }
], true);

// 3. Realtime SSE Live Events
const unsubscribe = db.subscribe((event) => {
  console.log('Realtime DB Event:', event.type, event.table, event.data);
}, 'users');

// 4. Media Storage (Upload & Stream)
const file = await db.uploadFile(buffer, 'avatar.png', 'image/png');
console.log('Stream URL:', db.getFileUrl(file.id));`}
                </pre>
              </div>

              {/* Python SDK */}
              <div className="space-y-2 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">2. Python Client</span>
                  <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    pip install vanilladb
                  </span>
                </div>
                <pre className="p-4 bg-muted/60 border border-border rounded text-xs font-mono overflow-x-auto text-foreground">
{`from vanilladb import VanillaDatabase

db = VanillaDatabase(
    url="${window.location.origin}/v1/databases/${databaseId}",
    token="vdb_live_your_api_token"
)

# 1. Parameterized Query
result = db.query("SELECT * FROM users WHERE active = ?", [1])
print("Rows:", result["rows"])

# 2. Atomic Batch Transaction
db.batch([
    {"sql": "INSERT INTO users (username) VALUES (?)", "params": ["bob"]},
    {"sql": "INSERT INTO logs (event) VALUES (?)", "params": ["user_created"]}
], transaction=True)

# 3. Media Storage Upload
uploaded = db.upload_file("photo.png", filename="user_avatar.png", content_type="image/png")
print("File URL:", db.get_file_url(uploaded["id"]))`}
                </pre>
              </div>
            </div>

            {/* cURL Example */}
            <div className="bg-card border border-border rounded-lg p-5 space-y-4 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground">cURL Commands</h3>
              <pre className="p-4 bg-muted/60 border border-border rounded text-xs font-mono overflow-x-auto text-foreground">
{`# 1. Raw SQL Query
curl -X POST "${window.location.origin}/v1/databases/${databaseId}/query" \\
  -H "Authorization: Bearer $VANILLA_DATABASE_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "sql": "SELECT * FROM users LIMIT 10",
    "params": []
  }'

# 2. Atomic Batch Transaction
curl -X POST "${window.location.origin}/v1/databases/${databaseId}/batch" \\
  -H "Authorization: Bearer $VANILLA_DATABASE_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "transaction": true,
    "statements": [
      { "sql": "UPDATE accounts SET balance = balance - 50 WHERE id = 1" },
      { "sql": "UPDATE accounts SET balance = balance + 50 WHERE id = 2" }
    ]
  }'

# 3. Stream Realtime Events (SSE)
curl -N "${window.location.origin}/v1/databases/${databaseId}/realtime" \\
  -H "Authorization: Bearer $VANILLA_DATABASE_TOKEN"`}
              </pre>
            </div>
          </div>
        )}

        {/* TOKENS TAB */}
        {activeTab === 'tokens' && (
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="flex items-center justify-between pb-2">
              <div>
                <h3 className="text-sm font-bold text-foreground">API Tokens</h3>
                <p className="text-xs text-muted-foreground">Unlimited tokens for external bots and services.</p>
              </div>
              <button
                onClick={() => onOpenCreateToken(databaseId)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create Token
              </button>
            </div>

            <div className="space-y-3">
              {tokens.map((tok) => (
                <div key={tok.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between shadow-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-xs text-foreground">{tok.name}</h4>
                      <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
                        {tok.token_prefix}••••••••{tok.token_last_chars}
                      </span>
                      {tok.revoked_at ? (
                        <span className="text-[10px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded font-medium">Revoked</span>
                      ) : (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded font-medium">Active</span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-3 mt-1.5">
                      <span>Permissions: <strong className="text-foreground">{tok.permissions.join(', ')}</strong></span>
                      <span>•</span>
                      <span>Last used: {formatTimeAgo(tok.last_used_at)}</span>
                      <span>•</span>
                      <span>Created: {formatDate(tok.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!tok.revoked_at && (
                      <button
                        onClick={() => revokeTokenMutation.mutate(tok.id)}
                        className="px-2.5 py-1 text-xs border border-border hover:bg-accent rounded text-muted-foreground transition-colors"
                      >
                        Revoke
                      </button>
                    )}
                    <button
                      onClick={() => deleteTokenMutation.mutate(tok.id)}
                      className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BACKUPS TAB */}
        {activeTab === 'backups' && (
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="flex items-center justify-between pb-2">
              <div>
                <h3 className="text-sm font-bold text-foreground">Database Snapshots</h3>
                <p className="text-xs text-muted-foreground">Safe WAL-consistent backup and restore points.</p>
              </div>
              <button
                onClick={() => createBackupMutation.mutate()}
                disabled={createBackupMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md text-xs font-medium transition-colors"
              >
                <Archive className="w-3.5 h-3.5" />
                Create Snapshot
              </button>
            </div>

            <div className="space-y-3">
              {backups.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg bg-card/50">
                  No snapshots taken yet. Create a backup before major schema updates.
                </div>
              ) : (
                backups.map((bkp) => (
                  <div key={bkp.id} className="bg-card border border-border rounded-lg p-4 flex items-center justify-between shadow-sm">
                    <div>
                      <div className="flex items-center gap-2">
                        <Archive className="w-4 h-4 text-purple-500" />
                        <span className="font-mono text-xs font-semibold text-foreground">{bkp.filename}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded uppercase">
                          {bkp.backup_type}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-3 mt-1.5">
                        <span>Size: {formatBytes(bkp.size_bytes)}</span>
                        <span>•</span>
                        <span>SHA256: {bkp.checksum.substring(0, 8)}...</span>
                        <span>•</span>
                        <span>Date: {formatDate(bkp.created_at)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to restore this snapshot? Current database will be restored.')) {
                            restoreBackupMutation.mutate(bkp.id);
                          }
                        }}
                        disabled={restoreBackupMutation.isPending}
                        className="px-2.5 py-1 text-xs border border-border hover:bg-accent rounded text-foreground flex items-center gap-1 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Restore
                      </button>
                      <button
                        onClick={() => deleteBackupMutation.mutate(bkp.id)}
                        className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* SETTINGS, MAINTENANCE & DANGER ZONE TAB */}
        {activeTab === 'settings' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* 1. Database Maintenance & Optimization Card */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-blue-500" />
                    Database Maintenance & Performance Tuning
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Defragment pages, reclaim free space, flush WAL buffers, and check database file integrity.
                  </p>
                </div>
              </div>

              {maintenanceMessage && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs rounded-lg flex items-center gap-2 font-medium animate-in fade-in duration-200">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{maintenanceMessage}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* VACUUM */}
                <div className="p-3.5 border border-border rounded-lg bg-muted/20 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <strong className="text-xs text-foreground">VACUUM (Reclaim Free Space)</strong>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 bg-muted rounded text-muted-foreground">
                        {freePages} Free Pages
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Repacks the database file to discard empty pages and reduce disk size.
                    </p>
                  </div>
                  <button
                    onClick={() => maintenanceMutation.mutate('vacuum')}
                    disabled={maintenanceMutation.isPending}
                    className="w-full py-1.5 px-3 bg-card border border-border hover:bg-accent text-foreground text-xs font-semibold rounded-md shadow-sm transition-colors"
                  >
                    Run VACUUM
                  </button>
                </div>

                {/* Integrity Check */}
                <div className="p-3.5 border border-border rounded-lg bg-muted/20 flex flex-col justify-between space-y-3">
                  <div>
                    <strong className="text-xs text-foreground">PRAGMA integrity_check</strong>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Deep scans B-Tree structures and data pages for zero corruption.
                    </p>
                  </div>
                  <button
                    onClick={() => maintenanceMutation.mutate('integrity_check')}
                    disabled={maintenanceMutation.isPending}
                    className="w-full py-1.5 px-3 bg-card border border-border hover:bg-accent text-foreground text-xs font-semibold rounded-md shadow-sm transition-colors"
                  >
                    Run Integrity Check
                  </button>
                </div>

                {/* WAL Checkpoint */}
                <div className="p-3.5 border border-border rounded-lg bg-muted/20 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <strong className="text-xs text-foreground">Flush WAL Buffer</strong>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 bg-muted rounded text-muted-foreground">
                        {formatBytes(stats?.walSizeBytes || 0)} WAL
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Forces writes from the Write-Ahead Log into the main DB file and truncates it.
                    </p>
                  </div>
                  <button
                    onClick={() => maintenanceMutation.mutate('wal_checkpoint')}
                    disabled={maintenanceMutation.isPending}
                    className="w-full py-1.5 px-3 bg-card border border-border hover:bg-accent text-foreground text-xs font-semibold rounded-md shadow-sm transition-colors"
                  >
                    Flush & Truncate WAL
                  </button>
                </div>

                {/* REINDEX */}
                <div className="p-3.5 border border-border rounded-lg bg-muted/20 flex flex-col justify-between space-y-3">
                  <div>
                    <strong className="text-xs text-foreground">REINDEX (Rebuild Indexes)</strong>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Rebuilds all indexes across all tables to optimize search speed.
                    </p>
                  </div>
                  <button
                    onClick={() => maintenanceMutation.mutate('reindex')}
                    disabled={maintenanceMutation.isPending}
                    className="w-full py-1.5 px-3 bg-card border border-border hover:bg-accent text-foreground text-xs font-semibold rounded-md shadow-sm transition-colors"
                  >
                    Run REINDEX
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Clone / Branch Database Card */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-500" />
                    Database Cloning & Branching
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Duplicate this database instance to create development or staging branches.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setCloneNewName(`${currentDbName} (Dev Branch)`);
                    setIsCloneModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Clone Database
                </button>
              </div>
            </div>

            {/* 3. Danger Zone */}
            <div className="bg-card border border-red-500/30 rounded-xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 text-red-500 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4" />
                Danger Zone
              </div>
              <p className="text-xs text-muted-foreground">
                Permanently delete this SQLite database instance, all associated WAL files, backups, and API tokens.
              </p>

              <div className="pt-3 border-t border-border space-y-3">
                <label className="block text-xs font-medium">
                  Type <strong className="text-red-500">{currentDbName}</strong> to confirm deletion:
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={deleteConfirmName}
                    onChange={(e) => setDeleteConfirmName(e.target.value)}
                    placeholder={currentDbName}
                    className="flex-1 px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-red-500 text-foreground"
                  />
                  <button
                    disabled={deleteConfirmName !== currentDbName || deleteDbMutation.isPending}
                    onClick={() => deleteDbMutation.mutate()}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold transition-colors"
                  >
                    Delete Database
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Clone Database Modal */}
      {isCloneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-500" />
                Clone / Branch Database
              </h3>
              <button onClick={() => setIsCloneModalOpen(false)} className="p-1 hover:bg-accent rounded text-muted-foreground">
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">New Database Name</label>
              <input
                type="text"
                required
                value={cloneNewName}
                onChange={(e) => setCloneNewName(e.target.value)}
                placeholder="e.g. Production Replica"
                className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md text-foreground"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Creates an identical SQLite copy with all tables, indexes, and data.
              </p>
            </div>

            <div className="pt-3 border-t border-border flex justify-end gap-2">
              <button
                onClick={() => setIsCloneModalOpen(false)}
                className="px-3 py-1.5 text-xs border border-border hover:bg-accent rounded-md"
              >
                Cancel
              </button>
              <button
                disabled={!cloneNewName.trim() || cloneDbMutation.isPending}
                onClick={() => cloneDbMutation.mutate(cloneNewName.trim())}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
              >
                {cloneDbMutation.isPending ? 'Cloning...' : 'Start Clone'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Insert / Edit Row Modal */}
      <RowModal
        isOpen={isInsertModalOpen || !!editingRow}
        tableSchema={currentTableSchema}
        initialRow={editingRow}
        isSaving={insertRowMutation.isPending || updateRowMutation.isPending}
        onClose={() => {
          setIsInsertModalOpen(false);
          setEditingRow(null);
        }}
        onSave={(rowValues) => {
          if (editingRow) {
            updateRowMutation.mutate({
              pkCol: primaryKeyCol,
              pkVal: editingRow[primaryKeyCol],
              values: rowValues,
            });
          } else {
            insertRowMutation.mutate(rowValues);
          }
        }}
      />

      {/* Rename Table Modal */}
      {isRenameTableOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-card border border-border rounded-xl shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Rename Table</h3>
              <button onClick={() => setIsRenameTableOpen(false)} className="p-1 hover:bg-accent rounded">
                <Trash2 className="w-4 h-4 hidden" />
                <span className="text-muted-foreground hover:text-foreground text-sm font-bold">✕</span>
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">New Table Name</label>
              <input
                type="text"
                required
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500 text-foreground"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsRenameTableOpen(false)}
                className="px-3 py-1.5 text-xs border border-border hover:bg-accent rounded-md text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => renameTableMutation.mutate(newTableName.trim())}
                disabled={renameTableMutation.isPending || !newTableName.trim()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold rounded-md"
              >
                {renameTableMutation.isPending ? 'Renaming...' : 'Rename'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Table Modal */}
      <CreateTableModal
        isOpen={isCreateTableOpen}
        databaseId={databaseId}
        onClose={() => setIsCreateTableOpen(false)}
        onSuccess={(name) => {
          setSelectedTable(name);
        }}
      />
    </div>
  );
};
