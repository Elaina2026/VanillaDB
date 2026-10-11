import React, { useState } from 'react';
import { getAvatarUrl, getInitials } from '../utils/avatar.js';

export interface UserAvatarProps {
  avatarUrl?: string | null;
  username?: string | null;
  className?: string;
  imgClassName?: string;
  fallbackClassName?: string;
  title?: string;
  onClick?: () => void;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  avatarUrl,
  username,
  className = 'w-8 h-8 rounded-full overflow-hidden border border-border flex items-center justify-center font-bold text-xs shrink-0',
  imgClassName = 'w-full h-full object-cover',
  fallbackClassName = 'w-full h-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs',
  title,
  onClick,
}) => {
  const [loadFailed, setLoadFailed] = useState(false);
  const resolvedSrc = getAvatarUrl(avatarUrl);

  return (
    <div className={className} title={title} onClick={onClick}>
      {resolvedSrc && !loadFailed ? (
        <img
          src={resolvedSrc}
          alt={username || 'Avatar'}
          referrerPolicy="no-referrer"
          className={imgClassName}
          onError={() => setLoadFailed(true)}
        />
      ) : (
        <div className={fallbackClassName}>
          {getInitials(username)}
        </div>
      )}
    </div>
  );
};
