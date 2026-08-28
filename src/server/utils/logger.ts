import pino from 'pino';
import { config } from '../config/index.js';

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
  redact: [
    'req.headers.authorization',
    'headers.authorization',
    'password',
    'confirmPassword',
    'tokenSecret',
    'token',
  ],
});
