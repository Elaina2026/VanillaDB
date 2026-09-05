import React, { useState } from 'react';
import { X, Plus, Trash2, Table } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../api/client.js';
import { useI18n } from '../hooks/useI18n.js';

interface ColumnDef {
  name: string;
  type: string;
  pk: boolean;
  notnull: boolean;
  unique: boolean;
  defaultValue: string;
}

export const CreateTableModal: React.FC<{
  isOpen: boolean;
  databaseId: string;
  onClose: () => void;
  onSuccess: (tableName: string) => void;
}> = ({ isOpen, databaseId, onClose, onSuccess }) => {
  const { t } = useI18n();
  const [tableName, setTableName] = useState('');
  const [columns, setColumns] = useState<ColumnDef[]>([
    { name: 'id', type: 'INTEGER', pk: true, notnull: true, unique: false, defaultValue: '' },
    { name: 'name', type: 'TEXT', pk: false, notnull: true, unique: false, defaultValue: '' },
    { name: 'created_at', type: 'INTEGER', pk: false, notnull: true, unique: false, defaultValue: '' },
  ]);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const createTableMutation = useMutation({
    mutationFn: (sql: string) =>
      apiRequest(`/api/admin/databases/${databaseId}/exec`, {
        method: 'POST',
        body: JSON.stringify({ sql }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dbSchema', databaseId] });
      queryClient.invalidateQueries({ queryKey: ['dbStats', databaseId] });
      onSuccess(tableName.trim());
      onClose();
    },
    onError: (err: any) => {
      setError(err.message || t('createTable.errorFailed', 'Failed to create table'));
    },
  });

  if (!isOpen) return null;

  const handleAddColumn = () => {
    setColumns([
      ...columns,
      { name: `col_${columns.length + 1}`, type: 'TEXT', pk: false, notnull: false, unique: false, defaultValue: '' },
    ]);
  };

  const handleRemoveColumn = (index: number) => {
    if (columns.length <= 1) return;
    setColumns(columns.filter((_, i) => i !== index));
  };

  const handleColumnChange = (index: number, field: keyof ColumnDef, value: any) => {
    const updated = [...columns];
    updated[index] = { ...updated[index], [field]: value };
    setColumns(updated);
  };

  const generateSql = (): string => {
    const colDefs = columns.map((col) => {
      let def = `"${col.name.replace(/"/g, '""')}" ${col.type}`;
      if (col.pk) {
        def += col.type === 'INTEGER' ? ' PRIMARY KEY AUTOINCREMENT' : ' PRIMARY KEY';
      }
      if (col.notnull && !col.pk) def += ' NOT NULL';
      if (col.unique && !col.pk) def += ' UNIQUE';
      if (col.defaultValue && col.defaultValue.trim()) {
        def += ` DEFAULT ${col.defaultValue}`;
      }
      return def;
    });

    return `CREATE TABLE "${tableName.trim().replace(/"/g, '""')}" (\n  ${colDefs.join(',\n  ')}\n);`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableName.trim()) {
      setError(t('createTable.tableNameRequired', 'Table name is required'));
      return;
    }
    setError(null);
    const sql = generateSql();
    createTableMutation.mutate(sql);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Table className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-bold">{t('schema.createTable', 'Create Table')}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/20 text-red-500 text-xs rounded font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{t('db.tableName', 'Table Name')}</label>
            <input
              type="text"
              required
              placeholder="e.g. products"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:ring-1 focus:ring-blue-500 font-mono"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-muted-foreground">{t('createTable.columnsDefinition', 'Columns Definition')}</label>
              <button
                type="button"
                onClick={handleAddColumn}
                className="flex items-center gap-1 text-xs text-blue-500 hover:underline font-medium"
              >
                <Plus className="w-3 h-3" /> {t('createTable.addColumn', 'Add Column')}
              </button>
            </div>

            <div className="space-y-2">
              {columns.map((col, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-muted/30 p-2 border border-border rounded-md text-xs">
                  <input
                    type="text"
                    required
                    placeholder={t('createTable.columnNamePlaceholder', 'column_name')}
                    value={col.name}
                    onChange={(e) => handleColumnChange(idx, 'name', e.target.value)}
                    className="flex-1 px-2 py-1 bg-background border border-border rounded font-mono text-xs"
                  />

                  <select
                    value={col.type}
                    onChange={(e) => handleColumnChange(idx, 'type', e.target.value)}
                    className="w-28 px-2 py-1 bg-background border border-border rounded text-xs font-mono"
                  >
                    <option value="INTEGER">INTEGER</option>
                    <option value="TEXT">TEXT</option>
                    <option value="REAL">REAL</option>
                    <option value="BLOB">BLOB</option>
                    <option value="NUMERIC">NUMERIC</option>
                  </select>

                  <label className="flex items-center gap-1 cursor-pointer text-[11px]">
                    <input
                      type="checkbox"
                      checked={col.pk}
                      onChange={(e) => handleColumnChange(idx, 'pk', e.target.checked)}
                      className="rounded border-border text-blue-600"
                    />
                    {t('createTable.pk', 'PK')}
                  </label>

                  <label className="flex items-center gap-1 cursor-pointer text-[11px]">
                    <input
                      type="checkbox"
                      checked={col.notnull}
                      onChange={(e) => handleColumnChange(idx, 'notnull', e.target.checked)}
                      className="rounded border-border text-blue-600"
                    />
                    {t('createTable.notNull', 'Not Null')}
                  </label>

                  <label className="flex items-center gap-1 cursor-pointer text-[11px]">
                    <input
                      type="checkbox"
                      checked={col.unique}
                      onChange={(e) => handleColumnChange(idx, 'unique', e.target.checked)}
                      className="rounded border-border text-blue-600"
                    />
                    {t('createTable.unique', 'Unique')}
                  </label>

                  <button
                    type="button"
                    onClick={() => handleRemoveColumn(idx)}
                    disabled={columns.length <= 1}
                    className="p-1 text-muted-foreground hover:text-red-500 disabled:opacity-30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{t('createTable.sqlPreview', 'SQL Preview')}</label>
            <pre className="p-3 bg-muted/60 border border-border rounded text-[11px] font-mono text-foreground overflow-x-auto">
              {tableName.trim() ? generateSql() : t('createTable.previewPlaceholder', '-- Enter table name to see preview')}
            </pre>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs border border-border hover:bg-accent rounded-md font-medium text-muted-foreground"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={createTableMutation.isPending || !tableName.trim()}
              className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md font-semibold transition-colors"
            >
              {createTableMutation.isPending ? t('common.creating', 'Creating...') : t('schema.createTable', 'Create Table')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
