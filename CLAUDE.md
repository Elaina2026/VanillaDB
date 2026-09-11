# VanillaDatabase Developer & Agent Guidelines

## Architecture Overview
- **Backend:** Node.js 22+, Fastify 5.2, `better-sqlite3` with Write-Ahead Logging (WAL), AES-256-GCM data-at-rest encryption.
- **Frontend:** React 19, Vite, Tailwind CSS v4, Lucide icons, React Query, bilingual i18n (Tiếng Việt & English).
- **System Roles:** `super_admin`, `admin`, `user`.
- **Database Roles:** `owner`, `admin`, `editor`, `viewer`.

## Critical Security Guardrails
1. **Session Revocation (VDB-SEC-01):**
   - HMAC session cookie payload format: `${userId}:${username}:${role}:${expiresAt}:${tokenVersion}`.
   - Any password change or user account disabling increments `token_version`.
   - Mismatched `tokenVersion` in middleware rejects requests immediately with `401 Unauthorized`.
2. **TOTP 2FA Replay Protection (VDB-SEC-02 - RFC 6238):**
   - Monotonic time-step tracking using `last_totp_step` in `users` table.
   - Replay attempts within the 90-second drift tolerance window are rejected.
3. **SSRF Prevention:**
   - Webhooks reject private RFC 1918, loopback (`127.0.0.0/8`), and cloud metadata (`169.254.169.254`).
4. **SQLite Sandboxing:**
   - Prepared statements required for all metadata queries.
   - Binary extension loading (`load_extension`) and `ATTACH DATABASE` are permanently disabled.

## Formatting Standards
- Do NOT use playful or casual Unicode emojis in documentation, commit messages, or comments.
- Use professional bracketed semantic markers (`[CORE]`, `[SECURITY]`, `[API]`, `[NOTE]`, `[WARN]`) or GitHub Markdown callouts.

## Automatic Memory & Context Retention
- Always persist important architectural decisions, security fixes, and milestone summaries into `.claude/projects/.../memory/session-history-chronology.md` in the background.
- Memory capture is automated via `claude-mem` (hooks capture tool uses, edits, and session summaries into `~/.claude-mem`).
- Never wait for the user to request manual memory saving.

## Development & Test Commands
- Run test suite: `npm test` (94 Vitest tests passing)
- Run production build: `npm run build` (Vite client + TypeScript server)
- Start development server: `npm run dev`
- Run benchmarks: `npm run benchmark`
