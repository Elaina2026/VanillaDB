import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { nanoid } from 'nanoid';
import { config } from '../config/index.js';
import { getMetadataDb } from '../db/metadata.js';
import { encryptBuffer, decryptBuffer, isEncryptedFile } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import type { FileRecord } from '../../../shared/index.ts';

export class StorageService {
  public ensureDatabaseExists(databaseId: string): boolean {
    if (!databaseId || typeof databaseId !== 'string') return false;
    const safeId = databaseId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeId) return false;

    const metaDb = getMetadataDb();
    const existing = metaDb.prepare('SELECT id FROM databases WHERE id = ?').get(safeId) as { id: string } | undefined;
    if (existing) return true;

    // Direct disk check: on worker storage nodes, tenant databases exist on disk without central metadata
    const dbPath = path.resolve(config.databasesDir, `${safeId}.sqlite`);
    if (fs.existsSync(dbPath)) {
      try {
        const now = Date.now();
        metaDb.prepare(`
          INSERT OR IGNORE INTO databases (id, name, slug, description, filename, max_size_mb, owner_id, node_id, created_at, updated_at, last_accessed_at)
          VALUES (?, ?, ?, NULL, ?, NULL, NULL, ?, ?, ?, ?)
        `).run(safeId, safeId, safeId, `${safeId}.sqlite`, config.nodeId || 'local', now, now, now);
        return true;
      } catch (err) {
        logger.warn({ err, databaseId: safeId }, 'Failed to auto-register disk database into metadata databases table');
      }
    }

