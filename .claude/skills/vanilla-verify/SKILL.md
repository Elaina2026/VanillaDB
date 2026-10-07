---
name: vanilla-verify
description: Run the full verification gate (typecheck, tests, security tests, build) for VanillaDatabase and report results. Use after any code change, before committing, before declaring a task done, or when asked to "verify", "check everything", or "make sure it passes".
allowed-tools: Bash(npm run *), Bash(npm test*), Bash(git status*), Bash(git diff*), Read, Grep
---

# vanilla-verify

Final gate for every change. Never report a task as finished without running this.

## Steps

1. Inspect scope: `git status` and `git diff --stat` to know which areas were touched.
2. Typecheck (frontend and server):
   ```bash
   npm run typecheck
   ```
3. Full test suite (sequential, because tests share SQLite files):
   ```bash
   npm test
   ```
4. If the change touches auth, SQL, storage, tokens, roles, crypto, or any route:
   ```bash
   npm run test:security
   ```
5. Production build (web and server bundle):
   ```bash
   npm run build
   ```
6. Combined shortcut when everything is needed: `npm run test:audit`.

## Pass criteria

- Zero TypeScript errors in both tsconfig projects.
- All Vitest tests pass (AGENTS.md expects 94 or more; the count may grow, it must never shrink without reason).
- Build succeeds.
- No `.env`, keys, tokens, or `data/` contents staged.
- No Unicode emojis in changed files (use `[CORE]`, `[SECURITY]`, `[API]`, `[NOTE]`, `[WARN]`).

## Failure handling

- Fix the root cause. Do not edit or delete an existing test just to make it green unless the test encodes behavior that was intentionally changed; explain why in the report.
- If a test is flaky, re-run that file alone with `npx vitest run tests/<file>.test.ts --fileParallelism=false` before concluding.
- Windows note: a stale `dist/` or locked SQLite file in `data/` can cause false failures; check for leftover node processes.

## Report format

```
Typecheck: pass/fail
Tests: X passed, Y failed (list failing names)
Security tests: pass/fail/skipped (reason)
Build: pass/fail
Open risks: ...
```

