import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { config } from '../config/index.js';
import { dbManager } from '../db/manager.js';
import { authService } from '../services/auth.js';
import { activityService } from '../services/activity.js';
import { storageService } from '../services/storage.js';
import { realtimeService } from '../services/realtime.js';
import { requireTokenPermission } from '../middleware/auth.js';
import { decryptBuffer, isEncryptedFile } from '../utils/crypto.js';

function isTablePermitted(table: string, apiToken?: any): boolean {
  if (!apiToken) return true;
  const lower = table.toLowerCase();
  if (apiToken.denied_tables && Array.isArray(apiToken.denied_tables) && apiToken.denied_tables.some((t: string) => t.toLowerCase() === lower)) {
    return false;
  }
  if (apiToken.allowed_tables && Array.isArray(apiToken.allowed_tables) && apiToken.allowed_tables.length > 0) {
    return apiToken.allowed_tables.some((t: string) => t.toLowerCase() === lower);
  }
  return true;
}

export function streamFileHelper(req: FastifyRequest, reply: FastifyReply, filePath: string, mimeType: string, fileSize: number) {
  // Defensive isolation for active/executable formats (SVG, HTML, XML)
  const baseMime = (mimeType || '').split(';')[0].trim().toLowerCase();
  const safeInlineMimes = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
    'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'video/mp4', 'video/webm'
  ]);

  if (!safeInlineMimes.has(baseMime)) {
    reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
    if (baseMime === 'image/svg+xml' || baseMime === 'text/html' || baseMime.includes('xml')) {
      reply.header('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    }
  }

  const range = req.headers.range;
  const isEncrypted = isEncryptedFile(filePath);

  // If encrypted, decrypt the file into buffer for range slicing
  let fileBuffer: Buffer | null = null;
  if (isEncrypted) {
    try {
      const rawEnc = fs.readFileSync(filePath);
      fileBuffer = decryptBuffer(rawEnc);
      fileSize = fileBuffer.length;
    } catch {
      // fallback
    }
  }

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
      reply.header('Content-Range', `bytes */${fileSize}`);
      return reply.status(416).send({ success: false, error: { code: 'RANGE_NOT_SATISFIABLE', message: 'Requested range not satisfiable' } });
    }

    const chunksize = end - start + 1;

    reply.status(206);
    reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Length', chunksize);
    reply.header('Content-Type', mimeType);
    reply.header('X-Content-Type-Options', 'nosniff');

    if (fileBuffer) {
      const sliced = fileBuffer.subarray(start, end + 1);
      return reply.send(sliced);
    }

    const stream = fs.createReadStream(filePath, { start, end });
    const onClose = () => { stream.destroy(); };
    req.raw.on('close', onClose);
    req.raw.on('error', onClose);
    stream.on('close', () => {
      req.raw.off('close', onClose);
      req.raw.off('error', onClose);
    });

    return reply.send(stream);
  } else {
    reply.header('Content-Length', fileSize);
    reply.header('Content-Type', mimeType);
    reply.header('Accept-Ranges', 'bytes');
    reply.header('X-Content-Type-Options', 'nosniff');

    if (fileBuffer) {
      return reply.send(fileBuffer);
    }

    const stream = fs.createReadStream(filePath);
    const onClose = () => { stream.destroy(); };
    req.raw.on('close', onClose);
    req.raw.on('error', onClose);
    stream.on('close', () => {
      req.raw.off('close', onClose);
      req.raw.off('error', onClose);
    });

    return reply.send(stream);
  }
}

