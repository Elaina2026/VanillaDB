import fs from 'fs';
import { logger } from './logger.js';

/**
 * Remove file quietly without crashing on best-effort cleanup.
 * Ignores ENOENT (file not found), but logs warnings on EBUSY, EPERM, EACCES to reveal resource leaks.
 */
export function removeFileQuiet(filePath: string, context?: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      logger.warn({ err, filePath, context }, 'Failed to remove file during cleanup');
    }
  }
}
