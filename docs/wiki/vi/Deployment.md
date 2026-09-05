# Triển khai & Vận hành Production (Deployment)

Hướng dẫn triển khai **VanillaDatabase** trên môi trường thực tế sử dụng Nginx Reverse Proxy, Systemd hoặc Docker.

---

## 1. Danh sách kiểm tra trước khi chạy Production

- [ ] Thiết lập `NODE_ENV=production`.
- [ ] Thiết lập chuỗi bí mật `VDB_SESSION_SECRET` ngẫu nhiên tối thiểu 32 ký tự.
- [ ] Chọn đường dẫn lưu trữ `VDB_DATA_DIR` trên ổ đĩa SSD/NVMe tốc độ cao.
- [ ] Bật `VDB_TRUST_PROXY=true` nếu đặt máy chủ sau Nginx, Cloudflare hoặc Caddy.
- [ ] Giới hạn cổng 3000 chỉ lắng nghe nội bộ thông qua tường lửa (UFW / iptables).

---

## 2. Cấu hình Nginx Reverse Proxy

VanillaDatabase yêu cầu tắt cơ chế đệm proxy (buffering) để hỗ trợ luồng **Server-Sent Events (SSE)** và **phát luồng HTTP 206 Partial Range**:

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

    # Kích thước tối đa cho upload database & media
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

        # Tắt bộ đệm proxy cho SSE và phát luồng Media HTTP 206
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

---

## 3. Khởi chạy bằng dịch vụ Systemd (Linux)

Tạo tệp cấu hình dịch vụ tại `/etc/systemd/system/vanilladb.service`:
```ini
[Unit]
Description=VanillaDatabase Multi-Tenant Engine
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

Kích hoạt và khởi chạy:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vanilladb
```