    return false;
  }

  public getStoragePath(databaseId: string, filename?: string): string {
    if (!databaseId || typeof databaseId !== 'string') {
      throw new Error('Database ID is required for storage path');
    }
    const sanitizedDbId = databaseId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!sanitizedDbId) {
      throw new Error('Invalid database ID for storage path');
    }
    const storageRoot = path.resolve(config.storageDir);
    const dbDir = path.resolve(storageRoot, sanitizedDbId);

    if (dbDir !== storageRoot && !dbDir.startsWith(storageRoot + path.sep)) {
      throw new Error('Invalid database storage directory path traversal');
    }

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    if (filename) {
      const sanitizedFilename = path.basename(filename);
      if (!sanitizedFilename || sanitizedFilename === '.' || sanitizedFilename === '..') {
        throw new Error('Invalid filename for storage path');
      }
      const filePath = path.resolve(dbDir, sanitizedFilename);
      if (filePath !== dbDir && !filePath.startsWith(dbDir + path.sep)) {
        throw new Error('Invalid file path traversal');
      }
      return filePath;
    }

    return dbDir;
  }

  public async saveStreamFile(params: {
    databaseId: string;
    originalName: string;
    mimeType: string;
    stream: Readable;
    metadata?: string | null;
  }): Promise<FileRecord> {
    if (!this.ensureDatabaseExists(params.databaseId)) {
      const err = new Error(`Database "${params.databaseId}" not found`);
      (err as any).code = 'DATABASE_NOT_FOUND';
      (err as any).statusCode = 404;
      throw err;
    }

    const metaDb = getMetadataDb();
    const id = `file_${nanoid(16)}`;
    const ext = path.extname(params.originalName || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 16);
    const filename = `${id}${ext}`;
    const filePath = this.getStoragePath(params.databaseId, filename);

    const maxSizeBytes = (config.maxImportMb || 1024) * 1024 * 1024;
    let totalBytes = 0;
    const chunks: Buffer[] = [];
    const hash = crypto.createHash('sha256');

    const normalizedMetadata = typeof params.metadata === 'string' && params.metadata.trim() !== ''
      ? params.metadata.trim()
      : null;
    const normalizedMimeType = params.mimeType && params.mimeType.trim()
      ? params.mimeType.trim()
      : 'application/octet-stream';
    const normalizedOriginalName = params.originalName && params.originalName.trim()
      ? params.originalName.trim()
      : filename;

    try {
      await new Promise<void>((resolve, reject) => {
        const onData = (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > maxSizeBytes) {
            params.stream.destroy(new Error(`File exceeds maximum upload size limit`));
            reject(new Error(`File exceeds maximum upload size limit`));
            return;
          }
          chunks.push(chunk);
          hash.update(chunk);
        };
        const onEnd = () => resolve();
        const onError = (err: any) => reject(err);
        const onClose = () => {
          if (totalBytes === 0 && chunks.length === 0) {
            reject(new Error('Upload stream closed prematurely'));
          } else {
            resolve();
          }
        };

        params.stream.on('data', onData);
        params.stream.once('end', onEnd);
        params.stream.once('error', onError);
        params.stream.once('close', onClose);
      });

      const plainBuffer = Buffer.concat(chunks);
      chunks.length = 0; // release individual chunks to GC immediately
      const sizeBytes = plainBuffer.length;
      const checksum = hash.digest('hex');

      // Encrypt at rest
      const encryptedBuffer = encryptBuffer(plainBuffer);
      fs.writeFileSync(filePath, encryptedBuffer);

      const now = Date.now();

      metaDb.prepare(`
        INSERT INTO files (id, database_id, filename, original_name, mime_type, size_bytes, checksum, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        params.databaseId,
        filename,
        normalizedOriginalName,
        normalizedMimeType,
        sizeBytes,
        checksum,
        normalizedMetadata,
        now,
        now
      );

      return {
        id,
        database_id: params.databaseId,
        filename,
        original_name: normalizedOriginalName,
        mime_type: normalizedMimeType,
        size_bytes: sizeBytes,
        checksum,
        metadata: normalizedMetadata,
        created_at: now,
        updated_at: now,
      };
    } catch (err: any) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {}

      if (err.code === 'ERR_SQLITE_ERROR' && (err.errcode === 787 || err.message?.includes('FOREIGN KEY constraint failed'))) {
        err.code = 'DATABASE_NOT_FOUND';
        err.statusCode = 404;
      }
      logger.error({ err, databaseId: params.databaseId, filename }, 'Failed to save stream file in storageService');
      throw err;
    }
  }

  public createFile(params: {
    databaseId: string;
    originalName: string;
    mimeType: string;
    buffer: Buffer;
    metadata?: string | null;
  }): FileRecord {
    if (!this.ensureDatabaseExists(params.databaseId)) {
      const err = new Error(`Database "${params.databaseId}" not found`);
      (err as any).code = 'DATABASE_NOT_FOUND';
      (err as any).statusCode = 404;
      throw err;
    }

    const metaDb = getMetadataDb();
    const id = `file_${nanoid(16)}`;
    const ext = path.extname(params.originalName || '');
    const filename = `${id}${ext}`;

    const normalizedMetadata = typeof params.metadata === 'string' && params.metadata.trim() !== ''
      ? params.metadata.trim()
      : null;
    const normalizedMimeType = params.mimeType && params.mimeType.trim()
      ? params.mimeType.trim()
      : 'application/octet-stream';
    const normalizedOriginalName = params.originalName && params.originalName.trim()
      ? params.originalName.trim()
      : filename;

    let filePath: string | null = null;
    try {
      filePath = this.getStoragePath(params.databaseId, filename);
      const encrypted = encryptBuffer(params.buffer);
      fs.writeFileSync(filePath, encrypted);

      const checksum = crypto.createHash('sha256').update(params.buffer).digest('hex');
      const sizeBytes = params.buffer.length;
      const now = Date.now();

      metaDb.prepare(`
        INSERT INTO files (id, database_id, filename, original_name, mime_type, size_bytes, checksum, metadata, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        params.databaseId,
        filename,
        normalizedOriginalName,
        normalizedMimeType,
        sizeBytes,
        checksum,
        normalizedMetadata,
        now,
        now
      );

      return {
        id,
        database_id: params.databaseId,
        filename,
        original_name: normalizedOriginalName,
        mime_type: normalizedMimeType,
        size_bytes: sizeBytes,
        checksum,
        metadata: normalizedMetadata,
        created_at: now,
        updated_at: now,
      };
    } catch (err: any) {
      if (filePath && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }

      if (err.code === 'ERR_SQLITE_ERROR' && (err.errcode === 787 || err.message?.includes('FOREIGN KEY constraint failed'))) {
        err.code = 'DATABASE_NOT_FOUND';
        err.statusCode = 404;
      }
      logger.error({ err, databaseId: params.databaseId, filename }, 'Failed to create file in storageService');
      throw err;
    }
  }

  public listFiles(databaseId: string): FileRecord[] {
    const metaDb = getMetadataDb();
    return metaDb.prepare('SELECT * FROM files WHERE database_id = ? ORDER BY created_at DESC').all(databaseId) as any[];
  }

  public getFile(fileId: string): FileRecord | null {
    const metaDb = getMetadataDb();
    const row = metaDb.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as any;
    return row || null;
  }

  public getFileByFilename(databaseId: string, filename: string): FileRecord | null {
    const metaDb = getMetadataDb();
    const row = metaDb.prepare('SELECT * FROM files WHERE database_id = ? AND (id = ? OR filename = ? OR original_name = ?)').get(databaseId, filename, filename, filename) as any;
    return row || null;
  }

  public deleteFile(fileId: string): boolean {
    const metaDb = getMetadataDb();
    const file = this.getFile(fileId);
    if (!file) return false;

    const filePath = this.getStoragePath(file.database_id, file.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch {}
    }

    metaDb.prepare('DELETE FROM files WHERE id = ?').run(fileId);
    return true;
  }

  public deleteDatabaseFiles(databaseId: string): void {
    if (!databaseId || typeof databaseId !== 'string') return;
    const sanitizedDbId = databaseId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!sanitizedDbId) return;
    const storageRoot = path.resolve(config.storageDir);
    const dbDir = path.resolve(storageRoot, sanitizedDbId);

    if (dbDir !== storageRoot && dbDir.startsWith(storageRoot + path.sep) && fs.existsSync(dbDir)) {
      try {
        fs.rmSync(dbDir, { recursive: true, force: true });
      } catch {}
    }
  }
}

export const storageService = new StorageService();
