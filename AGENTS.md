# VanillaDatabase (VanillaDB) — Agent Operating Guidelines

Guidelines, boundaries, and technical protocols for automated AI coding agents working on the VanillaDatabase repository.

---

## 1. Operating Principles & Safety

1. **Verify Before Modifying**:
   - Inspect related source files before writing edits.
   - Run `npm run typecheck` and `npm test` after any structural change.
2. **Minimal & Clean Diffs**:
   - Do not introduce heavy dependencies when native Node.js stdlib or existing modules suffice.
   - Keep codebase idiom consistent: concise error logging with Pino, strict Zod validation on endpoints, and Fastify plugin structure.
3. **Preserve Database Safety**:
   - Ensure all tenant database operations pass through `DatabaseManager.validateSqlSafety()`.
   - Never disable foreign keys or WAL mode defaults.
4. **Emoji & Formatting Rule**:
   - Do NOT use playful or casual Unicode emojis (such as rockets, fire, locks, or lightbulbs).
   - Use professional semantic tags (`[CORE]`, `[SECURITY]`, `[API]`, `[NOTE]`, `[WARN]`), GitHub Markdown callouts, or clean ASCII glyphs.

---

## 2. Standard Development Lifecycle

### Step 1: Pre-Change Analysis
- Inspect relevant service (`src/server/services/*.ts`) and API controller (`src/server/api/*.ts`).
- Check shared types in `shared/index.ts`.
- Verify database migrations in `src/server/db/metadata.ts`.

### Step 2: Implementation
- Implement changes using TypeScript ES modules (`.js` extension in local import paths).
- Update shared interfaces if data structures change.
- Never bypass `validateSqlSafety()` or allow dynamic SQL concatenation.

### Step 3: Verification
- Execute automated tests:
  ```bash
  npm test
  ```
- Run typecheck and bundle build:
  ```bash
  npm run build
  ```

---

## 3. Pull Request & Commit Checklist

Before finalizing changes or committing:
- [ ] Code passes `npm run build` with zero TypeScript errors.
- [ ] All 94 Vitest tests pass (`npm test`).
- [ ] No sensitive credentials, private keys, or `.env` files are tracked.
- [ ] New features or modified endpoints have corresponding documentation in `docs/en/` and `docs/vi/`.
- [ ] API responses maintain the standard `{ success: true, data: ... }` / `{ success: false, error: ... }` envelope.
- [ ] Zero Unicode emojis in markdown, comments, or terminal outputs.

---

# Hướng dẫn Vận hành Dành cho AI Agent (Tiếng Việt)

Quy chuẩn, ranh giới và giao thức kỹ thuật dành cho các trợ lý AI phát triển mã nguồn trên kho lưu trữ VanillaDatabase.

---

## 1. Nguyên tắc vận hành & An toàn mã nguồn

1. **Kiểm chứng trước khi sửa đổi**:
   - Đọc kỹ mã nguồn liên quan trước khi chỉnh sửa.
   - Chạy `npm run build` và `npm test` sau mọi thay đổi về cấu trúc.
2. **Thay đổi tối thiểu & Tinh gọn**:
   - Không tự ý cài đặt thêm thư viện bên ngoài khi thư viện chuẩn Node.js hoặc thư viện có sẵn đáp ứng được.
   - Giữ văn phong code nhất quán: ghi log ngắn gọn qua Pino, xác thực dữ liệu chặt chẽ qua Zod và cấu trúc plugin Fastify.
3. **Đảm bảo an toàn cơ sở dữ liệu**:
   - Toàn bộ truy vấn SQL của tenant bắt buộc đi qua bộ lọc `DatabaseManager.validateSqlSafety()`.
   - Tuyệt đối không tắt khóa ngoại (Foreign Keys) hay chế độ ghi nhật ký WAL.
4. **Quy tắc định dạng & Emoji**:
   - Không sử dụng các biểu tượng unicode emoji thông thường.
   - Sử dụng các thẻ ngữ cảnh chuyên nghiệp (`[CORE]`, `[SECURITY]`, `[API]`, `[NOTE]`, `[WARN]`), GitHub Markdown callouts hoặc ký tự ASCII.

---

## 2. Quy trình kiểm tra trước khi hoàn thành

- [ ] Mã nguồn biên dịch sạch với `npm run build`.
- [ ] Toàn bộ 94 bài kiểm thử Vitest vượt qua (`npm test`).
- [ ] Không đưa thông tin nhạy cảm (khóa bí mật, token, file `.env`) vào git.
- [ ] Cập nhật tài liệu song ngữ tương ứng tại `docs/en/` và `docs/vi/`.
