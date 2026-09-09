# Development & Contributing Guide

Comprehensive guide for developers contributing to, extending, or benchmarking **VanillaDatabase**.

---

## 1. Development Workflow

### Local Setup
```bash
# Clone the repository
git clone https://github.com/Elaina2026/VanillaDB.git
cd VanillaDB

# Install project dependencies
npm install

# Start development server with live reload
npm run dev
```

The development environment boots Fastify and Vite simultaneously, with client hot-module reloading enabled.

---

## 2. Testing & Quality Verification

### Run Automated Tests (Vitest)
```bash
npm test
```
The test suite executes 94 integration tests verifying:
- Authentication, setup, and admin bootstrap.
- Parameterized SQL execution and query safety sandbox.
- Scoped API tokens, rate limiting, and table allow/denylists.
- Atomic batch transactions and rollback guarantees.
- Encrypted media storage with HTTP 206 Partial Content range streaming.
- Point-in-time backup snapshots, restore, and SHA-256 integrity verification.
- Asynchronous webhook dispatching with HMAC signatures and SSRF blockers.
- Custom AI vector math functions (`vec_cosine_similarity()`, `vec_cosine_distance()`).
- Session revocation on password update (`VDB-SEC-01`).
- Monotonic time-step TOTP replay prevention (`VDB-SEC-02`).

### Run TypeScript Build & Typecheck
```bash
# Verify client and server compilation
npm run build

# Run typecheck only
npm run typecheck
```

### Run Performance Benchmarks
```bash
npm run benchmark
```
Evaluates concurrency, throughput, and latency profiles (p50, p95, p99) for single writes, parallel reads, and batch executions.

---

## 3. Contribution Guidelines & Pull Request Standards

Before submitting a Pull Request:
1. Ensure all 94 Vitest tests pass without regressions.
2. Confirm `npm run build` exits with zero TypeScript errors.
3. Adhere to coding conventions: Fastify route schemas, Zod request validation, and Pino logging.
4. Maintain bilingual documentation across both `docs/en/` and `docs/vi/`.
5. Do NOT include casual Unicode emojis in markdown documentation, commit messages, or terminal logs.
