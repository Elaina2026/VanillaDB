# Realtime Event Streaming (SSE) & Webhooks

VanillaDatabase includes a built-in event bus capable of streaming live database mutations to browser dashboards, SDKs, and external webhook endpoints.

---

## 1. Server-Sent Events (SSE) Stream

### Connection
- **Endpoint**: `GET /v1/databases/:databaseId/realtime`
- **Optional Query**: `?table=users` (filters events specifically for a single table)
- **Authentication**: `Authorization: Bearer vdb_live_...` or query parameter `?token=vdb_live_...` or Admin Session Cookie.

### Protocol
The endpoint streams standard `text/event-stream` messages:
- Periodic heartbeat every 20 seconds (`event: ping`) to keep NAT and reverse proxy connections alive.
- Live mutation events (`insert`, `update`, `delete`, `schema`).

### Event Payload Format
```json
event: insert
data: {
  "databaseId": "db_production_123",
  "table": "users",
  "type": "insert",
  "data": {
    "row": { "id": 15, "username": "elaina", "coins": 500 },
    "result": { "changes": 1, "lastInsertRowid": 15 }
  },
  "timestamp": 1724901234567
}
```

---

## 2. Webhooks Engine

VanillaDatabase can dispatch asynchronous signed HTTP POST requests to external services whenever mutations occur.

### Features
1. **Event Filtering**: Subscribe to all events (`*`) or specific triggers (`insert`, `update`, `delete`, `schema`).
2. **HMAC-SHA256 Signatures**: Each request includes an `X-Vanilla-Signature` header generated with the webhook's unique secret.
3. **Discord & Slack Native Formats**:
   - If the URL matches `discord.com/api/webhooks`, VanillaDatabase automatically formats payload into rich color-coded Discord embeds (`insert` = green, `update` = blue, `delete` = red, `schema` = purple).
   - If the URL matches `hooks.slack.com`, messages are formatted into standard Slack blocks.
4. **Retry & Health Tracking**: Tracks last trigger time and consecutive failure counts. Webhooks with errors can be tested and reset via dashboard.

### Verifying Webhook Signatures (Node.js)

```javascript
import crypto from 'crypto';

function verifyWebhook(payloadRawBody, signatureHeader, webhookSecret) {
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(payloadRawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
}
```
