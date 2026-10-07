import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../src/server/index.js';
import { getMetadataDb } from '../src/server/db/metadata.js';
import { config } from '../src/server/config/index.js';
import { databaseService } from '../src/server/services/database.js';
import { storageService } from '../src/server/services/storage.js';

describe('Storage Foreign Key & Metadata Integrity Suite', () => {
  let app: any;
  let adminCookie: string;
  const runId = Date.now();
  const createdDbIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Ensure admin authentication session
    const setupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: `storage_admin_${runId}`,
        password: 'AdminPassword123!',
        confirmPassword: 'AdminPassword123!',
      },
    });

    if (setupRes.statusCode === 201) {
      const cookie = setupRes.cookies.find((c: any) => c.name === 'vdb_session');
      adminCookie = `vdb_session=${cookie.value}`;
    } else {
      let loginRes = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: process.env.VDB_ADMIN_USERNAME || 'VanillaDatabase',
          password: process.env.VDB_ADMIN_PASSWORD || '123456',
        },
      });

      if (loginRes.statusCode !== 200) {
        loginRes = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: {
            username: 'admin_test',
            password: 'SuperSecretPassword123!',
          },
        });
      }

      const cookie = loginRes.cookies.find((c: any) => c.name === 'vdb_session');
      adminCookie = `vdb_session=${cookie.value}`;
    }
  });

  afterAll(async () => {
    for (const dbId of createdDbIds) {
      try { databaseService.deleteDatabase(dbId); } catch {}
      try { storageService.deleteDatabaseFiles(dbId); } catch {}
    }
    if (app) {
      await app.close();
    }
  });

  function createMultipartPayload(filename: string, content: string | Buffer, metadata?: string) {
    const boundary = '----WebKitFormBoundaryFKTest123456';
    let body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n${content}\r\n`;
    if (metadata !== undefined) {
      body += `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${metadata}\r\n`;
    }
    body += `--${boundary}--\r\n`;
    return {
      contentType: `multipart/form-data; boundary=${boundary}`,
      payload: body,
    };
  }

  it('should return HTTP 404 when uploading to a non-existent database ID instead of 500 FK error', async () => {
    const nonExistentDbId = 'db_non_existent_fk_test_9999';
    const { contentType, payload } = createMultipartPayload('test_image.png', 'PNG_TEST_CONTENT');

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${nonExistentDbId}/files`,
      headers: {
        cookie: adminCookie,
        'content-type': contentType,
      },
      payload,
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('DATABASE_NOT_FOUND');
    expect(body.error.message).toContain(nonExistentDbId);

    // Verify no orphaned directory or file was created on disk
    const storageDir = path.resolve(config.storageDir, nonExistentDbId);
    if (fs.existsSync(storageDir)) {
      const files = fs.readdirSync(storageDir);
      expect(files.length).toBe(0);
    }
  });

  it('should return HTTP 400 when database ID format is invalid', async () => {
    const invalidId = 'bad-id-with-special!@#$';
    const { contentType, payload } = createMultipartPayload('test.png', 'DATA');

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${encodeURIComponent(invalidId)}/files`,
      headers: {
        cookie: adminCookie,
        'content-type': contentType,
      },
      payload,
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_DATABASE_ID');
  });

  it('should successfully upload file to valid database, normalize empty metadata to null, and pass FK checks', async () => {
    const db = databaseService.createDatabase(`FK Test DB ${runId}`, 'Testing foreign key constraints');
    createdDbIds.push(db.id);

    const { contentType, payload } = createMultipartPayload('avatar.png', 'FAKE_AVATAR_IMAGE_BYTES', '   ');

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${db.id}/files`,
      headers: {
        cookie: adminCookie,
        'content-type': contentType,
      },
      payload,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.database_id).toBe(db.id);
    expect(body.data.original_name).toBe('avatar.png');
    // Metadata was whitespace-only -> must be normalized to null
    expect(body.data.metadata).toBeNull();

    // Verify metadata DB files record
    const metaDb = getMetadataDb();
    const fileRow = metaDb.prepare('SELECT * FROM files WHERE id = ?').get(body.data.id) as any;
    expect(fileRow).toBeDefined();
    expect(fileRow.database_id).toBe(db.id);
    expect(fileRow.metadata).toBeNull();

    // Strict PRAGMA foreign_key_check must pass with 0 violations
    const fkViolations = metaDb.prepare('PRAGMA foreign_key_check(files);').all();
    expect(fkViolations.length).toBe(0);

    // Verify encrypted file on disk
    const storedPath = storageService.getStoragePath(db.id, fileRow.filename);
    expect(fs.existsSync(storedPath)).toBe(true);
  });

  it('should auto-register parent database row when tenant SQLite exists on disk (worker node simulation)', async () => {
    const workerDbId = `db_disk_worker_${runId}`;
    createdDbIds.push(workerDbId);

    // Manually create .sqlite file on disk without central metadata entry
    const dbFilePath = path.resolve(config.databasesDir, `${workerDbId}.sqlite`);
    const directDb = new DatabaseSync(dbFilePath);
    directDb.exec('CREATE TABLE test_table (id INTEGER PRIMARY KEY, title TEXT);');
    directDb.close();

    const metaDb = getMetadataDb();
    // Ensure parent row is NOT present in databases table
    metaDb.prepare('DELETE FROM databases WHERE id = ?').run(workerDbId);
    const checkBefore = metaDb.prepare('SELECT id FROM databases WHERE id = ?').get(workerDbId);
    expect(checkBefore).toBeUndefined();

    // Upload file to disk-only database
    const { contentType, payload } = createMultipartPayload('disk_doc.pdf', 'SAMPLE_PDF_BYTES', '{"category":"docs"}');

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/databases/${workerDbId}/files`,
      headers: {
        cookie: adminCookie,
        'content-type': contentType,
      },
      payload,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.database_id).toBe(workerDbId);
    expect(body.data.metadata).toBe('{"category":"docs"}');

    // Verify parent row was auto-registered in databases table
    const checkAfter = metaDb.prepare('SELECT id FROM databases WHERE id = ?').get(workerDbId);
    expect(checkAfter).toBeDefined();

    // Strict foreign key check must pass
    const fkViolations = metaDb.prepare('PRAGMA foreign_key_check(files);').all();
    expect(fkViolations.length).toBe(0);
  });

  it('should reject and clean up orphaned files in storageService.createFile when database does not exist', () => {
    const fakeDbId = `db_create_orphan_test_${runId}`;
    const fakeBuffer = Buffer.from('TEST_BUFFER_CONTENT_123');

    expect(() => {
      storageService.createFile({
        databaseId: fakeDbId,
        originalName: 'test.dat',
        mimeType: 'application/octet-stream',
        buffer: fakeBuffer,
      });
    }).toThrowError(/not found/i);

    // Verify no files on disk
    const targetDir = path.resolve(config.storageDir, fakeDbId);
    if (fs.existsSync(targetDir)) {
      const files = fs.readdirSync(targetDir);
      expect(files.length).toBe(0);
    }
  });

  it('should reject and clean up in storageService.saveStreamFile when database does not exist', async () => {
    const fakeDbId = `db_stream_orphan_test_${runId}`;
    const stream = Readable.from([Buffer.from('CHUNK_1'), Buffer.from('CHUNK_2')]);

    await expect(storageService.saveStreamFile({
      databaseId: fakeDbId,
      originalName: 'stream_test.bin',
      mimeType: 'application/octet-stream',
      stream,
    })).rejects.toThrowError(/not found/i);

    // Verify no files on disk
    const targetDir = path.resolve(config.storageDir, fakeDbId);
    if (fs.existsSync(targetDir)) {
      const files = fs.readdirSync(targetDir);
      expect(files.length).toBe(0);
    }
  });
});
