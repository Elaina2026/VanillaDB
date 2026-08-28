import { buildApp } from './index.js';
import { databaseService } from './services/database.js';
import { tokenService } from './services/tokens.js';
import { dbManager } from './db/manager.js';

async function runBenchmark() {
  console.log('--- Starting VanillaDatabase High-Performance Benchmark ---');
  console.log('Configured: NO RATE LIMITING, WAL concurrency, Prepared Statements\n');

  const app = await buildApp();
  await app.ready();

  const db = databaseService.createDatabase('Benchmark DB', 'Benchmarking performance');
  const { plainSecret: token } = await tokenService.createToken({
    databaseId: db.id,
    name: 'Bench Token',
    permissions: ['database:read', 'database:write', 'database:ddl'],
  });

  // Setup schema
  await app.inject({
    method: 'POST',
    url: `/api/admin/databases/${db.id}/query`,
    payload: {
      sql: `
        CREATE TABLE bench_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          val INTEGER
        );
      `,
    },
  });

  const runPhase = async (name: string, count: number, fn: (i: number) => Promise<any>, concurrency = 1) => {
    const latencies: number[] = [];
    let success = 0;
    let errors = 0;

    const start = performance.now();
    let currentIdx = 0;

    const worker = async () => {
      while (currentIdx < count) {
        const i = currentIdx++;
        const t0 = performance.now();
        try {
          await fn(i);
          success++;
        } catch {
          errors++;
        }
        latencies.push(performance.now() - t0);
      }
    };

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);

    const totalDuration = (performance.now() - start) / 1000;
    latencies.sort((a, b) => a - b);

    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const rps = Math.round(count / totalDuration);

    console.log(`[Phase: ${name}]`);
    console.log(`  Requests: ${count} (${concurrency} concurrency)`);
    console.log(`  Success: ${success}, Errors: ${errors}`);
    console.log(`  Throughput: ${rps} req/sec`);
    console.log(`  Latency (ms) - Avg: ${avg.toFixed(2)} | p50: ${p50.toFixed(2)} | p95: ${p95.toFixed(2)} | p99: ${p99.toFixed(2)}\n`);
  };

  // 1. Single Inserts
  await runPhase('Single INSERTs (WAL mode)', 500, async (i) => {
    await app.inject({
      method: 'POST',
      url: `/v1/databases/${db.id}/query`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sql: 'INSERT INTO bench_items (name, val) VALUES (?, ?)',
        params: [`item_${i}`, i],
      },
    });
  });

  // 2. Parallel Reads
  await runPhase('Parallel Reads (SELECT * with LIMIT)', 1000, async (i) => {
    await app.inject({
      method: 'POST',
      url: `/v1/databases/${db.id}/query`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sql: 'SELECT * FROM bench_items WHERE id = ?',
        params: [(i % 500) + 1],
      },
    });
  }, 10);

  // 3. Transactional Batch Inserts
  await runPhase('Transactional Batch (10 items / batch)', 50, async (i) => {
    const stmts = Array.from({ length: 10 }, (_, j) => ({
      sql: 'INSERT INTO bench_items (name, val) VALUES (?, ?)',
      params: [`batch_${i}_${j}`, i * 10 + j],
    }));
    await app.inject({
      method: 'POST',
      url: `/v1/databases/${db.id}/batch`,
      headers: { authorization: `Bearer ${token}` },
      payload: { transaction: true, statements: stmts },
    });
  });

  // Cleanup
  databaseService.deleteDatabase(db.id);
  dbManager.closeAll();
  await app.close();
  console.log('--- Benchmark Completed Successfully ---');
}

runBenchmark().catch(console.error);
