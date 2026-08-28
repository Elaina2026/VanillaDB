import React from 'react';

export const LogoIcon: React.FC<{ className?: string; size?: number }> = ({ className = 'w-6 h-6', size }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      className={className}
      style={size ? { width: size, height: size } : undefined}
      fill="none"
    >
      <defs>
        {/* Background Gradient */}
        <linearGradient id="vdbBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>

        {/* Cylinder Primary Gradient (Blue to Cyan) */}
        <linearGradient id="vdbCylinderGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>

        {/* Top disk highlight */}
        <linearGradient id="vdbTopDiskGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>

        {/* Bolt Gradient */}
        <linearGradient id="vdbBoltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#93c5fd" />
        </linearGradient>
      </defs>

      {/* Rounded App Icon Background */}
      <rect width="512" height="512" rx="112" fill="url(#vdbBgGrad)" stroke="#334155" strokeWidth="12" />

      {/* Ambient Glow */}
      <ellipse cx="256" cy="260" rx="140" ry="140" fill="#3b82f6" opacity="0.25" />

      {/* Layer 3 (Bottom Disc) */}
      <g transform="translate(0, 110)">
        <path d="M 146 220 A 110 38 0 0 0 366 220 V 265 A 110 38 0 0 1 146 265 Z" fill="url(#vdbCylinderGrad)" stroke="#1e40af" strokeWidth="4" />
        <ellipse cx="256" cy="220" rx="110" ry="38" fill="#1e3a8a" stroke="#3b82f6" strokeWidth="3" />
      </g>

      {/* Layer 2 (Middle Disc) */}
      <g transform="translate(0, 55)">
        <path d="M 146 220 A 110 38 0 0 0 366 220 V 265 A 110 38 0 0 1 146 265 Z" fill="url(#vdbCylinderGrad)" stroke="#1e40af" strokeWidth="4" />
        <ellipse cx="256" cy="220" rx="110" ry="38" fill="#1e3a8a" stroke="#3b82f6" strokeWidth="3" />
      </g>

      {/* Layer 1 (Top Disc) */}
      <g transform="translate(0, 0)">
        <path d="M 146 220 A 110 38 0 0 0 366 220 V 265 A 110 38 0 0 1 146 265 Z" fill="url(#vdbCylinderGrad)" stroke="#1e40af" strokeWidth="4" />
        <ellipse cx="256" cy="220" rx="110" ry="38" fill="url(#vdbTopDiskGrad)" stroke="#93c5fd" strokeWidth="6" />
      </g>

      {/* Central Realtime Spark / V */}
      <path
        d="M 230 160 L 270 215 L 245 225 L 285 295 L 245 235 L 270 225 Z"
        fill="url(#vdbBoltGrad)"
        stroke="#ffffff"
        strokeWidth="4"
        strokeLinejoin="round"
      />

      {/* Orbital Data Particles */}
      <circle cx="160" cy="180" r="10" fill="#38bdf8" />
      <circle cx="355" cy="205" r="9" fill="#60a5fa" />
      <circle cx="330" cy="380" r="11" fill="#38bdf8" />
      <circle cx="170" cy="360" r="9" fill="#818cf8" />
    </svg>
  );
};
