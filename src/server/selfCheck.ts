import assert from 'node:assert';
import { IpTokenBucketLimiter } from './index.js';
import { dbManager } from './db/manager.js';

// 1. Check Token Bucket Rate Limiter
const checkLimiter = new IpTokenBucketLimiter(3, 1);
assert.strictEqual(checkLimiter.consume('192.0.2.1').allowed, true);
assert.strictEqual(checkLimiter.consume('192.0.2.1').allowed, true);
assert.strictEqual(checkLimiter.consume('192.0.2.1').allowed, true);
assert.strictEqual(checkLimiter.consume('192.0.2.1').allowed, false);
assert.strictEqual(checkLimiter.consume('192.0.2.2').allowed, true);

// 2. Check Identifier Escaper
assert.strictEqual(dbManager.escapeIdentifier('users'), '"users"');
assert.strictEqual(dbManager.escapeIdentifier('bad"table'), '"bad""table"');
assert.strictEqual(dbManager.escapeIdentifier('col"; DROP TABLE x; --'), '"col""; DROP TABLE x; --"');

// 3. Check SQL Safety whitespace / quote bypass prevention
assert.throws(() => {
  dbManager.validateSqlSafety('SELECT * FROM"secret"', {
    allowedTables: ['public_data'],
  });
}, /Access to table "secret" is not permitted/);

assert.throws(() => {
  dbManager.validateSqlSafety('SELECT * FROM`secret`', {
    allowedTables: ['public_data'],
  });
}, /Access to table "secret" is not permitted/);

assert.throws(() => {
  dbManager.validateSqlSafety('SELECT * FROM[secret]', {
    allowedTables: ['public_data'],
  });
}, /Access to table "secret" is not permitted/);

process.exit(0);
