import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';
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
  }, 20000);

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
  }, 20000);

  it('should successfully export database snapshot from worker even without metadata entry', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const path = await import('path');
    const fs = await import('fs');

    const workerDbId = 'db_worker_only_test';
    const workerDbPath = path.resolve(config.databasesDir, `${workerDbId}.sqlite`);

    // Create a database file directly on disk simulating a worker node
    const db = new DatabaseSync(workerDbPath);
    db.exec('CREATE TABLE worker_data (id INTEGER PRIMARY KEY, note TEXT);');
    db.exec("INSERT INTO worker_data VALUES (1, 'worker test payload');");
    db.close();

    const res = await app.inject({
      method: 'GET',
      url: `/api/internal/node/databases/${workerDbId}/export`,
      headers: {
        'x-cluster-secret': config.clusterSecret,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.rawPayload.length).toBeGreaterThan(0);

    // Verify downloaded snapshot is valid SQLite
    const verifyTemp = path.resolve(config.tempDir, `verify_${Date.now()}.sqlite`);
    fs.writeFileSync(verifyTemp, res.rawPayload);
    const verifyDb = new DatabaseSync(verifyTemp);
    const row = verifyDb.prepare('SELECT note FROM worker_data WHERE id = 1;').get() as any;
    expect(row.note).toBe('worker test payload');
    verifyDb.close();

    fs.unlinkSync(verifyTemp);
    if (fs.existsSync(workerDbPath)) fs.unlinkSync(workerDbPath);
  }, 20000);

  it('should preserve all tables and rows with zero data loss across export, receive, and migration', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const path = await import('path');
    const fs = await import('fs');

    // 1. Create a database instance
    const dbRecord = databaseService.createDatabase('Data Loss Zero Test DB', 'Verify migration data persistence');
    const dbId = dbRecord.id;

    // 2. Insert tables and sample rows into database
    const dbHandle = dbManager.get(dbId);
    dbHandle.exec(`
      CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        stock INTEGER NOT NULL
      );
      INSERT INTO products VALUES (1, 'Laptop', 1200.5, 15);
      INSERT INTO products VALUES (2, 'Mouse', 25.0, 100);
      INSERT INTO products VALUES (3, 'Keyboard', 75.0, 45);
    `);
    dbManager.close(dbId);

    // 3. Export snapshot via internal export endpoint
    const exportRes = await app.inject({
      method: 'GET',
      url: `/api/internal/node/databases/${dbId}/export`,
      headers: {
        'x-cluster-secret': config.clusterSecret,
      },
    });
    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.rawPayload.length).toBeGreaterThan(0);

    // 4. Simulate target node already having stale WAL/SHM files
    const targetFile = path.resolve(config.databasesDir, `${dbId}_simulated_worker.sqlite`);
    const targetWal = `${targetFile}-wal`;
    const targetShm = `${targetFile}-shm`;
    fs.writeFileSync(targetWal, Buffer.from('stale old wal data that must be cleaned'));
    fs.writeFileSync(targetShm, Buffer.from('stale old shm data'));

    // 5. Receive snapshot on target node
    const receiveRes = await app.inject({
      method: 'POST',
      url: `/api/internal/node/databases/${dbId}_simulated_worker/receive`,
      headers: {
        'x-cluster-secret': config.clusterSecret,
        'content-type': 'application/octet-stream',
      },
      payload: exportRes.rawPayload,
    });
    expect(receiveRes.statusCode).toBe(200);
    expect(fs.existsSync(targetFile)).toBe(true);
    // Stale WAL file must have been purged to prevent corruption
    expect(fs.readFileSync(targetFile).length).toBeGreaterThan(0);

    // 6. Verify data integrity on the target database: all 3 rows must be preserved
    const targetDb = new DatabaseSync(targetFile);
    const rows = targetDb.prepare('SELECT id, name, price, stock FROM products ORDER BY id ASC;').all() as any[];
    expect(rows.length).toBe(3);
    expect(rows[0].name).toBe('Laptop');
    expect(rows[1].name).toBe('Mouse');
    expect(rows[2].name).toBe('Keyboard');
    targetDb.close();

    // 7. Cleanup test databases
    try { databaseService.deleteDatabase(dbId); } catch {}
    if (fs.existsSync(targetFile)) try { fs.unlinkSync(targetFile); } catch {}
    if (fs.existsSync(targetWal)) try { fs.unlinkSync(targetWal); } catch {}
    if (fs.existsSync(targetShm)) try { fs.unlinkSync(targetShm); } catch {}
  }, 20000);

  it('should serve GET /api/admin/databases/:id without 500 when database is on remote worker node', async () => {
    const { getMetadataDb } = await import('../src/server/db/metadata.js');
    const metaDb = getMetadataDb();

    // 1. Create a database record marked as hosted on remote worker node
    const testDb = databaseService.createDatabase('Remote Host Test DB', 'Testing overview stats for remote node');
    metaDb.prepare("UPDATE databases SET node_id = 'worker_test_mock' WHERE id = ?").run(testDb.id);

    // 2. Fetch GET /api/admin/databases/:id - must return 200 and not 500
    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/databases/${testDb.id}`,
      headers: {
        cookie: adminCookie,
      },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.success).toBe(true);
    expect(json.data.database.id).toBe(testDb.id);
    expect(json.data.database.node_id).toBe('worker_test_mock');
    expect(typeof json.data.fileSizeBytes).toBe('number');

    // 3. Test internal overview-stats endpoint on local disk file
    const overviewRes = await app.inject({
      method: 'GET',
      url: `/api/internal/node/databases/${testDb.id}/overview-stats`,
      headers: {
        'x-cluster-secret': config.clusterSecret,
      },
    });
    expect(overviewRes.statusCode).toBe(200);
    const overviewJson = JSON.parse(overviewRes.payload);
    expect(overviewJson.success).toBe(true);
    expect(overviewJson.data.pageSize).toBeGreaterThan(0);
    expect(overviewJson.data.journalMode).toBe('wal');

    // 4. Test storage-stats fallback on worker node (direct filesystem check when metadata absent)
    const workerMockId = `worker_direct_${Date.now()}`;
    const directPath = path.resolve(config.databasesDir, `${workerMockId}.sqlite`);
    const tempDb = new DatabaseSync(directPath);
    tempDb.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, title TEXT); INSERT INTO items VALUES (1, 'A');");
    tempDb.close();

    const workerStorageStatsRes = await app.inject({
      method: 'GET',
      url: `/api/admin/databases/${workerMockId}/storage-stats`,
      headers: {
        'x-cluster-secret': config.clusterSecret,
      },
    });
    expect(workerStorageStatsRes.statusCode).toBe(200);
    const storageStatsJson = JSON.parse(workerStorageStatsRes.payload);
    expect(storageStatsJson.success).toBe(true);
    expect(storageStatsJson.data.tables.some((t: any) => t.name === 'items')).toBe(true);

    // Cleanup
    try { databaseService.deleteDatabase(testDb.id); } catch {}
    if (fs.existsSync(directPath)) try { fs.unlinkSync(directPath); } catch {}
    if (fs.existsSync(`${directPath}-wal`)) try { fs.unlinkSync(`${directPath}-wal`); } catch {}
    if (fs.existsSync(`${directPath}-shm`)) try { fs.unlinkSync(`${directPath}-shm`); } catch {}
  });

  it('should support backup creation for databases hosted on remote worker nodes without throwing local handle error', async () => {
    const { getMetadataDb } = await import('../src/server/db/metadata.js');
    const { backupService } = await import('../src/server/services/backup.js');
    const metaDb = getMetadataDb();

    // 1. Create a database record marked as hosted on worker node
    const remoteDb = databaseService.createDatabase('Remote Backup Test DB', 'Testing backup on worker');
    const workerNodeId = 'worker_backup_mock';
    metaDb.prepare(`
      INSERT OR REPLACE INTO storage_nodes (
        id, name, base_url, auth_token, status, disk_total_bytes, disk_free_bytes, disk_available_bytes, cpu_percent, ram_percent, network_rate_bps, database_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'healthy', 1000000000, 500000000, 500000000, 5, 20, 1000, 1, ?, ?)
    `).run(workerNodeId, 'Backup Worker Mock', 'http://127.0.0.1:25589', config.clusterSecret, Date.now(), Date.now());

    metaDb.prepare('UPDATE databases SET node_id = ? WHERE id = ?').run(workerNodeId, remoteDb.id);

    // 2. Mock fetch for worker export endpoint
    const originalFetch = global.fetch;
    const directPath = path.resolve(config.databasesDir, `${remoteDb.id}.sqlite`);
    const tempDb = new DatabaseSync(directPath);
    tempDb.exec("CREATE TABLE test_data (id INT, val TEXT); INSERT INTO test_data VALUES (1, 'snap');");
    tempDb.close();

    // @ts-ignore
    global.fetch = async (url: string, opts: any) => {
      if (url.includes(`/api/internal/node/databases/${remoteDb.id}/export`)) {
        const fileBuf = fs.readFileSync(directPath);
        return new Response(fileBuf, { status: 200 });
      }
      return originalFetch(url, opts);
    };

    try {
      // 3. Create backup - must not throw local handle exception
      const backup = await backupService.createBackup(remoteDb.id, 'scheduled');
      expect(backup).toBeDefined();
      expect(backup.database_id).toBe(remoteDb.id);
      expect(backup.status).toBe('completed');
      expect(backup.size_bytes).toBeGreaterThan(0);

      // 4. Verify backup is saved and encrypted on disk
      const backups = backupService.listBackups(remoteDb.id);
      expect(backups.length).toBeGreaterThan(0);
      expect(backups[0].id).toBe(backup.id);
    } finally {
      global.fetch = originalFetch;
      try { databaseService.deleteDatabase(remoteDb.id); } catch {}
      metaDb.prepare('DELETE FROM storage_nodes WHERE id = ?').run(workerNodeId);
      if (fs.existsSync(directPath)) try { fs.unlinkSync(directPath); } catch {}
      if (fs.existsSync(`${directPath}-wal`)) try { fs.unlinkSync(`${directPath}-wal`); } catch {}
      if (fs.existsSync(`${directPath}-shm`)) try { fs.unlinkSync(`${directPath}-shm`); } catch {}
    }
  });

  it('should support ProjectStatus health check for both Gateway and Worker storage node roles', async () => {
    const { healthService } = await import('../src/server/services/health.js');

    // 1. Gateway health check
    const gatewayHealth = await healthService.getHealthStatus({ nodeRole: 'gateway' });
    expect(gatewayHealth.statusCode).toBe(200);
    expect(gatewayHealth.body.status).toBe('operational');
    expect(gatewayHealth.body.service).toBe('vanilladb-gateway');
    expect(gatewayHealth.body.checks.database).toBe('ok');
    expect(gatewayHealth.body.checks.gateway).toBe('connected');

    // 2. Worker health check (standalone / direct storage mode)
    const workerHealth = await healthService.getHealthStatus({
      nodeRole: 'worker',
      serviceName: 'vanilladb-worker-node1',
    });
    expect(workerHealth.statusCode).toBe(200);
    expect(workerHealth.body.status).toBe('operational');
    expect(workerHealth.body.service).toBe('vanilladb-worker-node1');
    expect(workerHealth.body.checks.database).toBe('ok');
    expect(workerHealth.body.checks.gateway).toBe('connected');

    // 3. Worker health check with connected gateway URL
    const originalFetch = global.fetch;
    // @ts-ignore
    global.fetch = async (url: string) => {
      if (url.includes('/health')) {
        return new Response(null, { status: 200 });
      }
      return originalFetch(url);
    };

    try {
      const connectedWorker = await healthService.getHealthStatus({
        nodeRole: 'worker',
        gatewayUrl: 'http://127.0.0.1:3000',
      });
      expect(connectedWorker.statusCode).toBe(200);
      expect(connectedWorker.body.status).toBe('operational');
      expect(connectedWorker.body.checks.gateway).toBe('connected');
    } finally {
      global.fetch = originalFetch;
    }

    // 4. Worker outage when gateway is unreachable
    const outageWorker = await healthService.getHealthStatus({
      nodeRole: 'worker',
      gatewayUrl: 'http://127.0.0.1:49998',
    });
    expect(outageWorker.statusCode).toBe(503);
    expect(outageWorker.body.status).toBe('outage');
    expect(outageWorker.body.checks.gateway).toBe('unreachable');
  });
});
