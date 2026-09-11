import './suppressWarnings.js';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { getMetadataDb, closeMetadataDb } from './db/metadata.js';
import { dbManager } from './db/manager.js';
import { authService } from './services/auth.js';
import { tokenService } from './services/tokens.js';
import { activityService } from './services/activity.js';
import { systemService } from './services/system.js';
import { webhookService } from './services/webhook.js';
import { backupScheduler } from './services/backupScheduler.js';
import { jobSchedulerService } from './services/jobScheduler.js';
import { maintenanceWorker } from './services/maintenanceWorker.js';

import { authRoutes } from './api/auth.js';
import { adminRoutes } from './api/admin.js';
import { dataRoutes } from './api/data.js';
import { systemRoutes } from './api/system.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ponytail: in-memory token bucket ceiling 50k IPs; add Redis when running multi-node cluster
export class IpTokenBucketLimiter {
  private buckets = new Map<string, { tokens: number; lastRefill: number }>();
  private readonly capacity: number;
  private readonly refillPerSec: number;
  private readonly maxIps: number;

  constructor(capacity = 120, refillPerSec = 30, maxIps = 50_000) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.maxIps = maxIps;
    const timer = setInterval(() => this.prune(), 60_000);
    if (timer.unref) timer.unref();
  }

  public consume(ip: string): { allowed: boolean; remaining: number } {
    const now = Date.now();
    let bucket = this.buckets.get(ip);
    if (!bucket) {
      if (this.buckets.size >= this.maxIps) this.prune();
      bucket = { tokens: this.capacity - 1, lastRefill: now };
      this.buckets.set(ip, bucket);
      return { allowed: true, remaining: this.capacity - 1 };
    }
    const elapsedSec = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillPerSec);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      return { allowed: false, remaining: 0 };
    }
    bucket.tokens -= 1;
    return { allowed: true, remaining: Math.floor(bucket.tokens) };
  }

  private prune(): void {
    const now = Date.now();
    for (const [ip, b] of this.buckets.entries()) {
      if (now - b.lastRefill > 120_000 && b.tokens >= this.capacity - 1) {
        this.buckets.delete(ip);
      }
    }
  }

  public reset(): void {
    this.buckets.clear();
  }
}

