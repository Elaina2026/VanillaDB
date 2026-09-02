import { describe, it, expect } from 'vitest';
import { SqlTranslator } from '../src/server/utils/sqlTranslator.js';

describe('SqlTranslator Multi-Database Converter', () => {
  it('should detect dialects accurately', () => {
    const mysqlSql = 'CREATE TABLE `users` (`id` int(11) AUTO_INCREMENT, `name` varchar(255)) ENGINE=InnoDB;';
    const postgresSql = 'CREATE TABLE "public"."users" ("id" SERIAL, "data" JSONB, "created_at" TIMESTAMPTZ);';
    const jsonStr = '[{"id": 1, "username": "elaina", "score": 250}]';
    const sqliteSql = 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);';

    expect(SqlTranslator.detectDialect(mysqlSql)).toBe('mysql');
    expect(SqlTranslator.detectDialect(postgresSql)).toBe('postgres');
    expect(SqlTranslator.detectDialect(jsonStr)).toBe('json');
    expect(SqlTranslator.detectDialect(sqliteSql)).toBe('sqlite');
  });

  it('should translate MySQL DDL to SQLite compatible DDL', () => {
    const mysqlDump = `
      /*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
      CREATE TABLE \`users\` (
        \`id\` int(11) NOT NULL AUTO_INCREMENT,
        \`username\` varchar(100) NOT NULL,
        \`is_active\` tinyint(1) DEFAULT 1,
        \`balance\` decimal(10,2) DEFAULT 0.00,
        \`created_at\` datetime DEFAULT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`idx_username\` (\`username\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      INSERT INTO \`users\` (\`id\`, \`username\`, \`is_active\`) VALUES (1, 'elaina', 1);
    `;

    const translated = SqlTranslator.translateMySql(mysqlDump);
    expect(translated).not.toContain('ENGINE=InnoDB');
    expect(translated).not.toContain('`users`');
    expect(translated).toContain('"users"');
    expect(translated).toContain('CREATE INDEX IF NOT EXISTS');
    expect(translated).toContain('INSERT INTO "users" ("id", "username", "is_active") VALUES (1, \'elaina\', 1);');
  });

  it('should translate PostgreSQL DDL & COPY block to SQLite DDL and INSERTs', () => {
    const pgDump = `
      CREATE TABLE "public"."orders" (
        "id" SERIAL PRIMARY KEY,
        "customer" character varying(150),
        "payload" jsonb,
        "created_at" timestamp with time zone
      );
      COPY "orders" ("id", "customer", "payload") FROM stdin;
      1\tElaina\t{"item":"wand"}\n
      2\tSaya\t{"item":"book"}\n
      \\.
    `;

    const translated = SqlTranslator.translatePostgres(pgDump);
    expect(translated).not.toContain('public.');
    expect(translated).toContain('INTEGER PRIMARY KEY AUTOINCREMENT');
    expect(translated).toContain('INSERT INTO "orders" ("id", "customer", "payload") VALUES (\'1\', \'Elaina\', \'{"item":"wand"}\');');
  });

  it('should infer schema from JSON array', () => {
    const data = [
      { id: 1, name: 'Alice', age: 25, active: true, balance: 150.50, metadata: { role: 'admin' } },
      { id: 2, name: 'Bob', age: 30, active: false, balance: 200.00, metadata: { role: 'user' } }
    ];

    const { ddl, dml, rowCount } = SqlTranslator.inferSchemaFromJson(data, 'customers');
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS "customers"');
    expect(rowCount).toBe(2);
    expect(dml.length).toBe(2);
    expect(dml[0]).toContain('INSERT INTO "customers"');
  });
});
