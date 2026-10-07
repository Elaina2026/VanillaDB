---
name: vanilla-e2e-qa
description: Run a realistic end-to-end QA pass over VanillaDatabase functionality (auth, RBAC, databases, data API, storage, backup, realtime, webhooks, cluster, system, UI) against a real running server, then fix root causes and add regression tests. Use when asked to test everything, do a full QA sweep, or validate a release candidate.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(npm run *), Bash(npm test*), Bash(npx vitest*), Bash(node *)
---

# vanilla-e2e-qa

Related skills: `vanilla-verify`, `vanilla-security-audit`, `vanilla-sql-safety`, `vanilla-storage-debug`, `vanilla-benchmark`, `vanilla-write-tests`.

## Setup

1. Baseline: `npm ci`, `npm run build`, `npm test`. Record pass and fail counts.
2. Start the built server (`npm start`) on a random port with a temporary data dir; wait for `/health`. Never use real data.
3. Existing role-matrix check: `npm run workflow:exec` (see `workflow-launch-exec` skill).

## Areas (each: happy path, invalid input, missing permission, nonexistent reference, duplicate, boundary)

- **A Auth**: first-admin setup, login and logout, wrong password, lockout and rate limits, API tokens (create, scope, revoke), WebAuthn service flow, password change.
- **B Users and roles**: CRUD, role changes, privilege escalation attempts, deleting users that own data.
- **C Databases**: create, list, rename, delete, duplicate names, dangerous names, path traversal, access after delete.
- **D Data API**: tables and rows CRUD, DDL, transactions, pagination, NULL and unicode, import and conversion, SQL safety bypass attempts.
- **E Storage**: upload (small, large, empty, duplicate, odd names), download, delete, invalid database or folder (must be 4xx, never 500), aborted stream, no orphan files.
- **F Backup**: manual and scheduled backup, restore, corrupt backup, retention, data equality after restore.
- **G Realtime and webhooks**: subscribe, events on write, signatures, retries, SSRF blocking.
- **H Cluster**: join, leave, sync, invalid nodes.
- **I System**: health, metrics, activity log content, job scheduler, maintenance worker (checkpoint, vacuum).
- **J Security**: IDOR across tenants, information leakage in errors, headers, CORS, body limits.
- **K Resilience**: parallel load, concurrent writers, restart mid-operation, fd leaks.
- **L UI**: web build loads, login, create database, upload, run query; no console errors or failed requests.

## Procedure

1. Script the scenarios as Vitest tests under `tests/` (real server instance, real SQLite).
2. For each defect record: steps, expected vs actual, severity, root cause location.
3. Fix at the root with minimal diffs following project idioms (Zod, Pino, Fastify plugins, `.js` imports, envelope responses).
4. Add a regression test per defect.
5. Update `docs/en` and `docs/vi` where behavior changed (`vanilla-docs-sync`).

## Done criteria

- `npm run test:audit` passes.
- No 500 from user input; no cross-tenant data; no SQL safety bypass.

## Final report

Summary of scenarios run per area; defect table (ID, severity, area, description, status, file); files changed; measured performance (real numbers, see `vanilla-benchmark`); residual risks; recommendations.

