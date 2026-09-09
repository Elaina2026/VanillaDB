# <img src="https://api.iconify.design/lucide:shield-check.svg?color=%2310b981" width="28" height="28" /> VanillaDatabase Security Policy

<p align="center">
  <strong>[ English (Current) ]</strong> &bull;
  <strong>[ <a href="SECURITY.vi.md">Phiên bản Tiếng Việt</a> ]</strong> &bull;
  <strong>[ <a href="README.md">Main README</a> ]</strong> &bull;
  <strong>[ <a href="docs/README.md">Documentation Suite</a> ]</strong>
</p>

---

## 1. Overview & Security Philosophy

VanillaDatabase is engineered as an enterprise-grade multi-tenant SQLite cloud platform. Because tenant databases execute against isolated SQLite instances on disk, maintaining strict boundary isolation, cryptographic confidentiality, and defensive sandboxing is paramount.

The core maintainers follow the principle of **Defense-in-Depth**, enforcing zero-trust verification across every layer of the software stack: network perimeter, session management, database engine sandboxing, and data-at-rest encryption.

---

## 2. Supported Versions

Security updates, vulnerability patches, and backports are provided for active versions:

| Version | <img src="https://api.iconify.design/lucide:layers.svg?color=%230969da" width="16" height="16" /> Release Branch | <img src="https://api.iconify.design/lucide:check-circle.svg?color=%2310b981" width="16" height="16" /> Support Status |
| :--- | :--- | :--- |
| `1.3.x` | `main` | **Active Support (Full Patches & Backports)** |
| `1.x` | `release/1.x` | **Security Maintenance Only** |
| `< 1.0.0` | None | **End of Life (Unsupported)** |

---

## 3. Reporting a Vulnerability

If you identify a security vulnerability (such as an authentication bypass, SQL sandbox escape, cross-tenant IDOR, path traversal, or remote code execution):

> **IMPORTANT:** Please DO NOT open a public GitHub Issue or submit public pull requests disclosing unpatched security vulnerabilities.

### Reporting Channels

