import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authService } from '../services/auth.js';
import { activityService } from '../services/activity.js';
import { config } from '../config/index.js';
import { requireAdminAuth } from '../middleware/auth.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/status', async (req, reply) => {
    const hasAdmin = authService.hasAdminUser();
    let currentUser = null;

    const sessionCookie = req.cookies?.vdb_session;
    if (sessionCookie) {
      currentUser = authService.verifySessionCookie(sessionCookie, config.sessionSecret);
    }

    return reply.send({
      success: true,
      data: {
        initialized: hasAdmin,
        authenticated: !!currentUser,
        user: currentUser,
      },
    });
  });

  fastify.post('/setup', async (req, reply) => {
    if (authService.hasAdminUser()) {
      return reply.status(400).send({
        success: false,
        error: { code: 'ALREADY_INITIALIZED', message: 'Admin account has already been set up' },
      });
    }

    const SetupSchema = z.object({
      username: z.string().min(3).max(50),
      password: z.string().min(6).max(128),
      confirmPassword: z.string(),
    }).refine(data => data.password === data.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    });

    const parsed = SetupSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid input' },
      });
    }

    const user = await authService.createAdminUser(parsed.data.username, parsed.data.password, 'super_admin', 1000, 0);
    const { cookieValue, expires } = authService.generateSessionCookie(user, config.sessionSecret);

    reply.setCookie('vdb_session', cookieValue, {
      path: '/',
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      expires,
    });

    activityService.recordAudit({
      user: user.username,
      action: 'setup',
      resource: 'system',
      result: 'success',
      requestId: req.id,
    });

    return reply.status(201).send({
      success: true,
      data: {
        user: { id: user.id, username: user.username, role: user.role, created_at: user.created_at },
      },
    });
  });

  fastify.post('/login', async (req, reply) => {
    const LoginSchema = z.object({
      username: z.string(),
      password: z.string(),
    });

    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Username and password required' },
      });
    }

    const user = await authService.validateUser(parsed.data.username, parsed.data.password);
    if (!user) {
      activityService.recordAudit({
        user: parsed.data.username,
        action: 'login',
        resource: 'auth',
        result: 'failure',
        requestId: req.id,
      });

      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' },
      });
    }

    const { cookieValue, expires } = authService.generateSessionCookie(user, config.sessionSecret);
    reply.setCookie('vdb_session', cookieValue, {
      path: '/',
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      expires,
    });

    activityService.recordAudit({
      user: user.username,
      action: 'login',
      resource: 'auth',
      result: 'success',
      requestId: req.id,
    });

    return reply.send({
      success: true,
      data: {
        user: { id: user.id, username: user.username, created_at: user.created_at },
      },
    });
  });

  fastify.post('/logout', { preHandler: [requireAdminAuth] }, async (req, reply) => {
    reply.clearCookie('vdb_session', { path: '/' });

    if (req.adminUser) {
      activityService.recordAudit({
        user: req.adminUser.username,
        action: 'logout',
        resource: 'auth',
        result: 'success',
        requestId: req.id,
      });
    }

    return reply.send({ success: true });
  });

  fastify.get('/me', { preHandler: [requireAdminAuth] }, async (req, reply) => {
    return reply.send({
      success: true,
      data: { user: req.adminUser },
    });
  });
};
