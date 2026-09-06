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
  if (!fullUser) {
    reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'User account no longer exists' },
    });
    return;
  }
  if (fullUser.status === 'disabled') {
    reply.status(403).send({
      success: false,
      error: { code: 'USER_DISABLED', message: 'User account has been disabled by administrator' },
    });
    return;
  }

  if (fullUser && fullUser.role !== 'super_admin') {
    const targetDbId = (request.params as any)?.id || (request.params as any)?.databaseId || request.databaseId;
    if (targetDbId) {
      const limit = fullUser.rate_limit_per_minute > 0 ? fullUser.rate_limit_per_minute : 180;
      const key = `${user.userId}:${targetDbId}`;
      const now = Date.now();
      const tracker = userRateLimits.get(key) || { count: 0, resetAt: now + 60000 };
      if (now > tracker.resetAt) {
        tracker.count = 0;
        tracker.resetAt = now + 60000;
      }
      tracker.count++;
      userRateLimits.set(key, tracker);

      if (tracker.count >= Math.floor(limit * 0.8)) {
        reply.header('X-RateLimit-Warning', 'approaching-limit');
        reply.header('X-RateLimit-Remaining', Math.max(0, limit - tracker.count));
      }

      if (tracker.count > limit) {
        reply.status(429).send({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit for database (${limit} req/min) exceeded. Try again in ${Math.ceil((tracker.resetAt - now) / 1000)}s.`,
          },
        });
        return;
      }
    }
  }

  request.adminUser = {
    userId: fullUser.id,
    username: fullUser.username,
    role: fullUser.role,
  };
}

export function getRateLimitWarningsForUser(userId: string): Array<{
  databaseId: string;
  currentCount: number;
  limit: number;
  percentage: number;
}> {
  const fullUser = authService.getUserById(userId);
  const limit = (fullUser?.rate_limit_per_minute && fullUser.rate_limit_per_minute > 0)
    ? fullUser.rate_limit_per_minute
    : 180;
  const warnings: Array<{
    databaseId: string;
    currentCount: number;
    limit: number;
    percentage: number;
  }> = [];

  const now = Date.now();
  const prefix = `${userId}:`;
  for (const [key, tracker] of userRateLimits.entries()) {
    if (key.startsWith(prefix) && now <= tracker.resetAt) {
      const databaseId = key.substring(prefix.length);
      if (databaseId && !databaseId.includes('system') && tracker.count >= Math.floor(limit * 0.8)) {
        warnings.push({
          databaseId,
          currentCount: tracker.count,
          limit,
          percentage: Math.min(100, Math.round((tracker.count / limit) * 100)),
        });
      }
    }
  }
  return warnings;
}

export function getDatabaseRateLimitStatus(userId: string, databaseId: string): {
  currentCount: number;
  limit: number;
  percentage: number;
  isApproachingLimit: boolean;
  isExceeded: boolean;
} {
  const fullUser = authService.getUserById(userId);
  const limit = (fullUser?.rate_limit_per_minute && fullUser.rate_limit_per_minute > 0)
    ? fullUser.rate_limit_per_minute
    : 180;
  const key = `${userId}:${databaseId}`;
  const now = Date.now();
  const tracker = userRateLimits.get(key);
  const count = (tracker && now <= tracker.resetAt) ? tracker.count : 0;
  const percentage = Math.min(100, Math.round((count / limit) * 100));
  return {
    currentCount: count,
    limit,
    percentage,
    isApproachingLimit: count >= Math.floor(limit * 0.8),
    isExceeded: count > limit,
  };
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

    // 1. Support Admin / User Session Cookie (For Web UI viewing images/videos/media)
    const sessionCookie = request.cookies?.vdb_session;
    if (sessionCookie) {
      const user = authService.verifySessionCookie(sessionCookie, config.sessionSecret);
      if (user) {
        const fullUser = authService.getUserById(user.userId);
        if (!fullUser) {
          reply.status(401).send({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'User account no longer exists' },
          });
          return;
        }
        if (fullUser.status === 'disabled') {
          reply.status(403).send({
            success: false,
            error: { code: 'USER_DISABLED', message: 'User account has been disabled by administrator' },
          });
          return;
        }

        user.role = fullUser.role;
        request.adminUser = {
          userId: fullUser.id,
          username: fullUser.username,
          role: fullUser.role,
        };

        // Enforce tenant boundary: regular users can only access databases they own or are invited to
        if (user.role !== 'super_admin' && user.role !== 'admin') {
          const { databaseMembersService } = await import('../services/members.js');
          const memberRole = databaseMembersService.getUserDatabaseRole(databaseId, user.userId, user.role);
          if (!memberRole) {
            reply.status(403).send({
              success: false,
              error: { code: 'FORBIDDEN', message: 'Access denied: database belongs to another user' },
            });
            return;
          }

          if (permission !== 'database:read' && memberRole === 'viewer') {
            reply.status(403).send({
              success: false,
              error: { code: 'FORBIDDEN', message: 'Access denied: write operations require editor or admin role' },
            });
            return;
          }
        }

        if (user.role !== 'super_admin') {
          const fullUser = authService.getUserById(user.userId);
          const limit = (fullUser?.rate_limit_per_minute && fullUser.rate_limit_per_minute > 0)
            ? fullUser.rate_limit_per_minute
            : 180;
          const key = `${user.userId}:${databaseId}`;
          const now = Date.now();
          const tracker = userRateLimits.get(key) || { count: 0, resetAt: now + 60000 };
          if (now > tracker.resetAt) {
            tracker.count = 0;
            tracker.resetAt = now + 60000;
          }
          tracker.count++;
          userRateLimits.set(key, tracker);

          if (tracker.count >= Math.floor(limit * 0.8)) {
            reply.header('X-RateLimit-Warning', 'approaching-limit');
            reply.header('X-RateLimit-Remaining', Math.max(0, limit - tracker.count));
          }

          if (tracker.count > limit) {
            reply.status(429).send({
              success: false,
              error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: `Rate limit for database (${limit} req/min) exceeded. Try again in ${Math.ceil((tracker.resetAt - now) / 1000)}s.`,
              },
            });
            return;
          }
        }

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
