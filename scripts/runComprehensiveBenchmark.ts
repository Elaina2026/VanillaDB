import { buildApp } from '../src/server/index.js';
import { databaseService } from '../src/server/services/database.js';
import { tokenService } from '../src/server/services/tokens.js';
import { authService } from '../src/server/services/auth.js';
import { dbManager } from '../src/server/db/manager.js';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';

// Disable L7 flood limiter during raw load testing so we measure SQLite & server engine capacity
process.env.VDB_DISABLE_L7_LIMITER = 'true';

interface BenchmarkMetrics {
  name: string;
  samples: number;
  concurrency: number;
  durationSec: number;
  rps: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  cpuPercent: number;
  heapUsedMb: number;
  rssMb: number;
  errors: number;
  statusCodes: Record<string, number>;
}

function calculatePercentiles(latencies: number[]) {
  if (latencies.length === 0) return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: Math.round(sorted[0] * 100) / 100,
    max: Math.round(sorted[sorted.length - 1] * 100) / 100,
    avg: Math.round((sum / sorted.length) * 100) / 100,
    p50: Math.round(sorted[Math.floor(sorted.length * 0.5)] * 100) / 100,
    p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 100) / 100,
    p99: Math.round(sorted[Math.floor(sorted.length * 0.99)] * 100) / 100,
  };
}

