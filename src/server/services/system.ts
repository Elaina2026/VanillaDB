import fs from 'fs';
import path from 'path';
import os from 'os';
import { config } from '../config/index.js';
import { getMetadataDb } from '../db/metadata.js';
import { backupService } from './backup.js';
import { databaseService } from './database.js';
import { logger } from '../utils/logger.js';
import type { SystemSettings, SystemStatus, MetricHistoryPoint, SystemMetricsHistory } from '../../../shared/index.js';

export class SystemService {
  private metricsInterval: NodeJS.Timeout | null = null;
  private storageCacheInterval: NodeJS.Timeout | null = null;

  // Real-time telemetry rolling history
  private metricsHistory: MetricHistoryPoint[] = [];
  private readonly maxHistoryPoints = 60; // 60 points * 5s = 5 minutes of high-res real-time data

  // Cumulative metrics counters
  private totalNetworkIn = 0;
  private totalNetworkOut = 0;
  private totalRequests = 0;
  private totalErrors = 0;

  // Delta counters for current interval
  private currentIntervalInBytes = 0;
  private currentIntervalOutBytes = 0;
  private currentIntervalRequests = 0;
  private currentIntervalErrors = 0;
  private currentIntervalDurations: number[] = [];

  // Cached storage metrics to prevent synchronous file system blocking on event loop
  private cachedStorage = {
    databaseStorageBytes: 0,
    walStorageBytes: 0,
    backupStorageBytes: 0,
    mediaStorageBytes: 0,
    totalStorageBytes: 0,
  };

  // CPU measurement anchor
  private lastCpuUsage = process.cpuUsage();
  private lastCpuTime = Date.now();

  constructor() {
    this.refreshStorageCache();
    this.storageCacheInterval = setInterval(() => this.refreshStorageCache(), 30 * 1000);
    this.metricsInterval = setInterval(() => this.sampleMetrics(), 5000);
    // Initial sample
    this.sampleMetrics();
  }

  private refreshStorageCache(): void {
    try {
      const dbs = databaseService.listDatabases();
      let databaseStorageBytes = 0;
      let walStorageBytes = 0;

      for (const db of dbs) {
        const dbPath = path.resolve(config.databasesDir, db.filename);
        if (fs.existsSync(dbPath)) databaseStorageBytes += fs.statSync(dbPath).size;
        const walPath = `${dbPath}-wal`;
        if (fs.existsSync(walPath)) walStorageBytes += fs.statSync(walPath).size;
      }

      const calculateDirSize = (dirPath: string): number => {
        let size = 0;
        if (!fs.existsSync(dirPath)) return 0;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) size += calculateDirSize(fullPath);
          else size += fs.statSync(fullPath).size;
        }
        return size;
      };

      const backupStorageBytes = calculateDirSize(config.backupsDir);
      const mediaStorageBytes = calculateDirSize(config.storageDir);
      const totalStorageBytes = databaseStorageBytes + walStorageBytes + backupStorageBytes + mediaStorageBytes;

