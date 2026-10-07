---
name: vanilla-write-tests
description: Write or extend Vitest tests for VanillaDatabase with real SQLite databases and real Fastify request handling (no mocking of core logic). Use when adding tests for a feature or bug fix, when asked to improve coverage, or to reproduce a reported bug.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(npx vitest*), Bash(npm test*)
---

# vanilla-write-tests

## Conventions

- Location: `tests/<feature>.test.ts`. Name by behavior or area (existing: `roles`, `security`, `storageForeignKey`, `userManagement`, `cluster`, `crypto`, `sqlTranslator`, `zeroDay`).
- Run: `npm test` (sequential, `--fileParallelism=false`) because tests share the filesystem. Single file:
  ```bash
  npx vitest run tests/<file>.test.ts --fileParallelism=false
  ```
- Read a neighbor test first (for example `tests/userManagement.test.ts` for HTTP flows, `tests/storageForeignKey.test.ts` for service-level DB flows) and reuse its setup helpers.

## Realism rules

- Use a temporary data directory per test file (`fs.mkdtemp`), real SQLite (`node:sqlite`) with WAL and foreign keys ON. Clean up in `afterAll`.
- Prefer Fastify `app.inject()` against the real app instance over calling handlers directly, so hooks, Zod validation, auth, and error handling are exercised.
- Do not mock `DatabaseManager`, storage, or auth. Mock only external network (webhook targets, SMTP) with a local HTTP server on an ephemeral port.
- Each test creates its own users and databases; no dependency on test order.

## Case matrix (aim for every row per feature)

| Case | Expect |
|---|---|
| Valid request | 2xx and envelope `{ success: true, data }` |
| Missing or malformed field | 400 with `{ success: false, error }` |
| No auth / bad token | 401 |
| Insufficient role | 403 |
| Another tenant's resource | 403 or 404, never data |
| Nonexistent reference | 404 or 400, never 500 |
| Duplicate / conflict | 409 |
| Boundary values | empty, max length, unicode, very large |
| Side effects | row counts, files on disk, activity log entry, no orphans |

## Bug reproduction flow

1. Write the failing test first; confirm it fails for the right reason.
2. Fix the code.
3. Confirm green, then run the whole suite.

## Avoid

- Sleeps for synchronization (poll with timeout instead).
- Asserting on full error strings that include volatile text.
- Leaving data in `data/` or committing fixtures with secrets.

Finish with `vanilla-verify`.

