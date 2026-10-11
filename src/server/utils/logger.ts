import pino from 'pino';
import { config } from '../config/index.js';

export function sanitizeUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  return rawUrl.replace(/([?&](?:token|ticket)=)[^&]+/gi, '$1[REDACTED]');
}

export const logger = pino({
  level: config.logLevel,
  transport: !config.isProduction
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'SYS:standard',
        },
      }
    : undefined,
  serializers: {
    req(req: any) {
      const rawUrl = req.raw?.url || req.url || '';
      return {
        method: req.method,
        url: sanitizeUrl(rawUrl),
        host: req.headers?.host || req.host,
        remoteAddress: req.ip || req.socket?.remoteAddress || req.remoteAddress,
        remotePort: req.socket?.remotePort || req.remotePort,
      };
    },
  },
  redact: [
    'req.headers.authorization',
    'headers.authorization',
    'password',
    'confirmPassword',
    'tokenSecret',
    'token',
    'ticket',
    'req.query.token',
    'req.query.ticket',
  ],
});
