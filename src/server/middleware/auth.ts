import type { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from '../services/auth.js';
import { tokenService } from '../services/tokens.js';
import { config } from '../config/index.js';
import type { ApiTokenRecord, TokenPermission } from '../../../shared/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    adminUser?: { userId: string; username: string };
    apiToken?: ApiTokenRecord;
    databaseId?: string;
  }
}

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

  request.adminUser = user;
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

    const authHeader = request.headers.authorization;
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
