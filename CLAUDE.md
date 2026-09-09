# VanillaDatabase Developer Guidelines

## Architecture Overview
- **Backend:** Node.js, Fastify, `better-sqlite3` with WAL mode, AES-256-GCM data-at-rest encryption.
- **Frontend:** React 19, Vite, Tailwind CSS v4, Lucide icons, React Query.
- **RBAC Roles:** `super_admin`, `admin`, `user` (system-wide); `owner`, `admin`, `editor`, `viewer` (per database).

## Security Guardrails
1. **Session Cookies (VDB-SEC-01):**
   - HMAC payload format: `${userId}:${username}:${role}:${expiresAt}:${tokenVersion}`.
   - Any password change or user disabling increments `token_version`.
   - Mismatched `tokenVersion` in middleware rejects with `401 Unauthorized`.
2. **TOTP 2FA Replay Protection (VDB-SEC-02):**
   - Monotonic time-step tracking using `last_totp_step` in `users` table.
   - Replay attempts within the 90-second drift window are rejected (RFC 6238).
3. **SSRF Prevention:**
   - Webhooks reject private RFC 1918, loopback, and cloud metadata (`169.254.169.254`).
4. **SQLite Sandboxing:**
   - Parameterized queries exclusively for metadata. Binary extensions and `ATTACH DATABASE` disabled.

## Development Commands
- Run test suite: `npm test` (Runs Vitest sequentially: 94 tests)
- Run production build: `npm run build` (Vite bundle + TypeScript check)
- Start development server: `npm run dev`
