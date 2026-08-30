# VanillaDatabase (VanillaDB) — Agent Instructions & Operating Guidelines

Guidelines and protocols for automated AI coding agents working on the VanillaDatabase repository.

---

## 1. Operating Principles & Safety

1. **Verify Before Modifying**:
   - Always read related source files before editing.
   - Run `npm run typecheck` and `npm test` after any structural change.
2. **Minimal & Clean Diffs**:
   - Do not introduce heavy third-party dependencies when native Node.js stdlib or existing dependencies suffice.
   - Keep codebase idiom consistent: concise error logging with Pino, strict Zod validation on endpoints, and Fastify plugin structure.
3. **Preserve Database Safety**:
   - Ensure all tenant database operations pass through `DatabaseManager.validateSqlSafety()`.
   - Never disable foreign keys or WAL mode defaults.

---

## 2. Standard Development Lifecycle

### Step 1: Pre-Change Analysis
- Inspect relevant service (`src/server/services/*.ts`) and API controller (`src/server/api/*.ts`).
- Check shared types in `shared/index.ts`.

### Step 2: Implementation
- Implement changes using TypeScript ES modules (`.js` extension in local import paths).
- Update shared interfaces if data structures change.

### Step 3: Verification
- Execute tests:
  ```bash
  npm test
  ```
- Run typecheck:
  ```bash
  npm run typecheck
  ```

---

## 3. Pull Request Checklist

Before submitting PRs or finalizing changes:
- [ ] Code passes `npm run typecheck` with zero errors.
- [ ] All Vitest tests pass (`npm test`).
- [ ] No sensitive credentials, private keys, or `.env` files are tracked.
- [ ] Updated endpoints have corresponding documentation in `docs/wiki/` or `README.md`.
- [ ] API responses maintain the standard `{ success: true, data: ... }` / `{ success: false, error: ... }` envelope.
