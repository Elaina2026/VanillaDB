import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/server/index.js';
import { clusterService } from '../src/server/services/cluster.js';
import { databaseService } from '../src/server/services/database.js';
import { config } from '../src/server/config/index.js';
import { dbManager } from '../src/server/db/manager.js';

describe('Cluster & Multi-Node Storage Spillover Test Suite', () => {
  let app: any;
  let adminCookie: string;
  let createdDbId: string | null = null;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const { authService } = await import('../src/server/services/auth.js');
    const { getMetadataDb } = await import('../src/server/db/metadata.js');
    const metaDb = getMetadataDb();
    let adminUser = metaDb.prepare("SELECT * FROM users WHERE role = 'super_admin' LIMIT 1").get() as any;
    if (!adminUser) {
      const created = await authService.createAdminUser('cluster_admin_test', 'SuperSecretPassword123!', 'super_admin');
      adminUser = created;
    }
    const cookieObj = authService.generateSessionCookie(adminUser, config.sessionSecret);
    adminCookie = `vdb_session=${cookieObj.cookieValue}`;
  }, 30000);

  afterAll(async () => {
    if (createdDbId) {
      try {
        databaseService.deleteDatabase(createdDbId);
      } catch {}
    }
    clusterService.stop();
    dbManager.closeAll();
    if (app) await app.close();
  });

  it('should accurately sample local host telemetry metrics (CPU, RAM, Disk, Network)', () => {
    const metrics = clusterService.getLocalMetrics();
    expect(metrics).toBeDefined();
    expect(metrics.nodeId).toBeDefined();
    expect(metrics.status).toBe('healthy');
    expect(typeof metrics.cpuPercent).toBe('number');
    expect(typeof metrics.ramPercent).toBe('number');
    expect(metrics.diskTotalBytes).toBeGreaterThan(0);
    expect(metrics.diskFreeBytes).toBeGreaterThan(0);
    expect(metrics.diskUsedPercent).toBeGreaterThanOrEqual(0);
    expect(metrics.diskUsedPercent).toBeLessThanOrEqual(100);
    expect(metrics.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('should reject unauthenticated requests to internal node telemetry endpoint', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/internal/node/stats',
    });
    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.payload);
    expect(json.success).toBe(false);
  });

  it('should return hardware telemetry with valid x-cluster-secret', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/internal/node/stats',
      headers: {
        'x-cluster-secret': config.clusterSecret,
      },
    });
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.success).toBe(true);
    expect(json.data.diskTotalBytes).toBeGreaterThan(0);
    expect(json.data.status).toBe('healthy');
  });

  it('should return cluster status via admin API endpoint', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/cluster/status',
      headers: {
        cookie: adminCookie,
      },
    });
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.success).toBe(true);
    expect(json.data.totalNodes).toBeGreaterThanOrEqual(1);
    expect(json.data.nodes.some((n: any) => n.is_local)).toBe(true);
    expect(typeof json.data.spilloverActive).toBe('boolean');
  });

  it('should assign node_id when creating a new database', () => {
    const db = databaseService.createDatabase('Cluster Test DB', 'Testing node assignment');
    createdDbId = db.id;
    expect(db.id).toBeDefined();
    expect(db.node_id).toBe('local');

    const fetched = databaseService.getDatabase(db.id);
    expect(fetched?.node_id).toBe('local');
  });

  it('should override physical disk space when host_disk_total_gb is configured', async () => {
    const { systemService } = await import('../src/server/services/system.js');

    // Set 20 GB quota
    systemService.updateSettings({ host_disk_total_gb: 20 });

    const status = systemService.getSystemStatus();
    expect(status.diskSpace).toBeDefined();
    expect(status.diskSpace?.totalBytes).toBe(20 * 1024 * 1024 * 1024);
    expect(status.diskSpace?.availableBytes).toBeLessThanOrEqual(20 * 1024 * 1024 * 1024);

    const localMetrics = clusterService.getLocalMetrics();
    expect(localMetrics.diskTotalBytes).toBe(20 * 1024 * 1024 * 1024);

    // Reset to 0 (auto-detect)
    systemService.updateSettings({ host_disk_total_gb: 0 });
  });

  it('should accept application/octet-stream database snapshot uploads', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const path = await import('path');
    const fs = await import('fs');

    const dummyPath = path.resolve(config.tempDir, 'dummy_test_snap.sqlite');
    const db = new DatabaseSync(dummyPath);
    db.exec('CREATE TABLE test_sync (id INTEGER PRIMARY KEY, msg TEXT);');
    db.exec("INSERT INTO test_sync VALUES (1, 'hello');");
    db.close();

    const fileBuf = fs.readFileSync(dummyPath);
    fs.unlinkSync(dummyPath);

    const testTargetId = 'db_test_migration_receive';
    const res = await app.inject({
      method: 'POST',
      url: `/api/internal/node/databases/${testTargetId}/receive`,
      headers: {
        'x-cluster-secret': config.clusterSecret,
        'content-type': 'application/octet-stream',
      },
      payload: fileBuf,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.success).toBe(true);
    expect(json.data.databaseId).toBe(testTargetId);

    const targetFile = path.resolve(config.databasesDir, `${testTargetId}.sqlite`);
    if (fs.existsSync(targetFile)) {
      fs.unlinkSync(targetFile);
    }
  });
});
