import type { FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { authService } from '../services/auth.js';
import { activityService } from '../services/activity.js';
import { webAuthnService } from '../services/webauthn.js';
import { databaseMembersService } from '../services/members.js';
import {
  generateTotpSecret,
  verifyTotpCode,
  getTotpAuthUri,
  generateQrCodeSvgDataUrl,
  generateBackupCodes
} from '../utils/totp.js';
import { config } from '../config/index.js';
import { requireAdminAuth } from '../middleware/auth.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/status', async (req, reply) => {
    const hasAdmin = authService.hasAdminUser();
    let currentUser = null;

    const sessionCookie = req.cookies?.vdb_session;
    if (sessionCookie) {
      const sess = authService.verifySessionCookie(sessionCookie, config.sessionSecret);
      if (sess) {
        const full = authService.getUserById(sess.userId);
        currentUser = {
          userId: sess.userId,
          username: sess.username,
          role: sess.role,
          email: full?.email || null,
          avatar_url: full?.avatar_url || null,
          totp_enabled: full?.totp_enabled ?? false,
        };
      }
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

  // Public User Self-Registration
  fastify.post('/register', async (req, reply) => {
    if (!authService.hasAdminUser()) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NOT_INITIALIZED', message: 'Platform requires initial admin setup before registration' },
      });
    }

    const RegisterSchema = z.object({
      email: z.string().email('Invalid email address'),
      password: z.string().min(6, 'Password must be at least 6 characters').max(128),
      username: z.string().min(3).max(50).optional(),
    });

    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid input' },
      });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const username = (parsed.data.username || email.split('@')[0]).trim();

    try {
      const user = await authService.createUser({
        username,
        email,
        password: parsed.data.password,
        role: 'user',
      });

      // Claim any pending invites for this email address
      databaseMembersService.claimPendingInvites(user.id, email);

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
        action: 'user.register',
        resource: user.id,
        result: 'success',
        requestId: req.id,
        details: JSON.stringify({ email }),
      });

      return reply.status(201).send({
        success: true,
        data: {
          user: { id: user.id, username: user.username, email: user.email, role: user.role, created_at: user.created_at },
        },
      });
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: { code: 'REGISTRATION_ERROR', message: err.message || 'Registration failed' },
      });
    }
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
      email: z.string().email().optional(),
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

    const user = await authService.createAdminUser(
      parsed.data.username,
      parsed.data.password,
      'super_admin',
      1000,
      0,
      parsed.data.email
    );
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
        error: { code: 'INVALID_CREDENTIALS', message: 'Username/Email and password required' },
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
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' },
      });
    }

    // Check if 2FA (TOTP) is enabled on user's account
    if (user.totp_enabled) {
      const tempToken = authService.createTemp2faChallenge(user.id, config.sessionSecret);
      return reply.send({
        success: true,
        data: {
          require2fa: true,
          tempToken,
          username: user.username,
        },
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
        user: { id: user.id, username: user.username, role: user.role, created_at: user.created_at },
      },
    });
  });

  // 2FA Verification during login
  fastify.post('/login/2fa', async (req, reply) => {
    const Schema = z.object({
      tempToken: z.string().min(1),
      code: z.string().length(6),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Valid 6-digit code required' } });
    }

    const userId = authService.verifyTemp2faChallenge(parsed.data.tempToken, config.sessionSecret);
    if (!userId) {
      return reply.status(401).send({ success: false, error: { code: 'EXPIRED_2FA_CHALLENGE', message: '2FA session expired. Please sign in again.' } });
    }

    const userWithSecret = authService.getUserById(userId);
    const totpInfo = authService.getTotpSecretInternal(userId);
    if (!userWithSecret || !totpInfo?.totp_secret) {
      return reply.status(400).send({ success: false, error: { code: '2FA_NOT_CONFIGURED', message: '2FA not found' } });
    }

    const isValid = verifyTotpCode(totpInfo.totp_secret, parsed.data.code);
    if (!isValid) {
      return reply.status(401).send({ success: false, error: { code: 'INVALID_2FA_CODE', message: 'Mã xác thực 2FA không chính xác' } });
    }

    const { cookieValue, expires } = authService.generateSessionCookie(userWithSecret, config.sessionSecret);
    reply.setCookie('vdb_session', cookieValue, {
      path: '/',
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      expires,
    });

    activityService.recordAudit({
      user: userWithSecret.username,
      action: 'login_2fa',
      resource: 'auth',
      result: 'success',
      requestId: req.id,
    });

    return reply.send({
      success: true,
      data: {
        user: { id: userWithSecret.id, username: userWithSecret.username, role: userWithSecret.role, created_at: userWithSecret.created_at },
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

  // User Profile & Avatar Update
  fastify.put('/profile', { preHandler: [requireAdminAuth] }, async (req, reply) => {
    const Schema = z.object({
      email: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
      avatar_url: z.union([z.string().max(5000000), z.literal(''), z.null()]).optional(), // supports URL or Data URL up to 5MB
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Invalid profile payload' },
      });
    }

    try {
      const cleanEmail = parsed.data.email !== undefined ? (parsed.data.email?.trim() || null) : undefined;
      const cleanAvatar = parsed.data.avatar_url !== undefined ? (parsed.data.avatar_url?.trim() || null) : undefined;

      const updated = await authService.updateUser(req.adminUser!.userId, {
        email: cleanEmail,
        avatarUrl: cleanAvatar,
      });

      activityService.recordAudit({
        user: req.adminUser!.username,
        action: 'user.update_profile',
        resource: req.adminUser!.userId,
        result: 'success',
        requestId: req.id,
      });

      return reply.send({ success: true, data: updated });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: { code: 'PROFILE_UPDATE_ERROR', message: err.message } });
    }
  });

  // 2FA TOTP Setup (Generate Secret & QR Code)
  fastify.post('/2fa/setup', { preHandler: [requireAdminAuth] }, async (req, reply) => {
    const user = req.adminUser!;
    const fullUser = authService.getUserById(user.userId);
    if (!fullUser) {
      return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    const secret = generateTotpSecret();
    const metaDb = (await import('../db/metadata.js')).getMetadataDb();
    metaDb.prepare('UPDATE users SET totp_temp_secret = ? WHERE id = ?').run(secret, user.userId);

    const identifier = fullUser.email || user.username;
    const otpauthUri = getTotpAuthUri(identifier, secret);
    const qrDataUrl = await generateQrCodeSvgDataUrl(otpauthUri);

    return reply.send({
      success: true,
      data: {
        secret,
        otpauthUri,
        qrDataUrl,
      },
    });
  });

  // 2FA TOTP Activate: REQUIRES password + 6-digit TOTP code
  fastify.post('/2fa/activate', { preHandler: [requireAdminAuth] }, async (req, reply) => {
    const Schema = z.object({
      password: z.string().min(1, 'Mật khẩu tài khoản là bắt buộc'),
      code: z.string().length(6, 'Mã xác thực phải gồm 6 chữ số'),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Mật khẩu và mã 6 số là bắt buộc' },
      });
    }

    const user = authService.getUserById(req.adminUser!.userId);
    const totpInfo = authService.getTotpSecretInternal(req.adminUser!.userId);
    if (!user || !totpInfo?.totp_temp_secret) {
      return reply.status(400).send({
        success: false,
        error: { code: '2FA_NOT_INITIALIZED', message: 'Vui lòng nhấn tạo mã QR trước khi kích hoạt' },
      });
    }

    // Verify user's current password
    const metaDb = (await import('../db/metadata.js')).getMetadataDb();
    const userRow = metaDb.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string } | undefined;
    if (!userRow) {
      return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    const isPasswordValid = await authService.verifyPassword(userRow.password_hash, parsed.data.password);
    if (!isPasswordValid) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Mật khẩu tài khoản không chính xác' },
      });
    }

    // Verify TOTP 6-digit code
    const isCodeValid = verifyTotpCode(totpInfo.totp_temp_secret, parsed.data.code);
    if (!isCodeValid) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TOTP_CODE', message: 'Mã xác thực 2FA không chính xác hoặc đã hết hạn' },
      });
    }

    // Generate 6 backup recovery codes
    const backupCodes = generateBackupCodes(6);
    const backupCodeObjects = backupCodes.map(code => ({ code, used: false }));
    const backupCodesJson = JSON.stringify(backupCodeObjects);

    // Commit 2FA activation with backup codes
    metaDb.prepare(`
      UPDATE users
      SET totp_secret = totp_temp_secret, totp_enabled = 1, totp_temp_secret = NULL, totp_backup_codes = ?, updated_at = ?
      WHERE id = ?
    `).run(backupCodesJson, Date.now(), user.id);

    activityService.recordAudit({
      user: user.username,
      action: '2fa.activate',
      resource: user.id,
      result: 'success',
      requestId: req.id,
    });

    return reply.send({
      success: true,
      message: 'Đã kích hoạt bảo mật 2 lớp (2FA) thành công',
      data: {
        backupCodes
      }
    });
  });

  // 2FA TOTP Disable: REQUIRES password + 6-digit TOTP code
  fastify.post('/2fa/disable', { preHandler: [requireAdminAuth] }, async (req, reply) => {
    const Schema = z.object({
      password: z.string().min(1, 'Mật khẩu tài khoản là bắt buộc'),
      code: z.string().length(6, 'Mã xác thực phải gồm 6 chữ số'),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Mật khẩu và mã 6 số là bắt buộc' },
      });
    }

    const user = authService.getUserById(req.adminUser!.userId);
    const totpInfo = authService.getTotpSecretInternal(req.adminUser!.userId);
    if (!user || !totpInfo?.totp_secret) {
      return reply.status(400).send({
        success: false,
        error: { code: '2FA_NOT_ENABLED', message: 'Tài khoản chưa bật 2FA' },
      });
    }

    const metaDb = (await import('../db/metadata.js')).getMetadataDb();
    const userRow = metaDb.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string } | undefined;
    if (!userRow) {
      return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    const isPasswordValid = await authService.verifyPassword(userRow.password_hash, parsed.data.password);
    if (!isPasswordValid) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Mật khẩu tài khoản không chính xác' },
      });
    }

    const isCodeValid = verifyTotpCode(totpInfo.totp_secret, parsed.data.code);
    if (!isCodeValid) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TOTP_CODE', message: 'Mã xác thực 2FA không chính xác hoặc đã hết hạn' },
      });
    }

    metaDb.prepare(`
      UPDATE users
      SET totp_secret = NULL, totp_enabled = 0, totp_temp_secret = NULL, totp_backup_codes = NULL, updated_at = ?
      WHERE id = ?
    `).run(Date.now(), user.id);

    activityService.recordAudit({
      user: user.username,
      action: '2fa.disable',
      resource: user.id,
      result: 'success',
      requestId: req.id,
    });

    return reply.send({ success: true, message: 'Đã tắt bảo mật 2 lớp (2FA)' });
  });

  // Get current backup codes status for authenticated user (used vs unused)
  fastify.get('/2fa/backup-codes', { preHandler: [requireAdminAuth] }, async (req, reply) => {
    const user = authService.getUserById(req.adminUser!.userId);
    if (!user) {
      return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    const metaDb = (await import('../db/metadata.js')).getMetadataDb();
    const row = metaDb.prepare('SELECT totp_enabled, totp_backup_codes FROM users WHERE id = ?').get(user.id) as
      | { totp_enabled: number; totp_backup_codes: string | null }
      | undefined;

    if (!row || !row.totp_enabled || !row.totp_backup_codes) {
      return reply.send({
        success: true,
        data: {
          enabled: false,
          total: 0,
          remaining: 0,
          codes: []
        }
      });
    }

    let parsed: any[] = [];
    try {
      parsed = JSON.parse(row.totp_backup_codes);
      if (!Array.isArray(parsed)) parsed = [];
    } catch {
      parsed = [];
    }

    const normalized = parsed.map((item) => {
      if (typeof item === 'string') {
        return { code: item, used: false };
      }
      return {
        code: item.code,
        used: Boolean(item.used),
        usedAt: item.used_at || null,
      };
    });

    const remaining = normalized.filter(c => !c.used).length;

    return reply.send({
      success: true,
      data: {
        enabled: true,
        total: normalized.length,
        remaining,
        codes: normalized
      }
    });
  });

  // Regenerate new backup recovery codes (requires password)
  fastify.post('/2fa/regenerate-backup-codes', { preHandler: [requireAdminAuth] }, async (req, reply) => {
    const Schema = z.object({
      password: z.string().min(1, 'Mật khẩu tài khoản là bắt buộc'),
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Mật khẩu là bắt buộc' },
      });
    }

    const user = authService.getUserById(req.adminUser!.userId);
    if (!user) {
      return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    const metaDb = (await import('../db/metadata.js')).getMetadataDb();
    const userRow = metaDb.prepare('SELECT password_hash, totp_enabled FROM users WHERE id = ?').get(user.id) as
      | { password_hash: string; totp_enabled: number }
      | undefined;

    if (!userRow) {
      return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
    }

    if (!userRow.totp_enabled) {
      return reply.status(400).send({
        success: false,
        error: { code: '2FA_NOT_ENABLED', message: 'Tài khoản chưa bật bảo mật 2 lớp (2FA)' },
      });
    }

    const isPasswordValid = await authService.verifyPassword(userRow.password_hash, parsed.data.password);
    if (!isPasswordValid) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Mật khẩu tài khoản không chính xác' },
      });
    }

    // Generate fresh 6 backup recovery codes
    const newBackupCodes = generateBackupCodes(6);
    const newBackupCodeObjects = newBackupCodes.map(code => ({ code, used: false }));
    const newCodesJson = JSON.stringify(newBackupCodeObjects);

    metaDb.prepare(`
      UPDATE users
      SET totp_backup_codes = ?, updated_at = ?
      WHERE id = ?
    `).run(newCodesJson, Date.now(), user.id);

    activityService.recordAudit({
      user: user.username,
      action: '2fa.regenerate_backup_codes',
      resource: user.id,
      result: 'success',
      requestId: req.id,
    });

    return reply.send({
      success: true,
      message: 'Đã tạo mới danh sách mã dự phòng 2FA thành công',
      data: {
        backupCodes: newBackupCodes,
        total: 6,
        remaining: 6,
      }
    });
  });

  // Reset password using either TOTP 6-digit code OR 2FA Backup Recovery Code
  fastify.post('/recovery/reset-password', async (req, reply) => {
    const Schema = z.object({
      usernameOrEmail: z.string().min(1, 'Username hoặc Email là bắt buộc'),
      backupCode: z.string().optional(),
      totpCode: z.string().optional(),
      newPassword: z.string().min(6, 'Mật khẩu mới phải có tối thiểu 6 ký tự').max(128),
    }).refine((data) => (data.backupCode && data.backupCode.trim().length >= 8) || (data.totpCode && data.totpCode.trim().length === 6), {
      message: 'Cần cung cấp mã 2FA 6 số hoặc mã dự phòng hợp lệ',
      path: ['backupCode'],
    });

    const parsed = Schema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Dữ liệu không hợp lệ' },
      });
    }

    const metaDb = (await import('../db/metadata.js')).getMetadataDb();
    const cleanId = parsed.data.usernameOrEmail.trim();
    const cleanLower = cleanId.toLowerCase();

    const userRow = metaDb.prepare(`
      SELECT id, username, email, totp_enabled, totp_secret, totp_backup_codes
      FROM users
      WHERE username = ? OR email = ? OR LOWER(email) = ? OR LOWER(username) = ?
    `).get(cleanId, cleanId, cleanLower, cleanLower) as
      | { id: string; username: string; email: string | null; totp_enabled: number; totp_secret: string | null; totp_backup_codes: string | null }
      | undefined;

    if (!userRow) {
      return reply.status(404).send({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'Không tìm thấy tài khoản tương ứng' },
      });
    }

    if (!userRow.totp_enabled) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_2FA_ENABLED', message: 'Tài khoản chưa kích hoạt bảo mật 2 lớp (2FA)' },
      });
    }

    const cleanTotp = parsed.data.totpCode ? parsed.data.totpCode.trim() : '';
    const cleanBackup = parsed.data.backupCode ? parsed.data.backupCode.trim().toUpperCase() : '';

    let recoveryMethod: 'totp' | 'backup_code' = 'totp';
    let updatedCodesJson: string | null = userRow.totp_backup_codes;
    let remainingBackupCount = 0;

    if (cleanTotp && cleanTotp.length === 6) {
      // Recovery via 6-digit TOTP code
      if (!userRow.totp_secret) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_TOTP_SECRET', message: 'Không tìm thấy mã bí mật 2FA của tài khoản' },
        });
      }

      const isOtpValid = verifyTotpCode(userRow.totp_secret, cleanTotp);
      if (!isOtpValid) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_TOTP_CODE', message: 'Mã xác thực 2FA 6 chữ số không chính xác hoặc đã hết hạn' },
        });
      }

      recoveryMethod = 'totp';
      // Calculate remaining backup codes count if any
      try {
        const parsed = JSON.parse(userRow.totp_backup_codes || '[]');
        remainingBackupCount = Array.isArray(parsed) ? parsed.filter(c => typeof c === 'string' || !c.used).length : 0;
      } catch {
        remainingBackupCount = 0;
      }
    } else if (cleanBackup) {
      // Recovery via Backup Recovery Code
      if (!userRow.totp_backup_codes) {
        return reply.status(400).send({
          success: false,
          error: { code: 'NO_BACKUP_CODES', message: 'Tài khoản không có mã dự phòng' },
        });
      }

      let rawCodes: any[] = [];
      try {
        rawCodes = JSON.parse(userRow.totp_backup_codes);
        if (!Array.isArray(rawCodes)) rawCodes = [];
      } catch {
        rawCodes = [];
      }

      const matchIndex = rawCodes.findIndex((item) => {
        const candidate = typeof item === 'string' ? item : item.code;
        const isUsed = typeof item === 'object' && item.used;
        if (!candidate || isUsed) return false;
        const candUpper = candidate.toUpperCase();
        if (candUpper.length !== cleanBackup.length) return false;
        return crypto.timingSafeEqual(Buffer.from(candUpper), Buffer.from(cleanBackup));
      });

      if (matchIndex === -1) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_BACKUP_CODE', message: 'Mã dự phòng không chính xác hoặc đã được sử dụng' },
        });
      }

      // Burn backup code
      const matched = rawCodes[matchIndex];
      if (typeof matched === 'string') {
        rawCodes[matchIndex] = { code: matched, used: true, used_at: Date.now() };
      } else {
        matched.used = true;
        matched.used_at = Date.now();
      }

      updatedCodesJson = JSON.stringify(rawCodes);
      remainingBackupCount = rawCodes.filter(c => (typeof c === 'string' ? true : !c.used)).length;
      recoveryMethod = 'backup_code';
    } else {
      return reply.status(400).send({
        success: false,
        error: { code: 'MISSING_RECOVERY_CREDENTIAL', message: 'Vui lòng cung cấp mã 2FA 6 số hoặc mã dự phòng' },
      });
    }

    const newPasswordHash = await authService.hashPassword(parsed.data.newPassword);

    metaDb.prepare(`
      UPDATE users
      SET password_hash = ?, totp_backup_codes = ?, updated_at = ?
      WHERE id = ?
    `).run(newPasswordHash, updatedCodesJson, Date.now(), userRow.id);

    activityService.recordAudit({
      user: userRow.username,
      action: `password_reset_${recoveryMethod}`,
      resource: userRow.id,
      result: 'success',
      requestId: req.id,
    });

    return reply.send({
      success: true,
      message: recoveryMethod === 'totp'
        ? 'Đặt lại mật khẩu thành công bằng mã xác thực 2FA.'
        : 'Đặt lại mật khẩu thành công bằng mã dự phòng. Mã này đã được đánh dấu đã sử dụng.',
      data: {
        method: recoveryMethod,
        remainingBackupCodesCount: remainingBackupCount
      }
    });
  });
};
