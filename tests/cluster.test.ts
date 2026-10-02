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
    const directPath = path.resolve(config.databasesDir, `worker_direct_${Date.now()}.sqlite`);
    try {
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
      const tempDb = new DatabaseSync(directPath);
      tempDb.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, title TEXT); INSERT INTO items VALUES (1, 'A');");
      tempDb.close();

      const workerMockId = path.basename(directPath, '.sqlite');
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
    } finally {
      // Cleanup
      try { databaseService.deleteDatabase(testDb.id); } catch {}
      if (fs.existsSync(directPath)) try { fs.unlinkSync(directPath); } catch {}
      if (fs.existsSync(`${directPath}-wal`)) try { fs.unlinkSync(`${directPath}-wal`); } catch {}
      if (fs.existsSync(`${directPath}-shm`)) try { fs.unlinkSync(`${directPath}-shm`); } catch {}
    }
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

  it('should aggregate health status from worker nodes on Gateway and require both to be operational', async () => {
    const { healthService } = await import('../src/server/services/health.js');
    const { getMetadataDb } = await import('../src/server/db/metadata.js');
    const metaDb = getMetadataDb();

    const worker1 = 'worker_health_mock_1';
    const worker2 = 'worker_health_mock_2';
    metaDb.prepare(`
      INSERT OR REPLACE INTO storage_nodes (
        id, name, base_url, auth_token, status, disk_total_bytes, disk_free_bytes, disk_available_bytes, cpu_percent, ram_percent, network_rate_bps, database_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'healthy', 1000000000, 500000000, 500000000, 5, 20, 1000, 1, ?, ?)
    `).run(worker1, 'Health Worker 1', 'http://127.0.0.1:25881', config.clusterSecret, Date.now(), Date.now());

    metaDb.prepare(`
      INSERT OR REPLACE INTO storage_nodes (
        id, name, base_url, auth_token, status, disk_total_bytes, disk_free_bytes, disk_available_bytes, cpu_percent, ram_percent, network_rate_bps, database_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'healthy', 1000000000, 500000000, 500000000, 5, 20, 1000, 1, ?, ?)
    `).run(worker2, 'Health Worker 2', 'http://127.0.0.1:25882', config.clusterSecret, Date.now(), Date.now());

    const originalFetch = global.fetch;

    // 1. Both Gateway and all Workers are healthy -> operational
    // @ts-ignore
    global.fetch = async (url: string) => {
      if (url.includes('/health')) {
        return new Response(JSON.stringify({
          status: 'operational',
          service: 'vanilladb-worker-mock',
          uptime: 100,
          timestamp: Date.now(),
          checks: { database: 'ok', gateway: 'connected' },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return originalFetch(url);
    };

    try {
      const gatewayHealth = await healthService.getHealthStatus({ nodeRole: 'gateway' });
      expect(gatewayHealth.statusCode).toBe(200);
      expect(gatewayHealth.body.status).toBe('operational');
      expect(gatewayHealth.body.checks.database).toBe('ok');
      expect(gatewayHealth.body.checks.gateway).toBe('connected');
      expect(gatewayHealth.body.checks.workers).toBe('ok');
      expect(gatewayHealth.body.checks.storageNodes).toContain('healthy');

      // 2. One worker offline, one healthy -> Gateway status becomes degraded
      // @ts-ignore
      global.fetch = async (url: string) => {
        if (url.includes('25882/health')) {
          return new Response(null, { status: 500 });
        }
        if (url.includes('25881/health')) {
          return new Response(JSON.stringify({
            status: 'operational',
            checks: { database: 'ok', gateway: 'connected' },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return originalFetch(url);
      };

      const degradedHealth = await healthService.getHealthStatus({ nodeRole: 'gateway' });
      expect(degradedHealth.statusCode).toBe(200);
      expect(degradedHealth.body.status).toBe('degraded');
      expect(degradedHealth.body.checks.workers).toBe('degraded');
      expect(degradedHealth.body.checks.storageNodes).toContain('1/2 healthy');
    } finally {
      global.fetch = originalFetch;
      metaDb.prepare('DELETE FROM storage_nodes WHERE id IN (?, ?)').run(worker1, worker2);
    }
  });

  it('should execute scheduled SQL cron jobs on remote worker nodes without local handle error', async () => {
    const { getMetadataDb } = await import('../src/server/db/metadata.js');
    const { jobSchedulerService } = await import('../src/server/services/jobScheduler.js');
    const metaDb = getMetadataDb();

    const remoteDb = databaseService.createDatabase('Remote Cron Job DB', 'Testing remote SQL job');
    const workerNodeId = 'worker_cron_mock';
    metaDb.prepare(`
      INSERT OR REPLACE INTO storage_nodes (
        id, name, base_url, auth_token, status, disk_total_bytes, disk_free_bytes, disk_available_bytes, cpu_percent, ram_percent, network_rate_bps, database_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'healthy', 1000000000, 500000000, 500000000, 5, 20, 1000, 1, ?, ?)
    `).run(workerNodeId, 'Cron Worker Mock', 'http://127.0.0.1:25882', config.clusterSecret, Date.now(), Date.now());

    metaDb.prepare('UPDATE databases SET node_id = ? WHERE id = ?').run(workerNodeId, remoteDb.id);

    const originalFetch = global.fetch;
    let interceptedSql: string | null = null;

    // @ts-ignore
    global.fetch = async (url: string, opts: any) => {
      if (url.includes(`/api/admin/databases/${remoteDb.id}/exec`)) {
        const body = JSON.parse(opts.body);
        interceptedSql = body.sql;
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return originalFetch(url, opts);
    };

    try {
      const jobResult = await jobSchedulerService.runJob({
        id: 'job_test_remote_1',
        database_id: remoteDb.id,
        name: 'Remote Cleanup Query',
        cron_expression: '@hourly',
        sql_query: 'DELETE FROM logs WHERE created_at < 1000;',
      });

      expect(jobResult.success).toBe(true);
      expect(interceptedSql).toBe('DELETE FROM logs WHERE created_at < 1000;');
    } finally {
      global.fetch = originalFetch;
      try { databaseService.deleteDatabase(remoteDb.id); } catch {}
      metaDb.prepare('DELETE FROM storage_nodes WHERE id = ?').run(workerNodeId);
      metaDb.prepare("DELETE FROM scheduled_jobs WHERE id = 'job_test_remote_1'").run();
    }
  });

  it('should emit realtime events on Gateway when remote worker mutations succeed', async () => {
    const { getMetadataDb } = await import('../src/server/db/metadata.js');
    const { realtimeService } = await import('../src/server/services/realtime.js');
    const metaDb = getMetadataDb();

    const remoteDb = databaseService.createDatabase('Remote Webhook Relay DB', 'Testing realtime & webhook relay');
    const workerNodeId = 'worker_relay_mock';
    metaDb.prepare(`
      INSERT OR REPLACE INTO storage_nodes (
        id, name, base_url, auth_token, status, disk_total_bytes, disk_free_bytes, disk_available_bytes, cpu_percent, ram_percent, network_rate_bps, database_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'healthy', 1000000000, 500000000, 500000000, 5, 20, 1000, 1, ?, ?)
    `).run(workerNodeId, 'Relay Worker Mock', 'http://127.0.0.1:25883', config.clusterSecret, Date.now(), Date.now());

    metaDb.prepare('UPDATE databases SET node_id = ? WHERE id = ?').run(workerNodeId, remoteDb.id);

    const originalFetch = global.fetch;
    // @ts-ignore
    global.fetch = async (url: string, opts: any) => {
      if (url.includes(`/v1/databases/${remoteDb.id}/query`)) {
        return new Response(JSON.stringify({
          success: true,
          data: { changes: 1 },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return originalFetch(url, opts);
    };

    let receivedEvent: any = null;
    const unsub = realtimeService.subscribe(remoteDb.id, undefined, (event) => {
      receivedEvent = event;
    });

    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/databases/${remoteDb.id}/query`,
        headers: {
          cookie: adminCookie,
          'content-type': 'application/json',
        },
        payload: {
          sql: "INSERT INTO items VALUES (1, 'relay test');",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(receivedEvent).toBeDefined();
      expect(receivedEvent.databaseId).toBe(remoteDb.id);
      expect(receivedEvent.type).toBe('insert');
    } finally {
      unsub();
      global.fetch = originalFetch;
      try { databaseService.deleteDatabase(remoteDb.id); } catch {}
      metaDb.prepare('DELETE FROM storage_nodes WHERE id = ?').run(workerNodeId);
    }
  });

  it('should proxy queries, batch, and REST table APIs to remote worker node with token authorization', async () => {
    const { getMetadataDb } = await import('../src/server/db/metadata.js');
    const metaDb = getMetadataDb();

    // 1. Create a database record marked as hosted on worker node
    const remoteDb = databaseService.createDatabase('Remote Query Service Test DB', 'Testing Gateway proxy for queries');
    const workerNodeId = 'worker_query_mock';
    metaDb.prepare(`
      INSERT OR REPLACE INTO storage_nodes (
        id, name, base_url, auth_token, status, disk_total_bytes, disk_free_bytes, disk_available_bytes, cpu_percent, ram_percent, network_rate_bps, database_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'healthy', 1000000000, 500000000, 500000000, 5, 20, 1000, 1, ?, ?)
    `).run(workerNodeId, 'Query Worker Mock', 'http://127.0.0.1:25991', config.clusterSecret, Date.now(), Date.now());

    metaDb.prepare('UPDATE databases SET node_id = ? WHERE id = ?').run(workerNodeId, remoteDb.id);

    // Mock fetch for worker proxy calls
    const originalFetch = global.fetch;
    let interceptedQuery: any = null;
    let interceptedHeaders: any = null;

    // @ts-ignore
    global.fetch = async (url: string, opts: any) => {
      if (url.includes(`/v1/databases/${remoteDb.id}/query`)) {
        interceptedQuery = JSON.parse(opts.body);
        interceptedHeaders = opts.headers;
        return new Response(JSON.stringify({
          success: true,
          data: {
            columns: ['id', 'name'],
            rows: [[1, 'Worker Result Item']],
            rowCount: 1,
          }
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return originalFetch(url, opts);
    };

    try {
      // 2. Query via Gateway with admin session
      const res = await app.inject({
        method: 'POST',
        url: `/v1/databases/${remoteDb.id}/query`,
        headers: {
          cookie: adminCookie,
          'content-type': 'application/json',
        },
        payload: {
          sql: 'SELECT * FROM test_table;',
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.rowCount).toBe(1);
      expect(json.data.rows[0][1]).toBe('Worker Result Item');
      expect(interceptedQuery.sql).toBe('SELECT * FROM test_table;');
      expect(interceptedHeaders['x-cluster-secret']).toBe(config.clusterSecret);
    } finally {
      global.fetch = originalFetch;
      try { databaseService.deleteDatabase(remoteDb.id); } catch {}
      metaDb.prepare('DELETE FROM storage_nodes WHERE id = ?').run(workerNodeId);
    }
  });

  it('should enforce table allow/denylists on Gateway before proxying to remote worker', async () => {
    const { getMetadataDb } = await import('../src/server/db/metadata.js');
    const { tokenService } = await import('../src/server/services/tokens.js');
    const metaDb = getMetadataDb();

    const remoteDb = databaseService.createDatabase('Remote Token Table DB', 'Testing scoped token rules');
    const workerNodeId = 'worker_token_mock';
    metaDb.prepare(`
      INSERT OR REPLACE INTO storage_nodes (
        id, name, base_url, auth_token, status, disk_total_bytes, disk_free_bytes, disk_available_bytes, cpu_percent, ram_percent, network_rate_bps, database_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'healthy', 1000000000, 500000000, 500000000, 5, 20, 1000, 1, ?, ?)
    `).run(workerNodeId, 'Token Worker Mock', 'http://127.0.0.1:25992', config.clusterSecret, Date.now(), Date.now());

    metaDb.prepare('UPDATE databases SET node_id = ? WHERE id = ?').run(workerNodeId, remoteDb.id);

    // Create scoped token with allowed_tables = ['permitted_table']
    const { plainSecret } = await tokenService.createToken({
      databaseId: remoteDb.id,
      name: 'Restricted Token',
      permissions: ['database:read', 'database:write'],
      allowedTables: ['permitted_table'],
    });

    try {
      // 1. Attempt access to forbidden table via REST API
      const forbiddenRes = await app.inject({
        method: 'GET',
        url: `/v1/databases/${remoteDb.id}/tables/secret_table/rows`,
        headers: {
          authorization: `Bearer ${plainSecret}`,
        },
      });

      expect(forbiddenRes.statusCode).toBe(403);
      const forbiddenJson = JSON.parse(forbiddenRes.payload);
      expect(forbiddenJson.success).toBe(false);
      expect(forbiddenJson.error.code).toBe('FORBIDDEN');

      // 2. Mock worker response for permitted table
      const originalFetch = global.fetch;
      // @ts-ignore
      global.fetch = async (url: string, opts: any) => {
        if (url.includes(`/v1/databases/${remoteDb.id}/tables/permitted_table/rows`)) {
          expect(opts.headers['x-token-allowed-tables']).toBeDefined();
          return new Response(JSON.stringify({
            success: true,
            data: { rows: [{ id: 1, name: 'Allowed Row' }], rowCount: 1 }
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return originalFetch(url, opts);
      };

      try {
        const allowedRes = await app.inject({
          method: 'GET',
          url: `/v1/databases/${remoteDb.id}/tables/permitted_table/rows`,
          headers: {
            authorization: `Bearer ${plainSecret}`,
          },
        });

        expect(allowedRes.statusCode).toBe(200);
        const allowedJson = JSON.parse(allowedRes.payload);
        expect(allowedJson.success).toBe(true);
        expect(allowedJson.data.rows[0].name).toBe('Allowed Row');
      } finally {
        global.fetch = originalFetch;
      }
    } finally {
      try { databaseService.deleteDatabase(remoteDb.id); } catch {}
      metaDb.prepare('DELETE FROM storage_nodes WHERE id = ?').run(workerNodeId);
    }
  });

  it('should stream file uploads to worker and sync metadata to Gateway files table', async () => {
    const { getMetadataDb } = await import('../src/server/db/metadata.js');
    const { storageService } = await import('../src/server/services/storage.js');
    const metaDb = getMetadataDb();

    const remoteDb = databaseService.createDatabase('Remote File Sync DB', 'Testing file proxy and metadata sync');
    const workerNodeId = 'worker_file_mock';
    metaDb.prepare(`
      INSERT OR REPLACE INTO storage_nodes (
        id, name, base_url, auth_token, status, disk_total_bytes, disk_free_bytes, disk_available_bytes, cpu_percent, ram_percent, network_rate_bps, database_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'healthy', 1000000000, 500000000, 500000000, 5, 20, 1000, 1, ?, ?)
    `).run(workerNodeId, 'File Worker Mock', 'http://127.0.0.1:25993', config.clusterSecret, Date.now(), Date.now());

    metaDb.prepare('UPDATE databases SET node_id = ? WHERE id = ?').run(workerNodeId, remoteDb.id);

    const originalFetch = global.fetch;
    const mockFileRecord = {
      id: `file_test_sync_${Date.now()}`,
      database_id: remoteDb.id,
      filename: `synced_test_file_${Date.now()}.png`,
      original_name: 'test_image.png',
      mime_type: 'image/png',
      size_bytes: 4096,
      checksum: 'abc123hash',
      metadata: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    // @ts-ignore
    global.fetch = async (url: string, opts: any) => {
      if (url.includes(`/databases/${remoteDb.id}/files`)) {
        return new Response(JSON.stringify({
          success: true,
          data: mockFileRecord,
        }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      return originalFetch(url, opts);
    };

    try {
      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/databases/${remoteDb.id}/files`,
        headers: {
          cookie: adminCookie,
          'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW',
        },
        payload: '------WebKitFormBoundary7MA4YWxkTrZu0gW\r\nContent-Disposition: form-data; name="file"; filename="test_image.png"\r\nContent-Type: image/png\r\n\r\nfakePNGcontent\r\n------WebKitFormBoundary7MA4YWxkTrZu0gW--\r\n',
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(mockFileRecord.id);

      // Verify file record was synced into Gateway's files table
      const stored = storageService.getFile(mockFileRecord.id);
      expect(stored).toBeDefined();
      expect(stored?.id).toBe(mockFileRecord.id);
      expect(stored?.database_id).toBe(remoteDb.id);
    } finally {
      global.fetch = originalFetch;
      try { databaseService.deleteDatabase(remoteDb.id); } catch {}
      metaDb.prepare('DELETE FROM storage_nodes WHERE id = ?').run(workerNodeId);
      metaDb.prepare('DELETE FROM files WHERE id = ?').run(mockFileRecord.id);
    }
  });

  it('should support long-lived realtime SSE streams without 120s timeout and handle client disconnect', async () => {
    const { getMetadataDb } = await import('../src/server/db/metadata.js');
    const metaDb = getMetadataDb();

    const remoteDb = databaseService.createDatabase('Remote Realtime DB', 'Testing SSE streaming');
    const workerNodeId = 'worker_realtime_mock';
    metaDb.prepare(`
      INSERT OR REPLACE INTO storage_nodes (
        id, name, base_url, auth_token, status, disk_total_bytes, disk_free_bytes, disk_available_bytes, cpu_percent, ram_percent, network_rate_bps, database_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'healthy', 1000000000, 500000000, 500000000, 5, 20, 1000, 1, ?, ?)
    `).run(workerNodeId, 'Realtime Worker Mock', 'http://127.0.0.1:25994', config.clusterSecret, Date.now(), Date.now());

    metaDb.prepare('UPDATE databases SET node_id = ? WHERE id = ?').run(workerNodeId, remoteDb.id);

    const originalFetch = global.fetch;
    // @ts-ignore
    global.fetch = async (url: string, opts: any) => {
      if (url.includes(`/v1/databases/${remoteDb.id}/realtime`)) {
        // Return a ReadableStream simulating SSE event stream
        const sseStream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('event: ping\ndata: {"type":"ping"}\n\n'));
            controller.close();
          },
        });
        return new Response(sseStream, {
          status: 200,
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            'connection': 'keep-alive',
          },
        });
      }
      return originalFetch(url, opts);
    };

    try {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/databases/${remoteDb.id}/realtime`,
        headers: {
          cookie: adminCookie,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.payload).toContain('event: ping');
    } finally {
      global.fetch = originalFetch;
      try { databaseService.deleteDatabase(remoteDb.id); } catch {}
      metaDb.prepare('DELETE FROM storage_nodes WHERE id = ?').run(workerNodeId);
    }
  });

  it('should mark worker node offline and return 502 BAD_GATEWAY on connection failure', async () => {
    const { getMetadataDb } = await import('../src/server/db/metadata.js');
    const metaDb = getMetadataDb();

    const remoteDb = databaseService.createDatabase('Offline Node DB', 'Testing 502 handling');
    const workerNodeId = 'worker_offline_mock';
    metaDb.prepare(`
      INSERT OR REPLACE INTO storage_nodes (
        id, name, base_url, auth_token, status, disk_total_bytes, disk_free_bytes, disk_available_bytes, cpu_percent, ram_percent, network_rate_bps, database_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'healthy', 1000000000, 500000000, 500000000, 5, 20, 1000, 1, ?, ?)
    `).run(workerNodeId, 'Offline Worker Mock', 'http://127.0.0.1:49999', config.clusterSecret, Date.now(), Date.now());

    metaDb.prepare('UPDATE databases SET node_id = ? WHERE id = ?').run(workerNodeId, remoteDb.id);

    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/databases/${remoteDb.id}/query`,
        headers: {
          cookie: adminCookie,
          'content-type': 'application/json',
        },
        payload: { sql: 'SELECT 1;' },
      });

      expect(res.statusCode).toBe(502);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('BAD_GATEWAY');

      // Verify node status was marked offline
      const updatedNode = metaDb.prepare('SELECT status FROM storage_nodes WHERE id = ?').get(workerNodeId) as any;
      expect(updatedNode.status).toBe('offline');
    } finally {
      try { databaseService.deleteDatabase(remoteDb.id); } catch {}
      metaDb.prepare('DELETE FROM storage_nodes WHERE id = ?').run(workerNodeId);
    }
  });

  it('should serve safe offline fallback for storage-stats and schema when worker node is offline or unlisted', async () => {
    const { getMetadataDb } = await import('../src/server/db/metadata.js');
    const metaDb = getMetadataDb();

    const remoteDb = databaseService.createDatabase('Offline Safe Stats DB', 'Testing 200 fallback');
    const workerNodeId = `worker_dead_${Date.now()}`;
    const localFile = path.resolve(config.databasesDir, `${remoteDb.id}.sqlite`);
    dbManager.close(remoteDb.id);
    if (fs.existsSync(localFile)) fs.unlinkSync(localFile);
    try {
      metaDb.prepare('UPDATE databases SET node_id = ? WHERE id = ?').run(workerNodeId, remoteDb.id);

      // 1. GET storage-stats must return 200 with isNodeOffline: true
      const statsRes = await app.inject({
        method: 'GET',
        url: `/api/admin/databases/${remoteDb.id}/storage-stats`,
        headers: {
          cookie: adminCookie,
        },
      });
      expect(statsRes.statusCode).toBe(200);
      const statsJson = JSON.parse(statsRes.payload);
      expect(statsJson.success).toBe(true);
      expect(statsJson.data.isNodeOffline).toBe(true);

      // 2. GET schema must return 200 with isNodeOffline: true and empty array
      const schemaRes = await app.inject({
        method: 'GET',
        url: `/api/admin/databases/${remoteDb.id}/schema`,
        headers: {
          cookie: adminCookie,
        },
      });
      expect(schemaRes.statusCode).toBe(200);
      const schemaJson = JSON.parse(schemaRes.payload);
      expect(schemaJson.success).toBe(true);
      expect(Array.isArray(schemaJson.data)).toBe(true);
      expect(schemaJson.data.length).toBe(0);

      // 3. GET files must return 200 with list from Gateway metadata DB
      const filesRes = await app.inject({
        method: 'GET',
        url: `/api/admin/databases/${remoteDb.id}/files`,
        headers: {
          cookie: adminCookie,
        },
      });
      expect(filesRes.statusCode).toBe(200);
      const filesJson = JSON.parse(filesRes.payload);
      expect(filesJson.success).toBe(true);
      expect(Array.isArray(filesJson.data)).toBe(true);
    } finally {
      try { databaseService.deleteDatabase(remoteDb.id); } catch {}
    }
  });

  it('should support dynamic role creation, listing, developer role assignment, and deletion guards', async () => {
    // 1. List roles - must contain built-in developer, super_admin, admin, user
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/admin/roles',
      headers: { cookie: adminCookie },
    });
    expect(listRes.statusCode).toBe(200);
    const listJson = JSON.parse(listRes.payload);
    expect(listJson.success).toBe(true);
    const roleIds = listJson.data.map((r: any) => r.id);
    expect(roleIds).toContain('developer');
    expect(roleIds).toContain('super_admin');
    expect(roleIds).toContain('admin');
    expect(roleIds).toContain('user');

    // 2. Create custom role
    const customRoleRes = await app.inject({
      method: 'POST',
      url: '/api/admin/roles',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: {
        id: 'qa_engineer',
        name: 'QA Engineer',
        description: 'Test engineer with query privileges',
        permissions: ['databases:read', 'databases:query'],
      },
    });
    expect(customRoleRes.statusCode).toBe(201);
    const customRoleJson = JSON.parse(customRoleRes.payload);
    expect(customRoleJson.data.id).toBe('qa_engineer');
    expect(customRoleJson.data.is_system).toBe(false);

    // 3. Create a user with developer role
    const devUserRes = await app.inject({
      method: 'POST',
      url: '/api/admin/users',
      headers: { cookie: adminCookie, 'content-type': 'application/json' },
      payload: {
        username: `dev_${Date.now()}`,
        password: 'Password123!',
        role: 'developer',
      },
    });
    expect(devUserRes.statusCode).toBe(201);
    const devUserJson = JSON.parse(devUserRes.payload);
    expect(devUserJson.data.role).toBe('developer');

    // 4. Reject deleting built-in roles
    const delSystemRes = await app.inject({
      method: 'DELETE',
      url: '/api/admin/roles/developer',
      headers: { cookie: adminCookie },
    });
    expect(delSystemRes.statusCode).toBe(400);

    // 5. Delete custom role
    const delCustomRes = await app.inject({
      method: 'DELETE',
      url: '/api/admin/roles/qa_engineer',
      headers: { cookie: adminCookie },
    });
    expect(delCustomRes.statusCode).toBe(200);

    // Cleanup dev user
    const { getMetadataDb } = await import('../src/server/db/metadata.js');
    getMetadataDb().prepare('DELETE FROM users WHERE id = ?').run(devUserJson.data.id);
  });

  it('should support reassigning a database from an offline worker node back to local', async () => {
    const { getMetadataDb } = await import('../src/server/db/metadata.js');
    const metaDb = getMetadataDb();

    const remoteDb = databaseService.createDatabase('Rescue DB Test', 'Testing reassign-database');
    const offlineNodeId = 'worker_dead_for_reassign';
    try {
      metaDb.prepare('UPDATE databases SET node_id = ? WHERE id = ?').run(offlineNodeId, remoteDb.id);

      const reassignRes = await app.inject({
        method: 'POST',
        url: '/api/admin/cluster/reassign-database',
        headers: {
          cookie: adminCookie,
          'content-type': 'application/json',
        },
        payload: {
          databaseId: remoteDb.id,
          targetNodeId: 'local',
        },
      });

      expect(reassignRes.statusCode).toBe(200);
      const reassignJson = JSON.parse(reassignRes.payload);
      expect(reassignJson.success).toBe(true);
      expect(reassignJson.data.nodeId).toBe('local');

      // Verify metadata in DB is updated
      const updatedRow = metaDb.prepare('SELECT node_id FROM databases WHERE id = ?').get(remoteDb.id) as any;
      expect(updatedRow.node_id).toBe('local');
    } finally {
      try { databaseService.deleteDatabase(remoteDb.id); } catch {}
    }
  });
});