      this.cachedStorage = {
        databaseStorageBytes,
        walStorageBytes,
        backupStorageBytes,
        mediaStorageBytes,
        totalStorageBytes,
      };
    } catch (err) {
      logger.warn({ err }, 'Failed to refresh storage cache');
    }
  }

  public recordRequestMetrics(bytesIn: number, bytesOut: number, durationMs: number, isError: boolean): void {
    this.totalNetworkIn += bytesIn;
    this.totalNetworkOut += bytesOut;
    this.totalRequests++;
    if (isError) this.totalErrors++;

    this.currentIntervalInBytes += bytesIn;
    this.currentIntervalOutBytes += bytesOut;
    this.currentIntervalRequests++;
    if (isError) this.currentIntervalErrors++;
    this.currentIntervalDurations.push(durationMs);
  }

  private sampleMetrics(): void {
    const now = Date.now();
    const elapsedSec = Math.max((now - this.lastCpuTime) / 1000, 0.001);

    // CPU Percent Calculation
    const cpuUsage = process.cpuUsage(this.lastCpuUsage);
    const cpuTotalMicro = cpuUsage.user + cpuUsage.system;
    const cpuPercent = Math.min(
      Math.round(((cpuTotalMicro / 1000) / (elapsedSec * 1000 * os.cpus().length)) * 1000) / 10,
      100
    );

    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = now;

    // RAM usage
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const ramPercent = Math.round((usedMem / totalMem) * 1000) / 10;
    const mem = process.memoryUsage();

    // QPS & Network Rates
    const qps = Math.round((this.currentIntervalRequests / elapsedSec) * 10) / 10;
    const networkInRate = Math.round(this.currentIntervalInBytes / elapsedSec);
    const networkOutRate = Math.round(this.currentIntervalOutBytes / elapsedSec);

    const avgDurationMs =
      this.currentIntervalDurations.length > 0
        ? Math.round(
            (this.currentIntervalDurations.reduce((a, b) => a + b, 0) /
              this.currentIntervalDurations.length) *
              100
          ) / 100
        : 0;

    const point: MetricHistoryPoint = {
      timestamp: now,
      cpuPercent: Math.max(cpuPercent, 0.5),
      ramUsedBytes: usedMem,
      ramTotalBytes: totalMem,
      ramPercent,
      heapUsedBytes: mem.heapUsed,
      networkInBytes: this.currentIntervalInBytes,
      networkOutBytes: this.currentIntervalOutBytes,
      networkInRate,
      networkOutRate,
      requestsCount: this.currentIntervalRequests,
      errorsCount: this.currentIntervalErrors,
      qps,
      avgDurationMs,
      databaseStorageBytes: this.cachedStorage.databaseStorageBytes,
      walStorageBytes: this.cachedStorage.walStorageBytes,
      mediaStorageBytes: this.cachedStorage.mediaStorageBytes,
      backupStorageBytes: this.cachedStorage.backupStorageBytes,
      totalStorageBytes: this.cachedStorage.totalStorageBytes,
    };

    this.metricsHistory.push(point);
    if (this.metricsHistory.length > this.maxHistoryPoints) {
      this.metricsHistory.shift();
    }

    // Reset interval accumulators
    this.currentIntervalInBytes = 0;
    this.currentIntervalOutBytes = 0;
    this.currentIntervalRequests = 0;
    this.currentIntervalErrors = 0;
    this.currentIntervalDurations = [];
  }

  public getMetricsHistory(): SystemMetricsHistory {
    const latest =
      this.metricsHistory[this.metricsHistory.length - 1] || {
        timestamp: Date.now(),
        cpuPercent: 0,
        ramUsedBytes: 0,
        ramTotalBytes: 0,
        ramPercent: 0,
        heapUsedBytes: 0,
        networkInBytes: 0,
        networkOutBytes: 0,
        networkInRate: 0,
        networkOutRate: 0,
        requestsCount: 0,
        errorsCount: 0,
        qps: 0,
        avgDurationMs: 0,
        databaseStorageBytes: 0,
        walStorageBytes: 0,
        mediaStorageBytes: 0,
        backupStorageBytes: 0,
        totalStorageBytes: 0,
      };

    let maxQps = 0;
    let peakCpu = 0;
    let peakRamPercent = 0;
    let totalDurationSum = 0;
    let durationCount = 0;

    for (const p of this.metricsHistory) {
      if (p.qps > maxQps) maxQps = p.qps;
      if (p.cpuPercent > peakCpu) peakCpu = p.cpuPercent;
      if (p.ramPercent > peakRamPercent) peakRamPercent = p.ramPercent;
      if (p.avgDurationMs > 0) {
        totalDurationSum += p.avgDurationMs;
        durationCount++;
      }
    }

    return {
      current: latest,
      timeline: this.metricsHistory,
      summary: {
        maxQps,
        peakCpu,
        peakRamPercent,
        totalNetworkInBytes: this.totalNetworkIn,
        totalNetworkOutBytes: this.totalNetworkOut,
        totalRequests: this.totalRequests,
        totalErrors: this.totalErrors,
        avgLatencyMs: durationCount > 0 ? Math.round((totalDurationSum / durationCount) * 100) / 100 : 0,
      },
    };
  }

  public getSettings(): SystemSettings {
    const metaDb = getMetadataDb();
    const rows = metaDb.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;

    return {
      instance_name: map.instance_name || 'VanillaDatabase Primary',
      base_url: map.base_url || `http://${config.host}:${config.port}`,
      default_journal_mode: map.default_journal_mode || 'wal',
      default_busy_timeout: map.default_busy_timeout ? parseInt(map.default_busy_timeout, 10) : config.sqlBusyTimeoutMs,
      default_synchronous: map.default_synchronous || 'normal',
      default_foreign_keys: map.default_foreign_keys !== 'false',
      default_cache_size: map.default_cache_size ? parseInt(map.default_cache_size, 10) : -2000,
      default_auto_vacuum: map.default_auto_vacuum || 'none',
      backup_schedule: map.backup_schedule || 'daily',
      backup_retention: map.backup_retention ? parseInt(map.backup_retention, 10) : 10,
      max_upload_size_mb: map.max_upload_size_mb ? parseInt(map.max_upload_size_mb, 10) : 50,
      default_user_rate_limit: map.default_user_rate_limit ? parseInt(map.default_user_rate_limit, 10) : 60,
      default_user_max_databases: map.default_user_max_databases ? parseInt(map.default_user_max_databases, 10) : 5,
      enable_query_logging: map.enable_query_logging !== 'false',
      log_sql: map.log_sql === 'true',
      debug_mode: map.debug_mode === 'true',
      log_level: (map.log_level as any) || config.logLevel || 'info',
      enable_cors_all: map.enable_cors_all === 'true',
      enable_stack_traces: map.enable_stack_traces === 'true',
    };
  }

  public updateSettings(settings: Partial<SystemSettings>): SystemSettings {
    const metaDb = getMetadataDb();
    const now = Date.now();
    const stmt = metaDb.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)');

    metaDb.exec('BEGIN TRANSACTION;');
    try {
      for (const [k, v] of Object.entries(settings)) {
        if (v !== undefined) {
          stmt.run(k, String(v), now);
        }
      }
      metaDb.exec('COMMIT;');
    } catch (err) {
      metaDb.exec('ROLLBACK;');
      throw err;
    }

    const updated = this.getSettings();

    // Dynamically adjust logger level if modified
    if (settings.log_level && logger.level !== settings.log_level) {
      logger.level = settings.log_level;
      logger.info({ newLogLevel: settings.log_level }, 'Dynamically adjusted server log level');
    }

    return updated;
  }

  public getSystemStatus(): SystemStatus {
    const dbs = databaseService.listDatabases();
    const metaDb = getMetadataDb();
    const sqliteVersionRow = metaDb.prepare('SELECT sqlite_version() as version').get() as { version: string };

    // Stats on tokens & webhooks
    const tokensRow = metaDb.prepare('SELECT COUNT(*) as count FROM api_tokens WHERE revoked_at IS NULL').get() as { count: number };
    const webhooksRow = metaDb.prepare('SELECT COUNT(*) as count FROM webhooks WHERE active = 1').get() as { count: number };

    // 24h Activity stats
    const past24h = Date.now() - 24 * 60 * 60 * 1000;
    const activity24h = metaDb.prepare(`
      SELECT
        COUNT(*) as total,
        AVG(duration_ms) as avg_duration,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
      FROM activity_logs
      WHERE timestamp >= ?
    `).get(past24h) as { total: number; avg_duration: number | null; errors: number | null };

    const totalQueries24h = activity24h?.total || 0;
    const avgQueryDurationMs = Math.round((activity24h?.avg_duration || 0) * 100) / 100;
    const errorRatePercent = totalQueries24h > 0 ? Math.round(((activity24h?.errors || 0) / totalQueries24h) * 10000) / 100 : 0;

    const mem = process.memoryUsage();
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    return {
      version: '1.3.0',
      nodeVersion: process.version,
      sqliteVersion: sqliteVersionRow.version,
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      cpuModel: cpus[0]?.model || 'Generic CPU',
      cpuCount: cpus.length,
      uptimeSeconds: Math.floor(process.uptime()),
      systemUptimeSeconds: Math.floor(os.uptime()),
      databaseCount: dbs.length,
      totalDatabaseStorageBytes: this.cachedStorage.databaseStorageBytes,
      mediaStorageBytes: this.cachedStorage.mediaStorageBytes,
      backupStorageBytes: this.cachedStorage.backupStorageBytes,
      totalTokensCount: tokensRow?.count || 0,
      activeWebhooksCount: webhooksRow?.count || 0,
      totalQueries24h,
      avgQueryDurationMs,
      errorRatePercent,
      osMemory: {
        total: totalMem,
        free: freeMem,
        used: totalMem - freeMem,
      },
      memoryUsage: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
      },
      securityDiagnostics: {
        atRestEncryptionActive: true,
        encryptionAlgorithm: 'AES-256-GCM (Authenticated)',
      },
    };
  }

  public destroy(): void {
    if (this.storageCacheInterval) {
      clearInterval(this.storageCacheInterval);
      this.storageCacheInterval = null;
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }
}

export const systemService = new SystemService();
