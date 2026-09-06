# Ví dụ Tích hợp Node.js & TypeScript SDK cho VanillaDatabase

Sử dụng bộ client `@nullex/vanilladb` / `shared/client.ts` trên các ứng dụng Node.js hoặc trình duyệt.

---

## 1. Khởi tạo & Cấu hình Kết nối

```typescript
import { VanillaDatabase } from './shared/client.js';

const db = new VanillaDatabase({
  url: 'http://localhost:3000/v1/databases/db_production',
  token: 'vdb_live_your_token_here'
});
```

---

## 2. Thực thi Câu lệnh SQL Tham số hóa

```typescript
interface UserRecord {
  id: number;
  username: string;
  score: number;
}

// Thực thi truy vấn SQL định kiểu
const result = await db.query<UserRecord>(
  'SELECT id, username, score FROM users WHERE score > ? ORDER BY score DESC LIMIT ?',
  [100, 10]
);

console.log('Các hàng trả về:', result.rows);
console.log('Thời gian thực thi:', result.durationMs, 'ms');
```

---

## 3. Bộ dựng Fluent CRUD trên Bảng

```typescript
// 1. Thêm bản ghi
const insertRes = await db.from('users').insert({
  username: 'elaina',
  score: 300
});

// 2. Đọc danh sách bản ghi
const users = await db.from('users').select({
  limit: 25,
  offset: 0,
  orderBy: 'score',
  order: 'DESC'
});

// 3. Cập nhật bản ghi
await db.from('users').update({
  values: { score: 350 },
  where: { username: 'elaina' }
});

// 4. Xóa bản ghi
await db.from('users').delete({ id: 1 });
```

---

## 4. Giao dịch Batch Nguyên tử

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
], true); // true = tự động bọc trong BEGIN TRANSACTION / COMMIT và ROLLBACK nếu lỗi
```

---

## 5. Đăng ký Kênh Sự kiện Realtime (SSE)

```typescript
const unsubscribe = db.subscribe((event) => {
  console.log(`[Sự kiện ${event.type}] trên bảng: ${event.table}`, event.data);
}, 'users');

// Khi muốn hủy đăng ký:
// unsubscribe();
```
