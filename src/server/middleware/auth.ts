import type { FastifyRequest, FastifyReply } from 'fastify';
import { authService, type SessionUser } from '../services/auth.js';
import { tokenService } from '../services/tokens.js';
import { config } from '../config/index.js';
import type { ApiTokenRecord, TokenPermission, UserRole } from '../../../shared/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    adminUser?: SessionUser;
    apiToken?: ApiTokenRecord;
    databaseId?: string;
  }
}

// In-memory rate limiting map for authenticated user sessions: userId -> { count, resetAt }
const userRateLimits = new Map<string, { count: number; resetAt: number }>();

// Periodically clean up expired user rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [userId, tracker] of userRateLimits.entries()) {
    if (now > tracker.resetAt) {
      userRateLimits.delete(userId);
    }
  }
}, 60 * 1000).unref();

export async function requireAdminAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sessionCookie = request.cookies?.vdb_session;
  if (!sessionCookie) {
    reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const user = authService.verifySessionCookie(sessionCookie, config.sessionSecret);
  if (!user) {
    reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired session' },
    });
    return;
  }

  // Check per-user rate limit (if user has quota configured > 0)
  const fullUser = authService.getUserById(user.userId);
  if (fullUser && fullUser.status === 'disabled') {
    reply.status(403).send({
      success: false,
      error: { code: 'USER_DISABLED', message: 'User account has been disabled by administrator' },
    });
    return;
  }

  if (fullUser && fullUser.rate_limit_per_minute > 0 && fullUser.role !== 'super_admin') {
    const now = Date.now();
    const tracker = userRateLimits.get(user.userId) || { count: 0, resetAt: now + 60000 };
    if (now > tracker.resetAt) {
      tracker.count = 0;
      tracker.resetAt = now + 60000;
    }
    tracker.count++;
    userRateLimits.set(user.userId, tracker);

    if (tracker.count > fullUser.rate_limit_per_minute) {
      reply.status(429).send({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `User request quota (${fullUser.rate_limit_per_minute} req/min) exceeded. Try again in ${Math.ceil((tracker.resetAt - now) / 1000)}s.`,
        },
      });
      return;
    }
  }

  request.adminUser = user;
}

export function requireRole(allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Fastify preHandler hook array executes sequentially, requireAdminAuth may run before or inside here
    if (!request.adminUser) {
      await requireAdminAuth(request, reply);
      if (reply.sent) return;
    }
    if (!request.adminUser) return;

    if (!allowedRoles.includes(request.adminUser.role)) {
      reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Requires one of roles: [${allowedRoles.join(', ')}]`,
        },
      });
      return;
    }
  };
}

export function requireTokenPermission(permission: TokenPermission) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    let databaseId = (request.params as any)?.databaseId;

    // If route doesn't have databaseId in params but has fileId, resolve databaseId from file
    if (!databaseId && (request.params as any)?.fileId) {
      const { storageService } = await import('../services/storage.js');
      const file = storageService.getFile((request.params as any).fileId);
      if (file) {
        databaseId = file.database_id;
      }
    }

    if (!databaseId) {
      reply.status(400).send({
        success: false,
        error: { code: 'INVALID_DATABASE_ID', message: 'Database ID is required' },
      });
      return;
    }

    // 1. Support Admin Session Cookie (For Web UI viewing images/videos/media)
    const sessionCookie = request.cookies?.vdb_session;
    if (sessionCookie) {
      const user = authService.verifySessionCookie(sessionCookie, config.sessionSecret);
      if (user) {
        request.adminUser = user;
        request.databaseId = databaseId;
        return;
      }
    }

    // 2. Support Token in Query Param (?token=vdb_live_...) for <img>, <video>, <a> links
    let authHeader = request.headers.authorization;
    const queryToken = (request.query as any)?.token;
    if (!authHeader && queryToken && typeof queryToken === 'string') {
      authHeader = `Bearer ${queryToken}`;
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'API Bearer token is required' },
      });
      return;
    }

    const secret = authHeader.substring(7).trim();
    const token = tokenService.validateToken(secret, databaseId);

    if (!token) {
      reply.status(401).send({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid, expired, or revoked API token' },
      });
      return;
    }

    // Rate Limiting Check
    if (token.rate_limit && !tokenService.checkRateLimit(token.id, token.rate_limit)) {
      reply.status(429).send({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Token rate limit of ${token.rate_limit} req/min exceeded. Please try again later.`,
        },
      });
      return;
    }

    // Check permission: 'database:admin' grants all permissions
    if (!token.permissions.includes('database:admin') && !token.permissions.includes(permission)) {
      reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Token does not have required permission: ${permission}`,
        },
      });
      return;
    }

    request.apiToken = token;
    request.databaseId = databaseId;
  };
}
