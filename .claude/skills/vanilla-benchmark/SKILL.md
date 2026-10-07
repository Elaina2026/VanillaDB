---
name: vanilla-benchmark
description: Measure and report real performance of VanillaDatabase (latency percentiles, throughput, concurrency, SQLITE_BUSY, event loop blocking, memory, restart durability). Use when asked to benchmark, load test, check performance regressions, or validate concurrency claims.
allowed-tools: Read, Grep, Glob, Bash(npm run benchmark), Bash(npm run build), Bash(npx autocannon*), Bash(node *)
---

# vanilla-benchmark

Principle: report measured numbers only. Never write thresholds ("p95 < 8ms") as if they were results.

## Existing tooling

- `npm run benchmark` runs `src/server/benchmark.ts`; `benchmark_results.json` stores previous output. Read both and extend rather than replace.

## Environment

- Build first (`npm run build`), run the compiled server with a temporary data directory on the same disk type as production. Record: OS, Node version, CPU cores, RAM, disk, data size.
- Warm up (discard the first few seconds). Run each scenario at least 3 times and report median of runs.

## Scenarios

| ID | Scenario | Metrics |
|---|---|---|
| P1 | `GET /health` | p50, p95, p99, req/s |
| P2 | Authenticated `SELECT` via query endpoint | same |
| P3 | Single-row INSERT, one database | same, error count |
| P4 | 60, 200, 500 concurrent writes, same database | SQLITE_BUSY count, 5xx count, p99 |
| P5 | Concurrent writes across many databases | throughput scaling |
| P6 | Upload 1 MB and 100 MB streamed file | throughput, peak RSS |
| P7 | Login (argon2) burst | latency, CPU, whether other routes stall |
| P8 | `/health` latency while P4 runs | event loop blocking (node:sqlite is synchronous) |
| P9 | Kill and restart mid-load | integrity (`PRAGMA integrity_check`), row counts, open fd count before and after |
| P10 | 10 minute soak | RSS growth, fd growth, latency drift |

## Rules

- Use realistic payloads and a realistic dataset (tens of thousands of rows), not an empty table.
- Keep WAL and foreign keys ON; do not tune pragmas to flatter results unless the tuning is a proposed change, reported separately.
- Capture errors by type; a fast run with 5xx responses is a failure, not a win.

## Report

Markdown table per scenario: samples, p50/p95/p99, req/s, errors, CPU, RSS. Then: bottlenecks found, risks (for example synchronous SQLite blocking the event loop under heavy writes), and concrete recommendations. Compare with `benchmark_results.json` and flag regressions above 10 percent.

