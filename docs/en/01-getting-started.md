# Getting Started & Setup Guide

Step-by-step instructions for installing, configuring, and operating **VanillaDatabase** across development and production environments.

---

## 1. System Requirements

- **Node.js**: `v22.0.0` or higher.
- **NPM**: `v10.0.0` or higher.
- **Memory**: Minimum 512MB RAM recommended (server baseline footprint is ~35MB to 50MB).
- **Storage**: SSD or NVMe storage recommended for optimal SQLite Write-Ahead Logging (WAL) throughput.
- **Operating System**: Linux (Ubuntu, Debian, Alpine, RHEL), macOS, or Windows (x64 / arm64).

---

## 2. Installation & Quickstart

```bash
# 1. Clone repository
git clone https://github.com/Elaina2026/VanillaDB.git
cd VanillaDB

# 2. Install dependencies
npm install

# 3. Create configuration file
cp .env.example .env

# 4. Build frontend client & server bundles
npm run build

# 5. Start the production server
npm start
```

The server binds to `http://0.0.0.0:3000` by default.

---

## 3. First-Time Setup & Administrator Bootstrap

When accessing `http://localhost:3000` for the first time:
1. The welcome wizard prompts you to create the initial **Super Administrator** account.
2. Enter your chosen **Username** (minimum 3 characters) and **Password** (minimum 6 characters).
3. Confirm creation to generate the Argon2id hash and persist credentials in `data/system/vanilladb.sqlite`.

### Automated Bootstrap (Headless / Docker)
For automated CI/CD pipelines and container deployments, configure admin credentials in `.env`:
```env
VDB_ADMIN_USERNAME=VanillaDatabase
VDB_ADMIN_PASSWORD=SuperSecretPassword123!
```
If no administrator exists, the server provisions this account with `super_admin` role on initial startup.

### Emergency CLI Password Reset
If credentials are lost or locked out:
```bash
npm run admin:reset <username> <new_password>
```

---

## 4. Verification & Health Check

Execute an unauthenticated probe against the health check endpoint:
```bash
curl -i http://localhost:3000/health
```

Expected HTTP response:
```json
{
  "status": "ok",
  "version": "1.3.2",
  "uptime": 12.45
}
```

Check system status and configuration:
```bash
curl -i http://localhost:3000/api/auth/status
```
