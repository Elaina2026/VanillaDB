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
    const dbDir = path.resolve(config.storageDir, sanitizedDbId);
    const storageRoot = path.resolve(config.storageDir);

    if (!dbDir.startsWith(storageRoot)) {
      throw new Error('Invalid database storage directory path traversal');
    }

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    if (filename) {
      const sanitizedFilename = path.basename(filename);
      const filePath = path.resolve(dbDir, sanitizedFilename);
      if (!filePath.startsWith(dbDir)) {
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
    const ext = path.extname(params.originalName);
    const filename = `${id}${ext}`;
    const filePath = this.getStoragePath(params.databaseId, filename);

    const chunks: Buffer[] = [];
    params.stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    await new Promise((resolve, reject) => {
      params.stream.on('end', resolve);
      params.stream.on('error', reject);
    });

    const plainBuffer = Buffer.concat(chunks);
    const sizeBytes = plainBuffer.length;
    const checksum = crypto.createHash('sha256').update(plainBuffer).digest('hex');

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
    const sanitizedDbId = databaseId.replace(/[^a-zA-Z0-9_-]/g, '');
    const storageRoot = path.resolve(config.storageDir);
    const dbDir = path.resolve(config.storageDir, sanitizedDbId);

    if (dbDir.startsWith(storageRoot) && dbDir !== storageRoot && fs.existsSync(dbDir)) {
      try {
        fs.rmSync(dbDir, { recursive: true, force: true });
      } catch {}
    }
  }
}

export const storageService = new StorageService();
