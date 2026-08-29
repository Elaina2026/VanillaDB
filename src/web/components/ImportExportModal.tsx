import React, { useState } from 'react';
import { Upload, Download, FileText, Database, Layers, CheckCircle2, AlertCircle, X, RefreshCw } from 'lucide-react';
import { apiRequest } from '../api/client.js';
import type { TableSchemaDetail } from '@shared/index.js';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  databaseId: string;
  schema: TableSchemaDetail[];
  onSuccess: () => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  onClose,
  databaseId,
  schema,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');

  // Export states
  const [exportFormat, setExportFormat] = useState<'sql' | 'csv' | 'json' | 'sqlite'>('sql');
  const [selectedExportTable, setSelectedExportTable] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);

  // Import states
  const [importFile, setImportFile] = useState<File | null>(null);
  const [targetImportTable, setTargetImportTable] = useState<string>('');
  const [importDialect, setImportDialect] = useState<string>('auto');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const handleExport = () => {
    setIsExporting(true);
    let url = `/api/admin/databases/${databaseId}/export?format=${exportFormat}`;
    if (selectedExportTable !== 'all') {
      url += `&table=${encodeURIComponent(selectedExportTable)}`;
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setIsExporting(false), 1000);
  };

  const handleImport = async () => {
    if (!importFile) return;
    setIsImporting(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append('file', importFile);
    if (targetImportTable) {
      formData.append('tableName', targetImportTable);
    }
    if (importDialect && importDialect !== 'auto') {
      formData.append('dialect', importDialect);
    }

    try {
      const res = await fetch(`/api/admin/databases/${databaseId}/import`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Import failed');
      }

      setImportResult({
        success: true,
        message: data.message || `Successfully imported data`,
      });
      onSuccess();
    } catch (err: any) {
      setImportResult({
        success: false,
        message: err.message || 'Import failed',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const isCsvFile = importFile?.name.endsWith('.csv');
  const isJsonFile = importFile?.name.endsWith('.json') || importFile?.name.endsWith('.ndjson') || importFile?.name.endsWith('.jsonl');
  const isSqlFile = importFile?.name.endsWith('.sql') || importFile?.name.endsWith('.dump');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-500" />
            Import / Export Data
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-muted p-0.5 rounded-lg border border-border">
          <button
            onClick={() => {
              setActiveTab('export');
              setImportResult(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'export' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Export Data
          </button>
          <button
            onClick={() => {
              setActiveTab('import');
              setImportResult(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'import' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Import Data
          </button>
        </div>

        {/* Export Tab */}
        {activeTab === 'export' && (
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Export Format</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'sql', label: 'SQL Dump (.sql)' },
                  { id: 'sqlite', label: 'SQLite Binary (.db)' },
                  { id: 'csv', label: 'CSV (.csv)' },
                  { id: 'json', label: 'JSON (.json)' },
                ].map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => setExportFormat(fmt.id as any)}
                    className={`py-2 px-2 text-xs rounded-md border text-center transition-colors font-medium ${
                      exportFormat === fmt.id
                        ? 'border-blue-600 bg-blue-500/10 text-blue-500 font-semibold'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>

            {exportFormat !== 'sqlite' && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Target Table</label>
                <select
                  value={selectedExportTable}
                  onChange={(e) => setSelectedExportTable(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md text-foreground"
                >
                  {exportFormat === 'sql' && <option value="all">All Tables (Entire Database)</option>}
                  {schema
                    .filter((s) => s.type === 'table')
                    .map((t) => (
                      <option key={t.name} value={t.name}>
                        Table: {t.name}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="pt-3 flex justify-end gap-2">
              <button onClick={onClose} className="px-3 py-1.5 text-xs border border-border hover:bg-accent rounded-md">
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                {isExporting ? 'Exporting...' : 'Download Export'}
              </button>
            </div>
          </div>
        )}

        {/* Import Tab */}
        {activeTab === 'import' && (
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Select File to Import</label>
              <input
                type="file"
                accept=".sql,.sqlite,.db,.csv,.json,.ndjson,.jsonl,.dump"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setImportFile(f);
                  if (f && f.name.endsWith('.csv') && !targetImportTable) {
                    const matched = schema.find((s) => s.type === 'table');
                    if (matched) setTargetImportTable(matched.name);
                  }
                }}
                className="w-full text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Supported: <strong>.sql</strong> (MySQL/Postgres/SQLite), <strong>.sqlite / .db</strong>, <strong>.json / .ndjson</strong> (MongoDB), and <strong>.csv</strong>.
              </p>
            </div>

            {isSqlFile && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">SQL Dialect / Engine</label>
                <select
                  value={importDialect}
                  onChange={(e) => setImportDialect(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md text-foreground"
                >
                  <option value="auto">Auto-Detect Dialect (Recommended)</option>
                  <option value="mysql">MySQL Dump (Converts backticks, ENGINE, AUTO_INCREMENT)</option>
                  <option value="postgres">PostgreSQL Dump (Converts SERIAL, COPY stdin, UUID)</option>
                  <option value="sqlite">Standard SQLite SQL</option>
                </select>
              </div>
            )}

            {(isCsvFile || isJsonFile) && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Target Table Name {isJsonFile ? '(Optional - will auto-create if empty)' : ''}
                </label>
                <input
                  type="text"
                  placeholder="e.g. users or imported_data"
                  value={targetImportTable}
                  onChange={(e) => setTargetImportTable(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md text-foreground mb-1 font-mono"
                />
              </div>
            )}

            {importResult && (
              <div
                className={`p-3 rounded-md text-xs font-mono flex items-start gap-2 ${
                  importResult.success
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500'
                    : 'bg-red-500/10 border border-red-500/20 text-red-500'
                }`}
              >
                {importResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{importResult.message}</span>
              </div>
            )}

            <div className="pt-3 flex justify-end gap-2">
              <button onClick={onClose} className="px-3 py-1.5 text-xs border border-border hover:bg-accent rounded-md">
                Close
              </button>
              <button
                onClick={handleImport}
                disabled={!importFile || isImporting}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
              >
                {isImporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {isImporting ? 'Importing...' : 'Start Import'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
