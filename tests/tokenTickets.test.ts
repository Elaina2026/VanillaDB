import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/server/index.js';
import { databaseService } from '../src/server/services/database.js';
import { tokenService } from '../src/server/services/tokens.js';
import { ticketService } from '../src/server/services/tickets.js';
import { sanitizeUrl } from '../src/server/utils/logger.js';

describe('Task 1: Query Token Restriction & One-Time Tickets Suite', () => {
  let app: any;
  let serverPort: number;
  let testDbId: string;
  let otherDbId: string;
  let testToken: string;
  const runId = Date.now();

  beforeAll(async () => {
    app = await buildApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    serverPort = (app.server.address() as any).port;

    // Create databases & tokens
    const db = databaseService.createDatabase(`TokenTicketDB_${runId}`);
    testDbId = db.id;

    const otherDb = databaseService.createDatabase(`TokenTicketOtherDB_${runId}`);
    otherDbId = otherDb.id;

    const { plainSecret } = await tokenService.createToken({
      databaseId: testDbId,
      name: 'Ticket Test Token',
      permissions: ['database:read', 'database:write', 'database:admin'],
      rateLimit: 0,
    });
    testToken = plainSecret;
  });

  afterAll(async () => {
    try { databaseService.deleteDatabase(testDbId); } catch {}
    try { databaseService.deleteDatabase(otherDbId); } catch {}
    await app.close();
  });

  describe('1. Log and URL Redaction', () => {
    it('should redact both token and ticket query parameters in URLs', () => {
      const urlWithToken = '/v1/databases/db_123/query?token=secret123&foo=bar';
      const sanitizedToken = sanitizeUrl(urlWithToken);
      expect(sanitizedToken).toContain('token=[REDACTED]');
      expect(sanitizedToken).not.toContain('secret123');
      expect(sanitizedToken).toContain('foo=bar');

      const urlWithTicket = '/v1/databases/db_123/realtime?ticket=vdb_ticket_abc123&sse=1';
      const sanitizedTicket = sanitizeUrl(urlWithTicket);
      expect(sanitizedTicket).toContain('ticket=[REDACTED]');
      expect(sanitizedTicket).not.toContain('vdb_ticket_abc123');
      expect(sanitizedTicket).toContain('sse=1');
    });
  });

  describe('2. Query Token Deprecation and Rejection', () => {
    it('should reject ?token= on mutation and query routes with QUERY_TOKEN_NOT_PERMITTED', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/databases/${testDbId}/query?token=${testToken}`,
        payload: { sql: 'SELECT 1 as num' },
      });

      expect(res.statusCode).toBe(401);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('QUERY_TOKEN_NOT_PERMITTED');
    });

    it('should accept Authorization: Bearer <token> on query routes without issue', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/databases/${testDbId}/query`,
        headers: {
          authorization: `Bearer ${testToken}`,
        },
        payload: { sql: 'SELECT 1 as num' },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
    });

    it('should strictly reject ?token= with 401 QUERY_TOKEN_NOT_PERMITTED on media/stream routes', async () => {
      const res = await fetch(`http://127.0.0.1:${serverPort}/v1/databases/${testDbId}/realtime?token=${testToken}`);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('QUERY_TOKEN_NOT_PERMITTED');
    });
  });

  describe('3. One-Time Ticket Service & API Endpoints', () => {
    it('should issue a short-lived one-time ticket via POST /v1/databases/:id/tickets', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/databases/${testDbId}/tickets`,
        headers: {
          authorization: `Bearer ${testToken}`,
        },
        payload: {
          route: 'realtime',
          ttl_seconds: 60,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.ticket).toMatch(/^vdb_ticket_/);
      expect(json.data.expiresInSeconds).toBe(60);
      expect(json.data.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should successfully consume ticket on GET /v1/databases/:id/realtime?ticket=...', async () => {
      // 1. Issue ticket
      const ticketRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${testDbId}/tickets`,
        headers: {
          authorization: `Bearer ${testToken}`,
        },
        payload: {
          route: 'realtime',
          ttl_seconds: 60,
        },
      });
      const ticket = JSON.parse(ticketRes.payload).data.ticket;

      // 2. Consume ticket on realtime SSE endpoint
      const controller = new AbortController();
      const streamRes = await fetch(`http://127.0.0.1:${serverPort}/v1/databases/${testDbId}/realtime?ticket=${ticket}`, {
        signal: controller.signal,
      });

      expect(streamRes.status).toBe(200);
      expect(streamRes.headers.get('content-type')).toContain('text/event-stream');
      controller.abort();

      // 3. Replay attack: try consuming the exact same ticket a second time -> MUST FAIL
      const replayRes = await fetch(`http://127.0.0.1:${serverPort}/v1/databases/${testDbId}/realtime?ticket=${ticket}`);
      expect(replayRes.status).toBe(401);
      const replayJson = await replayRes.json();
      expect(replayJson.success).toBe(false);
      expect(replayJson.error.code).toBe('INVALID_OR_EXPIRED_TICKET');
    });

    it('should reject ticket if consumed on wrong database (Scope Isolation)', async () => {
      // 1. Issue ticket for testDbId
      const ticketRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${testDbId}/tickets`,
        headers: {
          authorization: `Bearer ${testToken}`,
        },
        payload: {
          route: 'realtime',
        },
      });
      const ticket = JSON.parse(ticketRes.payload).data.ticket;

      // 2. Attempt to use on otherDbId
      const crossDbRes = await app.inject({
        method: 'GET',
        url: `/v1/databases/${otherDbId}/realtime?ticket=${ticket}`,
      });

      expect(crossDbRes.statusCode).toBe(401);
      const json = JSON.parse(crossDbRes.payload);
      expect(json.success).toBe(false);
    });

    it('should reject ticket if route scope does not match', async () => {
      // 1. Issue ticket restricted to 'storage'
      const ticketRes = await app.inject({
        method: 'POST',
        url: `/v1/databases/${testDbId}/tickets`,
        headers: {
          authorization: `Bearer ${testToken}`,
        },
        payload: {
          route: 'storage',
        },
      });
      const ticket = JSON.parse(ticketRes.payload).data.ticket;

      // 2. Try to consume on realtime route
      const mismatchRes = await app.inject({
        method: 'GET',
        url: `/v1/databases/${testDbId}/realtime?ticket=${ticket}`,
      });

      expect(mismatchRes.statusCode).toBe(401);
      const json = JSON.parse(mismatchRes.payload);
      expect(json.success).toBe(false);
    });
  });
});
