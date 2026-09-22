import type { FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { z } from 'zod';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config/index.js';
import { clusterService } from '../services/cluster.js';
import { dbManager } from '../db/manager.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { getMetadataDb } from '../db/metadata.js';
import { activityService } from '../services/activity.js';

const addNodeSchema = z.object({
  name: z.string().min(1).max(100),
  baseUrl: z.string().url(),
  authToken: z.string().optional().nullable(),
});

const migrateSchema = z.object({
  databaseId: z.string().min(1),
  targetNodeId: z.string().min(1),
});

export const clusterRoutes: FastifyPluginAsync = async (fastify) => {
  // ==========================================
  // 1. Worker Node Internal APIs (/api/internal/node/*)
  // Protected by x-cluster-secret header
  // ==========================================
  fastify.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/api/internal/node')) {
      const secretHeader = req.headers['x-cluster-secret'];
      const secretStr = typeof secretHeader === 'string' ? secretHeader : '';
      const expectedStr = config.clusterSecret;

      let isMatch = false;
      if (secretStr.length > 0 && secretStr.length === expectedStr.length) {
        isMatch = crypto.timingSafeEqual(Buffer.from(secretStr), Buffer.from(expectedStr));
      }

      if (!isMatch) {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED_CLUSTER_NODE', message: 'Invalid or missing x-cluster-secret' },
        });
      }
    }
  });

  // Telemetry endpoint queried by Gateway
  fastify.get('/internal/node/stats', async (req, reply) => {
    const metrics = clusterService.getLocalMetrics();
    return reply.send({ success: true, data: metrics });
  });

  // Receive a migrated SQLite file from another node
  fastify.post('/internal/node/databases/:id/receive', async (req, reply) => {
    const { id } = req.params as { id: string };
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeId) {
      return reply.status(400).send({ success: false, error: { message: 'Invalid database ID' } });
    }

    const destFile = path.resolve(config.databasesDir, `${safeId}.sqlite`);
    const tempFile = path.resolve(config.tempDir, `${safeId}_recv_${Date.now()}.sqlite`);

    try {
      // Read binary buffer or multipart payload
      const buffer = await req.body as Buffer;
      if (!buffer || !Buffer.isBuffer(buffer)) {
        // Handle raw stream if not auto-buffered
        const rawChunks: Buffer[] = [];
        for await (const chunk of req.raw) {
          rawChunks.push(chunk);
        }
        const fullBuffer = Buffer.concat(rawChunks);
        fs.writeFileSync(tempFile, fullBuffer);
      } else {
        fs.writeFileSync(tempFile, buffer);
      }

      // Verify SQLite file integrity before placing into databases directory
      const testDb = new DatabaseSync(tempFile);
      const check = testDb.prepare('PRAGMA quick_check;').get() as any;
      testDb.close();

      if (!check || (check.quick_check !== 'ok' && Object.values(check)[0] !== 'ok')) {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        return reply.status(400).send({
          success: false,
          error: { message: 'Transferred SQLite file failed integrity quick_check' },
        });
      }

      // Atomic rename/move to destination
      if (fs.existsSync(destFile)) {
        dbManager.close(safeId);
        try { fs.unlinkSync(destFile); } catch {}
      }
      fs.copyFileSync(tempFile, destFile);
      fs.unlinkSync(tempFile);

      return reply.send({ success: true, data: { databaseId: safeId, sizeBytes: fs.statSync(destFile).size } });
    } catch (err: any) {
      if (fs.existsSync(tempFile)) {
        try { fs.unlinkSync(tempFile); } catch {}
      }
      return reply.status(500).send({
        success: false,
        error: { message: `Failed to receive database snapshot: ${err.message}` },
      });
    }
  });

  // Export a local database snapshot for migration back to gateway
  fastify.get('/internal/node/databases/:id/export', async (req, reply) => {
    const { id } = req.params as { id: string };
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
    const dbPath = path.resolve(config.databasesDir, `${safeId}.sqlite`);

    if (!fs.existsSync(dbPath)) {
      return reply.status(404).send({ success: false, error: { message: 'Database file not found on worker' } });
    }

    const tempExport = path.resolve(config.tempDir, `${safeId}_exp_${Date.now()}.sqlite`);
    try {
      const handle = dbManager.get(safeId);
      const safeTemp = tempExport.replace(/\\/g, '/').replace(/'/g, "''");
      handle.exec(`VACUUM INTO '${safeTemp}';`);

      const fileData = fs.readFileSync(tempExport);
      fs.unlinkSync(tempExport);

      reply.header('content-type', 'application/octet-stream');
      return reply.send(fileData);
    } catch (err: any) {
      if (fs.existsSync(tempExport)) {
        try { fs.unlinkSync(tempExport); } catch {}
      }
      return reply.status(500).send({ success: false, error: { message: `Export error: ${err.message}` } });
    }
  });

  // Delete local database files on worker after migration
  fastify.delete('/internal/node/databases/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
    dbManager.close(safeId);

    const dbPath = path.resolve(config.databasesDir, `${safeId}.sqlite`);
    if (fs.existsSync(dbPath)) {
      try { fs.unlinkSync(dbPath); } catch {}
    }
    if (fs.existsSync(`${dbPath}-wal`)) {
      try { fs.unlinkSync(`${dbPath}-wal`); } catch {}
    }
    if (fs.existsSync(`${dbPath}-shm`)) {
      try { fs.unlinkSync(`${dbPath}-shm`); } catch {}
    }

    return reply.send({ success: true });
  });

  // ==========================================
  // 2. Admin Cluster Management APIs (/api/admin/cluster/*)
  // Protected by requireAdminAuth
  // ==========================================
  fastify.register(async (adminScope) => {
    adminScope.addHook('preHandler', requireAdminAuth);

    adminScope.get('/admin/cluster/status', async (req, reply) => {
      const status = clusterService.getClusterStatus();
      return reply.send({ success: true, data: status });
    });

    adminScope.get('/admin/cluster/nodes', async (req, reply) => {
      const status = clusterService.getClusterStatus();
      return reply.send({ success: true, data: status.nodes });
    });

    adminScope.post('/admin/cluster/nodes', async (req, reply) => {
      if (req.adminUser?.role !== 'super_admin' && req.adminUser?.role !== 'admin') {
        return reply.status(403).send({ success: false, error: { message: 'Admin role required to manage cluster nodes' } });
      }

      const parsed = addNodeSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: { message: parsed.error.issues[0].message } });
      }

      try {
        const node = await clusterService.addNode(parsed.data);
        activityService.recordAudit({
          user: req.adminUser!.username,
          action: 'cluster.node_add',
          resource: node.id,
          result: 'success',
          requestId: req.id,
          details: JSON.stringify({ name: node.name, url: node.base_url }),
        });

        return reply.status(201).send({ success: true, data: node });
      } catch (err: any) {
        return reply.status(400).send({ success: false, error: { message: err.message } });
      }
    });

    adminScope.delete('/admin/cluster/nodes/:id', async (req, reply) => {
      if (req.adminUser?.role !== 'super_admin' && req.adminUser?.role !== 'admin') {
        return reply.status(403).send({ success: false, error: { message: 'Admin role required to delete cluster nodes' } });
      }

      const { id } = req.params as { id: string };
      try {
        clusterService.removeNode(id);
        activityService.recordAudit({
          user: req.adminUser!.username,
          action: 'cluster.node_remove',
          resource: id,
          result: 'success',
          requestId: req.id,
          details: JSON.stringify({ nodeId: id }),
        });

        return reply.send({ success: true });
      } catch (err: any) {
        return reply.status(400).send({ success: false, error: { message: err.message } });
      }
    });

    adminScope.post('/admin/cluster/migrate', async (req, reply) => {
      if (req.adminUser?.role !== 'super_admin' && req.adminUser?.role !== 'admin') {
        return reply.status(403).send({ success: false, error: { message: 'Admin role required to trigger database migration' } });
      }

      const parsed = migrateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, error: { message: parsed.error.issues[0].message } });
      }

      try {
        const result = await clusterService.migrateDatabase(parsed.data.databaseId, parsed.data.targetNodeId);
        activityService.recordAudit({
          user: req.adminUser!.username,
          action: 'cluster.database_migrate',
          resource: parsed.data.databaseId,
          result: 'success',
          requestId: req.id,
          details: JSON.stringify({ targetNodeId: parsed.data.targetNodeId, message: result.message }),
        });

        return reply.send({ success: true, data: result });
      } catch (err: any) {
        return reply.status(400).send({ success: false, error: { message: err.message } });
      }
    });

    adminScope.post('/admin/cluster/poll', async (req, reply) => {
      await clusterService.pollNodesHeartbeat();
      const status = clusterService.getClusterStatus();
      return reply.send({ success: true, data: status });
    });
  });
};
