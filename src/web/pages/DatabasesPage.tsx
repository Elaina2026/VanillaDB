import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Plus, Search, Layers, Server, Activity, Shield, Terminal, HardDrive, Settings, ExternalLink, Trash2, Copy, Check, Clock, Table } from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { formatBytes, formatTimeAgo, formatDate } from '../lib/utils.js';
import type { DatabaseRecord } from '@shared/index.js';

export const DatabasesPage: React.FC<{
  onSelectDatabase: (id: string) => void;
  onOpenCreateModal: () => void;
}> = ({ onSelectDatabase, onOpenCreateModal }) => {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data: databases = [], isLoading } = useQuery<DatabaseRecord[]>({
    queryKey: ['databases'],
    queryFn: () => apiRequest('/api/admin/databases'),
  });

  const filtered = databases.filter(
    (db) =>
      db.name.toLowerCase().includes(search.toLowerCase()) ||
      db.slug.toLowerCase().includes(search.toLowerCase()) ||
      (db.description && db.description.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-border">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Databases</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage your SQLite database instances and API endpoints.
          </p>
        </div>
        <button
          onClick={onOpenCreateModal}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Database
        </button>
      </div>

      {/* Search Filter */}
      <div className="py-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search databases..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-card border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? 'database' : 'databases'}
        </div>
      </div>

      {/* Database Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-36 bg-card border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center border border-dashed border-border rounded-lg bg-card/50 my-6">
          <div className="p-3 bg-muted rounded-full mb-3 text-muted-foreground">
            <Database className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold mb-1">No databases found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mb-4">
            {search ? 'Try adjusting your search query.' : 'Create your first SQLite database to get started connecting applications.'}
          </p>
          {!search && (
            <button
              onClick={onOpenCreateModal}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-medium transition-colors"
            >
              Create Database
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((db) => (
            <div
              key={db.id}
              onClick={() => onSelectDatabase(db.id)}
              className="bg-card border border-border hover:border-blue-500/50 rounded-lg p-4 cursor-pointer transition-all hover:shadow-sm flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h3 className="text-sm font-semibold tracking-tight text-foreground group-hover:text-blue-500 transition-colors truncate">
                    {db.name}
                  </h3>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-muted text-muted-foreground rounded border border-border shrink-0">
                    {db.id}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 min-h-[32px]">
                  {db.description || 'No description provided.'}
                </p>
              </div>

              <div className="pt-3 border-t border-border mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1 font-mono">
                  <Clock className="w-3 h-3" />
                  {formatTimeAgo(db.last_accessed_at || db.created_at)}
                </span>
                <span className="font-mono text-blue-500 hover:underline flex items-center gap-0.5">
                  Open <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
