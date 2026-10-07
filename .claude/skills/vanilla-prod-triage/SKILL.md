---
name: vanilla-prod-triage
description: Triage a production error from VanillaDatabase Pino JSON logs or user reports (map dist stack traces to src, classify, reproduce, fix, and write a fix prompt or patch). Use when the user pastes log lines, stack traces, 500 errors, or says something is broken on the server.
allowed-tools: Read, Grep, Glob, Edit, Bash(npx vitest*), Bash(npm test*), Bash(npm run build)
---

# vanilla-prod-triage

## 1. Parse the log

Pino JSON fields: `level` (50 = error, 40 = warn), `time` (epoch ms; convert to local time), `reqId`, `method`, `url`, `statusCode`, `err.message`, `err.code`, `err.stack`, `msg`.

- Group repeated lines by `url` pattern and `err.message`; count them.
- Extract identifiers (database id, user id) but never paste secrets back into reports.

## 2. Map to source

- Stack frames point to `dist/src/server/**/*.js`; open the matching `src/server/**/*.ts` and find the function by name (`StorageService.saveStreamFile` -> `src/server/services/storage.ts`). Line numbers differ after compilation.
- Route handler frames (`Object.<anonymous>` in `api/admin.js`) -> find the route by method and URL in `src/server/api/`.

## 3. Classify

| Signal | Likely class | Next step |
|---|---|---|
| `ERR_SQLITE_ERROR`, errcode 787 | FK violation | `vanilla-storage-debug` / `vanilla-db-migration` |
| errcode 5 or 6 (BUSY, LOCKED) | write contention | review transactions and busy timeout, `vanilla-benchmark` |
| errcode 19 other (UNIQUE, NOT NULL) | input or logic bug | validate before insert, return 409 or 400 |
| 401/403 bursts | auth or scope issue, possible attack | `vanilla-security-audit` |
| ENOSPC, EMFILE | disk or fd exhaustion | audit cleanup and handle closing |
| Zod errors surfacing as 500 | missing error mapping | map to 400 envelope |

Any 500 caused by user input is itself a bug: it must become a 4xx with a clear message.

## 4. Reproduce, fix, prevent

1. Write a failing test that reproduces with the same shape of input (`vanilla-write-tests`).
2. Fix the root cause (validate references, normalize optional values, clean up partial work).
3. Add a troubleshooting entry in `docs/en/11-troubleshooting.md` and `docs/vi/11-troubleshooting.md` when users could hit it.
4. Run `vanilla-verify`.

## 5. Deliverable when the user only asks for a prompt

Produce a ready-to-paste prompt containing: the error, mapped source files, hypotheses to check, required fix behavior, constraints from AGENTS.md (keep FK and WAL, `validateSqlSafety`, Zod, Pino, `.js` imports, no emojis), tests to add, docs to update, and the verification commands.

