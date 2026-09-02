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

import { authRoutes } from './api/auth.js';
import { adminRoutes } from './api/admin.js';
import { dataRoutes } from './api/data.js';
import { systemRoutes } from './api/system.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    trustProxy: config.trustProxy,
    bodyLimit: config.maxRequestBodyMb * 1024 * 1024,
  });

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

  // Security headers (Helmet) - configured for compatibility with Monaco Editor CDN & plain HTTP / IP hostnames
  await app.register(helmet, {
    contentSecurityPolicy: false,
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

  // CORS configuration
  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
    credentials: true,
  });

  // Request/Response metrics hook
  app.addHook('onRequest', async (req) => {
    (req.raw as any).__startTime = process.hrtime();
    (req.raw as any).__bytesIn = parseInt(req.headers['content-length'] || '0', 10);
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

  // Error handler supporting Debug Mode with stack traces
  app.setErrorHandler((error: any, req, reply) => {
    const settings = systemService.getSettings();
    const statusCode = error.statusCode || 500;
    const isDebug = settings.debug_mode || !config.isProduction;

    logger.error({
      err: error,
      reqId: req.id,
      method: req.method,
      url: req.url,
      statusCode,
    }, `API Request error: ${error.message}`);

    reply.status(statusCode).send({
      success: false,
      error: {
        code: error.code || 'INTERNAL_SERVER_ERROR',
        message: error.message || 'An internal server error occurred',
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
      version: '1.3.1',
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

  // Initialize Webhook listener and Scheduled Backups
  webhookService.init();
  backupScheduler.start();

  const app = await buildApp();

  const handleShutdown = async (signal: string) => {
    logger.info({ signal }, 'Graceful shutdown initiated');
    try {
      backupScheduler.stop();
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
