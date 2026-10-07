---
name: vanilla-storage-debug
description: Diagnose and fix file storage problems in VanillaDatabase (uploads, streaming, FOREIGN KEY constraint failed, orphan files, size limits). Use when POST /api/admin/databases/:id/files fails, when files exist on disk without metadata, or when storage tests fail.
allowed-tools: Read, Grep, Glob, Edit, Bash(npx vitest*), Bash(npm test*), Bash(npm run build)
---

# vanilla-storage-debug

Relevant code: `src/server/services/storage.ts` (`StorageService.saveStreamFile`), route in `src/server/api/admin.ts`, schema in `src/server/db/metadata.ts`, test `tests/storageForeignKey.test.ts`, docs `docs/*/07-storage-and-streaming.md`.

## Triage a production log

Example error: `FOREIGN KEY constraint failed` (errcode 787) at `saveStreamFile`.

Note: production logs reference `dist/...js` line numbers. Map them back to `src/` TypeScript by reading the function, not by line number.

## Checklist

1. Identify the INSERT inside `saveStreamFile` and list every column that is a foreign key.
2. For each FK value, determine where it comes from (route param, multipart field, JWT user, default). Likely causes:
   - Database id in the URL does not exist in the metadata table (deleted or never registered).
   - Optional folder or bucket id sent as empty string instead of NULL.
   - User id from the token no longer exists, or token belongs to another tenant.
   - Metadata migration not applied on an older deployment.
3. Reproduce in a test: call the storage service (or the route through Fastify `inject`) with a nonexistent reference and with an empty-string optional value.
4. Fix at the root:
   - Validate references before INSERT; return 404 or 400 with the standard envelope instead of 500.
   - Normalize optional ids (`"" -> null`).
   - Write order: stream to a temp file, verify metadata insert succeeds, then rename into place; on any failure delete the temp or final file so no orphan remains.
   - Enforce size limits while streaming (abort and clean up on overflow or client disconnect).
5. Keep `foreign_keys` ON. The constraint is correct; the input handling is the bug.
6. Add regression tests: invalid database, invalid folder, empty-string folder, token user missing, aborted stream leaves no file, duplicate filename policy.

## Orphan audit snippet (read-only, for diagnosis)

- Compare directory listing of the storage root with rows in the file metadata table; report files without rows and rows without files. Do not auto-delete in production without confirmation.

## Docs and release

Update `docs/en/07-storage-and-streaming.md` and `docs/vi/07-storage-and-streaming.md` if behavior or status codes change. Finish with `vanilla-verify`.

