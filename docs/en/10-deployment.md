# Production Deployment & Operations

Production hardening, Systemd configuration, reverse proxy setup (Nginx / Caddy), Docker Compose, and Cloudflare Origin Rules routing in **VanillaDatabase**.

---

## 1. Production Hardening Checklist

- [ ] Set `NODE_ENV=production` in `.env`.
- [ ] Generate secure 64-character hexadecimal secrets for `VDB_MASTER_KEY` and `VDB_SESSION_SECRET`.
- [ ] Mount `VDB_DATA_DIR` on high-speed SSD or NVMe storage for optimal SQLite WAL throughput.
- [ ] Configure `VDB_TRUST_PROXY=true` when deployed behind a reverse proxy or Cloudflare.
- [ ] Configure host firewall (`ufw`) to restrict direct port access.

---

## 2. Cloudflare Origin Rules & Edge Setup

When deploying VanillaDatabase behind Cloudflare with custom origin ports:

### Architecture Recommendation
Rather than maintaining an external proxy gateway process on the host, configure Cloudflare Edge routing directly:
1. **SSL/TLS Mode**: Select **Flexible** or **Full (Strict)**.
2. **Origin Rule Configuration**:
   - Go to Cloudflare Dashboard -> **Rules** -> **Origin Rules**.
   - Create rule named `vdb-origin-port`.
   - Field: `Hostname` | Operator: `equals` | Value: `vanilladatabase.yourdomain.com`.
   - Destination Port: Select **Rewrite to...** -> Enter your backend listening port (e.g. `25589` or `3000`).
   - Deploy rule. Cloudflare terminates HTTPS on port 443 and proxies directly to your backend application port.

---

## 3. Nginx Reverse Proxy Configuration

VanillaDatabase requires proxy buffering to be disabled for **Server-Sent Events (SSE)** and **HTTP 206 Partial Content Range Streaming**:

```nginx
server {
    listen 80;
    server_name db.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name db.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/db.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/db.yourdomain.com/privkey.pem;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Disable proxy buffering for Realtime SSE & HTTP 206 Streaming
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

---

## 4. Systemd Service Configuration

Run VanillaDatabase as a persistent Linux background service (`/etc/systemd/system/vanilladb.service`):

```ini
[Unit]
Description=VanillaDatabase Server
After=network.target

[Service]
Type=simple
User=vanilladb
WorkingDirectory=/opt/vanilladb
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/server/index.js
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable vanilladb
sudo systemctl start vanilladb
```

---

## 5. Docker Compose Deployment

```yaml
version: '3.8'

services:
  vanilladb:
    build: .
    container_name: vanilladb-engine
    restart: always
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - HOST=0.0.0.0
      - NODE_ENV=production
      - VDB_MASTER_KEY=your_64_character_hex_key
      - VDB_SESSION_SECRET=your_64_character_hex_key
      - VDB_CORS_ORIGINS=https://db.yourdomain.com
    volumes:
      - ./data:/app/data
```
