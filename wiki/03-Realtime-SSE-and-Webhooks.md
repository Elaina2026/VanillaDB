# 03. Realtime SSE & Webhooks

Architecture and usage guide for Server-Sent Events (SSE) live streams and HMAC-SHA256 authenticated webhooks.

---

## 1. Realtime SSE Event Stream (`/realtime`)

VanillaDatabase dispatches mutation events across open HTTP Server-Sent Event (SSE) channels.

### Advantages:
- Standard HTTP/1.1 and HTTP/2 transport.
- Zero WebSocket connection drop issues behind Cloudflare/Nginx reverse proxies.
- Built-in automatic reconnection via standard `EventSource` interfaces.

### Endpoint:
```
GET /v1/databases/:databaseId/realtime?table=users&token=vdb_live_xxx
```
- Headers: `Authorization: Bearer <API_TOKEN>` or query param `?token=<API_TOKEN>`.
- Parameter `table` (optional): Filter events for a single table.

### Payload Schema:
```json
{
  "databaseId": "db_production",
  "table": "users",
  "type": "insert",
  "data": {
    "row": { "username": "elaina", "score": 500 },
    "result": { "changes": 1, "lastInsertRowid": 42 }
  },
  "timestamp": 1700000000000
}
```

### Event Types (`type`):
- `insert`: Row created.
- `update`: Row updated.
- `delete`: Row deleted or table truncated.
- `schema`: Table created, renamed, or dropped.
- `ping`: Keep-alive heartbeat dispatched every 20 seconds.

---

## 2. TypeScript SDK Subscription

```typescript
import { VanillaDatabase } from '@nullex/vanilladb';

const db = new VanillaDatabase({
  url: 'https://db.yourdomain.com/v1/databases/db_production',
  token: 'vdb_live_your_token_here'
});

const unsubscribe = db.subscribe((event) => {
  console.log(`[Realtime Event] ${event.type}:`, event.data);
}, 'messages');
```

---

## 3. Python SDK Subscription

```python
from vanilladb import VanillaDatabase

db = VanillaDatabase(
    url="https://db.yourdomain.com/v1/databases/db_production",
    token="vdb_live_your_token_here"
)

def on_event(event):
    print("Live Event:", event["type"], event.get("data"))

db.subscribe(callback=on_event, table="orders")
```

---

## 4. Webhooks (HMAC-SHA256 Event Dispatcher)

Webhooks push JSON payloads over HTTP POST to target URLs on state mutations.

### Security Signature (`X-Vanilla-Signature`):
Headers sent on every dispatch:
- `X-Vanilla-Event`: Event type (`insert`, `update`, `delete`, `schema`).
- `X-Vanilla-Signature`: `sha256=<hex_digest>` computed from payload and secret key.

### Node.js Verification Example:
```javascript
import crypto from 'crypto';

function verifyWebhook(payload, signatureHeader, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expected = `sha256=${hmac.digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
}
```
