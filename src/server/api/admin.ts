import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import fs from 'fs';
import { dbManager } from '../db/manager.js';
import { databaseService } from '../services/database.js';
import { tokenService } from '../services/tokens.js';
import { backupService } from '../services/backup.js';
import { storageService } from '../services/storage.js';
import { webhookService } from '../services/webhook.js';
import { realtimeService } from '../services/realtime.js';
import { activityService } from '../services/activity.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { TokenPermissionSchema } from '../../../shared/index.js';

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireAdminAuth);

  // Databases CRUD
  fastify.get('/databases', async (req, reply) => {
    const list = databaseService.listDatabases();
    return reply.send({ success: true, data: list });
  });

  fastify.post('/databases', async (req, reply) => {
    const Schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional().nullable(),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid parameters' },
      });
    }

    const record = databaseService.createDatabase(parsed.data.name, parsed.data.description);
    activityService.recordAudit({
      user: req.adminUser!.username,
      action: 'database.create',
      resource: record.id,
      result: 'success',
      requestId: req.id,
      details: JSON.stringify({ name: record.name }),
    });

    return reply.status(201).send({ success: true, data: record });
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

  fastify.patch('/databases/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const Schema = z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional().nullable(),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } });
    }

    const updated = databaseService.updateDatabase(id, parsed.data);
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

  // Admin Table Browser rows
  fastify.get('/databases/:id/tables/:table/rows', async (req, reply) => {
    const { id, table } = req.params as { id: string; table: string };
    const query = req.query as any;

    const limit = Math.min(Math.max(parseInt(query.limit || '100', 10), 1), 1000);
    const offset = Math.max(parseInt(query.offset || '0', 10), 0);

    const schema = dbManager.getSchema(id);
    const tableExists = schema.some(t => t.name === table);
    if (!tableExists) {
      return reply.status(404).send({ success: false, error: { code: 'TABLE_NOT_FOUND', message: `Table "${table}" not found` } });
    }

    const sql = `SELECT * FROM "${table}" LIMIT ? OFFSET ?`;
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
      action: z.enum(['quick_check', 'integrity_check', 'optimize', 'wal_checkpoint', 'vacuum', 'analyze']),
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
      }

      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: { code: 'MAINTENANCE_ERROR', message: err.message } });
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
    return reply.send({ success: true, data: res.items, total: res.total });
  });

  fastify.get('/audit', async (req, reply) => {
    const query = req.query as any;
    const res = activityService.listAuditLogs(
      query.limit ? parseInt(query.limit, 10) : 50,
      query.offset ? parseInt(query.offset, 10) : 0
    );
    return reply.send({ success: true, data: res.items, total: res.total });
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

  // Import Data (.sql, .sqlite/.db, .csv)
  fastify.post('/databases/:id/import', async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = await req.file();
    if (!data) {
      return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'File is required' } });
    }

    const buffer = await data.toBuffer();
    const ext = data.filename.split('.').pop()?.toLowerCase();
    const targetTable = (data.fields?.tableName as any)?.value;

    if (ext === 'sql') {
      const sqlContent = buffer.toString('utf-8');
      const db = dbManager.get(id);
      db.exec(sqlContent);

      realtimeService.emitEvent({
        databaseId: id,
        type: 'schema',
        timestamp: Date.now(),
      });

      activityService.recordAudit({
        user: req.adminUser!.username,
        action: 'database.import_sql',
        resource: id,
        result: 'success',
        requestId: req.id,
        details: JSON.stringify({ filename: data.filename }),
      });

      return reply.send({ success: true, message: 'SQL script executed and imported successfully' });
    }

    if (ext === 'sqlite' || ext === 'db') {
      // Validate SQLite Header (first 16 bytes: "SQLite format 3\0")
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
        details: JSON.stringify({ filename: data.filename, size: buffer.length }),
      });

      return reply.send({ success: true, message: 'SQLite database file imported and replaced successfully' });
    }

    if (ext === 'csv') {
      if (!targetTable) {
        return reply.status(400).send({ success: false, error: { code: 'MISSING_TABLE', message: 'targetTable field required for CSV import' } });
      }

      const csvContent = buffer.toString('utf-8');
      const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) {
        return reply.send({ success: true, imported: 0 });
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const rows = lines.slice(1).map(l => l.split(',').map(v => v.trim().replace(/^"|"$/g, '')));

      const db = dbManager.get(id);
      const placeholders = headers.map(() => '?').join(', ');
      const cols = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(', ');
      const stmt = db.prepare(`INSERT INTO "${targetTable.replace(/"/g, '""')}" (${cols}) VALUES (${placeholders})`);

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
          table: targetTable,
          type: 'insert',
          data: { importedRows: count },
          timestamp: Date.now(),
        });

        return reply.send({ success: true, imported: count });
      } catch (err: any) {
        db.exec('ROLLBACK;');
        return reply.status(400).send({ success: false, error: { code: 'CSV_IMPORT_ERROR', message: err.message } });
      }
    }

    return reply.status(400).send({ success: false, error: { code: 'UNSUPPORTED_FORMAT', message: 'Supported formats: .sql, .sqlite, .db, .csv' } });
  });
};
