# Development & Contributing Guide

Guide for developers looking to contribute, run benchmarks, or extend VanillaDatabase.

---

## 1. Development Workflow

### Setup Local Environment
```bash
# Clone the repository
git clone https://github.com/Elaina2026/VanillaDB.git
cd VanillaDatabase

# Install dependencies
npm install

# Start development server with hot module reload
npm run dev
```

---

## 2. Testing & Quality Checks

### Run Automated Tests (Vitest)
```bash
npm test
```
Runs the full integration test suite verifying:
- Authentication & admin setup
- Parameterized SQL execution & safety sandbox
- Scoped token permissions & rate limiting
- Atomic batch transactions with rollback
- Media upload, AES-256-GCM encryption & HTTP 206 range streaming
- Backup creation, restore & checksum verification
- Webhook HMAC-SHA256 event dispatching
- AI Vector math custom functions
- Two-factor authentication (2FA) and backup code recovery

### Run TypeScript Typecheck
```bash
npm run typecheck
```

### Run Performance Benchmarks
```bash
npm run benchmark
```
Runs high-concurrency benchmarks evaluating throughput and latency (p50, p95, p99) for single inserts, parallel reads, and batch transactions.
