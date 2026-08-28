import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import fs from 'fs';
import { config } from '../config/index.js';
import { dbManager } from '../db/manager.js';
import { authService } from '../services/auth.js';
import { activityService } from '../services/activity.js';
import { storageService } from '../services/storage.js';
import { realtimeService } from '../services/realtime.js';
import { requireTokenPermission } from '../middleware/auth.js';

export function streamFileHelper(req: FastifyRequest, reply: FastifyReply, filePath: string, mimeType: string, fileSize: number) {
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
      reply.header('Content-Range', `bytes */${fileSize}`);
      return reply.status(416).send({ success: false, error: { code: 'RANGE_NOT_SATISFIABLE', message: 'Requested range not satisfiable' } });
    }

    const chunksize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });

    reply.status(206);
    reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Content-Length', chunksize);
    reply.header('Content-Type', mimeType);

    req.raw.on('close', () => {
      stream.destroy();
    });

    return reply.send(stream);
  } else {
    reply.header('Content-Length', fileSize);
    reply.header('Content-Type', mimeType);
    reply.header('Accept-Ranges', 'bytes');
    const stream = fs.createReadStream(filePath);

    req.raw.on('close', () => {
      stream.destroy();
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
    const token = req.apiToken!;

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

    // If writing, verify token has write permission
    const hasWrite = token.permissions.includes('database:admin') || token.permissions.includes('database:write') || token.permissions.includes('database:ddl');
    if (!isSelect && !hasWrite) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Token does not have write permissions', requestId: req.id },
      });
    }

    const startTime = performance.now();
    try {
      const result = dbManager.executeSql(databaseId, parsed.data.sql, parsed.data.params, {
        readonly: !hasWrite,
        allowedTables: token.allowed_tables,
        deniedTables: token.denied_tables,
      });

      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      activityService.recordActivity({
        databaseId,
        tokenId: token.id,
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
        tokenId: token.id,
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
    const token = req.apiToken!;

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

    const startTime = performance.now();
    try {
      const result = dbManager.executeBatch(databaseId, parsed.data.statements, parsed.data.transaction, {
        readonly: false,
        allowedTables: token.allowed_tables,
        deniedTables: token.denied_tables,
      });

      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      activityService.recordActivity({
        databaseId,
        tokenId: token.id,
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
        tokenId: token.id,
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

    // Validate table name exists in schema
    const schema = dbManager.getSchema(databaseId);
    const tableExists = schema.some(t => t.name === table);
    if (!tableExists) {
      return reply.status(404).send({ success: false, error: { code: 'TABLE_NOT_FOUND', message: `Table "${table}" not found` } });
    }

    let sql = `SELECT * FROM "${table}"`;
    if (orderBy) {
      sql += ` ORDER BY "${orderBy}" ${order}`;
    }
    sql += ` LIMIT ? OFFSET ?`;

    try {
      const result = dbManager.executeSql(databaseId, sql, [limit, offset]);
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

    const schema = dbManager.getSchema(databaseId);
    const tableExists = schema.some(t => t.name === table);
    if (!tableExists) {
      return reply.status(404).send({ success: false, error: { code: 'TABLE_NOT_FOUND', message: `Table "${table}" not found` } });
    }

    const row = req.body as Record<string, any>;
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'JSON object required' } });
    }

    const keys = Object.keys(row);
    if (keys.length === 0) {
      return reply.status(400).send({ success: false, error: { code: 'EMPTY_ROW', message: 'At least one column required' } });
    }

    const cols = keys.map(k => `"${k.replace(/"/g, '""')}"`).join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const values = Object.values(row);

    const sql = `INSERT INTO "${table}" (${cols}) VALUES (${placeholders})`;

    try {
      const result = dbManager.executeSql(databaseId, sql, values);
      realtimeService.emitEvent({
        databaseId,
        table,
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

  // REST Table API (Delete)
  fastify.delete('/databases/:databaseId/tables/:table/rows', {
    preHandler: [requireTokenPermission('database:write')],
  }, async (req, reply) => {
    const databaseId = req.databaseId!;
    const { table } = req.params as { table: string };
    const query = req.query as any;

    const schema = dbManager.getSchema(databaseId);
    const tableObj = schema.find(t => t.name === table);
    if (!tableObj) {
      return reply.status(404).send({ success: false, error: { code: 'TABLE_NOT_FOUND', message: `Table "${table}" not found` } });
    }

    const pkCol = tableObj.columns.find(c => c.pk === 1)?.name || 'id';
    const pkVal = query[pkCol] || query.id;

    if (!pkVal) {
      return reply.status(400).send({ success: false, error: { code: 'MISSING_KEY', message: `Query parameter "${pkCol}" is required for delete` } });
    }

    const sql = `DELETE FROM "${table}" WHERE "${pkCol}" = ?`;
    try {
      const result = dbManager.executeSql(databaseId, sql, [pkVal]);
      realtimeService.emitEvent({
        databaseId,
        table,
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

      // Allow admin session cookie authentication for SSE
      if (!req.headers.authorization && req.cookies?.vdb_session) {
        const user = authService.verifySessionCookie(req.cookies.vdb_session, config.sessionSecret);
        if (user) {
          req.adminUser = user;
          req.databaseId = (req.params as any).databaseId;
          return;
        }
      }

      return requireTokenPermission('database:read')(req, reply);
    },
  }, async (req, reply) => {
    const databaseId = req.databaseId!;
    const table = (req.query as any)?.table ? String((req.query as any).table) : undefined;

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
