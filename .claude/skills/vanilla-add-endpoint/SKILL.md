---
name: vanilla-add-endpoint
description: Add or modify a REST API endpoint in VanillaDatabase following project conventions (Fastify plugin, Zod validation, response envelope, RBAC, audit log, docs, tests). Use when asked to add a route, change request or response shape, or expose a service function over HTTP.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(npm run *), Bash(npm test*)
---

# vanilla-add-endpoint

## 1. Pre-change analysis (do not skip)

- Route files live in `src/server/api/`: `admin.ts` (management), `auth.ts`, `cluster.ts`, `data.ts` (tenant data and query), `system.ts`.
- Business logic lives in `src/server/services/*.ts`. Routes stay thin; logic goes in a service.
- Shared types: `shared/index.ts` (imported through `#shared/*`).
- Read the nearest similar route first and copy its pattern for auth hook, permission check, and error handling.

## 2. Implementation rules

- TypeScript ES modules; local imports use the `.js` extension.
- Validate every input (params, query, body) with Zod. Reject unknown or malformed input with 400.
- Response envelope is mandatory:
  - success: `{ success: true, data: ... }`
  - failure: `{ success: false, error: "message" }`
- Status codes: 400 invalid input, 401 unauthenticated, 403 forbidden, 404 missing resource, 409 conflict, 413 too large, 429 rate limited. Input-caused failures must never surface as 500.
- Authorization: reuse the existing role/permission helpers. Verify the caller owns or is a member of the target database (tenant isolation). Check both the role and the resource.
- Never concatenate SQL from user input. All tenant SQL goes through `DatabaseManager.validateSqlSafety()`. Use parameter binding for values.
- Referenced resources (database, folder, bucket, user) must be checked for existence before writing, so a foreign key failure becomes a clear 404 or 400.
- Log with Pino, concise, never log secrets, tokens, passwords, or raw file contents.
- Record sensitive actions in the activity log service (`activity.ts`).

## 3. Shared types and SDK

- Update `shared/index.ts` if a data structure changes.
- Check `sdk/` and `llms.md` / `llms.txt` for places that describe the endpoint.

## 4. Tests

- Add a Vitest file or extend an existing one in `tests/` (model: `tests/userManagement.test.ts`, `tests/roles.test.ts`).
- Cover: success, invalid input, unauthenticated, wrong role, other tenant's resource (IDOR), nonexistent reference, duplicate.

## 5. Docs (bilingual, required)

- `docs/en/04-api-reference.md` and `docs/vi/04-api-reference.md` (and the topic page, for example storage or auth).
- Add a CHANGELOG.md entry.

## 6. Finish

Run the `vanilla-verify` skill.