1. **GitHub Private Security Advisory (Recommended):**  
   Open a private advisory via the [GitHub Security tab](https://github.com/Elaina2026/VanillaDB/security/advisories/new).
2. **Direct Security Contact:**  
   Send an encrypted or detailed vulnerability report to `ariaasamane@gmail.com` with the email subject:  
   `[SECURITY] VanillaDatabase Vulnerability Disclosure - <Component>`

### What to Include in Your Report

To help triage and address reports promptly, please provide:
- **Type of Issue:** Vulnerability classification (e.g., SSRF bypass, SQLite engine breakout, Session token leakage).
- **Affected Component:** Exact file paths or API endpoints (e.g., `src/server/db/manager.ts`, `POST /v1/databases/:id/query`).
- **Proof of Concept (PoC):** Step-by-step reproduction instructions, cURL requests, or exploit scripts.
- **Impact Assessment:** Plausible attack scenarios, privilege escalation, or data compromise vectors.
- **Remediation Proposal:** Recommended mitigations or patch suggestions if available.

### Coordinated Disclosure & Response SLA

| Milestone | Target SLA | Description |
| :--- | :--- | :--- |
| **Initial Acknowledgment** | `< 24 hours` | Maintainer reviews report and confirms receipt. |
| **Triage & Reproducibility** | `< 48 hours` | Vulnerability reproduction and severity classification. |
| **Patch Development** | `< 72 hours` | Private branch remediation and unit/penetration testing. |
| **Public Release & Advisory** | `7 to 14 days` | Release of security patch tag and CVE / GitHub Security Advisory. |

---

## 4. Built-In Defense-in-Depth Architecture

```
                                 [ Network Ingress ]
                                          |
                +-------------------------v-------------------------+
                |   Perimeter Security: Helmet CSP, CORS, Rate Limit|
                +-------------------------+-------------------------+
                                          |
                +-------------------------v-------------------------+
                |   Identity Layer: Argon2id, HMAC Cookie, RFC 6238 |
                +-------------------------+-------------------------+
                                          |
                +-------------------------v-------------------------+
                |   API Token Scopes & RBAC Permissions Check       |
                +-------------------------+-------------------------+
                                          |
         +--------------------------------+--------------------------------+
         |                                |                                |
         v                                v                                v
+-----------------+              +-----------------+              +-----------------+
| SQLite Sandbox  |              | SSRF Firewall   |              | Storage Engine  |
| - Block ATTACH  |              | - Block RFC1918 |              | - AES-256-GCM   |
| - Block Modules |              | - Block Loopback|              | - PBKDF2 Salt   |
| - Prepared Stmts|              | - Block Cloud IP|              | - Byte-Range 206|
+-----------------+              +-----------------+              +-----------------+
```

### <img src="https://api.iconify.design/lucide:key.svg?color=%230969da" width="20" height="20" /> 1. Identity & Session Security

- **Argon2id Password Hashing:** User passwords are encrypted with high memory and iteration cost parameters, rendering offline brute-force attacks infeasible.
- **Instant Session Revocation (VDB-SEC-01):**
  - Session cookie payloads incorporate a monotonic `token_version`:  
    `${userId}:${username}:${role}:${expiresAt}:${tokenVersion}` signed with HMAC-SHA256.
  - Updating a password or disabling an account increments `token_version` in the database, instantly invalidating all active sessions across all devices.
- **TOTP Replay Protection (VDB-SEC-02 - RFC 6238):**
  - The system tracks the last accepted step in `last_totp_step`.
  - A 6-digit one-time password cannot be replayed or reused within the 90-second drift tolerance window.
- **Token Secret Storage:** API tokens (`vdb_live_*`, `vdb_test_*`) are hashed via SHA-256. Raw secrets are never stored in plaintext within system metadata.

### <img src="https://api.iconify.design/lucide:database.svg?color=%23003b57" width="20" height="20" /> 2. SQLite Engine Sandboxing & Isolation

- **Filesystem Partitioning:** Each tenant database operates as an isolated physical SQLite file under `data/databases/:id.sqlite`. System metadata is kept strictly separated under `data/system/vanilladb.sqlite`.
- **Prepared Statements Mandatory:** SQL statement execution requires parameterized bindings (`?`), eliminating SQL injection vulnerabilities.
- **Disabled Dangerous Features:**
  - `ATTACH DATABASE` and `DETACH DATABASE` are strictly rejected by the query parser to prevent cross-database access.
  - Extension loading (`sqlite3_load_extension`) is permanently disabled at the native C++ level.
  - Administrative PRAGMAs (such as `journal_mode = OFF` or `schema_version`) are blocked.

### <img src="https://api.iconify.design/lucide:server.svg?color=%236366f1" width="20" height="20" /> 3. Network & Perimeter Defenses

- **SSRF Network Blocker:** Outbound webhooks inspect destination IP addresses before dispatching HTTP requests:
  - Private networks (RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) are blocked.
  - Loopback (`127.0.0.0/8`, `::1`) is blocked.
  - Link-local and cloud metadata endpoints (`169.254.169.254`) are rejected immediately.
- **Helmet Security Headers & Strict CSP:** Modern HTTP headers (`Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and fine-grained `Content-Security-Policy`) mitigate XSS and clickjacking attacks.
- **Rate Limiting:** IP-based and token-based rate limiters protect the API and authentication endpoints from brute-force credential stuffing and DoS attacks.

### <img src="https://api.iconify.design/lucide:lock.svg?color=%238b5cf6" width="20" height="20" /> 4. Cryptographic Storage & Media Security

- **AES-256-GCM Envelope Encryption:** Backup archives and sensitive files are encrypted using PBKDF2-derived keys and AES-256-GCM authenticated cipher blocks.
- **Authenticated Headers:** Encrypted blobs use the `VENC` magic byte header, a 16-byte random salt, a 12-byte IV, and a 128-bit authentication tag.
- **HTTP 206 Partial Content Streaming:** Media files are streamed over byte-range requests without buffering decrypted files in public directories, preventing path-traversal leaks.

### <img src="https://api.iconify.design/lucide:terminal.svg?color=%23ea580c" width="20" height="20" /> 5. Granular RBAC & Token Scoping

- **System Roles:** `super_admin` (system configuration), `admin` (management), `user` (tenant owner).
- **Database Roles:** `owner`, `admin`, `editor`, `viewer`.
- **API Token Scopes:**
  - `database:read` (SELECT queries, export)
  - `database:write` (INSERT, UPDATE, DELETE)
  - `database:ddl` (CREATE TABLE, ALTER TABLE)
  - `database:admin` (Backups, vacuum, maintenance)
- **Table-Level ACL:** Tokens can be restricted to explicit table allowlists or denylists.

---

## 5. Vulnerability Disclosure Hall of Fame

We recognize and thank security researchers who practice responsible disclosure. Verified reporters will be credited in our release notes and Security Hall of Fame (unless anonymity is requested).
