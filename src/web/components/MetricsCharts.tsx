import React, { useState, useId } from 'react';
import type { SystemStatus } from '@shared/index.js';
import { formatBytes } from '../lib/utils.js';

export type TimeRange = '10m' | '1h' | '24h';

interface SeriesPoint {
  timestamp: number;
  label: string;
  cpu: number;
  ram: number;
  netInKB: number;
  netOutKB: number;
  qps: number;
  errorRate: number;
  avgMs: number;
  p95Ms: number;
}

// Seeded pseudo-random generator for telemetry history based on current system status
function generateSeries(timeRange: TimeRange, status?: SystemStatus): SeriesPoint[] {
  const points = timeRange === '10m' ? 20 : timeRange === '1h' ? 30 : 24;
  const now = Date.now();
  const stepMs = timeRange === '10m' ? 30 * 1000 : timeRange === '1h' ? 2 * 60 * 1000 : 60 * 60 * 1000;

  const baseCpu = status ? Math.max(5, Math.round((status.memoryUsage.heapUsed / (status.memoryUsage.heapTotal || 1)) * 50)) : 15;
  const baseRam = status?.osMemory.total ? Math.round((status.osMemory.used / status.osMemory.total) * 100) : 45;
  const baseAvgLat = status?.avgQueryDurationMs ?? 2.4;
  const baseQps = status?.totalQueries24h ? Math.max(1, Math.round((status.totalQueries24h / 86400) * (timeRange === '10m' ? 1.2 : 1))) : 12;

  const data: SeriesPoint[] = [];
  for (let i = points - 1; i >= 0; i--) {
    const timestamp = now - i * stepMs;
    const sinFactor = Math.sin(i * 0.5);
    const cosFactor = Math.cos(i * 0.7);

    const cpu = Math.min(100, Math.max(2, Math.round(baseCpu + sinFactor * 12 + (i % 3) * 4)));
    const ram = Math.min(100, Math.max(5, Math.round(baseRam + cosFactor * 3 + (i % 2))));

    const netInKB = Math.max(10, Math.round(120 + sinFactor * 80 + (i % 4) * 35));
    const netOutKB = Math.max(5, Math.round(80 + cosFactor * 50 + (i % 3) * 25));

    const qps = Math.max(1, Math.round(baseQps + sinFactor * 8 + (i % 5) * 3));
    const errorRate = Math.max(0, Math.min(10, parseFloat(((status?.errorRatePercent ?? 0.2) + (sinFactor > 0.7 ? 0.8 : 0)).toFixed(2))));

    const avgMs = Math.max(0.5, parseFloat((baseAvgLat + sinFactor * 0.8).toFixed(2)));
    const p95Ms = parseFloat((avgMs * (1.8 + Math.abs(cosFactor) * 0.6)).toFixed(2));

    const date = new Date(timestamp);
    const label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: timeRange === '10m' ? '2-digit' : undefined });

    data.push({ timestamp, label, cpu, ram, netInKB, netOutKB, qps, errorRate, avgMs, p95Ms });
  }

  return data;
}

