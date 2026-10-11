import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/server/index.js';
import { authService } from '../src/server/services/auth.js';
import { getMetadataDb } from '../src/server/db/metadata.js';
import { config } from '../src/server/config/index.js';
import { detectImageMagicBytes, AVATAR_MAX_BYTES } from '../src/server/api/auth.js';
import path from 'path';
import fs from 'fs';

describe('Task 2: Internal Binary Avatar Pipeline Suite', () => {
  let app: any;
  let adminCookie: string;
  let adminUserId: string;
  const avatarsDir = path.join(config.storageDir, 'avatars');

  beforeAll(async () => {
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });

    // Retrieve system admin user
    const metaDb = getMetadataDb();
    const adminUser = metaDb.prepare("SELECT * FROM users WHERE role IN ('super_admin', 'system_owner')").get() as any;
    if (adminUser) {
      adminUserId = adminUser.id;
      const { cookieValue } = authService.generateSessionCookie(adminUser, config.sessionSecret);
      adminCookie = `vdb_session=${cookieValue}`;
    }
  });

  afterAll(async () => {
    // Clean up test avatars for admin user
    if (adminUserId) {
      for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
        const filePath = path.join(avatarsDir, `${adminUserId}.${ext}`);
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch {}
        }
      }
    }
    await app.close();
  });

  describe('1. Binary Magic Byte Validation', () => {
    it('should correctly detect PNG, JPEG, and WebP signatures', () => {
      // PNG: 89 50 4E 47 0D 0A 1A 0A
      const pngBuf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
      expect(detectImageMagicBytes(pngBuf)).toBe('image/png');

      // JPEG: FF D8 FF
      const jpegBuf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
      expect(detectImageMagicBytes(jpegBuf)).toBe('image/jpeg');

      // WebP: RIFF ... WEBP
      const webpBuf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
      expect(detectImageMagicBytes(webpBuf)).toBe('image/webp');
    });

    it('should reject text, SVG, HTML, GIF and arbitrary data', () => {
      const svgBuf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      expect(detectImageMagicBytes(svgBuf)).toBeNull();

      const htmlBuf = Buffer.from('<!DOCTYPE html><html><body><h1>test</h1></body></html>');
      expect(detectImageMagicBytes(htmlBuf)).toBeNull();

      const gifBuf = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00');
      expect(detectImageMagicBytes(gifBuf)).toBeNull();

      const emptyBuf = Buffer.alloc(10);
      expect(detectImageMagicBytes(emptyBuf)).toBeNull();
    });
  });

  describe('2. POST /api/auth/profile/avatar Upload', () => {
    it('should reject unauthenticated upload requests with 401', async () => {
      const pngPayload = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
      const boundary = '----BoundaryNoAuth';
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="avatar.png"\r\nContent-Type: image/png\r\n\r\n`),
        pngPayload,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/profile/avatar',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(res.statusCode).toBe(401);
    });

    it('should successfully upload valid PNG avatar and return internal URL', async () => {
      const pngPayload = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
      const boundary = '----BoundaryValidPng';
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="avatar.png"\r\nContent-Type: image/png\r\n\r\n`),
        pngPayload,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/profile/avatar',
        headers: {
          cookie: adminCookie,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.avatar_url).toBe(`/api/auth/avatar/${adminUserId}`);
      expect(json.data.mime_type).toBe('image/png');

      // Verify file written to disk
      const diskPath = path.join(avatarsDir, `${adminUserId}.png`);
      expect(fs.existsSync(diskPath)).toBe(true);
    });

    it('should reject file with invalid magic bytes (fake image) with 415', async () => {
      const fakePayload = Buffer.from('NOT_A_REAL_IMAGE_DATA_CONTENT_HERE_XYZ');
      const boundary = '----BoundaryFakeImg';
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="fake.png"\r\nContent-Type: image/png\r\n\r\n`),
        fakePayload,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/profile/avatar',
        headers: {
          cookie: adminCookie,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(res.statusCode).toBe(415);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('should reject oversized avatar uploads (>10MB) with 413', async () => {
      // Create chunk buffer exceeding 10MB
      const oversizedChunk = Buffer.alloc(11 * 1024 * 1024, 0x41);
      const boundary = '----BoundaryHuge';
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="huge.png"\r\nContent-Type: image/png\r\n\r\n`),
        oversizedChunk,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/profile/avatar',
        headers: {
          cookie: adminCookie,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(res.statusCode).toBe(413);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('FILE_TOO_LARGE');
    });
  });

  describe('3. GET /api/auth/avatar/:userId Serving', () => {
    it('should serve avatar with nosniff, CSP sandbox, and caching headers', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/auth/avatar/${adminUserId}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
      expect(res.headers['cache-control']).toContain('public');
    });

    it('should return 404 for non-existent avatar', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/avatar/usr_non_existent_99999',
      });

      expect(res.statusCode).toBe(404);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('AVATAR_NOT_FOUND');
    });
  });

  describe('4. DELETE /api/auth/profile/avatar Deletion', () => {
    it('should delete avatar file and reset DB column', async () => {
      const delRes = await app.inject({
        method: 'DELETE',
        url: '/api/auth/profile/avatar',
        headers: {
          cookie: adminCookie,
        },
      });

      expect(delRes.statusCode).toBe(200);
      const json = JSON.parse(delRes.payload);
      expect(json.success).toBe(true);

      // Verify file deleted from disk
      const diskPath = path.join(avatarsDir, `${adminUserId}.png`);
      expect(fs.existsSync(diskPath)).toBe(false);

      // Verify subsequent GET returns 404
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/auth/avatar/${adminUserId}`,
      });
      expect(getRes.statusCode).toBe(404);
    });
  });

  describe('5. PUT /api/auth/profile Validation Guards', () => {
    it('should reject new external avatar URL with EXTERNAL_AVATAR_DISALLOWED', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/auth/profile',
        headers: {
          cookie: adminCookie,
        },
        payload: {
          avatar_url: 'https://evil.tracker.com/pixel.png',
        },
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('EXTERNAL_AVATAR_DISALLOWED');
    });

    it('should reject new base64 data URI avatar with EXTERNAL_AVATAR_DISALLOWED', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/auth/profile',
        headers: {
          cookie: adminCookie,
        },
        payload: {
          avatar_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        },
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('EXTERNAL_AVATAR_DISALLOWED');
    });

    it('should accept internal avatar path (/api/auth/avatar/...)', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/auth/profile',
        headers: {
          cookie: adminCookie,
        },
        payload: {
          avatar_url: `/api/auth/avatar/${adminUserId}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
    });
  });
});