export const globalL7Limiter = new IpTokenBucketLimiter(120, 30);

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: config.trustProxy,
    bodyLimit: config.maxRequestBodyMb * 1024 * 1024,
    // Native HTTP timeouts configured to prevent premature ECONNRESET on large batch/media operations
    connectionTimeout: 30_000,
    requestTimeout: 120_000,
    keepAliveTimeout: 15_000,
  });
  app.server.headersTimeout = 35_000;

  // Parse empty JSON body safely
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body: string, done) => {
    try {
      const json = body ? JSON.parse(body) : {};
      done(null, json);
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // Security headers (Helmet) - OWASP compliant with strict CSP and Monaco CDN whitelist
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // Required for frontend inline suppression scripts and Vite runtime
          "'unsafe-eval'",   // Required by Monaco Editor code runner & Web Workers
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
          'https://static.cloudflareinsights.com',
          'https://*.cloudflareinsights.com',
          'https://challenges.cloudflare.com',
          'blob:',
        ],
        scriptSrcElem: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
          'https://static.cloudflareinsights.com',
          'https://*.cloudflareinsights.com',
          'https://challenges.cloudflare.com',
          'blob:',
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net',
          'https://fonts.googleapis.com',
        ],
        fontSrc: [
          "'self'",
          'https://cdn.jsdelivr.net',
          'https://fonts.gstatic.com',
          'data:',
        ],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https:', // Allow HTTPS external avatars, OAuth avatars, and database media assets
        ],
        mediaSrc: [
          "'self'",
          'data:',
          'blob:',
          'https:',
        ],
        connectSrc: [
          "'self'",
          'blob:',
          'https://cdn.jsdelivr.net',
          'https://cloudflareinsights.com',
          'https://*.cloudflareinsights.com',
        ],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    originAgentCluster: false,
  });

  // Cookie parsing
  await app.register(cookie, {
    secret: config.sessionSecret,
    hook: 'onRequest',
  });

  // Multipart uploads (e.g. database imports)
  await app.register(multipart, {
    limits: {
      fileSize: config.maxImportMb * 1024 * 1024,
    },
  });

  // CORS configuration: only reflect origin when explicit allowlist is configured, or permit when settings allow
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (config.corsOrigins.length > 0) {
        return cb(null, config.corsOrigins.includes(origin));
      }
      const settings = systemService.getSettings();
      if (settings.enable_cors_all) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    credentials: true,
  });

  // Request/Response metrics hook
  app.addHook('onRequest', async (req) => {
    (req.raw as any).__startTime = process.hrtime();
    (req.raw as any).__bytesIn = parseInt(req.headers['content-length'] || '0', 10);
  });

  // Global L7 flood defense and request timeout hook
  app.addHook('onRequest', async (req, reply) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const { allowed, remaining } = globalL7Limiter.consume(ip);
    reply.header('X-RateLimit-Remaining-IP', remaining);

    if (!allowed) {
      return reply.status(429).send({
        success: false,
        error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests from this IP address.' }
      });
    }

    // Request execution timeout safeguard (skip for live SSE streams; extend to 120s for batch/storage)
    const isRealtime = req.url.includes('/realtime');
    if (!isRealtime) {
      const isHeavyRoute = req.url.includes('/batch') || req.url.includes('/storage') || req.url.includes('/import');
      const timeoutMs = isHeavyRoute ? 120_000 : 60_000;

      const timer = setTimeout(() => {
        if (!reply.sent && !reply.raw.destroyed) {
          reply.status(504).send({
            success: false,
            error: { code: 'REQUEST_TIMEOUT', message: 'Request execution exceeded time limit.' }
          });
        }
      }, timeoutMs);
      if (timer.unref) timer.unref();

      reply.raw.once('finish', () => clearTimeout(timer));
      reply.raw.once('close', () => clearTimeout(timer));
    }
  });

  app.addHook('onSend', async (req, reply, payload) => {
    let bytesOut = 0;
    if (typeof payload === 'string') {
      bytesOut = Buffer.byteLength(payload);
    } else if (Buffer.isBuffer(payload)) {
      bytesOut = payload.length;
    } else if (payload && typeof (payload as any).pipe === 'function') {
      const contentLength = reply.getHeader('content-length');
      if (contentLength) bytesOut = parseInt(String(contentLength), 10);
    }
    (req.raw as any).__bytesOut = bytesOut;
    return payload;
  });

  app.addHook('onResponse', async (req, reply) => {
    const startTime = (req.raw as any).__startTime;
    let durationMs = 0;
    if (startTime) {
      const diff = process.hrtime(startTime);
      durationMs = Math.round((diff[0] * 1000 + diff[1] / 1e6) * 100) / 100;
    }
    const bytesIn = (req.raw as any).__bytesIn || 0;
    const bytesOut = (req.raw as any).__bytesOut || Number(reply.getHeader('content-length')) || 0;
    const statusCode = reply.statusCode;
    const isError = statusCode >= 400;

    systemService.recordRequestMetrics(bytesIn, bytesOut, durationMs, isError);
  });

  // Error handler supporting Debug Mode with stack traces and client abort suppression
  app.setErrorHandler((error: any, req, reply) => {
    const settings = systemService.getSettings();
    const statusCode = error.statusCode || 500;
    const isDebug = settings.debug_mode || !config.isProduction;

    // Detect client-initiated disconnects or aborted sockets (ECONNRESET, premature close, etc.)
    const isClientAbort =
      error.code === 'ECONNRESET' ||
      error.code === 'ERR_STREAM_PREMATURE_CLOSE' ||
      error.code === 'FST_ERR_CTP_ABORTED' ||
      error.message === 'aborted' ||
      Boolean((req.raw as any).aborted) ||
      Boolean(req.raw.destroyed) ||
      Boolean(reply.raw.destroyed);

    if (isClientAbort) {
      logger.warn({
        reqId: req.id,
        method: req.method,
        url: req.url,
        code: error.code || 'ECONNRESET',
      }, `Client connection aborted: ${req.method} ${req.url}`);

      // Socket is closed or destroyed by client; do not attempt to write response to a dead connection
      if (reply.raw.destroyed || reply.raw.writableEnded) {
        return;
      }
    } else {
      logger.error({
        err: error,
        reqId: req.id,
        method: req.method,
        url: req.url,
        statusCode,
      }, `API Request error: ${error.message}`);
    }

    if (reply.raw.destroyed || reply.raw.writableEnded) {
      return;
    }

    // Sanitize 500 error messages in production to prevent leaking internal database schemas or server details
    let clientMessage = error.message || 'An internal server error occurred';
    if (!isDebug && statusCode >= 500) {
      clientMessage = 'An internal server error occurred. Please contact administrator or inspect system audit logs.';
    }

    reply.status(statusCode).send({
      success: false,
      error: {
        code: error.code || 'INTERNAL_SERVER_ERROR',
        message: clientMessage,
        requestId: req.id,
        ...(isDebug && settings.enable_stack_traces ? { stack: error.stack } : {}),
      },
    });
  });
  app.get('/health', async (req, reply) => {
    const metaDb = getMetadataDb();
    const sqliteVer = metaDb.prepare('SELECT sqlite_version() as version').get() as { version: string };
    return reply.send({
      status: 'ok',
      service: 'VanillaDatabase',
      version: '1.3.2',
      sqlite: sqliteVer.version,
      uptime: Math.floor(process.uptime()),
    });
  });

  // Control Plane APIs
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(systemRoutes, { prefix: '/api/system' });

  // Data Plane APIs (v1 public database endpoints)
  await app.register(dataRoutes, { prefix: '/v1' });

  // Serve Frontend assets in production
  const clientDistCandidates = [
    path.resolve(__dirname, '../../client'), // when running from dist/src/server
    path.resolve(__dirname, '../client'),    // when running from dist/server
    path.resolve(process.cwd(), 'dist/client'), // when cwd is project root
    path.resolve(process.cwd(), 'client'),
  ];
  const clientDist = clientDistCandidates.find(p => fs.existsSync(p));

  if (clientDist) {
    logger.info({ clientDist }, 'Serving static client frontend');
    await app.register(fastifyStatic, {
      root: clientDist,
      prefix: '/',
      wildcard: false,
    });

    app.get('/*', async (req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/v1')) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'API endpoint not found' } });
      }
      return reply.sendFile('index.html');
    });

    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/v1')) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'API endpoint not found' } });
      }
      return reply.sendFile('index.html');
    });
  } else {
    logger.warn('Frontend client dist folder not found. Web UI will return 404.');
  }

  // Bootstrap admin user if specified in environment
  if (config.bootstrapAdminUsername && config.bootstrapAdminPassword) {
    if (!authService.hasAdminUser()) {
      logger.info({ username: config.bootstrapAdminUsername }, 'Bootstrapping administrator user from environment variables');
      await authService.createAdminUser(config.bootstrapAdminUsername, config.bootstrapAdminPassword, 'super_admin', 1000, 0);
    }
  }

  return app;
}

export async function startServer() {
  // Ensure metadata database is initialized
  getMetadataDb();

  // Initialize Webhook listener, Scheduled Backups and Auto-Maintenance
  webhookService.init();
  backupScheduler.start();
  jobSchedulerService.start();
  maintenanceWorker.start();

  const app = await buildApp();

  const handleShutdown = async (signal: string) => {
    logger.info({ signal }, 'Graceful shutdown initiated');
    try {
      maintenanceWorker.stop();
      jobSchedulerService.stop();
      backupScheduler.stop();
      webhookService.destroy();
      tokenService.destroy();
      activityService.destroy();
      systemService.destroy();
      dbManager.closeAll();
      closeMetadataDb();
      await app.close();
      logger.info('VanillaDatabase stopped cleanly');
      process.exit(0);
    } catch (err) {
      logger.error(err, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  try {
    await app.listen({ host: config.host, port: config.port });
    logger.info(`VanillaDatabase running on http://${config.host}:${config.port}`);
  } catch (err) {
    logger.fatal(err, 'Failed to start VanillaDatabase server');
    process.exit(1);
  }
}

// Start if run directly
if (process.argv[1] && (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'))) {
  startServer();
}