export const dataRoutes: FastifyPluginAsync = async (fastify) => {
  // Raw SQL Query API
  fastify.post('/databases/:databaseId/query', {
    preHandler: [requireTokenPermission('database:read')],
  }, async (req, reply) => {
    const databaseId = req.databaseId!;
    const token = req.apiToken;
    const sessionUser = req.adminUser;

    const Schema = z.object({
      sql: z.string().min(1),
      params: z.union([z.array(z.any()), z.record(z.any())]).optional(),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Field "sql" is required', requestId: req.id },
      });
    }

    const trimmed = parsed.data.sql.trim();
    const isSelect = /^(SELECT|WITH|EXPLAIN|PRAGMA)\b/i.test(trimmed);
    const isDdl = /^(CREATE|ALTER|DROP)\b/i.test(trimmed);

    // If writing or executing DDL with API token, enforce token scope
    let hasWrite = true;
    if (token) {
      const hasAdmin = token.permissions.includes('database:admin');
      const hasDdl = hasAdmin || token.permissions.includes('database:ddl');
      hasWrite = hasAdmin || hasDdl || token.permissions.includes('database:write');

      if (isDdl && !hasDdl) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Token does not have DDL (schema modification) permissions', requestId: req.id },
        });
      }

      if (!isSelect && !hasWrite) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Token does not have write permissions', requestId: req.id },
        });
      }
    } else if (sessionUser && sessionUser.role !== 'super_admin' && sessionUser.role !== 'admin') {
      const { databaseMembersService } = await import('../services/members.js');
      const memberRole = databaseMembersService.getUserDatabaseRole(databaseId, sessionUser.userId, sessionUser.role);
      if (memberRole === 'viewer') {
        hasWrite = false;
        if (!isSelect || isDdl) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Viewer role can only execute read-only queries (SELECT)', requestId: req.id },
          });
        }
      } else if (memberRole === 'editor') {
        if (isDdl) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Editor role cannot execute DDL queries (schema modification)', requestId: req.id },
          });
        }
      }
    }

    const startTime = performance.now();
    try {
      const result = dbManager.executeSql(databaseId, parsed.data.sql, parsed.data.params, {
        readonly: !hasWrite,
        allowedTables: token?.allowed_tables || null,
        deniedTables: token?.denied_tables || null,
      });

      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      activityService.recordActivity({
        databaseId,
        tokenId: token?.id || `admin:${sessionUser?.username || 'user'}`,
        operation: 'SQL_QUERY',
        durationMs,
        status: 'success',
        rowCount: (result as any).rowCount ?? (result as any).changes,
      });

      // Emit realtime mutation event if write statement
      if (!isSelect) {
        realtimeService.emitEvent({
          databaseId,
          type: /CREATE|ALTER|DROP/i.test(trimmed) ? 'schema' : 'update',
          data: result,
          timestamp: Date.now(),
        });
      }

      return reply.send({ success: true, data: result });
    } catch (err: any) {
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      activityService.recordActivity({
        databaseId,
        tokenId: token?.id || `admin:${sessionUser?.username || 'user'}`,
        operation: 'SQL_QUERY',
        durationMs,
        status: 'error',
        errorMessage: err.message,
      });

      return reply.status(err.statusCode || 400).send({
        success: false,
        error: {
          code: err.code || 'SQLITE_ERROR',
          message: err.message,
          requestId: req.id,
        },
      });
    }
  });

  // Batch API
  fastify.post('/databases/:databaseId/batch', {
    preHandler: [requireTokenPermission('database:write')],
  }, async (req, reply) => {
    const databaseId = req.databaseId!;
    const token = req.apiToken;
    const sessionUser = req.adminUser;

    const Schema = z.object({
      transaction: z.boolean().optional().default(true),
      statements: z.array(z.object({
        sql: z.string().min(1),
        params: z.union([z.array(z.any()), z.record(z.any())]).optional(),
      })).min(1),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_BATCH_REQUEST', message: 'Valid "statements" array required', requestId: req.id },
      });
    }

    if (token) {
      const hasAdmin = token.permissions.includes('database:admin');
      const hasDdl = hasAdmin || token.permissions.includes('database:ddl');
      for (const stmt of parsed.data.statements) {
        if (/^(CREATE|ALTER|DROP)\b/i.test(stmt.sql.trim()) && !hasDdl) {
          return reply.status(403).send({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Batch contains DDL statements but token lacks database:ddl permission', requestId: req.id },
          });
        }
      }
    } else if (sessionUser && sessionUser.role !== 'super_admin' && sessionUser.role !== 'admin') {
      const { databaseMembersService } = await import('../services/members.js');
      const memberRole = databaseMembersService.getUserDatabaseRole(databaseId, sessionUser.userId, sessionUser.role);
      if (memberRole === 'viewer') {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Viewer role cannot execute batch mutations', requestId: req.id },
        });
      }
      if (memberRole === 'editor') {
        for (const stmt of parsed.data.statements) {
          if (/^(CREATE|ALTER|DROP)\b/i.test(stmt.sql.trim())) {
            return reply.status(403).send({
              success: false,
              error: { code: 'FORBIDDEN', message: 'Editor role cannot execute DDL schema modifications', requestId: req.id },
            });
          }
        }
      }
    }

    const startTime = performance.now();
    try {
      const result = dbManager.executeBatch(databaseId, parsed.data.statements, parsed.data.transaction, {
        readonly: false,
        allowedTables: token?.allowed_tables || null,
        deniedTables: token?.denied_tables || null,
      });

      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      activityService.recordActivity({
        databaseId,
        tokenId: token?.id || `admin:${sessionUser?.username || 'user'}`,
        operation: 'BATCH_QUERY',
        durationMs,
        status: 'success',
      });

      realtimeService.emitEvent({
        databaseId,
        type: 'update',
        data: result,
        timestamp: Date.now(),
      });

      return reply.send({ success: true, data: result });
    } catch (err: any) {
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      activityService.recordActivity({
        databaseId,
        tokenId: token?.id || `admin:${sessionUser?.username || 'user'}`,
        operation: 'BATCH_QUERY',
        durationMs,
        status: 'error',
        errorMessage: err.message,
      });

      return reply.status(err.statusCode || 400).send({
        success: false,
        error: {
          code: err.code || 'BATCH_ERROR',
          message: err.message,
          requestId: req.id,
        },
      });
    }
  });

  // REST Table API (Read)
  fastify.get('/databases/:databaseId/tables/:table/rows', {
    preHandler: [requireTokenPermission('database:read')],
  }, async (req, reply) => {
    const databaseId = req.databaseId!;
    const { table } = req.params as { table: string };
    const query = req.query as any;

    const limit = Math.min(Math.max(parseInt(query.limit || '100', 10), 1), 1000);
    const offset = Math.max(parseInt(query.offset || '0', 10), 0);
    const orderBy = query.orderBy ? String(query.orderBy).replace(/[^a-zA-Z0-9_]/g, '') : null;
    const order = query.order?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // Validate table name exists in schema (fast single-query check)
    const tableInfo = dbManager.getTableInfo(databaseId, table);
    if (!tableInfo) {
      return reply.status(404).send({ success: false, error: { code: 'TABLE_NOT_FOUND', message: `Table "${table}" not found` } });
    }

    const validCols = new Set(tableInfo.columns.map(c => c.name));
    let sql = `SELECT * FROM ${dbManager.escapeIdentifier(tableInfo.name)}`;
    if (orderBy) {
      if (!validCols.has(orderBy)) {
        return reply.status(400).send({ success: false, error: { code: 'INVALID_ORDER_BY', message: `Column "${orderBy}" does not exist` } });
      }
      sql += ` ORDER BY ${dbManager.escapeIdentifier(orderBy)} ${order}`;
    }
    sql += ` LIMIT ? OFFSET ?`;

    try {
      const startTime = performance.now();
      const result = dbManager.executeSql(databaseId, sql, [limit, offset], {
        readonly: true,
        allowedTables: req.apiToken?.allowed_tables,
        deniedTables: req.apiToken?.denied_tables,
      });
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

      activityService.recordActivity({
        databaseId,
        tokenId: req.apiToken?.id || `admin:${req.adminUser?.username || 'user'}`,
        operation: `REST_SELECT:${tableInfo.name}`,
        durationMs,
        status: 'success',
        rowCount: (result as any).rowCount || ((result as any).rows || []).length,
      });

      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(err.statusCode || 400).send({
        success: false,
        error: { code: err.code || 'SQLITE_ERROR', message: err.message, requestId: req.id },
      });
    }
  });

  // REST Table API (Insert)
  fastify.post('/databases/:databaseId/tables/:table/rows', {
    preHandler: [requireTokenPermission('database:write')],
  }, async (req, reply) => {
    const databaseId = req.databaseId!;
    const { table } = req.params as { table: string };

    const tableInfo = dbManager.getTableInfo(databaseId, table);
    if (!tableInfo) {
      return reply.status(404).send({ success: false, error: { code: 'TABLE_NOT_FOUND', message: `Table "${table}" not found` } });
    }

    const row = req.body as Record<string, any>;
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'JSON object required' } });
    }

    const validCols = new Set(tableInfo.columns.map(c => c.name));
    const keys = Object.keys(row);
    if (keys.length === 0 || !keys.every(k => validCols.has(k))) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_COLUMNS', message: 'Unknown column in payload' } });
    }

    const cols = keys.map(k => dbManager.escapeIdentifier(k)).join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const values = Object.values(row);

    const sql = `INSERT INTO ${dbManager.escapeIdentifier(tableInfo.name)} (${cols}) VALUES (${placeholders})`;

    try {
      const startTime = performance.now();
      const result = dbManager.executeSql(databaseId, sql, values, {
        allowedTables: req.apiToken?.allowed_tables,
        deniedTables: req.apiToken?.denied_tables,
      });
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

      activityService.recordActivity({
        databaseId,
        tokenId: req.apiToken?.id || `admin:${req.adminUser?.username || 'user'}`,
        operation: `REST_INSERT:${tableInfo.name}`,
        durationMs,
        status: 'success',
        rowCount: 1,
      });

      realtimeService.emitEvent({
        databaseId,
        table: tableInfo.name,
        type: 'insert',
        data: { row, result },
        timestamp: Date.now(),
      });
      return reply.status(201).send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(err.statusCode || 400).send({
        success: false,
        error: { code: err.code || 'SQLITE_ERROR', message: err.message, requestId: req.id },
      });
    }
  });

  // REST Table API (Update)
  fastify.put('/databases/:databaseId/tables/:table/rows', {
    preHandler: [requireTokenPermission('database:write')],
  }, async (req, reply) => {
    const databaseId = req.databaseId!;
    const { table } = req.params as { table: string };

    const tableInfo = dbManager.getTableInfo(databaseId, table);
    if (!tableInfo) {
      return reply.status(404).send({ success: false, error: { code: 'TABLE_NOT_FOUND', message: `Table "${table}" not found` } });
    }

    const Schema = z.object({
      where: z.record(z.any()),
      values: z.record(z.any()),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'Field "where" and "values" objects required' },
      });
    }

    const { where, values } = parsed.data;
    const updateKeys = Object.keys(values);
    const whereKeys = Object.keys(where);

    if (updateKeys.length === 0) {
      return reply.status(400).send({ success: false, error: { code: 'EMPTY_UPDATE', message: 'No fields to update' } });
    }
    if (whereKeys.length === 0) {
      return reply.status(400).send({ success: false, error: { code: 'EMPTY_WHERE', message: 'Target condition required' } });
    }

    const validCols = new Set(tableInfo.columns.map(c => c.name));
    if (!updateKeys.every(k => validCols.has(k)) || !whereKeys.every(k => validCols.has(k))) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_COLUMNS', message: 'Unknown column in where/values payload' } });
    }

    const setClauses = updateKeys.map(k => `${dbManager.escapeIdentifier(k)} = ?`).join(', ');
    const whereClauses = whereKeys.map(k => `${dbManager.escapeIdentifier(k)} = ?`).join(' AND ');
    const sql = `UPDATE ${dbManager.escapeIdentifier(tableInfo.name)} SET ${setClauses} WHERE ${whereClauses}`;
    const params = [...Object.values(values), ...Object.values(where)];

    try {
      const startTime = performance.now();
      const result = dbManager.executeSql(databaseId, sql, params, {
        allowedTables: req.apiToken?.allowed_tables,
        deniedTables: req.apiToken?.denied_tables,
      });
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

      activityService.recordActivity({
        databaseId,
        tokenId: req.apiToken?.id || `admin:${req.adminUser?.username || 'user'}`,
        operation: `REST_UPDATE:${tableInfo.name}`,
        durationMs,
        status: 'success',
        rowCount: (result as any).changes || 1,
      });

      realtimeService.emitEvent({
        databaseId,
        table: tableInfo.name,
        type: 'update',
        data: { where, values, result },
        timestamp: Date.now(),
      });

      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(err.statusCode || 400).send({
        success: false,
        error: { code: err.code || 'SQLITE_ERROR', message: err.message, requestId: req.id },
      });
    }
  });

  // REST Table API (Delete)
  fastify.delete('/databases/:databaseId/tables/:table/rows', {
    preHandler: [requireTokenPermission('database:write')],
  }, async (req, reply) => {
    const databaseId = req.databaseId!;
    const { table } = req.params as { table: string };
    const query = req.query as any;

    const tableInfo = dbManager.getTableInfo(databaseId, table);
    if (!tableInfo) {
      return reply.status(404).send({ success: false, error: { code: 'TABLE_NOT_FOUND', message: `Table "${table}" not found` } });
    }

    const validCols = new Set(tableInfo.columns.map(c => c.name));
    const pkCol = tableInfo.pkCol;
    const pkVal = query[pkCol] || query.id;

    if (!pkVal) {
      return reply.status(400).send({ success: false, error: { code: 'MISSING_KEY', message: `Query parameter "${pkCol}" is required for delete` } });
    }

    if (!validCols.has(pkCol)) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_PK_COLUMN', message: `Column "${pkCol}" not found in table` } });
    }

    const sql = `DELETE FROM ${dbManager.escapeIdentifier(tableInfo.name)} WHERE ${dbManager.escapeIdentifier(pkCol)} = ?`;
    try {
      const startTime = performance.now();
      const result = dbManager.executeSql(databaseId, sql, [pkVal], {
        allowedTables: req.apiToken?.allowed_tables,
        deniedTables: req.apiToken?.denied_tables,
      });
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

      activityService.recordActivity({
        databaseId,
        tokenId: req.apiToken?.id || `admin:${req.adminUser?.username || 'user'}`,
        operation: `REST_DELETE:${tableInfo.name}`,
        durationMs,
        status: 'success',
        rowCount: (result as any).changes || 1,
      });

      realtimeService.emitEvent({
        databaseId,
        table: tableInfo.name,
        type: 'delete',
        data: { pkCol, pkVal },
        timestamp: Date.now(),
      });
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(err.statusCode || 400).send({
        success: false,
        error: { code: err.code || 'SQLITE_ERROR', message: err.message, requestId: req.id },
      });
    }
  });

  // Realtime SSE Event Stream
  fastify.get('/databases/:databaseId/realtime', {
    preHandler: async (req, reply) => {
      const queryToken = (req.query as any)?.token;
      if (queryToken && typeof queryToken === 'string' && !req.headers.authorization) {
        req.headers.authorization = `Bearer ${queryToken}`;
      }

      // Allow session cookie authentication for SSE with membership verification
      if (!req.headers.authorization && req.cookies?.vdb_session) {
        const user = authService.verifySessionCookie(req.cookies.vdb_session, config.sessionSecret);
        if (user) {
          const targetDbId = (req.params as any).databaseId;
          if (user.role !== 'super_admin' && user.role !== 'admin') {
            const { databaseMembersService } = await import('../services/members.js');
            const role = databaseMembersService.getUserDatabaseRole(targetDbId, user.userId, user.role);
            if (!role) {
              return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied: you are not a member of this database' } });
            }
          }
          req.adminUser = user;
          req.databaseId = targetDbId;
          return;
        }
      }

      return requireTokenPermission('database:read')(req, reply);
    },
  }, async (req, reply) => {
    const databaseId = req.databaseId!;
    const table = (req.query as any)?.table ? String((req.query as any).table) : undefined;

    if (table && req.apiToken && !isTablePermitted(table, req.apiToken)) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: `Access to table "${table}" is denied for this token` }
      });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    });

    reply.raw.write(`event: ping\ndata: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`);

    const pingInterval = setInterval(() => {
      reply.raw.write(`event: ping\ndata: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`);
    }, 20000);

    const unsubscribe = realtimeService.subscribe(databaseId, table, (event) => {
      if (req.apiToken && event.table && !isTablePermitted(event.table, req.apiToken)) {
        return;
      }
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });

    const cleanup = () => {
      clearInterval(pingInterval);
      unsubscribe();
    };

    req.raw.on('close', cleanup);
    reply.raw.on('close', cleanup);
    reply.raw.on('error', cleanup);
  });

  // Token Files API (List & Upload)
  fastify.get('/databases/:databaseId/files', {
    preHandler: [requireTokenPermission('database:read')],
  }, async (req, reply) => {
    const databaseId = req.databaseId!;
    const files = storageService.listFiles(databaseId);
    return reply.send({ success: true, data: files });
  });

  fastify.post('/databases/:databaseId/files', {
    preHandler: [requireTokenPermission('database:write')],
  }, async (req, reply) => {
    const databaseId = req.databaseId!;
    const data = await req.file();
    if (!data) {
      return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'Multipart file field required' } });
    }

    const ext = (data.filename || '').split('.').pop()?.toLowerCase();
    const dangerousExts = new Set(['html', 'htm', 'xhtml', 'exe', 'sh', 'bat', 'cmd', 'php', 'js', 'mjs', 'vbs']);
    if (ext && dangerousExts.has(ext)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'FORBIDDEN_FILE_TYPE', message: 'Direct executable and active script files are forbidden' }
      });
    }

    const metadata = (data.fields?.metadata as any)?.value || null;

    const fileRecord = await storageService.saveStreamFile({
      databaseId,
      originalName: data.filename,
      mimeType: data.mimetype,
      stream: data.file,
      metadata,
    });

    realtimeService.emitEvent({
      databaseId,
      type: 'insert',
      data: { file: fileRecord },
      timestamp: Date.now(),
    });

    return reply.status(201).send({ success: true, data: fileRecord });
  });

  // Token Delete File API
  fastify.delete('/databases/:databaseId/files/:fileId', {
    preHandler: [requireTokenPermission('database:write')],
  }, async (req, reply) => {
    const databaseId = req.databaseId!;
    const { fileId } = req.params as { fileId: string };
    const file = storageService.getFile(fileId);
    if (!file || file.database_id !== databaseId) {
      return reply.status(404).send({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'File not found in this database' } });
    }

    storageService.deleteFile(fileId);
    realtimeService.emitEvent({
      databaseId,
      type: 'delete',
      data: { fileId },
      timestamp: Date.now(),
    });

    return reply.send({ success: true });
  });

  // Streaming File View endpoints
  fastify.get('/files/:fileId/view', {
    preHandler: [requireTokenPermission('database:read')],
  }, async (req, reply) => {
    const { fileId } = req.params as { fileId: string };
    const file = storageService.getFile(fileId);
    if (!file) {
      return reply.status(404).send({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'File not found' } });
    }

    // Verify token belongs to this database
    if (req.databaseId && file.database_id !== req.databaseId) {
      return reply.status(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied for this database token' } });
    }

    const filePath = storageService.getStoragePath(file.database_id, file.filename);
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ success: false, error: { code: 'FILE_MISSING_DISK', message: 'File not found on disk' } });
    }

    // Defensive isolation for potentially executable active content (SVG/HTML)
    if (file.mime_type === 'image/svg+xml' || file.mime_type === 'text/html') {
      reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
    }

    return streamFileHelper(req, reply, filePath, file.mime_type, file.size_bytes);
  });

  fastify.get('/databases/:databaseId/storage/:filename', {
    preHandler: [requireTokenPermission('database:read')],
  }, async (req, reply) => {
    const { databaseId, filename } = req.params as { databaseId: string; filename: string };
    const file = storageService.getFileByFilename(databaseId, filename);
    if (!file) {
      return reply.status(404).send({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'File not found' } });
    }

    const filePath = storageService.getStoragePath(databaseId, file.filename);
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ success: false, error: { code: 'FILE_MISSING_DISK', message: 'File not found on disk' } });
    }

    return streamFileHelper(req, reply, filePath, file.mime_type, file.size_bytes);
  });
};
