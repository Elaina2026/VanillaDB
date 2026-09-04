import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authService } from '../services/auth.js';
import { activityService } from '../services/activity.js';
import { webAuthnService } from '../services/webauthn.js';
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

  fastify.post('/change-password', { preHandler: [requireAdminAuth] }, async (req, reply) => {
    const Schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6).max(128),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Dữ liệu mật khẩu không hợp lệ (tối thiểu 6 ký tự)' },
      });
    }

    try {
      await authService.changePassword(req.adminUser!.userId, parsed.data.currentPassword, parsed.data.newPassword);
      activityService.recordAudit({
        user: req.adminUser!.username,
        action: 'user.change_password',
        resource: req.adminUser!.userId,
        result: 'success',
        requestId: req.id,
      });

      return reply.send({ success: true, message: 'Đổi mật khẩu thành công' });
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: { code: 'CHANGE_PASSWORD_ERROR', message: err.message },
      });
    }
  });

  // WebAuthn Passkey Registration Endpoints
  fastify.post('/webauthn/register-options', { preHandler: [requireAdminAuth] }, async (req, reply) => {
    const user = req.adminUser!;
    const origin = req.headers.origin || req.headers.referer;
    const options = await webAuthnService.getRegistrationOptions(user.userId, user.username, req.headers.host);
    return reply.send({ success: true, data: options });
  });

  fastify.post('/webauthn/register-verify', { preHandler: [requireAdminAuth] }, async (req, reply) => {
    const user = req.adminUser!;
    const origin = req.headers.origin || req.headers.referer;
    const res = await webAuthnService.verifyRegistration(user.userId, req.body as any, req.headers.host, origin);
    if (!res.success) {
      return reply.status(400).send({ success: false, error: { code: 'WEBAUTHN_REGISTRATION_FAILED', message: res.error } });
    }
    return reply.send({ success: true });
  });

  // WebAuthn Passkey Login Endpoints
  fastify.post('/webauthn/login-options', async (req, reply) => {
    const { username } = (req.body as any) || {};
    const options = await webAuthnService.getLoginOptions(username, req.headers.host);
    return reply.send({ success: true, data: options });
  });

  fastify.post('/webauthn/login-verify', async (req, reply) => {
    const origin = req.headers.origin || req.headers.referer;
    const res = await webAuthnService.verifyLogin(req.body as any, req.headers.host, origin);
    if (!res.success || !res.user) {
      return reply.status(400).send({ success: false, error: { code: 'WEBAUTHN_LOGIN_FAILED', message: res.error } });
    }

    const { cookieValue, expires } = authService.generateSessionCookie(res.user, config.sessionSecret);
    reply.setCookie('vdb_session', cookieValue, {
      path: '/',
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      expires,
    });

    activityService.recordAudit({
      user: res.user.username,
      action: 'login_passkey',
      resource: 'auth',
      result: 'success',
      requestId: req.id,
    });

    return reply.send({ success: true, data: { user: res.user } });
  });

  // WebAuthn User Credentials List & Revoke
  fastify.get('/webauthn/credentials', { preHandler: [requireAdminAuth] }, async (req, reply) => {
    const creds = webAuthnService.listUserCredentials(req.adminUser!.userId);
    return reply.send({ success: true, data: creds });
  });

  fastify.delete('/webauthn/credentials/:id', { preHandler: [requireAdminAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const ok = webAuthnService.deleteCredential(req.adminUser!.userId, id);
    return reply.send({ success: ok });
  });
};
