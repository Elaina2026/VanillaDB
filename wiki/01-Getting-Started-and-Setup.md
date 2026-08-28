# 01. Getting Started & Setup

Step-by-step instructions for deploying and running VanillaDatabase across local, Docker, and VPS production environments.

---

## 1. System Requirements
- **Node.js**: `22.x` or `24.x` (LTS recommended).
- **RAM**: Minimum `512MB RAM` (~35MB–50MB memory footprint).
- **Disk**: Proportional to database files and media storage.
- **OS**: Linux (Ubuntu, Debian, Alpine), macOS, or Windows.

---

## 2. Quickstart with Docker Compose (Recommended)

### Create `docker-compose.yml`
```yaml
services:
  vanilladb:
    image: node:22-alpine
    container_name: vanilladb
    restart: unless-stopped
    working_dir: /app
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - VDB_PORT=3000
      - VDB_HOST=0.0.0.0
      - VDB_DATA_DIR=/app/data
      - VDB_SESSION_SECRET=super_secret_random_key_at_least_32_chars
      - VDB_ADMIN_USERNAME=VanillaDatabase
      - VDB_ADMIN_PASSWORD=change_this_password_123!
    volumes:
      - ./data:/app/data
    command: >
      sh -c "npm install -g vanilladb && vanilladb start"
```

### Launch Container
```bash
docker compose up -d
docker compose logs -f vanilladb
```
Access dashboard at `http://localhost:3000`.

---

## 3. Local Development Setup

```bash
# 1. Clone repo
git clone https://github.com/Elaina2026/VanillaDB.git
cd VanillaDB

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env

# 4. Build frontend & backend
npm run build

# 5. Start server
npm start
```

---

## 4. Nginx Reverse Proxy with SSL (Zero Timeout)

Use this production Nginx configuration to support standard REST APIs, HTTP 206 partial content streaming, and long-lived Realtime SSE connections:

```nginx
server {
    listen 80;
    server_name db.yourdomain.com;

    client_max_body_size 1024M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable buffering for SSE Realtime and Range 206 Streaming
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        proxy_read_timeout 24h;
        proxy_send_timeout 24h;
    }
}
```

Issue free SSL certificate:
```bash
sudo certbot --nginx -d db.yourdomain.com
```

---

## 5. Linux Systemd Background Service

Create `/etc/systemd/system/vanilladb.service`:
```ini
[Unit]
Description=VanillaDatabase Cloud Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/VanillaDB
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vanilladb
```

---

## 6. Admin CLI Reset
Reset or create administrative credentials directly via CLI:
```bash
npm run admin:reset <username> <new_password>
```
