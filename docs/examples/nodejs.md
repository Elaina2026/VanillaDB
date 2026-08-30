# VanillaDatabase Node.js & TypeScript SDK Examples

Using the isomorphic `@nullex/vanilladb` / `shared/client.ts` client in Node.js or browser applications.

---

## 1. Setup & Initialization

```typescript
import { VanillaDatabase } from './shared/client.js';

const db = new VanillaDatabase({
  url: 'http://localhost:3000/v1/databases/db_production',
  token: 'vdb_live_your_token_here'
});
```

---

## 2. Execute Parameterized SQL Queries

```typescript
interface UserRecord {
  id: number;
  username: string;
  score: number;
}

// Typed SQL query execution
const result = await db.query<UserRecord>(
  'SELECT id, username, score FROM users WHERE score > ? ORDER BY score DESC LIMIT ?',
  [100, 10]
);

console.log('Returned rows:', result.rows);
console.log('Execution duration:', result.durationMs, 'ms');
```

---

## 3. Fluent Table CRUD Builder

```typescript
// 1. Insert row
const insertRes = await db.from('users').insert({
  username: 'elaina',
  score: 300
});

// 2. Select rows
const users = await db.from('users').select({
  limit: 25,
  offset: 0,
  orderBy: 'score',
  order: 'DESC'
});

// 3. Update row
await db.from('users').update({
  values: { score: 350 },
  where: { username: 'elaina' }
});

// 4. Delete row
await db.from('users').delete({ id: 1 });
```

---

## 4. Atomic Batch Transactions

```typescript
await db.batch([
  {
    sql: 'UPDATE bank_accounts SET balance = balance - ? WHERE id = ?',
    params: [100, 'acc_1']
  },
  {
    sql: 'UPDATE bank_accounts SET balance = balance + ? WHERE id = ?',
    params: [100, 'acc_2']
  }
], true); // true = wrapped in BEGIN TRANSACTION / COMMIT
```

---

## 5. Realtime SSE Subscriptions

```typescript
const unsubscribe = db.subscribe((event) => {
  console.log(`[Event ${event.type}] on table: ${event.table}`, event.data);
}, 'users');

// Later, disconnect listener:
// unsubscribe();
```
