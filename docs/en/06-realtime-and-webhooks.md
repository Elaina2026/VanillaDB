# Realtime Event Streaming (SSE) & Webhooks

Technical specification for live database mutation streaming via Server-Sent Events (SSE) and asynchronous webhook dispatching in **VanillaDatabase**.

---

## 1. Server-Sent Events (SSE) Live Stream

### Connection Protocol
- **Endpoint**: `GET /v1/databases/:databaseId/realtime`
- **Optional Filter**: `?table=orders` (filters stream for specific table events)
- **Authentication**: Bearer API token or active session cookie
- **Keep-Alive**: Automatic heartbeat ping every 20 seconds (`event: ping`) to prevent intermediate proxy timeout.

### Event Format & Payloads
```http
event: insert
data: {"databaseId":"db_production","table":"orders","type":"insert","data":{"row":{"id":1024,"customer":"Alice","total":89.5},"result":{"changes":1,"lastInsertRowid":1024}},"timestamp":1788854400000}

event: delete
data: {"databaseId":"db_production","table":"sessions","type":"delete","data":{"row":{"id":"sess_old"},"result":{"changes":1}},"timestamp":1788854410000}
```

---

## 2. Webhooks Engine & Event Dispatcher

VanillaDatabase dispatches asynchronous signed HTTP POST requests to configured URLs when database mutations occur.

### Capabilities
1. **Event Filtering**: Subscribe to all events (`*`) or specific triggers (`insert`, `update`, `delete`, `schema`).
2. **HMAC-SHA256 Signatures**: Each request carries an `X-Vanilla-Signature` header computed with the webhook's secret key.
3. **SSRF Network Blocker**:
   - The dispatcher checks target URLs against loopback (`127.0.0.0/8`, `::1`), RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local IPs, and cloud metadata (`169.254.169.254`).
   - Webhook configurations targeting forbidden internal ranges are rejected (`400 Bad Request`).
4. **Third-Party Integrations**:
   - **Discord**: Automatically transforms mutation payloads into structured embeds (`discord.com/api/webhooks`).
   - **Slack**: Formats events into standard Block Kit cards (`hooks.slack.com`).
5. **Fault Tolerance**: Automatic retries on transient network errors, consecutive failure counting, and manual test dispatch.

---

## 3. Signature Verification Implementation

Receiving servers verify webhook authenticity using constant-time HMAC comparison:

### Node.js Implementation
```javascript
import crypto from 'crypto';

export function verifyWebhook(rawBody, secret, signatureHeader) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const expected = hmac.digest('hex');

  if (signatureHeader.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
}
```

### Python Implementation
```python
import hmac
import hashlib

def verify_webhook(raw_body: bytes, secret: str, signature_header: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)
```
