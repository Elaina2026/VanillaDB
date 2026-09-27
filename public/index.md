# VanillaDatabase — High-Performance SQLite Cloud Platform

> Nền tảng SQLite Cloud đa người dùng, mã hóa AES-256-GCM, sao lưu tự động, phân quyền RBAC và API REST realtime tốc độ cao.

## Overview
VanillaDatabase is a developer-first SQLite Cloud platform providing multi-tenant encrypted databases at the edge with microsecond query latency, automated WAL checkpointing, and cluster sharding.

## Key Capabilities
- **Multi-Tenant Isolation**: Spin up isolated, encrypted SQLite instances per tenant or per AI agent in <100ms.
- **Data-at-Rest Encryption**: AES-256-GCM hardware-accelerated encryption on all SQLite data and backup blobs.
- **Write-Ahead Logging (WAL)**: High-concurrency read/write operations without reader-writer locks.
- **Cluster Sharding & Gateway Proxy**: Transparent request routing with automatic spillover and zero-downtime database migration.
- **Granular RBAC**: System roles (`super_admin`, `admin`, `user`) and database roles (`owner`, `admin`, `editor`, `viewer`) with scoped API tokens.
- **TOTP 2FA Replay Defense**: RFC 6238 time-step tracking preventing token replay attacks.
- **Session Revocation (VDB-SEC-01)**: Instant global session invalidation on credential rotation.

## Quickstart TypeScript SDK

```typescript
import { VanillaClient } from '@vanilladb/sdk';

const vdb = new VanillaClient({
  apiKey: process.env.VDB_API_KEY,
});

// Spin up a new encrypted database in <100ms
const db = await vdb.databases.create({
  name: 'tenant-acme-corp',
  encryption: 'aes-256-gcm',
  wal: true,
});

// Execute SQL directly
const result = await db.query({
  sql: 'SELECT id, name, email FROM users WHERE active = ?',
  params: [1],
});

console.log(`Database ready: ${db.id}, rows: ${result.rows.length}`);
```

## REST API Endpoints
- `POST /v1/databases/:id/query` — Execute SQL query with parameter bindings
- `POST /v1/databases/:id/exec` — Execute DDL/DML write statements
- `POST /v1/databases/:id/batch` — Atomic transaction batch execution
- `GET /v1/databases/:id/schema` — Inspect tables, columns, and indexes
- `GET /health` — Service health and SQLite version status

## Official Links
- Website: https://vanilladatabase.elaina2026.io.vn/
- Web App & Console: https://vanilladatabase.elaina2026.io.vn/login
- Sitemaps: https://vanilladatabase.elaina2026.io.vn/sitemap.xml
- LLM Guide: https://vanilladatabase.elaina2026.io.vn/llms.txt
