# Getting Started & Installation Guide

This guide walks you through setting up, configuring, and running **VanillaDatabase** in development and production environments.

---

## 1. System Requirements

- **Node.js**: `v22.0.0` or higher (mandatory for native `node:sqlite`).
- **NPM**: `v10.0.0` or higher.
- **RAM**: Minimum 512MB (VanillaDatabase itself consumes ~35MB–50MB).
- **Disk**: Dependent on database size (100MB+ recommended).

---

## 2. Installation Steps

### Step 1: Clone Repository
```bash
git clone <repository-url>
cd VanillaDatabase
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Review essential variables:
```env
NODE_ENV=production
VDB_HOST=0.0.0.0
VDB_PORT=3000
VDB_DATA_DIR=./data
VDB_SESSION_SECRET=a_very_long_secure_random_key_of_32_characters
```

---

## 3. First-Time Setup & Admin Account

When starting VanillaDatabase for the first time, you have two options to create the primary Super Administrator account:

### Option A: Via Web UI Setup Wizard
1. Build and run the server:
   ```bash
   npm run build
   npm start
   ```
2. Navigate to `http://localhost:3000` in your web browser.
3. The setup wizard (`/setup`) will automatically prompt you to configure the initial Super Admin username and password.

### Option B: Via Environment Variables (Automated Bootstrap)
Set the bootstrap credentials in `.env`:
```env
VDB_ADMIN_USERNAME=VanillaAdmin
VDB_ADMIN_PASSWORD=YourStrongPassword123!
```
When the server starts up, it automatically provisions the user if no admin exists.

### Option C: Via CLI Reset Tool
```bash
npm run admin:reset <username> <new_password>
```

---

## 4. Running the Application

### Development Mode (with Live Reload)
```bash
npm run dev
```
Runs the Fastify backend server on port 3000 (`tsx watch`) and Vite frontend dev server concurrently.

### Production Build & Launch
```bash
npm run build
npm start
```
Compiles frontend assets to `dist/client` and TypeScript server to `dist/src/server`.

---

## 5. Health Check Verification

Test that the service is running and SQLite is loaded:
```bash
curl http://localhost:3000/health
```

**Expected Response**:
```json
{
  "status": "ok",
  "service": "VanillaDatabase",
  "version": "1.3.1",
  "sqlite": "3.46.1",
  "uptime": 12
}
```
