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
    [key: string]: string;
  };
  version?: string;
}

export class HealthService {
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

    // 2. Evaluate gateway connection
    if (isWorker) {
      const targetGatewayUrl = overrides?.gatewayUrl !== undefined ? overrides.gatewayUrl : config.gatewayUrl;
      if (targetGatewayUrl) {
        try {
          const pingUrl = `${targetGatewayUrl.replace(/\/+$/, '')}/health`;
          const res = await fetch(pingUrl, {
            method: 'HEAD',
            headers: {
              'x-cluster-secret': config.clusterSecret,
            },
            signal: AbortSignal.timeout(3000),
          });
          if (!res.ok) {
            gatewayCheck = 'unreachable';
          }
        } catch (err) {
          gatewayCheck = 'unreachable';
          logger.warn({ err, gatewayUrl: targetGatewayUrl }, 'Worker failed to reach Gateway during health check');
        }
      } else {
        // When no remote gateway URL is provided, worker node functions in standalone/direct mode
        gatewayCheck = 'connected';
      }
    } else {
      // Primary gateway is connected by definition
      gatewayCheck = 'connected';
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
    } else if (isDegraded) {
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
        },
        version: '1.3.2',
      },
    };
  }
}

export const healthService = new HealthService();
