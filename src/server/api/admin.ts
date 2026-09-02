import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { dbManager } from '../db/manager.js';
import { databaseService } from '../services/database.js';
import { tokenService } from '../services/tokens.js';
import { backupService } from '../services/backup.js';
import { storageService } from '../services/storage.js';
import { webhookService } from '../services/webhook.js';
import { realtimeService } from '../services/realtime.js';
import { activityService } from '../services/activity.js';
import { authService } from '../services/auth.js';
import { requireAdminAuth, requireRole } from '../middleware/auth.js';
import { SqlTranslator } from '../utils/sqlTranslator.js';
import { decryptBuffer, isEncryptedFile } from '../utils/crypto.js';
import { TokenPermissionSchema } from '../../../shared/index.js';

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireAdminAuth);

  // Databases CRUD
  fastify.get('/databases', async (req, reply) => {
    const list = databaseService.listDatabases(req.adminUser?.userId, req.adminUser?.role);
    return reply.send({ success: true, data: list });
  });

  fastify.post('/databases', async (req, reply) => {
    const Schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional().nullable(),
      maxSizeMb: z.number().int().positive().optional().nullable(),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid parameters' },
      });
    }

    try {
      const record = databaseService.createDatabase(parsed.data.name, parsed.data.description, req.adminUser?.userId, parsed.data.maxSizeMb);
      activityService.recordAudit({
        user: req.adminUser!.username,
        action: 'database.create',
        resource: record.id,
        result: 'success',
        requestId: req.id,
        details: JSON.stringify({ name: record.name, ownerId: req.adminUser?.userId }),
      });

      return reply.status(201).send({ success: true, data: record });
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: { code: 'DATABASE_CREATE_ERROR', message: err.message },
      });
    }
  });

  fastify.get('/databases/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = databaseService.getDatabase(id);
    if (!db) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Database not found' } });
    }
    const stats = databaseService.getDatabaseOverviewStats(id);
    return reply.send({ success: true, data: stats });
  });

  fastify.get('/databases/:id/storage-stats', async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = databaseService.getDatabase(id);
    if (!db) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Database not found' } });
    }
    const stats = databaseService.getDatabaseStorageStats(id);
    return reply.send({ success: true, data: stats });
  });

  fastify.get('/databases/:id/metrics', async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = databaseService.getDatabase(id);
    if (!db) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Database not found' } });
    }
    const metrics = databaseService.getDatabaseMetricsStats(id);
    return reply.send({ success: true, data: metrics });
  });

  fastify.patch('/databases/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const Schema = z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional().nullable(),
      maxSizeMb: z.number().int().positive().optional().nullable(),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } });
    }

    const updated = databaseService.updateDatabase(id, {
      name: parsed.data.name,
      description: parsed.data.description,
      max_size_mb: parsed.data.maxSizeMb,
    });
    return reply.send({ success: true, data: updated });
  });

  fastify.delete('/databases/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = databaseService.getDatabase(id);
    if (!db) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Database not found' } });
    }

    databaseService.deleteDatabase(id);
    activityService.recordAudit({
      user: req.adminUser!.username,
      action: 'database.delete',
      resource: id,
      result: 'success',
      requestId: req.id,
      details: JSON.stringify({ name: db.name }),
    });

    return reply.send({ success: true });
  });

  fastify.post('/databases/:id/clone', async (req, reply) => {
    const { id } = req.params as { id: string };
    const Schema = z.object({
      name: z.string().min(1).max(100),
    });
    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'New database name required' } });
    }

    const cloned = databaseService.duplicateDatabase(id, parsed.data.name);
    activityService.recordAudit({
      user: req.adminUser!.username,
      action: 'database.clone',
      resource: cloned.id,
      result: 'success',
      requestId: req.id,
      details: JSON.stringify({ sourceId: id, newName: cloned.name }),
    });

    return reply.status(201).send({ success: true, data: cloned });
  });

  // Schema introspection & Table explorer
  fastify.get('/databases/:id/schema', async (req, reply) => {
    const { id } = req.params as { id: string };
    const schema = dbManager.getSchema(id);
    return reply.send({ success: true, data: schema });
  });

  // Setup FTS5 Full-Text Search Virtual Table with Auto-Sync Triggers
  fastify.post('/databases/:id/fts5-setup', async (req, reply) => {
    const { id } = req.params as { id: string };
    const Schema = z.object({
      sourceTable: z.string().min(1),
      ftsTable: z.string().optional(),
      columns: z.array(z.string()).min(1),
      tokenizer: z.enum(['unicode61', 'porter', 'ascii', 'trigram']).optional(),
      createTriggers: z.boolean().optional(),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid FTS5 parameters' },
      });
    }

    try {
      const result = databaseService.setupFts5Index(id, parsed.data);
      activityService.recordAudit({
        user: req.adminUser!.username,
        action: 'database.fts5_setup',
        resource: id,
        result: 'success',
        requestId: req.id,
        details: JSON.stringify({ sourceTable: parsed.data.sourceTable, ftsTable: result.ftsTable }),
      });

      realtimeService.emitEvent({
        databaseId: id,
        type: 'schema',
        table: result.ftsTable,
        data: { action: 'fts5_setup', ...result },
        timestamp: Date.now(),
      });

      return reply.status(201).send({ success: true, data: result, message: `FTS5 virtual table "${result.ftsTable}" created successfully with sync triggers` });
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: { code: 'FTS5_SETUP_ERROR', message: err.message },
      });
    }
  });

  // Admin Table Browser rows
  fastify.get('/databases/:id/tables/:table/rows', async (req, reply) => {
    const { id, table } = req.params as { id: string; table: string };
    const query = req.query as any;

    const limit = Math.min(Math.max(parseInt(query.limit || '100', 10), 1), 1000);
    const offset = Math.max(parseInt(query.offset || '0', 10), 0);

    const db = dbManager.get(id);
    const tableRow = db.prepare(`SELECT name FROM sqlite_schema WHERE type IN ('table', 'view') AND (name = ? OR LOWER(name) = LOWER(?)) LIMIT 1`).get(table, table) as { name: string } | undefined;

    if (!tableRow) {
      return reply.status(404).send({ success: false, error: { code: 'TABLE_NOT_FOUND', message: `Table "${table}" not found in database "${id}"` } });
    }

    const actualTableName = tableRow.name;
    const sql = `SELECT * FROM "${actualTableName.replace(/"/g, '""')}" LIMIT ? OFFSET ?`;
    try {
      const result = dbManager.executeSql(id, sql, [limit, offset]);
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(err.statusCode || 400).send({
        success: false,
        error: { code: err.code || 'SQLITE_ERROR', message: err.message, requestId: req.id },
      });
    }
  });

  // Admin Insert Row
  fastify.post('/databases/:id/tables/:table/rows', async (req, reply) => {
    const { id, table } = req.params as { id: string; table: string };
    const schema = dbManager.getSchema(id);
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
      const startTime = performance.now();
      const result = dbManager.executeSql(id, sql, values);
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

      activityService.recordActivity({
        databaseId: id,
        tokenId: `admin:${req.adminUser!.username}`,
        operation: `INSERT_ROW:${table}`,
        durationMs,
        status: 'success',
        rowCount: 1,
      });

      realtimeService.emitEvent({
        databaseId: id,
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

  // Admin Update Row
  fastify.put('/databases/:id/tables/:table/rows', async (req, reply) => {
    const { id, table } = req.params as { id: string; table: string };
    const Schema = z.object({
      pkCol: z.string(),
      pkVal: z.any(),
      values: z.record(z.any()),
    });
    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'pkCol, pkVal, and values required' } });
    }

    const { pkCol, pkVal, values } = parsed.data;
    const updateKeys = Object.keys(values);
    if (updateKeys.length === 0) {
      return reply.status(400).send({ success: false, error: { code: 'EMPTY_UPDATE', message: 'No values to update' } });
    }

    const setClauses = updateKeys.map(k => `"${k.replace(/"/g, '""')}" = ?`).join(', ');
    const sql = `UPDATE "${table}" SET ${setClauses} WHERE "${pkCol.replace(/"/g, '""')}" = ?`;
    const params = [...Object.values(values), pkVal];

    try {
      const startTime = performance.now();
      const result = dbManager.executeSql(id, sql, params);
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

      activityService.recordActivity({
        databaseId: id,
        tokenId: `admin:${req.adminUser!.username}`,
        operation: `UPDATE_ROW:${table}`,
        durationMs,
        status: 'success',
        rowCount: (result as any).changes || 1,
      });

      realtimeService.emitEvent({
        databaseId: id,
        table,
        type: 'update',
        data: { pkCol, pkVal, values, result },
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

  // Admin Bulk Delete Rows
  fastify.post('/databases/:id/tables/:table/delete-bulk', async (req, reply) => {
    const { id, table } = req.params as { id: string; table: string };
    const Schema = z.object({
      pkCol: z.string(),
      pkValues: z.array(z.any()).min(1),
    });
    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'pkCol and non-empty pkValues array required' } });
    }

    const { pkCol, pkValues } = parsed.data;
    const placeholders = pkValues.map(() => '?').join(', ');
    const sql = `DELETE FROM "${table}" WHERE "${pkCol.replace(/"/g, '""')}" IN (${placeholders})`;

    try {
      const startTime = performance.now();
      const result = dbManager.executeSql(id, sql, pkValues);
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

      activityService.recordActivity({
        databaseId: id,
        tokenId: `admin:${req.adminUser!.username}`,
        operation: `DELETE_ROWS:${table}`,
        durationMs,
        status: 'success',
        rowCount: (result as any).changes || pkValues.length,
      });

      realtimeService.emitEvent({
        databaseId: id,
        table,
        type: 'delete',
        data: { pkCol, pkValues, count: (result as any).changes || pkValues.length },
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

  // Admin Rename Table
  fastify.post('/databases/:id/tables/:table/rename', async (req, reply) => {
    const { id, table } = req.params as { id: string; table: string };
    const Schema = z.object({ newName: z.string().min(1).max(100) });
    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'newName is required' } });
    }

    const newName = parsed.data.newName.trim();
    const sql = `ALTER TABLE "${table}" RENAME TO "${newName.replace(/"/g, '""')}"`;
    try {
      dbManager.executeMultiStatements(id, sql);

      activityService.recordAudit({
        user: req.adminUser!.username,
        action: `table.rename`,
        resource: id,
        result: 'success',
        requestId: req.id,
        details: JSON.stringify({ oldName: table, newName }),
      });

      realtimeService.emitEvent({
        databaseId: id,
        type: 'schema',
        table: newName,
        data: { action: 'rename', oldName: table, newName },
        timestamp: Date.now(),
      });

      return reply.send({ success: true, data: { name: newName } });
    } catch (err: any) {
      return reply.status(err.statusCode || 400).send({
        success: false,
        error: { code: err.code || 'SQLITE_ERROR', message: err.message, requestId: req.id },
      });
    }
  });

  // Admin Truncate Table
  fastify.post('/databases/:id/tables/:table/truncate', async (req, reply) => {
    const { id, table } = req.params as { id: string; table: string };
    const sql = `DELETE FROM "${table}"`;
    try {
      const startTime = performance.now();
      const result = dbManager.executeSql(id, sql);
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

      activityService.recordActivity({
        databaseId: id,
        tokenId: `admin:${req.adminUser!.username}`,
        operation: `TRUNCATE_TABLE:${table}`,
        durationMs,
        status: 'success',
      });

      activityService.recordAudit({
        user: req.adminUser!.username,
        action: `table.truncate`,
        resource: id,
        result: 'success',
        requestId: req.id,
        details: JSON.stringify({ table }),
      });

      realtimeService.emitEvent({
        databaseId: id,
        table,
        type: 'delete',
        data: { action: 'truncate', table },
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

  // Admin Drop Table
  fastify.delete('/databases/:id/tables/:table', async (req, reply) => {
    const { id, table } = req.params as { id: string; table: string };
    const sql = `DROP TABLE IF EXISTS "${table}"`;
    try {
      dbManager.executeMultiStatements(id, sql);

      activityService.recordAudit({
        user: req.adminUser!.username,
        action: `table.drop`,
        resource: id,
        result: 'success',
        requestId: req.id,
        details: JSON.stringify({ table }),
      });

      realtimeService.emitEvent({
        databaseId: id,
        type: 'schema',
        table,
        data: { action: 'drop', table },
        timestamp: Date.now(),
      });

      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(err.statusCode || 400).send({
        success: false,
        error: { code: err.code || 'SQLITE_ERROR', message: err.message, requestId: req.id },
      });
    }
  });

  // Admin SQL Query console
  fastify.post('/databases/:id/query', async (req, reply) => {
    const { id } = req.params as { id: string };
    const Schema = z.object({
      sql: z.string().min(1),
      params: z.union([z.array(z.any()), z.record(z.any())]).optional(),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_QUERY', message: 'SQL query string required' },
      });
    }

    const startTime = performance.now();
    try {
      const result = dbManager.executeSql(id, parsed.data.sql, parsed.data.params);
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

      activityService.recordActivity({
        databaseId: id,
        tokenId: `admin:${req.adminUser!.username}`,
        operation: 'ADMIN_SQL_QUERY',
        durationMs,
        status: 'success',
        rowCount: (result as any).rowCount ?? (result as any).changes ?? 0,
      });

      return reply.send({ success: true, data: result });
    } catch (err: any) {
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      activityService.recordActivity({
        databaseId: id,
        tokenId: `admin:${req.adminUser!.username}`,
        operation: 'ADMIN_SQL_QUERY',
        durationMs,
        status: 'error',
        errorMessage: err.message,
      });

      return reply.status(err.statusCode || 400).send({
        success: false,
        error: { code: err.code || 'SQLITE_ERROR', message: err.message, requestId: req.id },
      });
    }
  });

  // Multi-statement raw script execution
  fastify.post('/databases/:id/exec', async (req, reply) => {
    const { id } = req.params as { id: string };
    const Schema = z.object({
      sql: z.string().min(1),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_SCRIPT', message: 'SQL script required' },
      });
    }

    const startTime = performance.now();
    try {
      const result = dbManager.executeMultiStatements(id, parsed.data.sql);
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

      activityService.recordActivity({
        databaseId: id,
        tokenId: `admin:${req.adminUser!.username}`,
        operation: 'ADMIN_SQL_EXEC',
        durationMs,
        status: 'success',
      });

      activityService.recordAudit({
        user: req.adminUser!.username,
        action: 'sql.exec',
        resource: id,
        result: 'success',
        requestId: req.id,
      });

      return reply.send({ success: true, data: result });
    } catch (err: any) {
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      activityService.recordActivity({
        databaseId: id,
        tokenId: `admin:${req.adminUser!.username}`,
        operation: 'ADMIN_SQL_EXEC',
        durationMs,
        status: 'error',
        errorMessage: err.message,
      });

      return reply.status(err.statusCode || 400).send({
        success: false,
        error: { code: err.code || 'SQLITE_ERROR', message: err.message, requestId: req.id },
      });
    }
  });

  // Maintenance operations
  fastify.post('/databases/:id/maintenance', async (req, reply) => {
    const { id } = req.params as { id: string };
    const Schema = z.object({
      action: z.enum(['quick_check', 'integrity_check', 'optimize', 'wal_checkpoint', 'vacuum', 'analyze', 'reindex']),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_ACTION', message: 'Valid maintenance action required' } });
    }

    const db = dbManager.get(id);
    const action = parsed.data.action;
    let result: any = null;

    try {
      if (action === 'quick_check') {
        result = db.prepare('PRAGMA quick_check;').all();
      } else if (action === 'integrity_check') {
        result = db.prepare('PRAGMA integrity_check;').all();
      } else if (action === 'optimize') {
        result = db.prepare('PRAGMA optimize;').all();
      } else if (action === 'wal_checkpoint') {
        result = db.prepare('PRAGMA wal_checkpoint(TRUNCATE);').all();
      } else if (action === 'vacuum') {
        db.exec('VACUUM;');
        result = { vacuum: 'completed' };
      } else if (action === 'analyze') {
        db.exec('ANALYZE;');
        result = { analyze: 'completed' };
      } else if (action === 'reindex') {
        db.exec('REINDEX;');
        result = { reindex: 'completed' };
      }

      activityService.recordAudit({
        user: req.adminUser!.username,
        action: `database.maintenance.${action}`,
        resource: id,
        result: 'success',
        requestId: req.id,
      });

      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: { code: 'MAINTENANCE_ERROR', message: err.message } });
    }
  });

  // Query Profiler & EXPLAIN QUERY PLAN
  fastify.post('/databases/:id/explain', async (req, reply) => {
    const { id } = req.params as { id: string };
    const Schema = z.object({
      sql: z.string().min(1),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_QUERY', message: 'SQL query string required' } });
    }

    try {
      const res = databaseService.explainQuery(id, parsed.data.sql);
      return reply.send({ success: true, data: res });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: { code: 'EXPLAIN_ERROR', message: err.message } });
    }
  });

  // Tokens management
  fastify.get('/databases/:id/tokens', async (req, reply) => {
    const { id } = req.params as { id: string };
    const tokens = tokenService.listTokens(id);
    return reply.send({ success: true, data: tokens });
  });

  fastify.post('/databases/:id/tokens', async (req, reply) => {
    const { id } = req.params as { id: string };
    const Schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional().nullable(),
      permissions: z.array(TokenPermissionSchema).min(1),
      allowedTables: z.array(z.string()).optional().nullable(),
      deniedTables: z.array(z.string()).optional().nullable(),
      rateLimit: z.number().int().positive().optional().nullable(),
      expiresInDays: z.number().int().positive().optional().nullable(),
      type: z.enum(['live', 'test']).optional(),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid token parameters' } });
    }

    const { tokenRecord, plainSecret } = await tokenService.createToken({
      databaseId: id,
      name: parsed.data.name,
      description: parsed.data.description,
      permissions: parsed.data.permissions,
      allowedTables: parsed.data.allowedTables,
      deniedTables: parsed.data.deniedTables,
      rateLimit: parsed.data.rateLimit,
      expiresInDays: parsed.data.expiresInDays,
      type: parsed.data.type,
    });

    activityService.recordAudit({
      user: req.adminUser!.username,
      action: 'token.create',
      resource: tokenRecord.id,
      result: 'success',
      requestId: req.id,
      details: JSON.stringify({ name: tokenRecord.name, databaseId: id }),
    });

    return reply.status(201).send({
      success: true,
      data: {
        token: tokenRecord,
        plainSecret,
      },
    });
  });

  fastify.post('/tokens/:tokenId/revoke', async (req, reply) => {
    const { tokenId } = req.params as { tokenId: string };
    tokenService.revokeToken(tokenId);
    activityService.recordAudit({
      user: req.adminUser!.username,
      action: 'token.revoke',
      resource: tokenId,
      result: 'success',
      requestId: req.id,
    });
    return reply.send({ success: true });
  });

  fastify.delete('/tokens/:tokenId', async (req, reply) => {
    const { tokenId } = req.params as { tokenId: string };
    tokenService.deleteToken(tokenId);
    activityService.recordAudit({
      user: req.adminUser!.username,
      action: 'token.delete',
      resource: tokenId,
      result: 'success',
      requestId: req.id,
    });
    return reply.send({ success: true });
  });

  // Backups management
  fastify.get('/databases/:id/backups', async (req, reply) => {
    const { id } = req.params as { id: string };
    const list = backupService.listBackups(id);
    return reply.send({ success: true, data: list });
  });

  fastify.post('/databases/:id/backups', async (req, reply) => {
    const { id } = req.params as { id: string };
    const backup = backupService.createBackup(id, 'manual');
    activityService.recordAudit({
      user: req.adminUser!.username,
      action: 'backup.create',
      resource: backup.id,
      result: 'success',
      requestId: req.id,
      details: JSON.stringify({ databaseId: id, filename: backup.filename }),
    });
    return reply.status(201).send({ success: true, data: backup });
  });

  fastify.post('/databases/:id/backups/:backupId/restore', async (req, reply) => {
    const { id, backupId } = req.params as { id: string; backupId: string };
    backupService.restoreBackup(id, backupId);
    activityService.recordAudit({
      user: req.adminUser!.username,
      action: 'database.restore',
      resource: id,
      result: 'success',
      requestId: req.id,
      details: JSON.stringify({ backupId }),
    });
    return reply.send({ success: true, message: 'Database restored successfully' });
  });

  fastify.get('/backups/:backupId/download', async (req, reply) => {
    const { backupId } = req.params as { backupId: string };
    const raw = (req.query as any)?.raw === 'true';
    const backup = backupService.getBackup(backupId);
    if (!backup) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Backup not found' } });
    }

    const filePath = path.resolve(config.backupsDir, backup.database_id, backup.filename);
    if (!fs.existsSync(filePath)) {
      return reply.status(404).send({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'Backup file missing on disk' } });
    }

    if (raw || !isEncryptedFile(filePath)) {
      reply.header('Content-Disposition', `attachment; filename="${backup.filename}"`);
      reply.header('Content-Type', 'application/x-sqlite3');
      reply.header('Content-Length', fs.statSync(filePath).size);
      return reply.send(fs.createReadStream(filePath));
    }

    // Decrypt on-the-fly for user download
    try {
      const rawEncBuffer = fs.readFileSync(filePath);
      const decrypted = decryptBuffer(rawEncBuffer);
      reply.header('Content-Disposition', `attachment; filename="${backup.filename}"`);
      reply.header('Content-Type', 'application/x-sqlite3');
      reply.header('Content-Length', decrypted.length);
      return reply.send(decrypted);
    } catch {
      reply.header('Content-Disposition', `attachment; filename="${backup.filename}"`);
      reply.header('Content-Type', 'application/x-sqlite3');
      reply.header('Content-Length', fs.statSync(filePath).size);
      return reply.send(fs.createReadStream(filePath));
    }
  });

  fastify.delete('/backups/:backupId', async (req, reply) => {
    const { backupId } = req.params as { backupId: string };
    try {
      backupService.deleteBackup(backupId);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: { code: 'BACKUP_DELETE_ERROR', message: err.message } });
    }
  });

  // Activity & Audit logs
  fastify.get('/activity', async (req, reply) => {
    const query = req.query as any;
    const res = activityService.listActivity({
      databaseId: query.databaseId,
      tokenId: query.tokenId,
      status: query.status,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
    });
    return reply.send({ success: true, data: { items: res.items, total: res.total } });
  });

  fastify.get('/audit', async (req, reply) => {
    const query = req.query as any;
    const res = activityService.listAuditLogs(
      query.limit ? parseInt(query.limit, 10) : 50,
      query.offset ? parseInt(query.offset, 10) : 0
    );
    return reply.send({ success: true, data: { items: res.items, total: res.total } });
  });

  // Admin Files API
  fastify.get('/databases/:id/files', async (req, reply) => {
    const { id } = req.params as { id: string };
    const files = storageService.listFiles(id);
    return reply.send({ success: true, data: files });
  });

  fastify.post('/databases/:id/files', async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = await req.file();
    if (!data) {
      return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'Multipart file field required' } });
    }

    const metadata = (data.fields?.metadata as any)?.value || null;

    const fileRecord = await storageService.saveStreamFile({
      databaseId: id,
      originalName: data.filename,
      mimeType: data.mimetype,
      stream: data.file,
      metadata,
    });

    activityService.recordAudit({
      user: req.adminUser!.username,
      action: 'file.upload',
      resource: fileRecord.id,
      result: 'success',
      requestId: req.id,
      details: JSON.stringify({ filename: fileRecord.filename, originalName: fileRecord.original_name }),
    });

    return reply.status(201).send({ success: true, data: fileRecord });
  });

  fastify.delete('/files/:fileId', async (req, reply) => {
    const { fileId } = req.params as { fileId: string };
    const file = storageService.getFile(fileId);
    if (!file) {
      return reply.status(404).send({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'File not found' } });
    }

    storageService.deleteFile(fileId);
    activityService.recordAudit({
      user: req.adminUser!.username,
      action: 'file.delete',
      resource: fileId,
      result: 'success',
      requestId: req.id,
    });

    return reply.send({ success: true });
  });

  // Webhooks Management
  fastify.get('/databases/:id/webhooks', async (req, reply) => {
    const { id } = req.params as { id: string };
    const list = webhookService.listWebhooks(id);
    return reply.send({ success: true, data: list });
  });

  fastify.post('/databases/:id/webhooks', async (req, reply) => {
    const { id } = req.params as { id: string };
    const Schema = z.object({
      name: z.string().min(1).max(100),
      url: z.string().url(),
      secret: z.string().optional(),
      events: z.array(z.string()).min(1),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid webhook parameters' } });
    }

    const hook = webhookService.createWebhook({
      databaseId: id,
      name: parsed.data.name,
      url: parsed.data.url,
      secret: parsed.data.secret,
      events: parsed.data.events,
    });

    activityService.recordAudit({
      user: req.adminUser!.username,
      action: 'webhook.create',
      resource: hook.id,
      result: 'success',
      requestId: req.id,
      details: JSON.stringify({ name: hook.name, url: hook.url }),
    });

    return reply.status(201).send({ success: true, data: hook });
  });

  fastify.delete('/webhooks/:webhookId', async (req, reply) => {
    const { webhookId } = req.params as { webhookId: string };
    webhookService.deleteWebhook(webhookId);
    activityService.recordAudit({
      user: req.adminUser!.username,
      action: 'webhook.delete',
      resource: webhookId,
      result: 'success',
      requestId: req.id,
    });
    return reply.send({ success: true });
  });

  fastify.patch('/webhooks/:webhookId/toggle', async (req, reply) => {
    const { webhookId } = req.params as { webhookId: string };
    const Schema = z.object({ active: z.boolean() });
    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'Field "active" boolean required' } });
    }

    webhookService.toggleWebhook(webhookId, parsed.data.active);
    return reply.send({ success: true });
  });

  fastify.post('/webhooks/:webhookId/test', async (req, reply) => {
    const { webhookId } = req.params as { webhookId: string };
    const metaDb = (await import('../db/metadata.js')).getMetadataDb();
    const hook = metaDb.prepare('SELECT * FROM webhooks WHERE id = ?').get(webhookId) as any;
    if (!hook) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Webhook not found' } });
    }

    try {
      await webhookService.dispatch({
        databaseId: hook.database_id,
        table: 'test_table',
        type: 'insert',
        data: { message: 'Test webhook dispatch from VanillaDatabase', triggeredAt: new Date().toISOString() },
        timestamp: Date.now(),
      });
      return reply.send({ success: true, message: 'Test webhook event dispatched' });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: { code: 'DISPATCH_ERROR', message: err.message } });
    }
  });

  fastify.post('/webhooks/:webhookId/reset-failures', async (req, reply) => {
    const { webhookId } = req.params as { webhookId: string };
    const metaDb = (await import('../db/metadata.js')).getMetadataDb();
    metaDb.prepare('UPDATE webhooks SET failure_count = 0 WHERE id = ?').run(webhookId);
    return reply.send({ success: true, message: 'Failure count reset to 0' });
  });

  // Export Data (SQL, CSV, JSON)
  fastify.get('/databases/:id/export', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { format?: string; table?: string };
    const format = query.format || 'sql';
    const targetTable = query.table;

    const db = dbManager.get(id);
    const schema = dbManager.getSchema(id);

    if (targetTable && !schema.some(s => s.name === targetTable)) {
      return reply.status(404).send({ success: false, error: { code: 'TABLE_NOT_FOUND', message: `Table "${targetTable}" not found` } });
    }

    if (format === 'sql') {
      const tablesToExport = targetTable
        ? schema.filter(s => s.name === targetTable)
        : schema.filter(s => s.type === 'table');

      let sqlDump = `-- VanillaDatabase SQL Dump\n-- Database ID: ${id}\n-- Exported At: ${new Date().toISOString()}\nPRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n\n`;

      for (const t of tablesToExport) {
        if (t.sql) {
          sqlDump += `${t.sql};\n\n`;
        }
        const rows = db.prepare(`SELECT * FROM "${t.name.replace(/"/g, '""')}"`).all() as Record<string, any>[];
        for (const row of rows) {
          const cols = Object.keys(row).map(k => `"${k.replace(/"/g, '""')}"`).join(', ');
          const vals = Object.values(row).map(v => {
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'number') return v;
            if (typeof v === 'boolean') return v ? 1 : 0;
            return `'${String(v).replace(/'/g, "''")}'`;
          }).join(', ');
          sqlDump += `INSERT INTO "${t.name.replace(/"/g, '""')}" (${cols}) VALUES (${vals});\n`;
        }
        sqlDump += '\n';
      }

      sqlDump += 'COMMIT;\n';

      reply.header('Content-Type', 'application/sql');
      reply.header('Content-Disposition', `attachment; filename="${targetTable || id}-dump.sql"`);
      return reply.send(sqlDump);
    }

    if (format === 'sqlite' || format === 'db') {
      const dbPath = dbManager.resolveDatabasePath(id);
      if (!fs.existsSync(dbPath)) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Database file not found' } });
      }

      // Checkpoint WAL to consolidate all pending writes into the main file before sending
      try {
        const activeDb = dbManager.get(id);
        activeDb.exec('PRAGMA wal_checkpoint(PASSIVE);');
      } catch {}

      const fileBuffer = fs.readFileSync(dbPath);
      reply.header('Content-Type', 'application/vnd.sqlite3');
      reply.header('Content-Disposition', `attachment; filename="${id}.sqlite"`);
      return reply.send(fileBuffer);
    }

    if (format === 'json') {
      const tableName = targetTable || schema.find(s => s.type === 'table')?.name;
      if (!tableName) {
        return reply.send([]);
      }

      const rows = db.prepare(`SELECT * FROM "${tableName.replace(/"/g, '""')}"`).all();
      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', `attachment; filename="${tableName}-export.json"`);
      return reply.send(rows);
    }

    if (format === 'csv') {
      const tableName = targetTable || schema.find(s => s.type === 'table')?.name;
      if (!tableName) {
        return reply.send('');
      }

      const rows = db.prepare(`SELECT * FROM "${tableName.replace(/"/g, '""')}"`).all() as Record<string, any>[];
      if (rows.length === 0) {
        return reply.send('');
      }

      const headers = Object.keys(rows[0]).join(',');
      const csvRows = rows.map(r =>
        Object.values(r)
          .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
          .join(',')
      );

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="${tableName}-export.csv"`);
      return reply.send([headers, ...csvRows].join('\n'));
    }

    return reply.status(400).send({ success: false, error: { code: 'INVALID_FORMAT', message: 'Format must be sql, csv, or json' } });
  });

  // Import Data (.sql, .sqlite/.db, .csv, .json, .ndjson, .dump) with Multi-Dialect Auto Translation
  fastify.post('/databases/:id/import', async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = await req.file();
    if (!data) {
      return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'File is required' } });
    }

    const buffer = await data.toBuffer();
    const filename = data.filename || 'import_file';
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const targetTable = (data.fields?.tableName as any)?.value;
    const explicitDialect = (data.fields?.dialect as any)?.value;

    // 1. SQLite Binary Replacement (.sqlite, .db)
    if (ext === 'sqlite' || ext === 'db') {
      const header = buffer.subarray(0, 16).toString('utf-8');
      if (!header.startsWith('SQLite format 3')) {
        return reply.status(400).send({ success: false, error: { code: 'INVALID_SQLITE_FILE', message: 'File is not a valid SQLite database binary' } });
      }

      dbManager.close(id);
      const dbPath = dbManager.resolveDatabasePath(id);
      fs.writeFileSync(dbPath, buffer);
      dbManager.get(id); // Reopen handle

      realtimeService.emitEvent({
        databaseId: id,
        type: 'schema',
        timestamp: Date.now(),
      });

      activityService.recordAudit({
        user: req.adminUser!.username,
        action: 'database.import_binary',
        resource: id,
        result: 'success',
        requestId: req.id,
        details: JSON.stringify({ filename, size: buffer.length }),
      });

      return reply.send({ success: true, message: 'SQLite database file imported and replaced successfully' });
    }

    // 2. JSON or NDJSON (Mongo / JSON Export)
    if (ext === 'json' || ext === 'ndjson' || ext === 'jsonl') {
      const content = buffer.toString('utf-8');
      let records: any[] = [];

      try {
        if (ext === 'ndjson' || ext === 'jsonl' || content.includes('\n{')) {
          records = SqlTranslator.parseNdjson(content);
        } else {
          const parsed = JSON.parse(content);
          records = Array.isArray(parsed) ? parsed : [parsed];
        }
      } catch (err: any) {
        return reply.status(400).send({ success: false, error: { code: 'INVALID_JSON', message: `JSON parsing error: ${err.message}` } });
      }

      if (records.length === 0) {
        return reply.send({ success: true, imported: 0, message: 'JSON file is empty' });
      }

      const inferredTableName = targetTable || filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
      const { ddl, dml, rowCount } = SqlTranslator.inferSchemaFromJson(records, inferredTableName);

      const db = dbManager.get(id);
      db.exec(ddl);

      if (dml.length > 0) {
        db.exec('BEGIN TRANSACTION;');
        try {
          for (const insertSql of dml) {
            db.exec(insertSql);
          }
          db.exec('COMMIT;');
        } catch (err: any) {
          db.exec('ROLLBACK;');
          return reply.status(400).send({ success: false, error: { code: 'JSON_IMPORT_ERROR', message: err.message } });
        }
      }

      realtimeService.emitEvent({
        databaseId: id,
        table: inferredTableName,
        type: 'insert',
        data: { importedRows: rowCount },
        timestamp: Date.now(),
      });

      activityService.recordAudit({
        user: req.adminUser!.username,
        action: 'database.import_json',
        resource: id,
        result: 'success',
        requestId: req.id,
        details: JSON.stringify({ filename, table: inferredTableName, rows: rowCount }),
      });

      return reply.send({
        success: true,
        imported: rowCount,
        table: inferredTableName,
        message: `Successfully imported ${rowCount} rows into table "${inferredTableName}"`,
      });
    }

    // 3. CSV Table Import
    if (ext === 'csv') {
      const csvContent = buffer.toString('utf-8');
      const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) {
        return reply.send({ success: true, imported: 0, message: 'CSV file is empty' });
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const rows = lines.slice(1).map(l => l.split(',').map(v => v.trim().replace(/^"|"$/g, '')));
      const db = dbManager.get(id);

      let effectiveTable = targetTable;
      if (!effectiveTable) {
        effectiveTable = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
        const colsDef = headers.map(h => `"${h.replace(/"/g, '""')}" TEXT`).join(', ');
        db.exec(`CREATE TABLE IF NOT EXISTS "${effectiveTable.replace(/"/g, '""')}" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, ${colsDef});`);
      }

      const placeholders = headers.map(() => '?').join(', ');
      const cols = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(', ');
      const stmt = db.prepare(`INSERT INTO "${effectiveTable.replace(/"/g, '""')}" (${cols}) VALUES (${placeholders})`);

      db.exec('BEGIN TRANSACTION;');
      try {
        let count = 0;
        for (const r of rows) {
          if (r.length === headers.length) {
            stmt.run(...r);
            count++;
          }
        }
        db.exec('COMMIT;');

        realtimeService.emitEvent({
          databaseId: id,
          table: effectiveTable,
          type: 'insert',
          data: { importedRows: count },
          timestamp: Date.now(),
        });

        activityService.recordAudit({
          user: req.adminUser!.username,
          action: 'database.import_csv',
          resource: id,
          result: 'success',
          requestId: req.id,
          details: JSON.stringify({ filename, table: effectiveTable, rows: count }),
        });

        return reply.send({ success: true, imported: count, message: `Imported ${count} rows into table "${effectiveTable}"` });
      } catch (err: any) {
        db.exec('ROLLBACK;');
        return reply.status(400).send({ success: false, error: { code: 'CSV_IMPORT_ERROR', message: err.message } });
      }
    }

    // 4. SQL / Database Dumps (.sql, .dump, text) with Multi-Dialect Translation
    const rawSql = buffer.toString('utf-8');
    const detectedDialect = explicitDialect || SqlTranslator.detectDialect(rawSql);
    let executableSql = rawSql;

    if (detectedDialect === 'mysql') {
      executableSql = SqlTranslator.translateMySql(rawSql);
    } else if (detectedDialect === 'postgres') {
      executableSql = SqlTranslator.translatePostgres(rawSql);
    }

    try {
      const db = dbManager.get(id);
      db.exec(executableSql);

      realtimeService.emitEvent({
        databaseId: id,
        type: 'schema',
        timestamp: Date.now(),
      });

      activityService.recordAudit({
        user: req.adminUser!.username,
        action: `database.import_${detectedDialect}`,
        resource: id,
        result: 'success',
        requestId: req.id,
        details: JSON.stringify({ filename, dialect: detectedDialect }),
      });

      return reply.send({
        success: true,
        dialect: detectedDialect,
        message: `Database script (${detectedDialect.toUpperCase()}) translated and imported successfully`,
      });
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: { code: 'IMPORT_EXECUTION_ERROR', message: `Execution failed: ${err.message}` },
      });
    }
  });

  // Create Database Directly from Uploaded Dump File
  fastify.post('/databases/import-new', async (req, reply) => {
    const data = await req.file();
    if (!data) {
      return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'File is required' } });
    }

    const buffer = await data.toBuffer();
    const filename = data.filename || 'import_db';
    const explicitName = (data.fields?.name as any)?.value;
    const description = (data.fields?.description as any)?.value;
    const dbName = (explicitName || filename.replace(/\.[^/.]+$/, '')).trim();

    const record = databaseService.createDatabase(dbName, description || `Imported from ${filename}`, req.adminUser?.userId);
    const id = record.id;
    const ext = filename.split('.').pop()?.toLowerCase() || '';

    try {
      if (ext === 'sqlite' || ext === 'db') {
        const header = buffer.subarray(0, 16).toString('utf-8');
        if (header.startsWith('SQLite format 3')) {
          dbManager.close(id);
          const dbPath = dbManager.resolveDatabasePath(id);
          fs.writeFileSync(dbPath, buffer);
          dbManager.get(id);
        }
      } else if (ext === 'json' || ext === 'ndjson' || ext === 'jsonl') {
        const content = buffer.toString('utf-8');
        const records = ext === 'ndjson' || ext === 'jsonl' ? SqlTranslator.parseNdjson(content) : JSON.parse(content);
        const { ddl, dml } = SqlTranslator.inferSchemaFromJson(Array.isArray(records) ? records : [records], 'main_data');
        const db = dbManager.get(id);
        db.exec(ddl);
        if (dml.length > 0) {
          db.exec('BEGIN TRANSACTION;');
          for (const s of dml) db.exec(s);
          db.exec('COMMIT;');
        }
      } else if (ext === 'csv') {
        const csvContent = buffer.toString('utf-8');
        const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
        if (lines.length >= 2) {
          const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
          const rows = lines.slice(1).map(l => l.split(',').map(v => v.trim().replace(/^"|"$/g, '')));
          const db = dbManager.get(id);
          const colsDef = headers.map(h => `"${h.replace(/"/g, '""')}" TEXT`).join(', ');
          db.exec(`CREATE TABLE IF NOT EXISTS "main_data" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, ${colsDef});`);
          const placeholders = headers.map(() => '?').join(', ');
          const cols = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(', ');
          const stmt = db.prepare(`INSERT INTO "main_data" (${cols}) VALUES (${placeholders})`);
          db.exec('BEGIN TRANSACTION;');
          for (const r of rows) {
            if (r.length === headers.length) stmt.run(...r);
          }
          db.exec('COMMIT;');
        }
      } else {
        const rawSql = buffer.toString('utf-8');
        const dialect = SqlTranslator.detectDialect(rawSql);
        let execSql = rawSql;
        if (dialect === 'mysql') execSql = SqlTranslator.translateMySql(rawSql);
        if (dialect === 'postgres') execSql = SqlTranslator.translatePostgres(rawSql);
        const db = dbManager.get(id);
        db.exec(execSql);
      }

      activityService.recordAudit({
        user: req.adminUser!.username,
        action: 'database.create_from_import',
        resource: id,
        result: 'success',
        requestId: req.id,
        details: JSON.stringify({ filename, dbName }),
      });

      return reply.status(201).send({ success: true, data: record, message: 'Database created and initialized from file successfully' });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: { code: 'IMPORT_INIT_FAILED', message: `Database created but initialization failed: ${err.message}` } });
    }
  });

  // User Management & RBAC APIs (Super Admin / Admin only)
  fastify.get('/users', { preHandler: [requireRole(['super_admin', 'admin'])] }, async (req, reply) => {
    const users = authService.listUsers();
    return reply.send({ success: true, data: users });
  });

  fastify.post('/users', { preHandler: [requireRole(['super_admin'])] }, async (req, reply) => {
    const Schema = z.object({
      username: z.string().min(3).max(50),
      password: z.string().min(6).max(128),
      role: z.enum(['super_admin', 'admin', 'user']).default('user'),
      maxDatabases: z.number().int().min(0).default(5),
      rateLimitPerMinute: z.number().int().min(0).default(60),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid user payload' },
      });
    }

    try {
      const newUser = await authService.createUser({
        username: parsed.data.username,
        password: parsed.data.password,
        role: parsed.data.role as any,
        maxDatabases: parsed.data.maxDatabases,
        rateLimitPerMinute: parsed.data.rateLimitPerMinute,
      });

      activityService.recordAudit({
        user: req.adminUser!.username,
        action: 'user.create',
        resource: newUser.id,
        result: 'success',
        requestId: req.id,
        details: JSON.stringify({ username: newUser.username, role: newUser.role, maxDatabases: newUser.max_databases, rateLimit: newUser.rate_limit_per_minute }),
      });

      return reply.status(201).send({ success: true, data: newUser });
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: { code: 'USER_CREATE_ERROR', message: err.message },
      });
    }
  });

  fastify.patch('/users/:userId', { preHandler: [requireRole(['super_admin'])] }, async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const Schema = z.object({
      password: z.string().min(6).max(128).optional(),
      role: z.enum(['super_admin', 'admin', 'user']).optional(),
      maxDatabases: z.number().int().min(0).optional(),
      rateLimitPerMinute: z.number().int().min(0).optional(),
      status: z.enum(['active', 'disabled']).optional(),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid user update payload' },
      });
    }

    try {
      const updated = await authService.updateUser(userId, parsed.data as any);
      activityService.recordAudit({
        user: req.adminUser!.username,
        action: 'user.update',
        resource: userId,
        result: 'success',
        requestId: req.id,
        details: JSON.stringify(parsed.data),
      });

      return reply.send({ success: true, data: updated });
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: { code: 'USER_UPDATE_ERROR', message: err.message },
      });
    }
  });

  fastify.delete('/users/:userId', { preHandler: [requireRole(['super_admin'])] }, async (req, reply) => {
    const { userId } = req.params as { userId: string };
    if (req.adminUser?.userId === userId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'CANNOT_DELETE_SELF', message: 'You cannot delete your own account' },
      });
    }

    try {
      authService.deleteUser(userId);
      activityService.recordAudit({
        user: req.adminUser!.username,
        action: 'user.delete',
        resource: userId,
        result: 'success',
        requestId: req.id,
      });

      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: { code: 'USER_DELETE_ERROR', message: err.message },
      });
    }
  });
};
