# Deployment & Production Hardening

This guide explains how to deploy **VanillaDatabase** in production using Systemd, Docker, or Nginx Reverse Proxy.

---

## 1. Production Best Practices Checklist

- [ ] Set `NODE_ENV=production`.
- [ ] Set a secure `VDB_SESSION_SECRET` (at least 32 random characters).
- [ ] Set a persistent `VDB_DATA_DIR` on a fast SSD/NVMe drive.
- [ ] Enable `VDB_TRUST_PROXY=true` when running behind Nginx or Cloudflare.
- [ ] Configure firewall rules to ensure port 3000 is only accessible internally or via the reverse proxy.

---

## 2. Nginx Reverse Proxy Configuration

VanillaDatabase requires reverse proxy buffering to be disabled for **Server-Sent Events (SSE)** and **HTTP 206 Partial Content Range Streaming**:

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

    # Maximum file upload size for database dumps & media
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

        # Disable buffering for SSE Realtime and Range 206 Media Streaming
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

---

## 3. Systemd Service Setup (Linux)

Create `/etc/systemd/system/vanilladb.service`:

```ini
[Unit]
Description=VanillaDatabase Engine
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/vanilladb
ExecStart=/usr/bin/node dist/src/server/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=VDB_DATA_DIR=/var/data/vanilladb

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vanilladb
```
