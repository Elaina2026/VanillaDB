---
name: vanilla-security-audit
description: Perform a security review of VanillaDatabase code or a change set (authn, authz, tenant isolation, secrets, SSRF, uploads, crypto, headers, rate limits). Use when asked to audit, pen-test, review security, or before releasing changes that touch auth, tokens, roles, webhooks, storage, or SQL execution.
allowed-tools: Read, Grep, Glob, Bash(npm run test:security), Bash(npx vitest*), Bash(git diff*), Bash(git log*)
---

# vanilla-security-audit

Read `SECURITY.md` first, then review by area. Report findings; only fix when asked or when trivially safe, and add a regression test for each fix.

## Areas and what to look for

1. **Authentication** (`api/auth.ts`, `services/auth.ts`, `webauthn.ts`, `tokens.ts`)
   - Password hashing uses argon2 with sane parameters; constant-time comparisons; no user enumeration in login or reset responses.
   - Brute-force protection and rate limiting on login, 2FA, token endpoints, and CPU-heavy hashing routes.
   - Session or JWT expiry, rotation, revocation on password change or role change, cookie flags (HttpOnly, Secure, SameSite).
   - WebAuthn: challenge single-use, origin and RP id checked.
2. **Authorization** (`services/roles.ts`, `members.ts`)
   - Every route checks role and resource ownership. Try: developer calling admin routes, user deleting another user's database, admin modifying the platform owner, API token scope exceeding its creator.
   - IDOR: swap database ids, file ids, token ids between tenants.
3. **Tenant isolation** (`DatabaseManager`)
   - No cross-database reads via ATTACH, path traversal in database names or file names, shared prepared statement caches leaking data.
4. **SQL execution** - see `vanilla-sql-safety`.
5. **Storage/uploads** - filename sanitization, path traversal, content-type trust, size limits, zip or archive handling, download headers (`Content-Disposition`, `X-Content-Type-Options`).
6. **Webhooks and realtime** (`webhook.ts`, `realtime.ts`)
   - SSRF: block loopback, link-local (169.254.0.0/16), private ranges, IPv6 equivalents, DNS rebinding (resolve then connect to the validated IP), redirects.
   - Payload signing and replay protection; subscription authorization per database.
7. **Crypto and secrets** (`tests/crypto.test.ts`)
   - Keys loaded from env or protected files, never logged; encrypted-at-rest fields; random IVs/nonces; no hardcoded secrets. Check `.env` is gitignored and not tracked.
8. **Information disclosure**
   - Error responses and Pino logs must not contain stack traces to clients, absolute paths, tokens, or password hashes. Activity log must not store secrets.
9. **HTTP hardening**
   - Helmet headers, strict CORS origin list, body size limits, request timeouts, trust-proxy configuration when behind Nginx or Cloudflare.
10. **Cluster** (`cluster.ts`) - node join authentication, shared secret handling, replay, TLS expectations.
11. **Dependencies** - `npm audit --omit=dev` summary; flag high or critical items.

## Method

- Grep for risky patterns: string-built SQL, `exec`/`spawn`, `path.join` with user input, `fetch` with user URLs, `JSON.parse` without validation, missing Zod on routes.
- Run `npm run test:security` and read the existing security tests to avoid duplicating coverage.

## Report format

Table: ID | Severity (Critical/High/Medium/Low/Info) | Area | Evidence (file and function) | Impact | Fix suggestion | Status.
Use tags `[SECURITY]`, `[WARN]`; no emojis.

