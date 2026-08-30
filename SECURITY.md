# Security Policy

The VanillaDatabase maintainers take security seriously. We appreciate responsible disclosure of vulnerabilities.

---

## 1. Supported Versions

Security patches and updates are actively provided for:

| Version | Supported |
| :--- | :--- |
| `1.x` | ✅ Yes |
| `< 1.0.0` | ❌ No |

---

## 2. Reporting a Vulnerability

If you discover a security vulnerability (such as SQL injection bypass, authentication bypass, path traversal, or remote code execution):

**Please DO NOT open a public GitHub Issue.**

Instead, please report security vulnerabilities via:
1. **GitHub Security Advisory**: Open a private advisory under the [Security tab](https://github.com/Elaina2026/VanillaDB/security/advisories/new).
2. **Email Contact**: Send a detailed report to `ariaasamane@gmail.com` with the subject `[SECURITY] VanillaDatabase Vulnerability Report`.

### Please include in your report:
- Type of vulnerability (e.g. SQL sandbox bypass, path traversal).
- Step-by-step reproduction instructions or proof-of-concept (PoC).
- Potential impact and severity assessment.
- Affected component or source file (e.g., `src/server/db/manager.ts`).

---

## 3. Built-In Security Guardrails

VanillaDatabase incorporates multiple layers of security:
- **Argon2id** password hashing with high memory cost parameters.
- **SHA-256 token hashing** (raw API token secrets are never stored in plaintext).
- **SQL Sandboxing**: `ATTACH DATABASE`, `DETACH DATABASE`, `load_extension()`, and dangerous PRAGMAs are strictly blocked.
- **Path Traversal Guards**: Strict resolution checks prevent directory traversal outside `data/storage` or `data/databases`.
- **AES-256-GCM Encryption**: Backup files and media uploads are encrypted with PBKDF2 derived keys.