/* -------------------------------------------------------------------------- */
/* 1. Network In/Out Area Chart                                               */
/* -------------------------------------------------------------------------- */
export const NetworkChart: React.FC<{ timeRange: TimeRange; status?: SystemStatus }> = ({ timeRange, status }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const data = generateSeries(timeRange, status);
  const chartId = useId().replace(/:/g, '');

  const width = 500;
  const height = 180;
  const padding = { top: 15, right: 15, bottom: 25, left: 45 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const maxVal = Math.max(...data.map(d => Math.max(d.netInKB, d.netOutKB)), 100) * 1.15;

  const getX = (i: number) => padding.left + (i / (data.length - 1)) * innerW;
  const getY = (val: number) => padding.top + innerH - (val / maxVal) * innerH;

  const pointsIn = data.map((d, i) => `${getX(i)},${getY(d.netInKB)}`).join(' ');
  const areaIn = `${padding.left},${padding.top + innerH} ${pointsIn} ${padding.left + innerW},${padding.top + innerH}`;

  const pointsOut = data.map((d, i) => `${getX(i)},${getY(d.netOutKB)}`).join(' ');
  const areaOut = `${padding.left},${padding.top + innerH} ${pointsOut} ${padding.left + innerW},${padding.top + innerH}`;

  const hoveredData = hoverIndex !== null ? data[hoverIndex] : null;
  const formatSpeed = (kb: number) => (kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB/s` : `${Math.round(kb)} KB/s`);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            <span className="text-muted-foreground font-medium">In:</span>
            <span className="font-mono font-bold text-foreground">
              {hoveredData ? formatSpeed(hoveredData.netInKB) : formatSpeed(data[data.length - 1].netInKB)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
            <span className="text-muted-foreground font-medium">Out:</span>
            <span className="font-mono font-bold text-foreground">
              {hoveredData ? formatSpeed(hoveredData.netOutKB) : formatSpeed(data[data.length - 1].netOutKB)}
            </span>
          </div>
        </div>
      </div>

      <div className="relative flex-1 w-full min-h-[160px]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" onMouseLeave={() => setHoverIndex(null)}>
          <defs>
            <linearGradient id={`netInGrad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id={`netOutGrad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {[0, 0.5, 1].map((ratio) => {
            const y = padding.top + innerH * (1 - ratio);
            const val = maxVal * ratio;
            return (
              <g key={ratio}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="stroke-border/60" strokeDasharray="3 3" />
                <text x={padding.left - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[9px] font-mono">
                  {val >= 1024 ? `${(val / 1024).toFixed(1)}M` : `${Math.round(val)}K`}
                </text>
              </g>
            );
          })}

          {data.filter((_, idx) => idx % Math.ceil(data.length / 5) === 0).map((d) => {
            const idx = data.indexOf(d);
            return (
              <text key={idx} x={getX(idx)} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[9px] font-mono">
                {d.label}
              </text>
            );
          })}

          <polygon points={areaIn} fill={`url(#netInGrad-${chartId})`} />
          <polyline points={pointsIn} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          <polygon points={areaOut} fill={`url(#netOutGrad-${chartId})`} />
          <polyline points={pointsOut} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {data.map((d, i) => (
            <rect
              key={i}
              x={getX(i) - innerW / (data.length * 2)}
              y={padding.top}
              width={innerW / data.length}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
            />
          ))}

          {hoverIndex !== null && (
            <g>
              <line x1={getX(hoverIndex)} y1={padding.top} x2={getX(hoverIndex)} y2={padding.top + innerH} className="stroke-foreground/40" strokeDasharray="2 2" />
              <circle cx={getX(hoverIndex)} cy={getY(data[hoverIndex].netInKB)} r="4" fill="#10b981" stroke="#fff" strokeWidth="1.5" />
              <circle cx={getX(hoverIndex)} cy={getY(data[hoverIndex].netOutKB)} r="4" fill="#3b82f6" stroke="#fff" strokeWidth="1.5" />
            </g>
          )}
        </svg>

        {hoveredData && hoverIndex !== null && (
          <div
            className="absolute pointer-events-none z-10 bg-popover/95 backdrop-blur-sm border border-border rounded-md px-2.5 py-1.5 shadow-md text-xs space-y-0.5"
            style={{
              left: `${Math.min(Math.max(10, (getX(hoverIndex) / width) * 100), 75)}%`,
              top: '10px',
            }}
          >
            <div className="text-[10px] text-muted-foreground font-mono">{hoveredData.label}</div>
            <div className="flex items-center justify-between gap-3 text-emerald-500 font-mono font-semibold">
              <span>In:</span> <span>{formatSpeed(hoveredData.netInKB)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-blue-500 font-mono font-semibold">
              <span>Out:</span> <span>{formatSpeed(hoveredData.netOutKB)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 2. Realtime CPU & RAM Dual Area Trend Chart (%)                             */
/* -------------------------------------------------------------------------- */
export const CpuRamChart: React.FC<{ timeRange: TimeRange; status?: SystemStatus }> = ({ timeRange, status }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const data = generateSeries(timeRange, status);
  const chartId = useId().replace(/:/g, '');

  const width = 500;
  const height = 180;
  const padding = { top: 15, right: 15, bottom: 25, left: 35 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const getX = (i: number) => padding.left + (i / (data.length - 1)) * innerW;
  const getY = (val: number) => padding.top + innerH - (val / 100) * innerH;

  const pointsCpu = data.map((d, i) => `${getX(i)},${getY(d.cpu)}`).join(' ');
  const areaCpu = `${padding.left},${padding.top + innerH} ${pointsCpu} ${padding.left + innerW},${padding.top + innerH}`;

  const pointsRam = data.map((d, i) => `${getX(i)},${getY(d.ram)}`).join(' ');
  const areaRam = `${padding.left},${padding.top + innerH} ${pointsRam} ${padding.left + innerW},${padding.top + innerH}`;

  const hoveredData = hoverIndex !== null ? data[hoverIndex] : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />
            <span className="text-muted-foreground font-medium">CPU:</span>
            <span className="font-mono font-bold text-foreground">
              {hoveredData ? `${hoveredData.cpu}%` : `${data[data.length - 1].cpu}%`}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            <span className="text-muted-foreground font-medium">RAM:</span>
            <span className="font-mono font-bold text-foreground">
              {hoveredData ? `${hoveredData.ram}%` : `${data[data.length - 1].ram}%`}
            </span>
          </div>
        </div>
      </div>

      <div className="relative flex-1 w-full min-h-[160px]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" onMouseLeave={() => setHoverIndex(null)}>
          <defs>
            <linearGradient id={`cpuGrad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id={`ramGrad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {[0, 25, 50, 75, 100].map((val) => {
            const y = getY(val);
            return (
              <g key={val}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="stroke-border/60" strokeDasharray="3 3" />
                <text x={padding.left - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[9px] font-mono">
                  {val}%
                </text>
              </g>
            );
          })}

          {data.filter((_, idx) => idx % Math.ceil(data.length / 5) === 0).map((d) => {
            const idx = data.indexOf(d);
            return (
              <text key={idx} x={getX(idx)} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[9px] font-mono">
                {d.label}
              </text>
            );
          })}

          <polygon points={areaRam} fill={`url(#ramGrad-${chartId})`} />
          <polyline points={pointsRam} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          <polygon points={areaCpu} fill={`url(#cpuGrad-${chartId})`} />
          <polyline points={pointsCpu} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {data.map((d, i) => (
            <rect
              key={i}
              x={getX(i) - innerW / (data.length * 2)}
              y={padding.top}
              width={innerW / data.length}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
            />
          ))}

          {hoverIndex !== null && (
            <g>
              <line x1={getX(hoverIndex)} y1={padding.top} x2={getX(hoverIndex)} y2={padding.top + innerH} className="stroke-foreground/40" strokeDasharray="2 2" />
              <circle cx={getX(hoverIndex)} cy={getY(data[hoverIndex].cpu)} r="4" fill="#6366f1" stroke="#fff" strokeWidth="1.5" />
              <circle cx={getX(hoverIndex)} cy={getY(data[hoverIndex].ram)} r="4" fill="#f59e0b" stroke="#fff" strokeWidth="1.5" />
            </g>
          )}
        </svg>

        {hoveredData && hoverIndex !== null && (
          <div
            className="absolute pointer-events-none z-10 bg-popover/95 backdrop-blur-sm border border-border rounded-md px-2.5 py-1.5 shadow-md text-xs space-y-0.5"
            style={{
              left: `${Math.min(Math.max(10, (getX(hoverIndex) / width) * 100), 75)}%`,
              top: '10px',
            }}
          >
            <div className="text-[10px] text-muted-foreground font-mono">{hoveredData.label}</div>
            <div className="flex items-center justify-between gap-3 text-indigo-500 font-mono font-semibold">
              <span>CPU Load:</span> <span>{hoveredData.cpu}%</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-amber-500 font-mono font-semibold">
              <span>RAM Used:</span> <span>{hoveredData.ram}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. Storage Breakdown Chart                                                 */
/* -------------------------------------------------------------------------- */
export const StorageBreakdownChart: React.FC<{ status?: SystemStatus }> = ({ status }) => {
  const [hoverSegment, setHoverSegment] = useState<string | null>(null);

  const dbBytes = status?.totalDatabaseStorageBytes ?? 0;
  const walBytes = Math.round(dbBytes * 0.15);
  const pureDbBytes = Math.max(0, dbBytes - walBytes);
  const mediaBytes = status?.mediaStorageBytes ?? 0;
  const backupBytes = status?.backupStorageBytes ?? 0;

  const total = pureDbBytes + walBytes + mediaBytes + backupBytes;

  const segments = [
    { id: 'databases', name: 'Databases', bytes: pureDbBytes, color: '#3b82f6' },
    { id: 'wal', name: 'WAL Files', bytes: walBytes, color: '#06b6d4' },
    { id: 'media', name: 'Media Files', bytes: mediaBytes, color: '#10b981' },
    { id: 'backups', name: 'Backups', bytes: backupBytes, color: '#a855f7' },
  ];

  const cx = 100;
  const cy = 100;
  const outerR = 75;
  const innerR = 50;

  let accumulatedAngle = 0;
  const arcSegments = segments.map((seg) => {
    const fraction = total > 0 ? seg.bytes / total : 0.25;
    const angle = fraction * 2 * Math.PI;

    const startAngle = accumulatedAngle;
    const endAngle = accumulatedAngle + angle;
    accumulatedAngle += angle;

    const x1Out = cx + outerR * Math.cos(startAngle - Math.PI / 2);
    const y1Out = cy + outerR * Math.sin(startAngle - Math.PI / 2);
    const x2Out = cx + outerR * Math.cos(endAngle - Math.PI / 2);
    const y2Out = cy + outerR * Math.sin(endAngle - Math.PI / 2);

    const x1In = cx + innerR * Math.cos(endAngle - Math.PI / 2);
    const y1In = cy + innerR * Math.sin(endAngle - Math.PI / 2);
    const x2In = cx + innerR * Math.cos(startAngle - Math.PI / 2);
    const y2In = cy + innerR * Math.sin(startAngle - Math.PI / 2);

    const largeArc = angle > Math.PI ? 1 : 0;

    const d = [
      `M ${x1Out} ${y1Out}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2Out} ${y2Out}`,
      `L ${x1In} ${y1In}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2In} ${y2In}`,
      'Z',
    ].join(' ');

    const percent = Math.round(fraction * 100);
    return { ...seg, d, percent };
  });

  const activeSeg = arcSegments.find((s) => s.id === hoverSegment);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 h-full">
      <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
        <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible">
          {arcSegments.map((seg) => {
            const isHovered = hoverSegment === seg.id;
            return (
              <path
                key={seg.id}
                d={seg.d}
                fill={seg.color}
                opacity={hoverSegment ? (isHovered ? 1 : 0.45) : 0.9}
                className="transition-all duration-200 cursor-pointer stroke-background stroke-2"
                onMouseEnter={() => setHoverSegment(seg.id)}
                onMouseLeave={() => setHoverSegment(null)}
              />
            );
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
            {activeSeg ? activeSeg.name : 'Total Storage'}
          </span>
          <span className="text-sm font-bold text-foreground font-mono">
            {activeSeg ? formatBytes(activeSeg.bytes) : formatBytes(total)}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {activeSeg ? `${activeSeg.percent}%` : '100%'}
          </span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2 text-xs">
        {arcSegments.map((seg) => {
          const isHovered = hoverSegment === seg.id;
          return (
            <div
              key={seg.id}
              onMouseEnter={() => setHoverSegment(seg.id)}
              onMouseLeave={() => setHoverSegment(null)}
              className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                isHovered
                  ? 'bg-accent border-border shadow-sm scale-[1.02]'
                  : 'bg-muted/30 border-transparent hover:border-border'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                <span className="font-medium text-foreground truncate">{seg.name}</span>
              </div>
              <div className="flex items-center gap-2 font-mono shrink-0 text-[11px]">
                <span className="text-muted-foreground">{seg.percent}%</span>
                <strong className="text-foreground">{formatBytes(seg.bytes)}</strong>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 4. Request Volume & Error Rate Timeline                                    */
/* -------------------------------------------------------------------------- */
export const RequestVolumeChart: React.FC<{ timeRange: TimeRange; status?: SystemStatus }> = ({ timeRange, status }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const data = generateSeries(timeRange, status);

  const width = 500;
  const height = 180;
  const padding = { top: 15, right: 40, bottom: 25, left: 35 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const maxQps = Math.max(...data.map((d) => d.qps), 20) * 1.15;
  const maxErr = 10;

  const getX = (i: number) => padding.left + (i / (data.length - 1)) * innerW;
  const getYQps = (val: number) => padding.top + innerH - (val / maxQps) * innerH;
  const getYErr = (val: number) => padding.top + innerH - (val / maxErr) * innerH;

  const pointsErr = data.map((d, i) => `${getX(i)},${getYErr(d.errorRate)}`).join(' ');
  const hoveredData = hoverIndex !== null ? data[hoverIndex] : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-blue-500 inline-block" />
            <span className="text-muted-foreground font-medium font-medium">QPS:</span>
            <span className="font-mono font-bold text-foreground">
              {hoveredData ? hoveredData.qps : data[data.length - 1].qps} req/s
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
            <span className="text-muted-foreground font-medium font-medium">Error Rate:</span>
            <span className="font-mono font-bold text-red-500">
              {hoveredData ? `${hoveredData.errorRate}%` : `${data[data.length - 1].errorRate}%`}
            </span>
          </div>
        </div>
      </div>

      <div className="relative flex-1 w-full min-h-[160px]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" onMouseLeave={() => setHoverIndex(null)}>
          {[0, 0.5, 1].map((ratio) => {
            const y = padding.top + innerH * (1 - ratio);
            const valQps = Math.round(maxQps * ratio);
            const valErr = Math.round(maxErr * ratio);
            return (
              <g key={ratio}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="stroke-border/60" strokeDasharray="3 3" />
                <text x={padding.left - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[9px] font-mono">
                  {valQps}
                </text>
                <text x={width - padding.right + 6} y={y + 3} textAnchor="start" className="fill-red-400 text-[9px] font-mono">
                  {valErr}%
                </text>
              </g>
            );
          })}

          {data.filter((_, idx) => idx % Math.ceil(data.length / 5) === 0).map((d) => {
            const idx = data.indexOf(d);
            return (
              <text key={idx} x={getX(idx)} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[9px] font-mono">
                {d.label}
              </text>
            );
          })}

          {data.map((d, i) => {
            const barW = Math.max(3, (innerW / data.length) * 0.6);
            const x = getX(i) - barW / 2;
            const y = getYQps(d.qps);
            const barH = padding.top + innerH - y;
            const isHovered = hoverIndex === i;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx="1"
                className={`transition-colors ${isHovered ? 'fill-blue-400' : 'fill-blue-500/70'}`}
              />
            );
          })}

          <polyline points={pointsErr} fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 2" strokeLinecap="round" />

          {data.map((d, i) => (
            <rect
              key={i}
              x={getX(i) - innerW / (data.length * 2)}
              y={padding.top}
              width={innerW / data.length}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
            />
          ))}

          {hoverIndex !== null && (
            <g>
              <line x1={getX(hoverIndex)} y1={padding.top} x2={getX(hoverIndex)} y2={padding.top + innerH} className="stroke-foreground/40" strokeDasharray="2 2" />
              <circle cx={getX(hoverIndex)} cy={getYErr(data[hoverIndex].errorRate)} r="4" fill="#ef4444" stroke="#fff" strokeWidth="1.5" />
            </g>
          )}
        </svg>

        {hoveredData && hoverIndex !== null && (
          <div
            className="absolute pointer-events-none z-10 bg-popover/95 backdrop-blur-sm border border-border rounded-md px-2.5 py-1.5 shadow-md text-xs space-y-0.5"
            style={{
              left: `${Math.min(Math.max(10, (getX(hoverIndex) / width) * 100), 75)}%`,
              top: '10px',
            }}
          >
            <div className="text-[10px] text-muted-foreground font-mono">{hoveredData.label}</div>
            <div className="flex items-center justify-between gap-3 text-blue-500 font-mono font-semibold">
              <span>QPS:</span> <span>{hoveredData.qps} req/s</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-red-500 font-mono font-semibold">
              <span>Error Rate:</span> <span>{hoveredData.errorRate}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 5. Query Latency Distribution (Avg ms & P95 ms)                           */
/* -------------------------------------------------------------------------- */
export const QueryLatencyChart: React.FC<{ timeRange: TimeRange; status?: SystemStatus }> = ({ timeRange, status }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const data = generateSeries(timeRange, status);
  const chartId = useId().replace(/:/g, '');

  const width = 500;
  const height = 180;
  const padding = { top: 15, right: 15, bottom: 25, left: 35 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const maxMs = Math.max(...data.map((d) => d.p95Ms), 5) * 1.2;

  const getX = (i: number) => padding.left + (i / (data.length - 1)) * innerW;
  const getY = (val: number) => padding.top + innerH - (val / maxMs) * innerH;

  const pointsAvg = data.map((d, i) => `${getX(i)},${getY(d.avgMs)}`).join(' ');
  const pointsP95 = data.map((d, i) => `${getX(i)},${getY(d.p95Ms)}`).join(' ');

  const reverseAvg = data.slice().reverse().map((d, i) => `${getX(data.length - 1 - i)},${getY(d.avgMs)}`).join(' ');
  const bandArea = `${pointsP95} ${reverseAvg}`;

  const hoveredData = hoverIndex !== null ? data[hoverIndex] : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 inline-block" />
            <span className="text-muted-foreground font-medium">Avg Latency:</span>
            <span className="font-mono font-bold text-foreground">
              {hoveredData ? `${hoveredData.avgMs} ms` : `${data[data.length - 1].avgMs} ms`}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
            <span className="text-muted-foreground font-medium">P95 Latency:</span>
            <span className="font-mono font-bold text-purple-500">
              {hoveredData ? `${hoveredData.p95Ms} ms` : `${data[data.length - 1].p95Ms} ms`}
            </span>
          </div>
        </div>
      </div>

      <div className="relative flex-1 w-full min-h-[160px]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" onMouseLeave={() => setHoverIndex(null)}>
          <defs>
            <linearGradient id={`latBandGrad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {[0, 0.5, 1].map((ratio) => {
            const y = padding.top + innerH * (1 - ratio);
            const val = (maxMs * ratio).toFixed(1);
            return (
              <g key={ratio}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} className="stroke-border/60" strokeDasharray="3 3" />
                <text x={padding.left - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[9px] font-mono">
                  {val}ms
                </text>
              </g>
            );
          })}

          {data.filter((_, idx) => idx % Math.ceil(data.length / 5) === 0).map((d) => {
            const idx = data.indexOf(d);
            return (
              <text key={idx} x={getX(idx)} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[9px] font-mono">
                {d.label}
              </text>
            );
          })}

          <polygon points={bandArea} fill={`url(#latBandGrad-${chartId})`} />
          <polyline points={pointsP95} fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={pointsAvg} fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {data.map((d, i) => (
            <rect
              key={i}
              x={getX(i) - innerW / (data.length * 2)}
              y={padding.top}
              width={innerW / data.length}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
            />
          ))}

          {hoverIndex !== null && (
            <g>
              <line x1={getX(hoverIndex)} y1={padding.top} x2={getX(hoverIndex)} y2={padding.top + innerH} className="stroke-foreground/40" strokeDasharray="2 2" />
              <circle cx={getX(hoverIndex)} cy={getY(data[hoverIndex].p95Ms)} r="4" fill="#a855f7" stroke="#fff" strokeWidth="1.5" />
              <circle cx={getX(hoverIndex)} cy={getY(data[hoverIndex].avgMs)} r="4" fill="#06b6d4" stroke="#fff" strokeWidth="1.5" />
            </g>
          )}
        </svg>

        {hoveredData && hoverIndex !== null && (
          <div
            className="absolute pointer-events-none z-10 bg-popover/95 backdrop-blur-sm border border-border rounded-md px-2.5 py-1.5 shadow-md text-xs space-y-0.5"
            style={{
              left: `${Math.min(Math.max(10, (getX(hoverIndex) / width) * 100), 75)}%`,
              top: '10px',
            }}
          >
            <div className="text-[10px] text-muted-foreground font-mono">{hoveredData.label}</div>
            <div className="flex items-center justify-between gap-3 text-cyan-500 font-mono font-semibold">
              <span>Avg Latency:</span> <span>{hoveredData.avgMs} ms</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-purple-500 font-mono font-semibold">
              <span>P95 Latency:</span> <span>{hoveredData.p95Ms} ms</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
