import React from 'react';
import logoUrl from '../assets/logo.svg';

export const LogoIcon: React.FC<{ className?: string; size?: number }> = ({
  className = 'w-6 h-6',
  size,
}) => {
  return (
    <img
      src={logoUrl}
      alt="VanillaDatabase Logo"
      className={className}
      style={size ? { width: size, height: size } : undefined}
      draggable={false}
    />
  );
};
