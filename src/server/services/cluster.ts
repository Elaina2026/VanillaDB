import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getMetadataDb } from '../db/metadata.js';
import { dbManager } from '../db/manager.js';
import { systemService } from './system.js';
import type {
  StorageNodeRecord,
  StorageNodeStatus,
  NodeMetrics,
  ClusterStatus,
} from '../../../shared/index.js';

export class ClusterService {
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastCpuUsage: NodeJS.CpuUsage | null = null;
  private lastCpuSampleTime: number = Date.now();
  private cachedLocalCpuPercent: number = 0;

  constructor() {
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuSampleTime = Date.now();
  }

  public start(): void {
    if (this.heartbeatInterval) return;
    // Initial ping after 3s, then poll every 15s
    setTimeout(() => {
      this.pollNodesHeartbeat().catch(err => {
        logger.warn({ err }, 'Cluster heartbeat initial poll error');
      });
    }, 3000);

    this.heartbeatInterval = setInterval(() => {
      this.pollNodesHeartbeat().catch(err => {
        logger.warn({ err }, 'Cluster heartbeat background poll error');
      });
    }, 15000);
    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }
  }

  public stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Sample local hardware metrics (CPU, RAM, Disk, Network)
   */
  public getLocalMetrics(): NodeMetrics {
    const now = Date.now();
    const elapsedSec = (now - this.lastCpuSampleTime) / 1000;

    if (elapsedSec >= 1 && this.lastCpuUsage) {
      const currentCpuUsage = process.cpuUsage(this.lastCpuUsage);
      const cpus = os.cpus().length || 1;
      const totalMicros = elapsedSec * 1000000 * cpus;
      const usedMicros = currentCpuUsage.user + currentCpuUsage.system;
      this.cachedLocalCpuPercent = Math.min(100, Math.max(0, Math.round((usedMicros / totalMicros) * 1000) / 10));
      this.lastCpuUsage = process.cpuUsage();
      this.lastCpuSampleTime = now;
    }

    const totalRam = os.totalmem();
    const freeRam = os.freemem();
    const usedRam = totalRam - freeRam;
    const ramPercent = Math.round((usedRam / totalRam) * 1000) / 10;

    let diskTotal = 0;
    let diskFree = 0;
    let diskAvailable = 0;
    try {
      const stat = fs.statfsSync(config.databasesDir);
      diskTotal = stat.bsize * stat.blocks;
      diskFree = stat.bsize * stat.bfree;
      diskAvailable = stat.bsize * stat.bavail;
    } catch {
      // Fallback
      diskTotal = 100 * 1024 * 1024 * 1024;
      diskFree = 50 * 1024 * 1024 * 1024;
      diskAvailable = diskFree;
    }

    // When container/hosting quota is explicitly configured, cap physical partition size
    let effectiveTotalGb = config.hostDiskGb || 0;
    try {
      const settings = systemService.getSettings();
      if (settings.host_disk_total_gb) {
        effectiveTotalGb = settings.host_disk_total_gb;
      }
    } catch {
      // Ignore if systemService not ready
    }

    if (effectiveTotalGb > 0) {
      diskTotal = effectiveTotalGb * 1024 * 1024 * 1024;
      let used = 0;
      try {
        used = systemService.getMetricsHistory().current?.totalStorageBytes || 0;
      } catch {
        used = 0;
      }
      diskAvailable = Math.max(0, diskTotal - used);
      diskFree = diskAvailable;
    }

    const diskUsed = Math.max(0, diskTotal - diskAvailable);
    const diskUsedPercent = diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 1000) / 10 : 0;

    let networkInRate = 0;
    let networkOutRate = 0;
    try {
      const currentPoint = systemService.getMetricsHistory().current;
      networkInRate = currentPoint.networkInRate || 0;
      networkOutRate = currentPoint.networkOutRate || 0;
    } catch {
      // Ignore if systemService metrics not ready
    }

    let databaseCount = 0;
    try {
      const row = getMetadataDb().prepare(
        "SELECT COUNT(*) as count FROM databases WHERE node_id = 'local' OR node_id = ? OR node_id IS NULL"
      ).get(config.nodeId) as { count: number } | undefined;
      databaseCount = row?.count || 0;
    } catch {
      // Ignore
    }

    return {
      nodeId: config.nodeId || 'local',
      status: 'healthy',
      cpuPercent: this.cachedLocalCpuPercent,
      ramPercent,
      ramUsedBytes: usedRam,
      ramTotalBytes: totalRam,
      diskTotalBytes: diskTotal,
      diskFreeBytes: diskFree,
      diskAvailableBytes: diskAvailable,
      diskUsedPercent,
      networkInRateBps: networkInRate,
      networkOutRateBps: networkOutRate,
      totalNetworkRateBps: networkInRate + networkOutRate,
      databaseCount,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: now,
    };
  }

  /**
   * Return aggregated cluster overview including local host and all worker nodes
   */
  public getClusterStatus(): ClusterStatus {
    const metaDb = getMetadataDb();
    const local = this.getLocalMetrics();

    const localNodeRecord: StorageNodeRecord = {
      id: 'local',
      name: `Primary Host (${os.hostname()})`,
      base_url: `http://${config.host}:${config.port}`,
      status: 'healthy',
      last_heartbeat_at: Date.now(),
      created_at: 0,
      updated_at: Date.now(),
      disk_total_bytes: local.diskTotalBytes,
      disk_free_bytes: local.diskFreeBytes,
      disk_available_bytes: local.diskAvailableBytes,
      disk_used_percent: local.diskUsedPercent,
      cpu_percent: local.cpuPercent,
      ram_percent: local.ramPercent,
      network_rate_bps: local.totalNetworkRateBps,
      database_count: local.databaseCount,
      is_local: true,
    };

    const workerRows = metaDb.prepare('SELECT * FROM storage_nodes ORDER BY created_at ASC').all() as any[];
    const workerNodes: StorageNodeRecord[] = workerRows.map(row => ({
      id: row.id,
      name: row.name,
      base_url: row.base_url,
      // auth_token is an internal cluster secret and must not be exposed in status listings
      status: (row.status as StorageNodeStatus) || 'offline',
      last_heartbeat_at: row.last_heartbeat_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      disk_total_bytes: row.disk_total_bytes || 0,
      disk_free_bytes: row.disk_free_bytes || 0,
      disk_available_bytes: row.disk_available_bytes || 0,
      disk_used_percent: row.disk_total_bytes > 0
        ? Math.round(((row.disk_total_bytes - row.disk_free_bytes) / row.disk_total_bytes) * 1000) / 10
        : 0,
      cpu_percent: row.cpu_percent || 0,
      ram_percent: row.ram_percent || 0,
      network_rate_bps: row.network_rate_bps || 0,
      database_count: row.database_count || 0,
      is_local: false,
    }));

    const allNodes = [localNodeRecord, ...workerNodes];
    const totalNodes = allNodes.length;
    const healthyNodes = allNodes.filter(n => n.status === 'healthy').length;

    const totalClusterDiskBytes = allNodes.reduce((acc, n) => acc + n.disk_total_bytes, 0);
    const freeClusterDiskBytes = allNodes.reduce((acc, n) => acc + n.disk_free_bytes, 0);
    const usedClusterDiskBytes = Math.max(0, totalClusterDiskBytes - freeClusterDiskBytes);
    const usedClusterDiskPercent = totalClusterDiskBytes > 0
      ? Math.round((usedClusterDiskBytes / totalClusterDiskBytes) * 1000) / 10
      : 0;

    // Local node disk considered full if used >= 85% OR free < 5GB
    const localNodeFull = local.diskUsedPercent >= 85 || local.diskFreeBytes < 5 * 1024 * 1024 * 1024;
    const spilloverActive = localNodeFull && workerNodes.some(w => w.status === 'healthy' && w.disk_free_bytes >= 5 * 1024 * 1024 * 1024);

    return {
      totalNodes,
      healthyNodes,
      totalClusterDiskBytes,
      freeClusterDiskBytes,
      usedClusterDiskPercent,
      localNodeFull,
      spilloverActive,
      nodes: allNodes,
    };
  }

  /**
   * Determine node placement for a new database.
   * If local disk is full (> 85% or < 5GB free), spills over to healthy worker node with most free space.
   */
  public selectPlacementNode(): { nodeId: string; isSpillover: boolean; reason?: string } {
    const local = this.getLocalMetrics();
    const isLocalFull = local.diskUsedPercent >= 85 || local.diskFreeBytes < 5 * 1024 * 1024 * 1024;

    if (!isLocalFull) {
      return { nodeId: 'local', isSpillover: false };
    }

    // Local host disk is full; find best available worker node
    const metaDb = getMetadataDb();
    const candidate = metaDb.prepare(`
      SELECT id, name, disk_free_bytes
      FROM storage_nodes
      WHERE status = 'healthy' AND disk_free_bytes >= 5368709120
      ORDER BY disk_free_bytes DESC
      LIMIT 1
    `).get() as { id: string; name: string; disk_free_bytes: number } | undefined;

    if (candidate) {
      logger.warn(
        { localDiskUsed: local.diskUsedPercent, targetNode: candidate.id, targetName: candidate.name },
        'Local host disk storage full. Activating auto-spillover to worker node'
      );
      return {
        nodeId: candidate.id,
        isSpillover: true,
        reason: `Local disk is ${local.diskUsedPercent}% full (<5GB free). Spilled over to ${candidate.name}.`,
      };
    }

    // No worker node with >=5GB free found; fallback to local with warning
    logger.error('Storage alert: Local disk is full and no healthy worker nodes with >=5GB free space are available!');
    return {
      nodeId: 'local',
      isSpillover: false,
      reason: 'Local disk full, but no healthy worker nodes found with sufficient capacity.',
    };
  }

  /**
   * Register a new worker host Node.js instance
   */
  public async addNode(params: { name: string; baseUrl: string; authToken?: string | null }): Promise<StorageNodeRecord> {
    const metaDb = getMetadataDb();
    const normalizedUrl = params.baseUrl.trim().replace(/\/+$/, '');

    // Test connectivity to target node
    let stats: NodeMetrics;
    try {
      const res = await fetch(`${normalizedUrl}/api/internal/node/stats`, {
        method: 'GET',
        headers: {
          'x-cluster-secret': params.authToken || config.clusterSecret,
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        throw new Error(`Worker node responded with HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json() as any;
      if (!json.success || !json.data) {
        throw new Error('Invalid response structure from worker node');
      }
      stats = json.data;
    } catch (err: any) {
      throw new Error(`Cannot connect to worker node at ${normalizedUrl}: ${err.message}`);
    }

    const id = `node_${crypto.randomBytes(8).toString('hex')}`;
    const now = Date.now();

    metaDb.prepare(`
      INSERT INTO storage_nodes (
        id, name, base_url, auth_token, status, last_heartbeat_at,
        created_at, updated_at, disk_total_bytes, disk_free_bytes,
        disk_available_bytes, cpu_percent, ram_percent, network_rate_bps, database_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.name.trim(),
      normalizedUrl,
      params.authToken || null,
      'healthy',
      now,
      now,
      now,
      stats.diskTotalBytes || 0,
      stats.diskFreeBytes || 0,
      stats.diskAvailableBytes || 0,
      stats.cpuPercent || 0,
      stats.ramPercent || 0,
      stats.totalNetworkRateBps || 0,
      stats.databaseCount || 0
    );

    return {
      id,
      name: params.name.trim(),
      base_url: normalizedUrl,
      auth_token: params.authToken || null,
      status: 'healthy',
      last_heartbeat_at: now,
      created_at: now,
      updated_at: now,
      disk_total_bytes: stats.diskTotalBytes || 0,
      disk_free_bytes: stats.diskFreeBytes || 0,
      disk_available_bytes: stats.diskAvailableBytes || 0,
      disk_used_percent: stats.diskUsedPercent || 0,
      cpu_percent: stats.cpuPercent || 0,
      ram_percent: stats.ramPercent || 0,
      network_rate_bps: stats.totalNetworkRateBps || 0,
      database_count: stats.databaseCount || 0,
      is_local: false,
    };
  }

  /**
   * Remove a worker node (guards against removing nodes hosting active databases)
   */
  public removeNode(nodeId: string): void {
    const metaDb = getMetadataDb();
    const countRow = metaDb.prepare('SELECT COUNT(*) as count FROM databases WHERE node_id = ?').get(nodeId) as { count: number };
    if (countRow && countRow.count > 0) {
      throw new Error(`Cannot remove node "${nodeId}": It currently hosts ${countRow.count} databases. Please migrate them first.`);
    }

    metaDb.prepare('DELETE FROM storage_nodes WHERE id = ?').run(nodeId);
  }

  /**
   * Poll worker nodes for heartbeats and resource telemetry
   */
  public async pollNodesHeartbeat(): Promise<void> {
    const metaDb = getMetadataDb();
    const nodes = metaDb.prepare('SELECT * FROM storage_nodes').all() as any[];

    await Promise.allSettled(
      nodes.map(async (node) => {
        try {
          const res = await fetch(`${node.base_url}/api/internal/node/stats`, {
            method: 'GET',
            headers: {
              'x-cluster-secret': node.auth_token || config.clusterSecret,
            },
            signal: AbortSignal.timeout(3000),
          });

          if (res.ok) {
            const json = (await res.json()) as any;
            if (json.success && json.data) {
              const data: NodeMetrics = json.data;
              metaDb.prepare(`
                UPDATE storage_nodes
                SET status = 'healthy',
                    last_heartbeat_at = ?,
                    updated_at = ?,
                    disk_total_bytes = ?,
                    disk_free_bytes = ?,
                    disk_available_bytes = ?,
                    cpu_percent = ?,
                    ram_percent = ?,
                    network_rate_bps = ?,
                    database_count = ?
                WHERE id = ?
              `).run(
                Date.now(),
                Date.now(),
                data.diskTotalBytes || 0,
                data.diskFreeBytes || 0,
                data.diskAvailableBytes || 0,
                data.cpuPercent || 0,
                data.ramPercent || 0,
                data.totalNetworkRateBps || 0,
                data.databaseCount || 0,
                node.id
              );
              return;
            }
          }
          metaDb.prepare("UPDATE storage_nodes SET status = 'unhealthy', updated_at = ? WHERE id = ?").run(Date.now(), node.id);
        } catch {
          metaDb.prepare("UPDATE storage_nodes SET status = 'offline', updated_at = ? WHERE id = ?").run(Date.now(), node.id);
        }
      })
    );
  }

  /**
   * Transparently forward API requests to the remote worker host
   */
  public async proxyToNode(nodeId: string, req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const metaDb = getMetadataDb();
    const node = metaDb.prepare('SELECT * FROM storage_nodes WHERE id = ?').get(nodeId) as any;
    if (!node) {
      return reply.status(502).send({
        success: false,
        error: { code: 'BAD_GATEWAY', message: `Target storage node "${nodeId}" not found in cluster metadata.` },
      });
    }

    const targetUrl = `${node.base_url.replace(/\/+$/, '')}${req.raw.url}`;
    const headers: Record<string, string> = {};

    // Forward relevant headers
    for (const [key, val] of Object.entries(req.headers)) {
      if (!val) continue;
      const lower = key.toLowerCase();
      if (['host', 'connection', 'content-length'].includes(lower)) continue;
      headers[lower] = Array.isArray(val) ? val.join(', ') : String(val);
    }
    headers['x-cluster-secret'] = node.auth_token || config.clusterSecret;
    headers['x-forwarded-host'] = req.headers.host || '';

    try {
      let body: any = undefined;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        if (req.body) {
          body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
          if (!headers['content-type']) {
            headers['content-type'] = 'application/json';
          }
        }
      }

      const remoteRes = await fetch(targetUrl, {
        method: req.method,
        headers,
        body,
        // @ts-ignore
        duplex: body ? 'half' : undefined,
      });

      reply.status(remoteRes.status);
      remoteRes.headers.forEach((value, name) => {
        const lower = name.toLowerCase();
        if (['content-length', 'transfer-encoding', 'connection'].includes(lower)) return;
        reply.header(name, value);
      });

      if (remoteRes.body) {
        // Stream back to client
        const stream = Readable.fromWeb(remoteRes.body as any);
        return reply.send(stream);
      } else {
        return reply.send();
      }
    } catch (err: any) {
      logger.error({ err, targetUrl }, 'Cluster proxy request failed');
      return reply.status(502).send({
        success: false,
        error: { code: 'GATEWAY_ERROR', message: `Failed to proxy request to worker host: ${err.message}` },
      });
    }
  }

  /**
   * Migrate an entire SQLite database and its media files to another host with ZERO data loss
   */
  public async migrateDatabase(databaseId: string, targetNodeId: string): Promise<{ success: boolean; message: string }> {
    const metaDb = getMetadataDb();
    const dbRow = metaDb.prepare('SELECT * FROM databases WHERE id = ?').get(databaseId) as any;
    if (!dbRow) {
      throw new Error(`Database not found: ${databaseId}`);
    }

    const currentNodeId = dbRow.node_id || 'local';
    if (currentNodeId === targetNodeId) {
      throw new Error(`Database is already on target node "${targetNodeId}".`);
    }

    if (targetNodeId !== 'local') {
      const targetNode = metaDb.prepare('SELECT * FROM storage_nodes WHERE id = ?').get(targetNodeId) as any;
      if (!targetNode || targetNode.status !== 'healthy') {
        throw new Error(`Target node "${targetNodeId}" is offline or unhealthy.`);
      }

      // 1. Prepare temp snapshot using VACUUM INTO
      const tempSnapshot = path.resolve(config.tempDir, `${databaseId}_migrating_${Date.now()}.sqlite`);
      try {
        const localHandle = dbManager.get(databaseId);
        const safeTempPath = tempSnapshot.replace(/\\/g, '/').replace(/'/g, "''");
        localHandle.exec(`VACUUM INTO '${safeTempPath}';`);
      } catch (err: any) {
        throw new Error(`Failed to create consistent SQLite snapshot: ${err.message}`);
      }

      // 2. Stream snapshot to target node
      try {
        const fileData = fs.readFileSync(tempSnapshot);
        const uploadRes = await fetch(`${targetNode.base_url}/api/internal/node/databases/${databaseId}/receive`, {
          method: 'POST',
          headers: {
            'x-cluster-secret': targetNode.auth_token || config.clusterSecret,
            'content-type': 'application/octet-stream',
          },
          body: fileData,
        });

        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          throw new Error(`Target worker rejected database snapshot: ${uploadRes.status} ${errText}`);
        }
      } finally {
        if (fs.existsSync(tempSnapshot)) {
          fs.unlinkSync(tempSnapshot);
        }
      }

      // 3. Close and purge local SQLite handle and files
      dbManager.close(databaseId);
      const localDbPath = path.resolve(config.databasesDir, dbRow.filename || `${databaseId}.sqlite`);
      if (fs.existsSync(localDbPath)) {
        try { fs.unlinkSync(localDbPath); } catch {}
      }
      if (fs.existsSync(`${localDbPath}-wal`)) {
        try { fs.unlinkSync(`${localDbPath}-wal`); } catch {}
      }
      if (fs.existsSync(`${localDbPath}-shm`)) {
        try { fs.unlinkSync(`${localDbPath}-shm`); } catch {}
      }

      // 4. Update metadata
      metaDb.prepare('UPDATE databases SET node_id = ?, updated_at = ? WHERE id = ?').run(targetNodeId, Date.now(), databaseId);

      return {
        success: true,
        message: `Database "${dbRow.name}" successfully migrated to node ${targetNode.name} without data loss.`,
      };
    } else {
      // Migrating from remote worker back to local host
      const sourceNode = metaDb.prepare('SELECT * FROM storage_nodes WHERE id = ?').get(currentNodeId) as any;
      if (!sourceNode) {
        throw new Error(`Source worker node "${currentNodeId}" not found.`);
      }

      const downloadRes = await fetch(`${sourceNode.base_url}/api/internal/node/databases/${databaseId}/export`, {
        method: 'GET',
        headers: {
          'x-cluster-secret': sourceNode.auth_token || config.clusterSecret,
        },
      });

      if (!downloadRes.ok) {
        throw new Error(`Failed to download database from source worker: HTTP ${downloadRes.status}`);
      }

      const destPath = path.resolve(config.databasesDir, dbRow.filename || `${databaseId}.sqlite`);
      const buffer = Buffer.from(await downloadRes.arrayBuffer());
      fs.writeFileSync(destPath, buffer);

      // Clean up remote
      await fetch(`${sourceNode.base_url}/api/internal/node/databases/${databaseId}`, {
        method: 'DELETE',
        headers: {
          'x-cluster-secret': sourceNode.auth_token || config.clusterSecret,
        },
      }).catch(() => {});

      metaDb.prepare("UPDATE databases SET node_id = 'local', updated_at = ? WHERE id = ?").run(Date.now(), databaseId);

      return {
        success: true,
        message: `Database "${dbRow.name}" successfully migrated back to local host.`,
      };
    }
  }
}

export const clusterService = new ClusterService();
