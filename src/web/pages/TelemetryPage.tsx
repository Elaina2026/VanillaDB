import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Cpu,
  RefreshCw,
  Wifi,
  BarChart3,
  Timer,
  HardDrive,
  Flame,
  Zap,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { formatBytes } from '../lib/utils.js';
import type { SystemStatus, SystemMetricsHistory } from '@shared/index.js';
import {
  NetworkChart,
  CpuRamChart,
  StorageBreakdownChart,
  RequestVolumeChart,
  QueryLatencyChart,
  type TimeRange
} from '../components/MetricsCharts.js';

export const TelemetryPage: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('1h');
  const [refreshInterval, setRefreshInterval] = useState<number>(5000);

  const { data: status, isLoading: isStatusLoading, refetch: refetchStatus } = useQuery<SystemStatus>({
    queryKey: ['systemStatus'],
    queryFn: () => apiRequest('/api/system/status'),
    refetchInterval: refreshInterval > 0 ? refreshInterval : false,
  });

  const { data: metricsHistory, isLoading: isHistoryLoading, refetch: refetchMetrics } = useQuery<SystemMetricsHistory>({
    queryKey: ['metricsHistory'],
    queryFn: () => apiRequest('/api/system/metrics'),
    refetchInterval: refreshInterval > 0 ? refreshInterval : false,
  });

  const totalStorage =
    (status?.totalDatabaseStorageBytes ?? 0) +
    (status?.mediaStorageBytes ?? 0) +
    (status?.backupStorageBytes ?? 0);

  const handleRefresh = () => {
    refetchStatus();
    refetchMetrics();
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6 select-none">
      {/* Header & Interactive Telemetry Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">Live Telemetry & Metrics</h1>
            <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded font-semibold uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live 60-Point Stream
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time interactive SVG charts for Network In/Out, CPU, RAM, QPS throughput, and P95 latency distribution.
          </p>
        </div>

        {/* Interactive Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Time Range Selector */}
          <div className="bg-muted/60 p-0.5 rounded-lg border border-border flex items-center gap-0.5 text-xs">
            {(['10m', '1h', '24h'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-2.5 py-1 rounded-md font-medium transition-all text-xs ${
                  timeRange === range
                    ? 'bg-card text-foreground shadow-sm font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {range === '10m' ? 'Live 10m' : range}
              </button>
            ))}
          </div>

          {/* Refresh Interval Selector */}
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="bg-card border border-border text-foreground text-xs rounded-md px-2.5 py-1.5 font-medium shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value={2000}>Refresh: 2s (High-Res)</option>
            <option value={5000}>Refresh: 5s (Default)</option>
            <option value={15000}>Refresh: 15s</option>
            <option value={0}>Manual Pause</option>
          </select>

          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border hover:bg-accent text-foreground rounded-md text-xs font-semibold shadow-sm transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isStatusLoading || isHistoryLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Telemetry Summary Stats Banner */}
      {metricsHistory?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Peak CPU</div>
            <div className="text-lg font-mono font-bold text-foreground mt-0.5">{metricsHistory.summary.peakCpu}%</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Peak RAM</div>
            <div className="text-lg font-mono font-bold text-foreground mt-0.5">{metricsHistory.summary.peakRamPercent}%</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Max QPS</div>
            <div className="text-lg font-mono font-bold text-blue-500 mt-0.5">{metricsHistory.summary.maxQps} req/s</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Avg Latency</div>
            <div className="text-lg font-mono font-bold text-cyan-500 mt-0.5">{metricsHistory.summary.avgLatencyMs} ms</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Network In</div>
            <div className="text-lg font-mono font-bold text-emerald-500 mt-0.5">{formatBytes(metricsHistory.summary.totalNetworkInBytes)}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="text-[10px] uppercase font-bold text-muted-foreground">Network Out</div>
            <div className="text-lg font-mono font-bold text-purple-500 mt-0.5">{formatBytes(metricsHistory.summary.totalNetworkOutBytes)}</div>
          </div>
        </div>
      )}

      {/* Primary Telemetry SVG Interactive Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Realtime CPU & RAM Dual Area Trend Chart */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3 flex flex-col">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-500" />
              Realtime CPU & RAM Dual Area Trend
            </h2>
            <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-2 py-0.5 rounded">
              {timeRange} window
            </span>
          </div>
          <div className="flex-1 min-h-[220px]">
            <CpuRamChart timeRange={timeRange} status={status} />
          </div>
        </div>

        {/* Network In/Out Speed Area Chart */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3 flex flex-col">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Wifi className="w-4 h-4 text-emerald-500" />
              Network Traffic Throughput (In / Out)
            </h2>
            <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-2 py-0.5 rounded">
              {timeRange} window
            </span>
          </div>
          <div className="flex-1 min-h-[220px]">
            <NetworkChart timeRange={timeRange} status={status} />
          </div>
        </div>

        {/* Request Volume & Error Rate Timeline */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3 flex flex-col">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              Request Volume & Error Rate Timeline
            </h2>
            <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-2 py-0.5 rounded">
              QPS / Error %
            </span>
          </div>
          <div className="flex-1 min-h-[220px]">
            <RequestVolumeChart timeRange={timeRange} status={status} />
          </div>
        </div>

        {/* Query Latency Distribution (Avg vs P95) */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3 flex flex-col">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Timer className="w-4 h-4 text-cyan-500" />
              Query Latency Distribution
            </h2>
            <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-2 py-0.5 rounded">
              Avg vs P95 (ms)
            </span>
          </div>
          <div className="flex-1 min-h-[220px]">
            <QueryLatencyChart timeRange={timeRange} status={status} />
          </div>
        </div>
      </div>

      {/* Storage Breakdown Interactive Donut Section */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-purple-500" />
            Storage Allocation Breakdown
          </h2>
          <span className="text-xs font-mono font-semibold text-muted-foreground">
            Total Used: {formatBytes(totalStorage)}
          </span>
        </div>

        <StorageBreakdownChart status={status} />
      </div>
    </div>
  );
};
