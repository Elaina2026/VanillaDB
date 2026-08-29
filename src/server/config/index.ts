import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

dotenv.config();

function getEnvInt(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (val === undefined || val === '') return defaultValue;
  const num = parseInt(val, 10);
  return isNaN(num) ? defaultValue : num;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const val = process.env[key];
  if (val === undefined || val === '') return defaultValue;
  return val.toLowerCase() === 'true' || val === '1';
}

const dataDir = path.resolve(process.env.VDB_DATA_DIR || './data');
const systemDir = path.join(dataDir, 'system');
const databasesDir = path.join(dataDir, 'databases');
const backupsDir = path.join(dataDir, 'backups');
const storageDir = path.join(dataDir, 'storage');
const tempDir = path.join(dataDir, 'temp');

for (const dir of [dataDir, systemDir, databasesDir, backupsDir, storageDir, tempDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

let sessionSecret = process.env.VDB_SESSION_SECRET;
const secretFilePath = path.join(systemDir, '.session_secret');

if (!sessionSecret || sessionSecret.trim() === '') {
  if (fs.existsSync(secretFilePath)) {
    sessionSecret = fs.readFileSync(secretFilePath, 'utf-8').trim();
  } else {
    sessionSecret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretFilePath, sessionSecret, { encoding: 'utf-8', mode: 0o600 });
  }
}

// Master Encryption Key for Data-At-Rest Encryption (AES-256-GCM)
let masterKey = process.env.VDB_MASTER_KEY || process.env.VDB_ENCRYPTION_KEY;
const masterKeyFilePath = path.join(systemDir, '.master_key');

if (!masterKey || masterKey.trim() === '') {
  if (fs.existsSync(masterKeyFilePath)) {
    masterKey = fs.readFileSync(masterKeyFilePath, 'utf-8').trim();
  } else {
    masterKey = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(masterKeyFilePath, masterKey, { encoding: 'utf-8', mode: 0o600 });
  }
}

// Derive a 256-bit binary encryption key using PBKDF2
const derivedEncryptionKey = crypto.pbkdf2Sync(masterKey, 'vdb_at_rest_salt', 100000, 32, 'sha256');

const appEnv = process.env.VDB_ENV || process.env.NODE_ENV || 'development';
const isProduction = appEnv === 'production';

const insecureSecrets = ['changeme', 'password', '123456', 'secret', 'admin'];
if (isProduction && insecureSecrets.includes(sessionSecret.toLowerCase())) {
  throw new Error(`Insecure VDB_SESSION_SECRET configured: "${sessionSecret}". Please provide a secure random secret.`);
}

export const config = {
  env: appEnv,
  isProduction,
  host: process.env.VDB_HOST || process.env.HOST || '0.0.0.0',
  port: getEnvInt('VDB_PORT', getEnvInt('PORT', 3000)),
  dataDir,
  systemDir,
  databasesDir,
  backupsDir,
  storageDir,
  tempDir,
  sessionSecret,
  masterKey,
  derivedEncryptionKey,
  trustProxy: getEnvBool('VDB_TRUST_PROXY', false),
  corsOrigins: process.env.VDB_CORS_ORIGINS ? process.env.VDB_CORS_ORIGINS.split(',').map(s => s.trim()) : [],
  sqlBusyTimeoutMs: getEnvInt('VDB_SQL_BUSY_TIMEOUT_MS', 5000),
  maxRequestBodyMb: getEnvInt('VDB_MAX_REQUEST_BODY_MB', 10),
  maxImportMb: getEnvInt('VDB_MAX_IMPORT_MB', 1024),
  maxQueryRows: getEnvInt('VDB_MAX_QUERY_ROWS', 100000),
  queryTimeoutMs: getEnvInt('VDB_QUERY_TIMEOUT_MS', 0),
  logLevel: process.env.VDB_LOG_LEVEL || 'info',
  logSql: getEnvBool('VDB_LOG_SQL', false),
  bootstrapAdminUsername: process.env.VDB_ADMIN_USERNAME || null,
  bootstrapAdminPassword: process.env.VDB_ADMIN_PASSWORD || null,
};
