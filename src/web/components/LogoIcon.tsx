import React from 'react';

export const LogoIcon: React.FC<{ className?: string; size?: number }> = ({
  className = 'w-6 h-6',
  size,
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      className={className}
      style={size ? { width: size, height: size } : undefined}
      fill="none"
    >
      <defs>
        {/* Cyan to Royal Blue primary cylinder gradient */}
        <linearGradient id="vdbCylinderGradIcon" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0284c7" />
          <stop offset="35%" stopColor="#2563eb" />
          <stop offset="70%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>

        {/* Top disk high-contrast surface */}
        <linearGradient id="vdbTopDiskGradIcon" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>

        {/* Mid disk surface */}
        <linearGradient id="vdbMidDiskGradIcon" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>

        {/* Lightning V-Monogram Gradient */}
        <linearGradient id="vdbBoltGradIcon" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="40%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>

        {/* Ambient Glow Filter */}
        <filter id="vdbGlowFilterIcon" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="16" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Ambient Glow (Transparent Background) */}
      <ellipse cx="256" cy="270" rx="160" ry="140" fill="#2563eb" opacity="0.35" filter="url(#vdbGlowFilterIcon)" />

      {/* Layer 3: Bottom Disk */}
      <g transform="translate(0, 140)">
        <path d="M 126 180 A 130 46 0 0 0 386 180 V 235 A 130 46 0 0 1 126 235 Z" fill="url(#vdbCylinderGradIcon)" stroke="#1e40af" strokeWidth="4" strokeLinejoin="round" />
        <ellipse cx="256" cy="180" rx="130" ry="46" fill="url(#vdbMidDiskGradIcon)" stroke="#3b82f6" strokeWidth="3" />
      </g>

      {/* Layer 2: Middle Disk */}
      <g transform="translate(0, 70)">
        <path d="M 126 180 A 130 46 0 0 0 386 180 V 235 A 130 46 0 0 1 126 235 Z" fill="url(#vdbCylinderGradIcon)" stroke="#1e40af" strokeWidth="4" strokeLinejoin="round" />
        <ellipse cx="256" cy="180" rx="130" ry="46" fill="url(#vdbMidDiskGradIcon)" stroke="#3b82f6" strokeWidth="3" />
      </g>

      {/* Layer 1: Top Disk */}
      <g transform="translate(0, 0)">
        <path d="M 126 180 A 130 46 0 0 0 386 180 V 235 A 130 46 0 0 1 126 235 Z" fill="url(#vdbCylinderGradIcon)" stroke="#1e40af" strokeWidth="4" strokeLinejoin="round" />
        <ellipse cx="256" cy="180" rx="130" ry="46" fill="url(#vdbTopDiskGradIcon)" stroke="#93c5fd" strokeWidth="6" />
      </g>

      {/* Central Realtime V-Bolt Monogram */}
      <path
        d="M 226 105 L 278 180 L 246 192 L 298 290 L 244 206 L 274 194 Z"
        fill="url(#vdbBoltGradIcon)"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinejoin="round"
        filter="url(#vdbGlowFilterIcon)"
      />

      {/* Floating Data Nodes */}
      <circle cx="140" cy="140" r="10" fill="#38bdf8" filter="url(#vdbGlowFilterIcon)" />
      <circle cx="375" cy="170" r="8.5" fill="#60a5fa" filter="url(#vdbGlowFilterIcon)" />
      <circle cx="355" cy="400" r="11" fill="#38bdf8" filter="url(#vdbGlowFilterIcon)" />
      <circle cx="155" cy="380" r="9" fill="#818cf8" filter="url(#vdbGlowFilterIcon)" />
    </svg>
  );
};
