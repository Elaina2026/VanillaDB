---
name: vanilla-db-migration
description: Change the VanillaDatabase metadata schema safely (new table, column, index, foreign key, data backfill) in src/server/db/metadata.ts. Use when a feature needs persistent metadata, when fixing orphaned rows or FOREIGN KEY failures, or when asked to add a migration.
allowed-tools: Read, Grep, Glob, Edit, Bash(npm run *), Bash(npm test*)
---

# vanilla-db-migration

## Principles

- Metadata schema and migrations live in `src/server/db/metadata.ts`. Read the existing migration mechanism first (version tracking, idempotency pattern) and follow it exactly.
- Migrations must be idempotent and safe on existing production data. Production databases were created by older versions.
- Never disable `PRAGMA foreign_keys` and never switch off WAL. If SQLite requires a table rebuild (it cannot alter or drop constraints in place), do the rebuild inside a transaction and run `PRAGMA foreign_key_check` afterward without turning enforcement off permanently.

## Procedure

1. Describe the target schema and the current schema (read both).
2. Write the migration:
   - `CREATE TABLE IF NOT EXISTS` / guarded `ALTER TABLE ADD COLUMN` (check `PRAGMA table_info` first).
   - New columns on existing tables need a safe default or a nullable type.
   - Add indexes for every column used in WHERE or JOIN or as a foreign key.
   - Choose `ON DELETE` behavior deliberately (CASCADE for owned children, SET NULL for optional links, RESTRICT for protected parents) and document the reason in a short comment.
3. Backfill existing rows in the same migration. Normalize empty strings to NULL for optional foreign keys.
4. Repair orphans before adding a stricter constraint: find with `LEFT JOIN ... WHERE parent.id IS NULL`, then delete or repair.
5. Update TypeScript types in `shared/index.ts` and service code that reads or writes the table.
6. Tests:
   - Fresh database: schema is created correctly.
   - Upgrade path: build a database at the previous schema state, insert sample rows, run migration, assert data and constraints (see `tests/storageForeignKey.test.ts` for FK-oriented style).
   - Running migration twice changes nothing.
7. Backup note: migrations that rebuild tables should be mentioned in CHANGELOG.md with a recommendation to back up first.
8. Docs: `docs/en/02-architecture.md` / `docs/vi/02-architecture.md` if the data model changes; also `SCHEMA-REPORT.md` if it documents tables.

## Anti-patterns

- Editing an already released migration in place (add a new one).
- Using string interpolation with external input in DDL.
- Dropping data silently. Log counts of repaired or removed rows through Pino.

Finish with the `vanilla-verify` skill.

