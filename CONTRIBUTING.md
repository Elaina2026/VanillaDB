# Contributing to VanillaDatabase

Thank you for your interest in contributing to **VanillaDatabase**! We welcome bug fixes, performance optimizations, documentation improvements, and feature contributions.

---

## 1. Development Setup

### Prerequisites
- **Node.js**: `v22.0.0` or higher
- **NPM**: `v10.0.0` or higher
- **Git**

### Getting the Code
```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/<your-username>/VanillaDB.git
cd VanillaDB

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### Running Locally
```bash
# Run server and client in development mode
npm run dev
```

---

## 2. Coding Standards & Conventions

1. **Native over Dependencies**: Prefer Node.js 22 built-ins (`node:sqlite`, `node:crypto`, `node:stream`) over adding heavy external packages.
2. **Strict Validation**: Validate all incoming HTTP payloads using **Zod** schemas in route definitions.
3. **Synchronous SQLite Operations**: Node.js `node:sqlite` uses `DatabaseSync`. Keep SQLite queries synchronous; do not create artificial async wrappers.
4. **Structured Logging**: Use `logger` (Pino) for error and lifecycle events; avoid raw `console.log` in server code.
5. **No Secret Leaks**: Never hardcode default secrets, credentials, or private keys.

---

## 3. Testing Requirements

Before submitting any Pull Request:
```bash
# 1. Ensure all TypeScript types are valid
npm run typecheck

# 2. Run the full automated integration test suite
npm test
```

If you add new endpoints or modify business logic, add corresponding automated tests in `tests/vanilladb.test.ts`.

---

## 4. Submitting a Pull Request

1. Create a feature branch:
   ```bash
   git checkout -b feat/my-new-feature
   ```
2. Commit your changes with conventional commit messages (`feat: ...`, `fix: ...`, `docs: ...`).
3. Push to your fork and open a Pull Request against the `main` branch.
4. Fill out all sections of the [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md).
