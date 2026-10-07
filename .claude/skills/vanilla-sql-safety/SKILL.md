---
name: vanilla-sql-safety
description: Work on tenant SQL execution safety in VanillaDatabase (DatabaseManager.validateSqlSafety, SQL translator, query and DDL endpoints). Use when modifying the query console, SQL import, dialect translation, or when asked to harden or test SQL injection and sandbox escape protections.
allowed-tools: Read, Grep, Glob, Edit, Bash(npm run test:security), Bash(npx vitest*)
---

# vanilla-sql-safety

## Hard rules

- Every tenant SQL statement passes through `DatabaseManager.validateSqlSafety()`. No bypass, no "internal" shortcut for user-influenced SQL.
- Values are bound parameters. Identifiers (table, column names) are validated against a strict pattern and quoted, never concatenated raw.
- Never allow turning off `foreign_keys` or changing `journal_mode` from WAL.

## Must-block list (verify each still fails)

| Vector | Example |
|---|---|
| Attach other files | `ATTACH DATABASE '/etc/passwd' AS x` |
| Load native code | `SELECT load_extension('x')` |
| Dangerous PRAGMAs | `PRAGMA foreign_keys=OFF`, `PRAGMA journal_mode=DELETE`, `PRAGMA writable_schema=ON` |
| Stacked statements | `SELECT 1; DROP TABLE t` (policy: single statement unless the import path explicitly allows scripts) |
| Metadata and system tables | reading or writing internal metadata tables, `sqlite_master` tampering |
| Comment and quote tricks | `/* */`, `--`, unicode quotes, case variations (`aTtAcH`) |
| File functions | `readfile`, `writefile`, `edit`, `fts3_tokenizer` |
| VACUUM INTO | exporting to arbitrary paths |

## Procedure for changes

1. Read `validateSqlSafety()` and `src/server/` SQL translator code (tests: `tests/sqlTranslator.test.ts`, `tests/security.test.ts`, `tests/zeroDay.test.ts`, `tests/dataLeakSecurity.test.ts`).
2. Prefer an allowlist of statement types per role over a growing denylist. Strip or neutralize comments and string literals before keyword scanning, but do not rely on regex alone if a tokenizer path exists.
3. Add a failing test first for each new bypass idea, then fix.
4. Translator changes: add tests for each supported dialect construct and each unsupported one (unsupported must return a clear 400, not partial execution).
5. Error messages must not leak file paths, stack traces, or internal table names.

## Verification

```bash
npm run test:security
```
then the `vanilla-verify` skill. Document user-visible limits in `docs/en/03-database-engine.md` and `docs/vi/03-database-engine.md`.

