import React, { useState, useRef } from 'react';
import { Key, ZoomIn, ZoomOut, RotateCcw, Table as TableIcon } from 'lucide-react';
import type { TableSchemaDetail } from '#shared/index.js';

export const ErdCanvas: React.FC<{
  schema: TableSchemaDetail[];
  onSelectTable?: (tableName: string) => void;
}> = ({ schema, onSelectTable }) => {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 30, y: 30 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const tables = schema.filter((s) => s.type === 'table');

  // Compute table card positions in 3 columns
  const cardWidth = 260;
  const colGap = 80;
  const rowGap = 50;

  const positions: Record<string, { x: number; y: number; height: number }> = {};

  tables.forEach((t, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const height = 46 + t.columns.length * 24 + 10;
    positions[t.name] = {
      x: col * (cardWidth + colGap),
      y: row * 260,
      height,
    };
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div className="relative w-full h-[600px] bg-[#09090b] border border-[#27272a] rounded-xl overflow-hidden select-none">
      {/* Zoom / Pan Controls Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 bg-[#18181b]/90 border border-[#27272a] backdrop-blur-md rounded-lg p-1.5 shadow-xl">
        <button
          onClick={() => setZoom((z) => Math.min(1.8, z + 0.15))}
          className="p-1.5 hover:bg-[#27272a] text-[#a1a1aa] hover:text-[#ffffff] rounded transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] font-mono font-bold text-[#71717a] px-1.5">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
          className="p-1.5 hover:bg-[#27272a] text-[#a1a1aa] hover:text-[#ffffff] rounded transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 30, y: 30 });
          }}
          className="p-1.5 hover:bg-[#27272a] text-[#a1a1aa] hover:text-[#ffffff] rounded transition-colors"
          title="Reset View"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      <svg
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <defs>
          <marker
            id="erd-arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#3b82f6" />
          </marker>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Foreign Key Connector Edges (Bezier Curves) */}
          {tables.flatMap((t) =>
            (t.foreignKeys || []).map((fk, fkIdx) => {
              const fromPos = positions[t.name];
              const toPos = positions[fk.table];
              if (!fromPos || !toPos) return null;

              const fromColIdx = t.columns.findIndex((c) => c.name === fk.from);
              const fromY = fromPos.y + 46 + (fromColIdx >= 0 ? fromColIdx * 24 + 12 : 12);
              const fromX = fromPos.x + cardWidth;

              const toColIdx = schema.find((s) => s.name === fk.table)?.columns.findIndex((c) => c.name === fk.to) ?? -1;
              const toY = toPos.y + 46 + (toColIdx >= 0 ? toColIdx * 24 + 12 : 12);
              const toX = toPos.x;

              const dx = Math.abs(toX - fromX) * 0.5;
              const pathD = `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`;

              return (
                <path
                  key={`${t.name}-${fkIdx}`}
                  d={pathD}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="1.8"
                  strokeDasharray="4 2"
                  markerEnd="url(#erd-arrow)"
                  className="opacity-75 hover:opacity-100 transition-opacity"
                />
              );
            })
          )}

          {/* Table Cards */}
          {tables.map((tbl) => {
            const pos = positions[tbl.name] || { x: 0, y: 0, height: 100 };
            return (
              <g
                key={tbl.name}
                transform={`translate(${pos.x}, ${pos.y})`}
                className="cursor-pointer"
                onClick={() => onSelectTable?.(tbl.name)}
              >
                {/* Card Background */}
                <rect
                  width={cardWidth}
                  height={pos.height}
                  rx="10"
                  fill="#121214"
                  stroke="#27272a"
                  strokeWidth="1.5"
                  className="hover:stroke-blue-500/70 transition-colors shadow-2xl"
                />

                {/* Table Header Banner */}
                <rect width={cardWidth} height="36" rx="10" fill="#18181b" />
                <rect y="26" width={cardWidth} height="10" fill="#18181b" />
                <line x1="0" y1="36" x2={cardWidth} y2="36" stroke="#27272a" strokeWidth="1" />

                <text x="14" y="23" fill="#60a5fa" fontSize="12" fontWeight="bold" fontFamily="monospace">
                  {tbl.name}
                </text>
                <text x={cardWidth - 14} y="23" textAnchor="end" fill="#71717a" fontSize="10" fontFamily="monospace">
                  {tbl.columns.length} cols
                </text>

                {/* Column Rows */}
                {tbl.columns.map((col, cIdx) => {
                  const cy = 46 + cIdx * 24 + 14;
                  return (
                    <g key={col.name}>
                      {col.pk ? (
                        <text x="12" y={cy} fill="#eab308" fontSize="10" fontWeight="bold">
                          PK
                        </text>
                      ) : (
                        <circle cx="16" cy={cy - 3} r="2" fill="#52525b" />
                      )}
                      <text x="36" y={cy} fill={col.pk ? '#ffffff' : '#d4d4d8'} fontSize="11" fontFamily="monospace">
                        {col.name}
                      </text>
                      <text
                        x={cardWidth - 14}
                        y={cy}
                        textAnchor="end"
                        fill="#71717a"
                        fontSize="9"
                        fontFamily="monospace"
                      >
                        {col.type || 'TEXT'}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
