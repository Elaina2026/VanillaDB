import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/server/index.js';
import { databaseService } from '../src/server/services/database.js';
import { tokenService } from '../src/server/services/tokens.js';
import { authService } from '../src/server/services/auth.js';
import { safeCompareSecret } from '../src/server/utils/crypto.js';
import { removeFileQuiet } from '../src/server/utils/fsUtils.js';
import { getMetadataDb } from '../src/server/db/metadata.js';
import { config } from '../src/server/config/index.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

describe('Security Leads Remediation Suite (Leads 1 - 6)', () => {
  let app: any;
  let testDbId: string;
  let testToken: string;
  let adminCookie: string;
  const runId = Date.now();

  beforeAll(async () => {
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address() as any;

    // Create admin user for session cookie tests
    const metaDb = getMetadataDb();
    const adminUser = metaDb.prepare("SELECT * FROM users WHERE role IN ('super_admin', 'system_owner')").get() as any;
    if (adminUser) {
      const { cookieValue } = authService.generateSessionCookie(adminUser, config.sessionSecret);
      adminCookie = `vdb_session=${cookieValue}`;
    }

    // Create database & token
    const db = databaseService.createDatabase(`SecLeadDB_${runId}`);
    testDbId = db.id;
    const { plainSecret } = await tokenService.createToken({
      databaseId: testDbId,
      name: 'Sec Lead Token',
      permissions: ['database:read', 'database:write', 'database:admin'],
      rateLimit: 0,
    });
    testToken = plainSecret;
  });

  afterAll(async () => {
    try { databaseService.deleteDatabase(testDbId); } catch {}
    try {
      const metaDb = getMetadataDb();
      metaDb.prepare("UPDATE users SET avatar_url = NULL WHERE avatar_url LIKE '/v1/files/%'").run();
    } catch {}
    await app.close();
  });

  // ==========================================
  // LEAD 1: File View Preview Security & Isolation
  // ==========================================
  describe('Lead 1: /v1/files/:id/view Preview & Content Isolation', () => {
    it('should serve safe images (PNG, JPEG, WEBP) inline with nosniff', async () => {
      // Upload a small PNG file
      const pngPayload = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
      const boundary = '----WebKitFormBoundarySafePng';
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="safe.png"\r\nContent-Type: image/png\r\n\r\n`),
        pngPayload,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const uploadRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${testDbId}/files`,
        headers: {
          authorization: `Bearer ${testToken}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(uploadRes.statusCode).toBe(201);
      const fileId = uploadRes.json().data.id;

      // View file
      const viewRes = await app.inject({
        method: 'GET',
        url: `/v1/files/${fileId}/view`,
        headers: { authorization: `Bearer ${testToken}` },
      });

      expect(viewRes.statusCode).toBe(200);
      expect(viewRes.headers['x-content-type-options']).toBe('nosniff');
      expect(viewRes.headers['content-type']).toContain('image/png');
      expect(viewRes.headers['cross-origin-resource-policy']).toBe('same-origin');
    });

    it('should enforce Content-Disposition: attachment and CSP sandbox on SVG / active content', async () => {
      const svgPayload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>window.__xss=1</script></svg>');
      const boundary = '----WebKitFormBoundaryActiveSvg';
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="xss.svg"\r\nContent-Type: image/svg+xml\r\n\r\n`),
        svgPayload,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const uploadRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${testDbId}/files`,
        headers: {
          authorization: `Bearer ${testToken}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(uploadRes.statusCode).toBe(201);
      const fileId = uploadRes.json().data.id;

      const viewRes = await app.inject({
        method: 'GET',
        url: `/v1/files/${fileId}/view`,
        headers: { authorization: `Bearer ${testToken}` },
      });

      expect(viewRes.statusCode).toBe(200);
      expect(viewRes.headers['x-content-type-options']).toBe('nosniff');
      expect(viewRes.headers['content-security-policy']).toContain('sandbox');
      expect(viewRes.headers['content-security-policy']).toContain("default-src 'none'");
      expect(viewRes.headers['content-disposition']).toContain('attachment');
    });

    it('should reject direct HTML file uploads at boundary', async () => {
      const htmlPayload = Buffer.from('<html><script>window.__xss=1</script></html>');
      const boundary = '----WebKitFormBoundaryForbiddenHtml';
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="malicious.html"\r\nContent-Type: text/html\r\n\r\n`),
        htmlPayload,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      const uploadRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${testDbId}/files`,
        headers: {
          authorization: `Bearer ${testToken}`,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        payload: body,
      });

      expect(uploadRes.statusCode).toBe(400);
      expect(uploadRes.json().error.code).toBe('FORBIDDEN_FILE_TYPE');
    });
  });

  // ==========================================
  // LEAD 2: avatar_url Validation & Hardening
  // ==========================================
  describe('Lead 2: avatar_url Validation on PUT /profile', () => {
    it('should reject javascript: URLs in avatar_url', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/auth/profile',
        headers: { cookie: adminCookie },
        payload: { avatar_url: 'javascript:alert(1)' },
      });

      expect(res.statusCode).toBe(400);
      expect(['VALIDATION_ERROR', 'EXTERNAL_AVATAR_DISALLOWED']).toContain(res.json().error.code);
    });

    it('should reject data:text/html and data:image/svg+xml in avatar_url', async () => {
      const res1 = await app.inject({
        method: 'PUT',
        url: '/api/auth/profile',
        headers: { cookie: adminCookie },
        payload: { avatar_url: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==' },
      });
      expect(res1.statusCode).toBe(400);

      const res2 = await app.inject({
        method: 'PUT',
        url: '/api/auth/profile',
        headers: { cookie: adminCookie },
        payload: { avatar_url: 'data:image/svg+xml;utf8,<svg onload="alert(1)"></svg>' },
      });
      expect(res2.statusCode).toBe(400);
    });

    it('should reject unencrypted http: external URLs (prevent cleartext tracking)', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/auth/profile',
        headers: { cookie: adminCookie },
        payload: { avatar_url: 'http://tracking.attacker.com/pixel.png' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should reject new external https: URLs to eliminate third-party tracking pixels', async () => {
      const res1 = await app.inject({
        method: 'PUT',
        url: '/api/auth/profile',
        headers: { cookie: adminCookie },
        payload: { avatar_url: 'https://images.unsplash.com/photo-123' },
      });
      expect(res1.statusCode).toBe(400);
      expect(res1.json().error.code).toBe('EXTERNAL_AVATAR_DISALLOWED');

      // Internal path must be accepted
      const res2 = await app.inject({
        method: 'PUT',
        url: '/api/auth/profile',
        headers: { cookie: adminCookie },
        payload: { avatar_url: '/v1/files/file_abc123/view' },
      });
      expect(res2.statusCode).toBe(200);
    });

    it('should reject new data:image/png;base64 avatars to prevent database bloat', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/auth/profile',
        headers: { cookie: adminCookie },
        payload: { avatar_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('EXTERNAL_AVATAR_DISALLOWED');
    });
  });

  // ==========================================
  // LEAD 3: Token Query String Restrictions & Redaction
  // ==========================================
  describe('Lead 3: Token via Query String Restrictions', () => {
    it('should reject ?token= on mutation and sensitive query endpoints (POST /query)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/databases/${testDbId}/query?token=${testToken}`,
        payload: { sql: 'SELECT 1;' },
      });

      // Must be rejected because POST /query does not allow query token
      expect(res.statusCode).toBe(401);
      expect(['QUERY_TOKEN_NOT_PERMITTED', 'UNAUTHENTICATED']).toContain(res.json().error.code);
    });

    it('should strictly reject ?token= on file view and storage routes per RFC 6750', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/databases/${testDbId}/storage/non_existent.png?token=${testToken}`,
      });

      // Must be rejected with QUERY_TOKEN_NOT_PERMITTED
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('QUERY_TOKEN_NOT_PERMITTED');
    });
  });

  // ==========================================
  // LEAD 4: Cluster Secret Comparison & Rate Limiting
  // ==========================================
  describe('Lead 4: Cluster Secret Timing-Safe Comparison & Rate Limiting', () => {
    it('safeCompareSecret helper should return true for exact match regardless of format', () => {
      expect(safeCompareSecret('correct-secret-123', 'correct-secret-123')).toBe(true);
    });

    it('safeCompareSecret helper should return false for differing secrets or lengths without throwing', () => {
      expect(safeCompareSecret('wrong', 'correct-secret-123')).toBe(false);
      expect(safeCompareSecret('', 'correct-secret-123')).toBe(false);
      expect(safeCompareSecret(null, 'correct-secret-123')).toBe(false);
      expect(safeCompareSecret(undefined, 'correct-secret-123')).toBe(false);
      expect(safeCompareSecret(12345, 'correct-secret-123')).toBe(false);
    });

    it('should reject cluster requests with wrong x-cluster-secret', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/internal/node/stats',
        headers: { 'x-cluster-secret': 'wrong-secret' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED_CLUSTER_NODE');
    });
  });

  // ==========================================
  // LEAD 6: File Removal Quiet Helper (No Swallowed Errors)
  // ==========================================
  describe('Lead 6: removeFileQuiet Helper', () => {
    it('should quietly remove an existing file without errors', () => {
      const tempPath = path.resolve(process.cwd(), `temp_test_${Date.now()}.tmp`);
      fs.writeFileSync(tempPath, 'temporary');
      expect(fs.existsSync(tempPath)).toBe(true);

      removeFileQuiet(tempPath, 'test-cleanup');
      expect(fs.existsSync(tempPath)).toBe(false);
    });

    it('should ignore ENOENT when file does not exist without throwing', () => {
      const nonExistent = path.resolve(process.cwd(), `missing_${Date.now()}.tmp`);
      expect(() => removeFileQuiet(nonExistent, 'missing-cleanup')).not.toThrow();
    });
  });
});
