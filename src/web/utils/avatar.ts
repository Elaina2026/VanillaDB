/**
 * Avatar utilities for resolving avatar source and fallback initials.
 * Supports:
 * - Internal URLs (/api/auth/avatar/:userId)
 * - Legacy external HTTPS URLs (https://...)
 * - Legacy data URIs (data:image/...)
 * - Graceful fallback initials
 */

export function getAvatarUrl(avatarUrl?: string | null): string | null {
  if (!avatarUrl || typeof avatarUrl !== 'string') return null;
  const trimmed = avatarUrl.trim();
  if (!trimmed) return null;

  // Internal path
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  // Legacy external HTTPS URL
  if (trimmed.startsWith('https://')) {
    return trimmed;
  }

  // Legacy data URI (PNG, JPEG, WebP)
  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }

  return null;
}

export function getInitials(name?: string | null): string {
  if (!name || typeof name !== 'string') return 'U';
  const clean = name.trim();
  if (!clean) return 'U';

  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0][0] || '';
    const last = parts[parts.length - 1][0] || '';
    return (first + last).toUpperCase() || 'U';
  }

  return clean.slice(0, 2).toUpperCase();
}
