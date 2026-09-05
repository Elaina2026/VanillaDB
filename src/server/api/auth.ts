import type { FastifyPluginAsync } from 'fastify';
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
        maxDatabases: 5,
        rateLimitPerMinute: 60,
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
    if (!userWithSecret || !userWithSecret.totp_secret) {
      return reply.status(400).send({ success: false, error: { code: '2FA_NOT_CONFIGURED', message: '2FA not found' } });
    }

    const isValid = verifyTotpCode(userWithSecret.totp_secret, parsed.data.code);
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
    if (!user || !user.totp_temp_secret) {
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
    const isCodeValid = verifyTotpCode(user.totp_temp_secret, parsed.data.code);
    if (!isCodeValid) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TOTP_CODE', message: 'Mã xác thực 2FA không chính xác hoặc đã hết hạn' },
      });
    }

    // Generate 6 backup recovery codes
    const backupCodes = generateBackupCodes(6);
    const backupCodesJson = JSON.stringify(backupCodes);

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
    if (!user || !user.totp_secret) {
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

    const isCodeValid = verifyTotpCode(user.totp_secret, parsed.data.code);
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

  // Reset password using 2FA Backup Recovery Code
  fastify.post('/recovery/reset-password', async (req, reply) => {
    const Schema = z.object({
      usernameOrEmail: z.string().min(1, 'Username hoặc Email là bắt buộc'),
      backupCode: z.string().min(8, 'Mã dự phòng hợp lệ là bắt buộc'),
      newPassword: z.string().min(6, 'Mật khẩu mới phải có tối thiểu 6 ký tự').max(128),
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
    const cleanCode = parsed.data.backupCode.trim().toUpperCase();

    const userRow = metaDb.prepare(`
      SELECT id, username, email, totp_enabled, totp_backup_codes
      FROM users
      WHERE username = ? OR email = ? OR LOWER(email) = ? OR LOWER(username) = ?
    `).get(cleanId, cleanId, cleanLower, cleanLower) as
      | { id: string; username: string; email: string | null; totp_enabled: number; totp_backup_codes: string | null }
      | undefined;

    if (!userRow) {
      return reply.status(404).send({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'Không tìm thấy tài khoản tương ứng' },
      });
    }

    if (!userRow.totp_enabled || !userRow.totp_backup_codes) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_BACKUP_CODES', message: 'Tài khoản chưa kích hoạt 2FA hoặc không có mã dự phòng' },
      });
    }

    let codes: string[] = [];
    try {
      codes = JSON.parse(userRow.totp_backup_codes);
      if (!Array.isArray(codes)) codes = [];
    } catch {
      codes = [];
    }

    const codeIndex = codes.findIndex(c => c.toUpperCase() === cleanCode);
    if (codeIndex === -1) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_BACKUP_CODE', message: 'Mã dự phòng không chính xác hoặc đã được sử dụng' },
      });
    }

    // Burn the used backup code
    codes.splice(codeIndex, 1);
    const updatedCodesJson = JSON.stringify(codes);
    const newPasswordHash = await authService.hashPassword(parsed.data.newPassword);

    metaDb.prepare(`
      UPDATE users
      SET password_hash = ?, totp_backup_codes = ?, updated_at = ?
      WHERE id = ?
    `).run(newPasswordHash, updatedCodesJson, Date.now(), userRow.id);

    activityService.recordAudit({
      user: userRow.username,
      action: 'password_reset_backup_code',
      resource: userRow.id,
      result: 'success',
      requestId: req.id,
    });

    return reply.send({
      success: true,
      message: 'Đặt lại mật khẩu thành công bằng mã dự phòng. Mã này đã bị huỷ.',
      data: {
        remainingBackupCodesCount: codes.length
      }
    });
  });
};