async function runBenchmark() {
  console.log('================================================================');
  console.log('   VANILLADATABASE SENIOR QA / SDET BENCHMARK SUITE');
  console.log('================================================================');
  console.log(`OS: ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`CPU: ${os.cpus()[0]?.model} (${os.cpus().length} cores)`);
  console.log(`Total RAM: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`Node.js: ${process.version}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // Start real HTTP server on random port
  let app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  let address = app.server.address() as any;
  let baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`Live HTTP server running at: ${baseUrl}\n`);

  // Setup Admin account
  const runId = Date.now();
  let adminCookie = '';
  const adminUsername = `bench_admin_${runId}`;
  const adminPassword = 'AdminPassword123!';

  const setupRes = await fetch(`${baseUrl}/api/auth/setup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: adminUsername,
      password: adminPassword,
      confirmPassword: adminPassword,
    }),
  });

  if (setupRes.status === 201) {
    const rawCookie = setupRes.headers.get('set-cookie');
    if (rawCookie) adminCookie = rawCookie.split(';')[0];
  } else {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: process.env.VDB_ADMIN_USERNAME || 'VanillaDatabase',
        password: process.env.VDB_ADMIN_PASSWORD || '123456',
      }),
    });
    const rawCookie = loginRes.headers.get('set-cookie');
    if (rawCookie) adminCookie = rawCookie.split(';')[0];
  }

  // Provision Main Benchmark Database
  const mainDb = databaseService.createDatabase(`BenchMain_${runId}`, 'Main Benchmark DB');
  const { plainSecret: mainToken } = await tokenService.createToken({
    databaseId: mainDb.id,
    name: 'Bench Token',
    permissions: ['database:read', 'database:write', 'database:ddl'],
    rateLimit: 0,
  });

  // Create test table
  await fetch(`${baseUrl}/v1/databases/${mainDb.id}/query`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${mainToken}`,
    },
    body: JSON.stringify({
      sql: `
        CREATE TABLE bench_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          payload TEXT,
          num_val REAL,
          created_at INTEGER
        );
        CREATE INDEX idx_bench_items_name ON bench_items(name);
      `,
    }),
  });

  // Pre-seed 500 rows for SELECT benchmark
  console.log('Pre-seeding 500 rows for query testing...');
  const batchStmts = Array.from({ length: 500 }, (_, i) => ({
    sql: 'INSERT INTO bench_items (name, payload, num_val, created_at) VALUES (?, ?, ?, ?);',
    params: [`seed_item_${i}`, `payload_data_string_${i}_${crypto.randomBytes(16).toString('hex')}`, i * 1.5, Date.now()],
  }));

  await fetch(`${baseUrl}/v1/databases/${mainDb.id}/batch`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${mainToken}`,
    },
    body: JSON.stringify({ transaction: true, statements: batchStmts }),
  });
  console.log('Seeding complete.\n');

  // Generic benchmark runner
  async function benchmarkEndpoint(
    name: string,
    totalRequests: number,
    concurrency: number,
    requestFn: (index: number) => Promise<Response>
  ): Promise<BenchmarkMetrics> {
    const latencies: number[] = [];
    const statusCodes: Record<string, number> = {};
    let errors = 0;
    let nextIndex = 0;

    const cpuBefore = process.cpuUsage();
    const timeStart = performance.now();

    async function worker() {
      while (true) {
        const i = nextIndex++;
        if (i >= totalRequests) break;
        const t0 = performance.now();
        try {
          const res = await requestFn(i);
          const t1 = performance.now();
          latencies.push(t1 - t0);
          statusCodes[res.status] = (statusCodes[res.status] || 0) + 1;
          if (res.status >= 400) errors++;
          await res.arrayBuffer();
        } catch (err: any) {
          const t1 = performance.now();
          latencies.push(t1 - t0);
          errors++;
          statusCodes['ERR'] = (statusCodes['ERR'] || 0) + 1;
        }
      }
    }

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);

    const timeEnd = performance.now();
    const cpuDiff = process.cpuUsage(cpuBefore);
    const durationMs = timeEnd - timeStart;
    const durationSec = durationMs / 1000;
    const rps = Math.round(totalRequests / durationSec);
    const totalCpuMicros = cpuDiff.user + cpuDiff.system;
    const cpuPercent = Math.min(100, Math.round((totalCpuMicros / (durationMs * 1000 * os.cpus().length)) * 100));
    const mem = process.memoryUsage();

    const stats = calculatePercentiles(latencies);

    return {
      name,
      samples: totalRequests,
      concurrency,
      durationSec: Math.round(durationSec * 1000) / 1000,
      rps,
      minMs: stats.min,
      maxMs: stats.max,
      avgMs: stats.avg,
      p50Ms: stats.p50,
      p95Ms: stats.p95,
      p99Ms: stats.p99,
      cpuPercent,
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024 * 10) / 10,
      rssMb: Math.round(mem.rss / 1024 / 1024 * 10) / 10,
      errors,
      statusCodes,
    };
  }

  // ==========================================
  // 1. ENDPOINT BENCHMARKS
  // ==========================================
  console.log('--- 1. Running Endpoint Benchmarks ---');

  // 1.1 /health
  console.log('Benchmarking: GET /health (1,000 requests, concurrency: 20)...');
  const benchHealth = await benchmarkEndpoint('GET /health', 1000, 20, () =>
    fetch(`${baseUrl}/health`, { method: 'GET' })
  );

  // 1.2 POST query SELECT
  console.log('Benchmarking: POST query SELECT (1,000 requests, concurrency: 20)...');
  const benchSelect = await benchmarkEndpoint('POST query SELECT', 1000, 20, (i) =>
    fetch(`${baseUrl}/v1/databases/${mainDb.id}/query`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${mainToken}`,
      },
      body: JSON.stringify({
        sql: 'SELECT id, name, payload FROM bench_items WHERE id = ?;',
        params: [(i % 500) + 1],
      }),
    })
  );

  // 1.3 POST query INSERT đơn
  console.log('Benchmarking: POST query INSERT đơn (500 requests, concurrency: 10)...');
  const benchInsert = await benchmarkEndpoint('POST query INSERT đơn', 500, 10, (i) =>
    fetch(`${baseUrl}/v1/databases/${mainDb.id}/query`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${mainToken}`,
      },
      body: JSON.stringify({
        sql: 'INSERT INTO bench_items (name, payload, num_val, created_at) VALUES (?, ?, ?, ?);',
        params: [`new_item_${i}`, `load_payload_${i}`, i, Date.now()],
      }),
    })
  );

  // 1.4 Upload file 1MB
  console.log('Benchmarking: Upload file 1MB (50 requests, concurrency: 5)...');
  const oneMbBuffer = crypto.randomBytes(1024 * 1024);
  const boundary = '----WebKitFormBoundaryBenchUpload';
  const fileHeader = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="upload_1mb.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`
  );
  const fileFooter = Buffer.from(`\r\n--${boundary}--\r\n`);
  const multipart1Mb = Buffer.concat([fileHeader, oneMbBuffer, fileFooter]);

  const benchUpload = await benchmarkEndpoint('Upload file 1MB (AES-256-GCM)', 50, 5, () =>
    fetch(`${baseUrl}/api/admin/databases/${mainDb.id}/files`, {
      method: 'POST',
      headers: {
        cookie: adminCookie,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      body: multipart1Mb,
    })
  );

  // 1.5 Login (Argon2id/PBKDF2 crypto cost)
  console.log('Benchmarking: POST /api/auth/login (Argon2id/PBKDF2) (25 requests, concurrency: 2)...');
  const benchLogin = await benchmarkEndpoint('POST /api/auth/login (Argon2id/PBKDF2)', 25, 2, (i) =>
    fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': `10.0.0.${i + 1}`,
      },
      body: JSON.stringify({
        username: adminUsername,
        password: adminPassword,
      }),
    })
  );

  console.log('Endpoint benchmarks completed.\n');

  // ==========================================
  // 2. CONCURRENT WRITES STRESS TEST (200 & 500)
  // ==========================================
  console.log('--- 2. Concurrent Writes Stress Test (Single DB vs Multiple DBs) ---');

  interface StressResult {
    name: string;
    total: number;
    concurrency: number;
    success: number;
    sqliteBusy: number;
    http5xx: number;
    otherErrors: number;
    durationMs: number;
    rps: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
  }

  async function runConcurrentWriteTest(
    testName: string,
    total: number,
    concurrency: number,
    getTarget: (index: number) => { dbId: string; token: string }
  ): Promise<StressResult> {
    let success = 0;
    let sqliteBusy = 0;
    let http5xx = 0;
    let otherErrors = 0;
    let nextIdx = 0;
    const latencies: number[] = [];

    const tStart = performance.now();

    async function stressWorker() {
      while (true) {
        const i = nextIdx++;
        if (i >= total) break;
        const target = getTarget(i);
        const reqT0 = performance.now();

        try {
          const res = await fetch(`${baseUrl}/v1/databases/${target.dbId}/query`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${target.token}`,
            },
            body: JSON.stringify({
              sql: 'INSERT INTO bench_items (name, payload, num_val, created_at) VALUES (?, ?, ?, ?);',
              params: [`stress_${testName}_${i}`, `stress_payload_${i}`, i, Date.now()],
            }),
          });
          const reqT1 = performance.now();
          latencies.push(reqT1 - reqT0);

          if (res.status === 200) {
            success++;
          } else {
            const body = await res.text();
            if (res.status >= 500) http5xx++;
            if (body.includes('SQLITE_BUSY') || body.includes('database is locked')) {
              sqliteBusy++;
            } else {
              otherErrors++;
            }
          }
        } catch (err: any) {
          const reqT1 = performance.now();
          latencies.push(reqT1 - reqT0);
          otherErrors++;
        }
      }
    }

    const workers = Array.from({ length: concurrency }, () => stressWorker());
    await Promise.all(workers);

    const durationMs = performance.now() - tStart;
    const rps = Math.round(total / (durationMs / 1000));
    const stats = calculatePercentiles(latencies);

    return {
      name: testName,
      total,
      concurrency,
      success,
      sqliteBusy,
      http5xx,
      otherErrors,
      durationMs: Math.round(durationMs),
      rps,
      p50Ms: stats.p50,
      p95Ms: stats.p95,
      p99Ms: stats.p99,
    };
  }

  // Provision 5 databases for multi-DB tests
  console.log('Provisioning 5 separate databases for multi-DB stress test...');
  const multiDbs: Array<{ id: string; token: string }> = [];
  for (let d = 0; d < 5; d++) {
    const db = databaseService.createDatabase(`MultiDB_${d}_${runId}`);
    const { plainSecret: tok } = await tokenService.createToken({
      databaseId: db.id,
      name: `MultiToken_${d}`,
      permissions: ['database:read', 'database:write', 'database:ddl'],
      rateLimit: 0,
    });
    // Create schema
    await fetch(`${baseUrl}/v1/databases/${db.id}/query`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${tok}`,
      },
      body: JSON.stringify({
        sql: 'CREATE TABLE bench_items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, payload TEXT, num_val REAL, created_at INTEGER);',
      }),
    });
    multiDbs.push({ id: db.id, token: tok });
  }
  console.log('Multi-DB setup complete.');

  // Test 2.1: 200 writes to SAME DB
  console.log('Running: 200 concurrent writes -> Single DB...');
  const stressSingle200 = await runConcurrentWriteTest('Single DB (200 writes)', 200, 20, () => ({
    dbId: mainDb.id,
    token: mainToken,
  }));

  // Test 2.2: 500 writes to SAME DB
  console.log('Running: 500 concurrent writes -> Single DB...');
  const stressSingle500 = await runConcurrentWriteTest('Single DB (500 writes)', 500, 25, () => ({
    dbId: mainDb.id,
    token: mainToken,
  }));

  // Test 2.3: 200 writes across 5 DIFFERENT DBs
  console.log('Running: 200 concurrent writes -> 5 Separate DBs...');
  const stressMulti200 = await runConcurrentWriteTest('5 Separate DBs (200 writes)', 200, 20, (i) => {
    const target = multiDbs[i % multiDbs.length];
    return { dbId: target.id, token: target.token };
  });

  // Test 2.4: 500 writes across 5 DIFFERENT DBs
  console.log('Running: 500 concurrent writes -> 5 Separate DBs...');
  const stressMulti500 = await runConcurrentWriteTest('5 Separate DBs (500 writes)', 500, 25, (i) => {
    const target = multiDbs[i % multiDbs.length];
    return { dbId: target.id, token: target.token };
  });

  console.log('Concurrent write tests complete.\n');

  // ==========================================
  // 3. /health LATENCY UNDER HEAVY WRITE LOAD
  // ==========================================
  console.log('--- 3. Measuring /health Latency During Active Heavy Write Load ---');
  let writeLoadActive = true;
  let writeLoadCount = 0;

  // Background heavy writers continuously inserting transactions
  const heavyWriters = Array.from({ length: 6 }, async () => {
    while (writeLoadActive) {
      try {
        await fetch(`${baseUrl}/v1/databases/${mainDb.id}/query`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${mainToken}`,
          },
          body: JSON.stringify({
            sql: 'INSERT INTO bench_items (name, payload, num_val, created_at) VALUES (?, ?, ?, ?);',
            params: [`heavy_load_${writeLoadCount++}`, crypto.randomBytes(32).toString('hex'), Math.random(), Date.now()],
          }),
        });
      } catch {}
    }
  });

  // Sample /health latency while heavy writes are actively running
  const healthLatenciesUnderLoad: number[] = [];
  for (let h = 0; h < 100; h++) {
    const t0 = performance.now();
    const hRes = await fetch(`${baseUrl}/health`);
    const t1 = performance.now();
    healthLatenciesUnderLoad.push(t1 - t0);
    await hRes.arrayBuffer();
    await new Promise((r) => setTimeout(r, 10));
  }

  writeLoadActive = false;
  await Promise.all(heavyWriters);

  const healthUnderLoadStats = calculatePercentiles(healthLatenciesUnderLoad);
  console.log(`/health during heavy writes: Avg: ${healthUnderLoadStats.avg.toFixed(2)}ms | p50: ${healthUnderLoadStats.p50.toFixed(2)}ms | p95: ${healthUnderLoadStats.p95.toFixed(2)}ms | p99: ${healthUnderLoadStats.p99.toFixed(2)}ms\n`);

  // ==========================================
  // 4. MID-LOAD SERVER RESTART & DATA INTEGRITY & FD COUNT
  // ==========================================
  console.log('--- 4. Mid-Load Server Restart, Data Integrity & Handle Leak Check ---');

  const activeHandlesBefore = (process as any)._getActiveHandles?.().length || 0;

  const restartTestDb = databaseService.createDatabase(`RestartTest_${runId}`);
  const { plainSecret: restartToken } = await tokenService.createToken({
    databaseId: restartTestDb.id,
    name: 'Restart Token',
    permissions: ['database:read', 'database:write', 'database:ddl'],
    rateLimit: 0,
  });

  await fetch(`${baseUrl}/v1/databases/${restartTestDb.id}/query`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${restartToken}`,
    },
    body: JSON.stringify({
      sql: 'CREATE TABLE audit_records (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL);',
    }),
  });

  // Launch 100 inserts, close server mid-way
  let insertDoneCount = 0;
  let insertErrCount = 0;
  const insertPromises = Array.from({ length: 100 }, async (_, i) => {
    try {
      const r = await fetch(`${baseUrl}/v1/databases/${restartTestDb.id}/query`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${restartToken}`,
        },
        body: JSON.stringify({
          sql: 'INSERT INTO audit_records (hash) VALUES (?);',
          params: [`hash_rec_${i}_${crypto.randomBytes(8).toString('hex')}`],
        }),
      });
      if (r.status === 200) insertDoneCount++;
      else insertErrCount++;
    } catch {
      insertErrCount++;
    }
  });

  // Let 30ms pass so roughly half are processed
  await new Promise((r) => setTimeout(r, 30));

  console.log('Executing mid-flight server shutdown...');
  await app.close();
  dbManager.closeAll();

  // Wait remaining requests to settle
  await Promise.allSettled(insertPromises);
  console.log(`Server stopped. Client commits acknowledged: ${insertDoneCount}, aborted/failed in-flight: ${insertErrCount}`);

  // Re-launch fresh server
  console.log('Re-launching fresh server instance...');
  app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const newAddr = app.server.address() as any;
  baseUrl = `http://127.0.0.1:${newAddr.port}`;
  console.log(`Fresh server online at: ${baseUrl}`);

  // Check integrity with PRAGMA integrity_check on SQLite
  const integrityRes = await fetch(`${baseUrl}/v1/databases/${restartTestDb.id}/query`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${restartToken}`,
    },
    body: JSON.stringify({ sql: 'PRAGMA integrity_check;' }),
  });

  const integrityJson = await integrityRes.json();
  const integrityStatus = integrityJson.data?.rows?.[0]?.integrity_check || 'unknown';

  // Count persisted rows
  const countRes = await fetch(`${baseUrl}/v1/databases/${restartTestDb.id}/query`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${restartToken}`,
    },
    body: JSON.stringify({ sql: 'SELECT COUNT(*) as cnt FROM audit_records;' }),
  });
  const countJson = await countRes.json();
  const actualPersistedRows = countJson.data?.rows?.[0]?.cnt || 0;

  const activeHandlesAfter = (process as any)._getActiveHandles?.().length || 0;
  console.log(`Data Integrity check: ${integrityStatus}`);
  console.log(`Committed rows verified: ${actualPersistedRows} (matches acknowledged: ${insertDoneCount === actualPersistedRows})`);
  console.log(`Active handles before vs after: ${activeHandlesBefore} -> ${activeHandlesAfter}\n`);

  // ==========================================
  // 5. INTERNAL RATE LIMITING VERIFICATION
  // ==========================================
  console.log('--- 5. Verifying Internal Rate Limiting for Auth & PBKDF2 Routes ---');

  // Test Login rate limit (> 30 requests from same IP)
  let loginRateLimitedAt = -1;
  for (let a = 1; a <= 35; a++) {
    const r = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'non_existent_rate_test_user',
        password: 'RandomPassword123!',
      }),
    });
    if (r.status === 429) {
      loginRateLimitedAt = a;
      break;
    }
  }

  // Test Password Change rate limit (> 10 requests)
  let changePwdRateLimitedAt = -1;
  for (let c = 1; c <= 15; c++) {
    const r = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: adminCookie,
      },
      body: JSON.stringify({
        currentPassword: 'WrongPassword!',
        newPassword: 'NewValidPassword123!',
      }),
    });
    if (r.status === 429) {
      changePwdRateLimitedAt = c;
      break;
    }
  }

  // Test Recovery / Reset Password rate limit (> 10 requests)
  let recoveryRateLimitedAt = -1;
  for (let rc = 1; rc <= 15; rc++) {
    const r = await fetch(`${baseUrl}/api/auth/recovery/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        usernameOrEmail: 'recovery_test_target',
        totpCode: '123456',
        newPassword: 'NewPassword123!',
      }),
    });
    if (r.status === 429) {
      recoveryRateLimitedAt = rc;
      break;
    }
  }

  console.log(`Login 429 triggered at attempt: ${loginRateLimitedAt > 0 ? loginRateLimitedAt : 'FAILED'}`);
  console.log(`Change-Password 429 triggered at attempt: ${changePwdRateLimitedAt > 0 ? changePwdRateLimitedAt : 'FAILED'}`);
  console.log(`Recovery 429 triggered at attempt: ${recoveryRateLimitedAt > 0 ? recoveryRateLimitedAt : 'FAILED'}\n`);

  // Cleanup
  console.log('Cleaning up benchmark databases...');
  try { databaseService.deleteDatabase(mainDb.id); } catch {}
  try { databaseService.deleteDatabase(restartTestDb.id); } catch {}
  for (const m of multiDbs) {
    try { databaseService.deleteDatabase(m.id); } catch {}
  }
  dbManager.closeAll();
  await app.close();

  // Print Summary Data as JSON
  const reportOutput = {
    env: {
      os: `${os.type()} ${os.release()} (${os.arch()})`,
      cpu: `${os.cpus()[0]?.model} (${os.cpus().length} cores)`,
      totalRamGb: Number((os.totalmem() / 1024 / 1024 / 1024).toFixed(2)),
      nodeVersion: process.version,
    },
    endpoints: [benchHealth, benchSelect, benchInsert, benchUpload, benchLogin],
    stress: [stressSingle200, stressSingle500, stressMulti200, stressMulti500],
    healthUnderLoad: {
      idleP50Ms: benchHealth.p50Ms,
      idleP95Ms: benchHealth.p95Ms,
      idleP99Ms: benchHealth.p99Ms,
      underLoadAvgMs: healthUnderLoadStats.avg,
      underLoadP50Ms: healthUnderLoadStats.p50,
      underLoadP95Ms: healthUnderLoadStats.p95,
      underLoadP99Ms: healthUnderLoadStats.p99,
    },
    restartAndIntegrity: {
      integrityCheck: integrityStatus,
      clientCommitsAcknowledged: insertDoneCount,
      persistedRowsVerified: actualPersistedRows,
      exactMatch: insertDoneCount === actualPersistedRows,
      activeHandlesBefore,
      activeHandlesAfter,
    },
    rateLimiting: {
      loginTriggerAttempt: loginRateLimitedAt,
      changePasswordTriggerAttempt: changePwdRateLimitedAt,
      recoveryTriggerAttempt: recoveryRateLimitedAt,
    },
  };

  fs.writeFileSync('benchmark_results.json', JSON.stringify(reportOutput, null, 2));
  console.log('Benchmark finished! Data saved to benchmark_results.json');
}

runBenchmark().catch((err) => {
  console.error('Benchmark fatal error:', err);
  process.exit(1);
});
