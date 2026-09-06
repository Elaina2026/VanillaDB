# Getting Started & Production Setup

This guide provides step-by-step instructions for installing, configuring, and running **VanillaDatabase** in both local development and production environments.

---

## 1. System Requirements

- **Node.js**: `v22.0.0` or higher (mandatory for native `node:sqlite` module support).
- **NPM**: `v10.0.0` or higher.
- **RAM**: Minimum 512MB RAM recommended (VanillaDB baseline footprint is ~35MB–50MB).
- **Disk**: SSD or NVMe storage recommended for optimal SQLite WAL performance.
- **Operating System**: Linux (Ubuntu, Debian, Alpine, RHEL, CentOS), macOS, or Windows (x64 / arm64).

---

## 2. Installation Steps

### Option A: Local & VPS Installation

```bash
# 1. Clone repository
git clone https://github.com/Elaina2026/VanillaDB.git
cd VanillaDatabase

# 2. Install dependencies
npm install

# 3. Create configuration file
cp .env.example .env

# 4. Build frontend client & backend server
npm run build

# 5. Start the production server
npm start
```

By default, the server binds to `0.0.0.0:3000`.

---

## 3. First-Time Setup & Administrator Bootstrap

When accessing `http://localhost:3000` for the first time:
1. The welcome wizard prompts you to create the initial **Super Administrator** account.
2. Enter your desired **Username** (minimum 3 characters) and **Password** (minimum 6 characters).
3. Click **"Initialize Super Admin"** to generate the Argon2id hash and persist credentials in `data/system/vanilladb.sqlite`.

### Automatic Environment Bootstrap (Headless Mode)
For automated CI/CD pipelines and Docker deployments, specify admin credentials directly via environment variables:
```env
VDB_ADMIN_USERNAME=VanillaDatabase
VDB_ADMIN_PASSWORD=SuperSecretPassword123!
```
On boot, if no administrator account exists, VanillaDatabase automatically provisions the account with `super_admin` privileges.

### Emergency CLI Password Reset
If administrator credentials are lost:
```bash
# Reset password via CLI directly against the metadata SQLite database
node dist/src/server/cli.js <username> <new_password>
```

---

## 4. Key Configuration Variables

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | Set to `production` for strict security, error sanitization, and production caching |
| `VDB_PORT` | `3000` | Port listening for HTTP traffic |
| `VDB_HOST` | `0.0.0.0` | Network binding interface |
| `VDB_DATA_DIR` | `./data` | Master storage directory for databases, backups, and media files |
| `VDB_SESSION_SECRET` | *Auto-generated* | 64-char hex string used to sign session cookies |
| `VDB_MASTER_KEY` | *Auto-generated* | Master key for AES-256-GCM data-at-rest encryption |
| `VDB_TRUST_PROXY` | `false` | Enable when running behind reverse proxies (Nginx, Cloudflare) |
| `VDB_SQL_BUSY_TIMEOUT_MS` | `5000` | Max milliseconds to wait on SQLite file locks before returning `SQLITE_BUSY` |
