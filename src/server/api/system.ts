import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { systemService } from '../services/system.js';
import { requireAdminAuth } from '../middleware/auth.js';

export const systemRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireAdminAuth);

  fastify.get('/settings', async (req, reply) => {
    const settings = systemService.getSettings();
    return reply.send({ success: true, data: settings });
  });

  fastify.post('/settings', async (req, reply) => {
    const Schema = z.object({
      instance_name: z.string().min(1).max(100).optional(),
      base_url: z.string().url().optional(),
      default_journal_mode: z.string().optional(),
      default_busy_timeout: z.number().int().positive().optional(),
      default_synchronous: z.string().optional(),
      default_foreign_keys: z.boolean().optional(),
      default_cache_size: z.number().int().optional(),
      default_auto_vacuum: z.enum(['none', 'full', 'incremental']).optional(),
      backup_schedule: z.enum(['disabled', 'hourly', '6hours', '12hours', 'daily', 'weekly']).optional(),
      backup_retention: z.number().int().min(0).optional(),
      max_upload_size_mb: z.number().int().min(1).max(500).optional(),
      default_user_rate_limit: z.number().int().min(0).optional(),
      default_user_max_databases: z.number().int().min(0).optional(),
      enable_query_logging: z.boolean().optional(),
      log_sql: z.boolean().optional(),
      debug_mode: z.boolean().optional(),
      log_level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).optional(),
      enable_cors_all: z.boolean().optional(),
      enable_stack_traces: z.boolean().optional(),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid settings configuration' },
      });
    }

    const updated = systemService.updateSettings(parsed.data);
    return reply.send({ success: true, data: updated });
  });

  fastify.get('/status', async (req, reply) => {
    const status = systemService.getSystemStatus();
    return reply.send({ success: true, data: status });
  });

  fastify.get('/metrics', async (req, reply) => {
    const metrics = systemService.getMetricsHistory();
    return reply.send({ success: true, data: metrics });
  });
};
