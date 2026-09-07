import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { nanoid } from 'nanoid';
import { config } from '../config/index.js';
import { getMetadataDb } from '../db/metadata.js';
import { encryptBuffer, decryptBuffer, isEncryptedFile } from '../utils/crypto.js';
import type { FileRecord } from '../../../shared/index.ts';

export class StorageService {
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
    const metaDb = getMetadataDb();
    const id = `file_${nanoid(16)}`;
    const ext = path.extname(params.originalName || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 16);
    const filename = `${id}${ext}`;
    const filePath = this.getStoragePath(params.databaseId, filename);

    const maxSizeBytes = (config.maxImportMb || 1024) * 1024 * 1024;
    let totalBytes = 0;
    const chunks: Buffer[] = [];
    const hash = crypto.createHash('sha256');

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
        params.originalName,
        params.mimeType || 'application/octet-stream',
        sizeBytes,
        checksum,
        params.metadata || null,
        now,
        now
      );

      return {
        id,
        database_id: params.databaseId,
        filename,
        original_name: params.originalName,
        mime_type: params.mimeType || 'application/octet-stream',
        size_bytes: sizeBytes,
        checksum,
        metadata: params.metadata || null,
        created_at: now,
        updated_at: now,
      };
    } catch (err) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {}
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
    const metaDb = getMetadataDb();
    const id = `file_${nanoid(16)}`;
    const ext = path.extname(params.originalName);
    const filename = `${id}${ext}`;

    const filePath = this.getStoragePath(params.databaseId, filename);
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
      params.originalName,
      params.mimeType || 'application/octet-stream',
      sizeBytes,
      checksum,
      params.metadata || null,
      now,
      now
    );

    return {
      id,
      database_id: params.databaseId,
      filename,
      original_name: params.originalName,
      mime_type: params.mimeType || 'application/octet-stream',
      size_bytes: sizeBytes,
      checksum,
      metadata: params.metadata || null,
      created_at: now,
      updated_at: now,
    };
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
    const row = metaDb.prepare('SELECT * FROM files WHERE database_id = ? AND (filename = ? OR original_name = ?)').get(databaseId, filename, filename) as any;
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
