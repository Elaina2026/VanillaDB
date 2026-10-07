---
name: vanilla-docs-sync
description: Update VanillaDatabase documentation in both English and Vietnamese (docs/en, docs/vi, README, CHANGELOG, llms.md, SDK docs) after a feature, endpoint, config, or behavior change. Use whenever code changes user-visible behavior or when asked to document something.
allowed-tools: Read, Grep, Glob, Edit, Write
---

# vanilla-docs-sync

## Rule

Every user-visible change needs matching updates in `docs/en/` and `docs/vi/`. Both languages must carry the same facts.

## Topic map

| Change area | Pages (same file name in en and vi) |
|---|---|
| Setup, env vars | `01-getting-started.md`, `10-deployment.md` |
| Architecture, data model | `02-architecture.md` |
| Query engine, SQL rules | `03-database-engine.md` |
| Endpoints, payloads, status codes | `04-api-reference.md` |
| Auth, roles, 2FA, WebAuthn | `05-authentication-rbac-2fa.md` |
| Realtime, webhooks | `06-realtime-and-webhooks.md` |
| Files, streaming | `07-storage-and-streaming.md` |
| Backup and restore | `08-backup-and-restore.md` |
| Import and conversion | `09-migration-and-converter.md` |
| Errors and fixes | `11-troubleshooting.md` |
| Dev workflow, scripts | `12-development.md` |

Also check: `README.md` / `README.vi.md`, `SECURITY.md` / `SECURITY.vi.md`, `CHANGELOG.md`, `llms.md`, `llms.txt`, `docs/Home.md`, `sdk/` readme or types, `.env.example` (for new env vars).

## Style

- Professional tone. No Unicode emojis. Use tags `[CORE]`, `[SECURITY]`, `[API]`, `[NOTE]`, `[WARN]` or GitHub callouts (`> [!NOTE]`).
- API docs: method, path, auth/role required, request body (types and constraints), success example in envelope form, error codes table.
- Code identifiers, paths, and JSON stay in English inside the Vietnamese pages; prose is Vietnamese with correct diacritics.
- Examples must match real behavior. Verify against the code or a real request, do not invent fields.

## Procedure

1. List changed behavior from `git diff`.
2. Update English page, then mirror to Vietnamese.
3. Add a CHANGELOG entry (version, category: Added/Changed/Fixed/Security).
4. Grep for stale mentions of renamed items across `docs/`, README, and `llms.*`.
5. If a troubleshooting scenario was solved (for example a FOREIGN KEY upload error), add symptom, cause, and fix to `11-troubleshooting.md` in both languages.

