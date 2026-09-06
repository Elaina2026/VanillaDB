# Triển khai & Vận hành Môi trường Production

Tài liệu này hướng dẫn cách triển khai **VanillaDatabase** trên môi trường sản xuất (production) sử dụng Systemd, Docker hoặc Nginx Reverse Proxy.

---

## 1. Danh mục Kiểm tra Bảo mật Trước khi Triển khai

- [ ] Thiết lập `NODE_ENV=production`.
- [ ] Cấu hình biến `VDB_SESSION_SECRET` an toàn (chuỗi ngẫu nhiên tối thiểu 32 ký tự).
- [ ] Chỉ định thư mục `VDB_DATA_DIR` cố định trên ổ đĩa SSD/NVMe tốc độ cao.
- [ ] Kích hoạt `VDB_TRUST_PROXY=true` khi chạy phía sau Nginx hoặc Cloudflare.
- [ ] Cấu hình tường lửa để cổng 3000 chỉ có thể truy cập nội bộ hoặc qua Reverse Proxy.

---

## 2. Cấu hình Nginx Reverse Proxy

VanillaDatabase yêu cầu tắt cơ chế đệm proxy (buffering) để hỗ trợ luồng thời gian thực **Server-Sent Events (SSE)** và phát luồng media **HTTP 206 Partial Content Range Streaming**:

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

    # Kích thước tệp tải lên tối đa cho các bản sao lưu database và file media
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

        # Tắt bộ đệm proxy cho SSE Realtime và Range 206 Media Streaming
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

---

## 3. Cấu hình Dịch vụ Systemd (Linux)

Tạo tệp cấu hình `/etc/systemd/system/vanilladb.service`:

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

Kích hoạt và khởi chạy dịch vụ:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vanilladb
```
