import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config/index.js';
import { getMetadataDb } from '../db/metadata.js';
import { clusterService } from './cluster.js';
import { logger } from '../utils/logger.js';

export interface HealthCheckResult {
  status: 'operational' | 'degraded' | 'outage';
  service: string;
  uptime: number;
  timestamp: number;
  checks: {
    database: 'ok' | 'degraded' | 'error';
    gateway: 'connected' | 'unreachable' | 'error';
    workers?: 'ok' | 'degraded' | 'offline';
    storageNodes?: string;
    [key: string]: any;
  };
  version?: string;
}

export class HealthService {
  private lastGatewayCheckResult: 'connected' | 'unreachable' = 'connected';
  private lastGatewayCheckTime = 0;
  private lastGatewayWarnLogTime = 0;
  private cachedGatewayUrl: string | null = null;

  /**
   * Evaluate system health status adhering to ProjectStatus standard
   * Supports both Gateway (Primary) and Worker (Storage) node roles.
   */
  public async getHealthStatus(overrides?: {
    nodeRole?: 'worker' | 'gateway';
    gatewayUrl?: string | null;
    serviceName?: string | null;
  }): Promise<{ statusCode: number; body: HealthCheckResult }> {
    const role = overrides?.nodeRole || config.nodeRole;
    const isWorker = role === 'worker' || (config.nodeId !== 'local' && role !== 'gateway');
    const defaultServiceName = isWorker
      ? (config.nodeId && config.nodeId !== 'local' ? `vanilladb-worker-${config.nodeId}` : 'vanilladb-worker')
      : 'vanilladb-gateway';
    const service = overrides?.serviceName || config.serviceName || defaultServiceName;
    const uptime = Math.floor(process.uptime());
    const timestamp = Date.now();

    let databaseCheck: 'ok' | 'degraded' | 'error' = 'ok';
    let gatewayCheck: 'connected' | 'unreachable' | 'error' = 'connected';
    let isDegraded = false;

    // 1. Evaluate database readiness
    if (isWorker) {
      try {
        if (!fs.existsSync(config.databasesDir)) {
          fs.mkdirSync(config.databasesDir, { recursive: true });
        }
        fs.accessSync(config.databasesDir, fs.constants.R_OK | fs.constants.W_OK);
        const testDb = new DatabaseSync(':memory:');
        testDb.exec('SELECT 1;');
        testDb.close();
      } catch (err) {
        databaseCheck = 'error';
        logger.error({ err }, 'Worker node storage/sqlite health check failed');
      }
    } else {
      try {
        const metaDb = getMetadataDb();
        metaDb.prepare('SELECT 1').get();
      } catch (err) {
        databaseCheck = 'error';
        logger.error({ err }, 'Gateway metadata database health check failed');
      }
    }

    // 2. Evaluate gateway & workers connection
    let workersCheck: 'ok' | 'degraded' | 'offline' = 'ok';
    let workerStats: { total: number; healthy: number; offline: number } | undefined = undefined;

    if (isWorker) {
      const targetGatewayUrl = overrides?.gatewayUrl !== undefined ? overrides.gatewayUrl : config.gatewayUrl;
      if (targetGatewayUrl) {
        const now = Date.now();
        const isSameTarget = this.cachedGatewayUrl === targetGatewayUrl;
        const cacheAgeMs = now - this.lastGatewayCheckTime;

        // Cache gateway check for 15s when running in production to avoid log spam & connection timeouts
        if (isSameTarget && cacheAgeMs < 15_000 && overrides?.gatewayUrl === undefined) {
          gatewayCheck = this.lastGatewayCheckResult;
        } else {
          this.cachedGatewayUrl = targetGatewayUrl;
          try {
            const pingUrl = `${targetGatewayUrl.replace(/\/+$/, '')}/health`;
            const res = await fetch(pingUrl, {
              method: 'HEAD',
              headers: {
                'x-cluster-secret': config.clusterSecret,
              },
              signal: AbortSignal.timeout(7000),
            });
            if (res.ok || res.status === 503) {
              gatewayCheck = 'connected';
              this.lastGatewayCheckResult = 'connected';
              this.lastGatewayCheckTime = now;
            } else {
              gatewayCheck = 'unreachable';
              this.lastGatewayCheckResult = 'unreachable';
              this.lastGatewayCheckTime = now;
              if (now - this.lastGatewayWarnLogTime > 300_000) {
                logger.warn({ gatewayUrl: targetGatewayUrl, status: res.status }, 'Worker failed to reach Gateway during health check (throttled)');
                this.lastGatewayWarnLogTime = now;
              }
            }
          } catch (err: any) {
            gatewayCheck = 'unreachable';
            this.lastGatewayCheckResult = 'unreachable';
            this.lastGatewayCheckTime = now;
            if (now - this.lastGatewayWarnLogTime > 300_000) {
              logger.warn({ err: err?.message || String(err), gatewayUrl: targetGatewayUrl }, 'Worker failed to reach Gateway during health check (throttled)');
              this.lastGatewayWarnLogTime = now;
            }
          }
        }
      } else {
        // When no remote gateway URL is provided, worker node functions in standalone/direct mode
        gatewayCheck = 'connected';
      }
    } else {
      // Primary gateway is connected
      gatewayCheck = 'connected';

      try {
        const metaDb = getMetadataDb();
        const nodes = metaDb.prepare('SELECT id, name, base_url, auth_token, status FROM storage_nodes').all() as Array<{
          id: string;
          name: string;
          base_url: string;
          auth_token?: string | null;
          status: string;
        }>;

        if (nodes.length > 0) {
          let healthyCount = 0;
          let offlineCount = 0;

          await Promise.all(
            nodes.map(async (node) => {
              try {
                const pingUrl = `${node.base_url.replace(/\/+$/, '')}/health`;
                const res = await fetch(pingUrl, {
                  method: 'GET',
                  headers: {
                    'x-cluster-secret': node.auth_token || config.clusterSecret,
                  },
                  signal: AbortSignal.timeout(7000), // Upgraded to 7000ms
                });

                if (res.ok) {
                  const json = (await res.json()) as any;
                  if (json.status === 'operational' || json.status === 'degraded') {
                    healthyCount++;
                    clusterService.recordNodeSuccess(node.id);
                    return;
                  }
                }
                offlineCount++;
                clusterService.recordNodeFailure(node.id, `Worker responded HTTP ${res.status}`);
              } catch (err: any) {
                offlineCount++;
                clusterService.recordNodeFailure(node.id, err?.message || 'Health probe failed');
              }
            })
          );

          workerStats = { total: nodes.length, healthy: healthyCount, offline: offlineCount };

          if (offlineCount === 0) {
            workersCheck = 'ok';
          } else if (healthyCount > 0) {
            workersCheck = 'degraded';
            isDegraded = true;
          } else {
            workersCheck = 'offline';
            isDegraded = true;
          }
        }
      } catch (err) {
        logger.warn({ err }, 'Error checking worker nodes health from Gateway');
      }
    }

    // 3. Evaluate resource degradation (disk pressure >= 90% or ram pressure >= 95%)
    try {
      const localMetrics = clusterService.getLocalMetrics();
      if (localMetrics.diskUsedPercent >= 90 || localMetrics.ramPercent >= 95) {
        isDegraded = true;
      }
    } catch {
      // Non-fatal if metrics sampling fails
    }

    // 4. Derive overall status and HTTP status code
    let status: 'operational' | 'degraded' | 'outage' = 'operational';
    if (databaseCheck === 'error' || gatewayCheck !== 'connected') {
      status = 'outage';
    } else if (isDegraded || workersCheck === 'degraded' || workersCheck === 'offline') {
      status = 'degraded';
    }

    const statusCode = status === 'outage' ? 503 : 200;

    return {
      statusCode,
      body: {
        status,
        service,
        uptime,
        timestamp,
        checks: {
          database: databaseCheck,
          gateway: gatewayCheck,
          ...(workerStats
            ? {
                workers: workersCheck,
                storageNodes: `${workerStats.healthy}/${workerStats.total} healthy${workerStats.offline > 0 ? ` (${workerStats.offline} offline)` : ''}`,
              }
            : {}),
        },
        version: '1.3.2',
      },
    };
  }
}

export const healthService = new HealthService();
