# Triển khai Thực tế Production & Vận hành Cloudflare

Cẩm nang gia cố môi trường production, thiết lập dịch vụ Systemd, cấu hình reverse proxy (Nginx / Caddy), Docker Compose và định tuyến Origin Rules Cloudflare trong **VanillaDatabase**.

---

## 1. Danh mục Kiểm tra An toàn Production

- [ ] Thiết lập `NODE_ENV=production` trong tệp `.env`.
- [ ] Sinh chuỗi khóa ngẫu nhiên 64 ký tự hex cho `VDB_MASTER_KEY` và `VDB_SESSION_SECRET`.
- [ ] Gắn kết thư mục `VDB_DATA_DIR` trên ổ đĩa SSD hoặc NVMe để đạt hiệu năng WAL cao nhất.
- [ ] Bật `VDB_TRUST_PROXY=true` khi chạy phía sau reverse proxy hoặc mạng Cloudflare.
- [ ] Cấu hình tường lửa máy chủ (`ufw`) để chặn truy cập trực tiếp cổng dịch vụ từ bên ngoài.

---

## 2. Cấu hình Định tuyến Cổng qua Cloudflare Origin Rules

Khi triển khai VanillaDatabase phía sau Cloudflare với các cổng dịch vụ tùy chỉnh:

### Khuyến nghị Kiến trúc
Tránh sử dụng thêm tiến trình gateway trung gian trên máy chủ. Hãy tận dụng bộ định tuyến tại biên của Cloudflare:
1. **Chế độ SSL/TLS**: Chọn **Flexible** hoặc **Full (Strict)**.
2. **Thiết lập Origin Rule**:
   - Vào Cloudflare Dashboard -> **Rules** -> **Origin Rules**.
   - Bấm **Create rule**, đặt tên rule: `vdb-origin-port`.
   - Trường (Field): `Hostname` | Phép toán (Operator): `equals` | Giá trị (Value): `vanilladatabase.tenmien.com`.
   - Mục Destination Port: Chọn **Rewrite to...** -> Điền cổng máy chủ backend thực tế (ví dụ: `25589` hoặc `3000`).
   - Bấm **Deploy**. Cloudflare sẽ nhận kết nối HTTPS cổng 443 và tự động chuyển hướng vào cổng backend.

---

## 3. Cấu hình Nginx Reverse Proxy

VanillaDatabase yêu cầu tắt bộ đệm proxy (buffering) để hỗ trợ luồng **Server-Sent Events (SSE)** và **HTTP 206 Partial Content**:

```nginx
server {
    listen 80;
    server_name db.tenmien.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name db.tenmien.com;

    ssl_certificate /etc/letsencrypt/live/db.tenmien.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/db.tenmien.com/privkey.pem;

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

        # Tắt bộ đệm proxy cho Realtime SSE & HTTP 206 Media Streaming
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

---

## 4. Cấu hình Dịch vụ Linux Systemd

Vận hành VanillaDatabase dưới dạng dịch vụ chạy ngầm trên Linux (`/etc/systemd/system/vanilladb.service`):

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

Kích hoạt và khởi chạy dịch vụ:
```bash
sudo systemctl daemon-reload
sudo systemctl enable vanilladb
sudo systemctl start vanilladb
```

---

## 5. Triển khai với Docker Compose

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
      - VDB_MASTER_KEY=nhap_khoa_hex_64_ky_tu_tai_day
      - VDB_SESSION_SECRET=nhap_khoa_hex_64_ky_tu_tai_day
      - VDB_CORS_ORIGINS=https://db.tenmien.com
    volumes:
      - ./data:/app/data
```
