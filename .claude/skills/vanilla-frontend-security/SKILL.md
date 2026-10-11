---
name: vanilla-frontend-security
description: Audit the VanillaDatabase React/Vite frontend (src/ client code, public/, index.html) for bugs, XSS and DOM sinks, token and session handling flaws, CSP gaps, open redirects, unsafe dependencies, and zero-day style vulnerability classes. Use when asked to check the frontend, find dangerous bugs, scan for XSS, or review the web UI security.
allowed-tools: Read, Grep, Glob, Bash(rg *), Bash(npm audit*), Bash(npm run typecheck), Bash(npm run build), Bash(npx vitest*)
---

# vanilla-frontend-security

Scope: client code (React 18, Vite, Tailwind, TanStack Query/Table, Monaco editor, WebAuthn browser lib) and the way it talks to the Fastify API. Report first; fix only when asked or when the fix is trivial, and add a regression test.

## Phase 1: automated sweep (dependency-free Node scanner)

The scanner needs no extra tools (works on Windows, Linux, macOS). Run from the repository root:

```bash
node .claude/skills/vanilla-frontend-security/scripts/scan.mjs frontend
node .claude/skills/vanilla-frontend-security/scripts/scan.mjs server
node .claude/skills/vanilla-frontend-security/scripts/scan.mjs all --json
```

Output is sorted by severity. Each hit is a lead, not a finding: open the file, read the surrounding code, and decide whether untrusted data can reach the sink. Delete false positives from the report; do not list raw hits as vulnerabilities.

## Phase 2: manual review checklist

1. **XSS and DOM sinks**
   - Any user-controlled data (database names, table or column names, row values, file names, webhook URLs, activity log text, error messages from the API) rendered as HTML, in `href`/`src` (`javascript:` URLs), in `style`, or into the Monaco editor model without escaping.
   - Table cells and JSON viewers must render values as text. Check CSV/JSON export for formula injection (`=`, `+`, `-`, `@` prefixes) in CSV output.
   - File preview and download: blob URLs, SVG or HTML uploads previewed inline (stored XSS via uploaded file served from the app origin).
2. **Auth and session handling**
   - Where the token or session lives: prefer HttpOnly cookie. If a token is in `localStorage`, any XSS becomes account takeover; flag as High.
   - Logout clears all client state and TanStack Query cache (no data from the previous user visible after switching accounts).
   - 401/403 handling: redirect to login, no infinite retry loops, no leaking of protected data in cached queries.
   - Client-side role checks are only UX. Confirm the server enforces the same rules (see `vanilla-security-audit`).
   - WebAuthn/2FA UI: errors do not reveal whether an account exists.
3. **Navigation and redirects**
   - `?redirect=`, `?next=`, `returnTo` params validated to same-origin relative paths (open redirect).
   - External links use `rel="noopener noreferrer"`.
4. **API client**
   - Base URL not influenced by user input; no credentials sent to third-party origins.
   - Request IDs and error bodies shown to the user do not include stack traces or internal paths.
   - Uploads: client-side size and type checks are convenience only; abort and progress handling do not leak object URLs (revoke them).
5. **Transport and headers (as served by the app)**
   - CSP present and without `unsafe-eval`; note Monaco workers may need `worker-src blob:`; inline script exceptions should use nonces or hashes, not `unsafe-inline`.
   - `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, frame protection (`frame-ancestors`), HSTS behind TLS.
   - Check `vite.config.ts` and `index.html` for third-party scripts or CDNs without SRI, source maps shipped to production (`build.sourcemap`), dev proxy settings leaking into production.
6. **Secrets in the bundle**
   - Build, then grep `dist/` and `public/` for keys, tokens, internal hostnames, `.env` values (`VITE_*` variables are public by design).
7. **Realtime (WebSocket/SSE) client**
   - Authenticates per connection; reconnect loops are bounded; messages are treated as untrusted data (no HTML rendering, no `eval` of payloads).
8. **Bug hunting (non-security)**
   - Stale closures and missing dependency arrays in hooks, unmounted-component state updates, leaked listeners and intervals, uncancelled fetches (race conditions when switching databases fast), missing error and empty states, pagination off-by-one, large table rendering without virtualization, unhandled promise rejections, `key` misuse, timezone and number formatting issues, and accessibility basics (labels, focus traps in modals).
   - Run `npm run typecheck`; look for `any`, non-null assertions (`!`) and `as` casts on API data lacking runtime validation.
9. **Dependencies and supply chain**
   - `npm audit --omit=dev`, then review high and critical entries for reachability (a vulnerable dev tool is not the same as a runtime dependency).
   - Check lockfile integrity, unexpected install scripts, typosquatted names, and overly broad version ranges on security-critical packages (`@simplewebauthn/*`, `argon2`, `@fastify/*`).

## Phase 3: zero-day style analysis (vulnerability classes, not guesses)

"Zero-day" cannot be searched by name, so hunt by class and assume the attacker controls any data that comes from another user or from stored content:

- Stored XSS through any persisted string that is later rendered (names, comments, webhook labels, activity entries).
- Prototype pollution via object merges of API or JSON data (`Object.assign`, deep merge helpers, `JSON.parse` reviver) and unsafe `__proto__`/`constructor` keys in imported data.
- ReDoS in client-side regexes applied to user text (nested quantifiers).
- Client-side path or URL construction from user input (`new URL(userInput, base)`, template strings in `fetch`), enabling request forgery to unintended API routes.
- Clickjacking and UI redress where frame protection is missing.
- CSRF on cookie-authenticated mutations: confirm SameSite, CSRF tokens or custom header requirements.
- Cache and state confusion between tenants in TanStack Query keys (keys missing the database id or user id).
- Race conditions that apply an action to the wrong database after a fast switch.
- Parser differentials in import features (CSV, SQL dump, JSON): oversized input, deeply nested JSON, zip bombs, encoding tricks.
- Dependency advisories newer than the lockfile: check release notes of Monaco, React Router/TanStack, Vite dev server (file read via dev server exposure), and WebAuthn libraries.

For each class, state: attack scenario, affected component, proof of concept (safe, local test data only), impact, fix.

## Phase 4: dynamic confirmation (local only)

- Use a local server with temporary data. Never test against production or third-party hosts.
- For XSS candidates, use inert payloads (`<img src=x onerror=window.__xss=1>`) and assert `window.__xss` stays undefined.
- Write Vitest tests for pure logic (sanitizers, URL validators, key builders). For UI flows, use the existing test setup if any; otherwise describe manual reproduction steps.

## Report format

| ID | Severity | Class (CWE) | Location (file and component) | Evidence | Impact | Fix | Status |
|---|---|---|---|---|---|---|---|

Severity: Critical (account or data takeover without interaction), High (needs a user action or chains with another bug), Medium, Low, Info. Use `[SECURITY]` and `[WARN]` tags, no emojis. End with the residual-risk list and run `vanilla-verify` after any fix.

## Guardrails

- No exploitation of external systems, no destructive payloads, no real credentials in reports.
- Do not weaken CSP, CORS, or auth checks to make a test pass.

