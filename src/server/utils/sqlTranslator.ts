/**
 * Multi-Database SQL Dialect & Document Converter for VanillaDatabase
 * Translates MySQL, PostgreSQL, and structured JSON/NDJSON into SQLite-compatible DDL & DML.
 */

export interface TranslationResult {
  dialect: 'sqlite' | 'mysql' | 'postgres' | 'json' | 'unknown';
  sql: string;
  inferredTables?: string[];
}

export class SqlTranslator {
  /**
   * Automatically detect the dialect of an SQL string or data payload.
   */
  public static detectDialect(content: string): 'sqlite' | 'mysql' | 'postgres' | 'json' | 'unknown' {
    const trimmed = content.trim();

    if (trimmed.startsWith('[') || (trimmed.startsWith('{') && (trimmed.endsWith('}') || trimmed.includes('\n{')))) {
      return 'json';
    }

    // PostgreSQL patterns
    if (
      /\bCREATE\s+SEQUENCE\b/i.test(trimmed) ||
      /\bOWNER\s+TO\b/i.test(trimmed) ||
      /\bSET\s+search_path\b/i.test(trimmed) ||
      /\bCOPY\s+[^;]+FROM\s+stdin/i.test(trimmed) ||
      /\bSERIAL\b|\bBIGSERIAL\b/i.test(trimmed) ||
      /\bBYTEA\b|\bJSONB\b|\bTIMESTAMPTZ\b/i.test(trimmed)
    ) {
      return 'postgres';
    }

    // MySQL patterns
    if (
      /`[^`]+`/.test(trimmed) ||
      /\bENGINE\s*=\s*[A-Za-z0-9_]+/i.test(trimmed) ||
      /\bAUTO_INCREMENT\b/i.test(trimmed) ||
      /\/\*!\d+[\s\S]*?\*\//.test(trimmed) ||
      /\bDEFAULT\s+CHARSET\b/i.test(trimmed) ||
      /\bUNSIGNED\b/i.test(trimmed) ||
      /\bMEDIUMINT\b|\bLONGTEXT\b|\bMEDIUMTEXT\b|\bDATETIME\b/i.test(trimmed)
    ) {
      return 'mysql';
    }

    // Default to sqlite if standard SQL
    if (/^(CREATE|INSERT|SELECT|DROP|ALTER|PRAGMA|BEGIN|COMMIT)\b/i.test(trimmed)) {
      return 'sqlite';
    }

    return 'unknown';
  }

  /**
   * Translate MySQL Dump / DDL / DML to SQLite compatible SQL.
   */
  public static translateMySql(sql: string): string {
    let out = sql;

    // 1. Remove MySQL conditional comments: /*!40101 ... */
    out = out.replace(/\/\*!\d+[\s\S]*?\*\/;?/g, '');

    // 2. Remove MySQL standard block comments: /* ... */
    out = out.replace(/\/\*[\s\S]*?\*\//g, '');

    // 3. Remove SET statements and transaction locks (e.g. SET @OLD_..., LOCK TABLES, UNLOCK TABLES)
    out = out.replace(/^(SET\s+@|SET\s+FOREIGN_KEY_CHECKS|SET\s+SQL_MODE|SET\s+TIME_ZONE|LOCK\s+TABLES|UNLOCK\s+TABLES)[^;]*;/gim, '');

    // 4. Convert backticks to double quotes: `users` -> "users"
    out = out.replace(/`([^`]+)`/g, '"$1"');

    // 5. Transform AUTO_INCREMENT in column definitions
    out = out.replace(/\b(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT)\s+(?:UNSIGNED\s+)?AUTO_INCREMENT\b/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
    out = out.replace(/\bAUTO_INCREMENT\b/gi, 'AUTOINCREMENT');

    // 6. Map MySQL Data Types to SQLite Affinity (Using strict word boundary or exact type name)
    out = out.replace(/\b(TINYINT|SMALLINT|MEDIUMINT|BIGINT|INT)\b(?:\s*\(\d+\))?(?:\s+UNSIGNED)?/gi, 'INTEGER');
    out = out.replace(/\b(VARCHAR|CHAR|NVARCHAR|VARCHAR2)\b(?:\s*\(\d+\))?/gi, 'TEXT');
    out = out.replace(/\b(TINYTEXT|MEDIUMTEXT|LONGTEXT|TEXT|JSON|ENUM\([^)]+\)|SET\([^)]+\))\b/gi, 'TEXT');
    out = out.replace(/\b(DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL)\b(?:\s*\(\d+(?:,\s*\d+)?\))?/gi, 'REAL');
    out = out.replace(/\b(DATETIME|TIMESTAMP|DATE|TIME|YEAR)\b(?:\s*\(\d+\))?/gi, 'TEXT');
    out = out.replace(/\b(TINYBLOB|MEDIUMBLOB|LONGBLOB|VARBINARY|BINARY|BLOB)\b/gi, 'BLOB');
    out = out.replace(/\b(BOOLEAN|BOOL)\b/gi, 'INTEGER');

    // 7. Remove MySQL Table Options (ENGINE=InnoDB, DEFAULT CHARSET=utf8mb4, COLLATE=..., AUTO_INCREMENT=123)
    out = out.replace(/\)\s*(?:ENGINE\s*=\s*[A-Za-z0-9_]+|DEFAULT\s+CHARSET\s*=\s*[A-Za-z0-9_]+|COLLATE\s*=\s*[A-Za-z0-9_]+|AUTO_INCREMENT\s*=\s*\d+|ROW_FORMAT\s*=\s*[A-Za-z0-9_]+|\s)+;/gi, ');');

    // 8. Convert inline KEY / INDEX definitions inside CREATE TABLE to standalone CREATE INDEX statements
    const standaloneIndexes: string[] = [];
    out = out.replace(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[A-Za-z0-9_]+"?)\s*\(([\s\S]*?)\);/gi, (match, tableName, tableBody) => {
      const cleanTableName = tableName.replace(/"/g, '');
      const lines = tableBody.split(',\n');
      const filteredLines: string[] = [];

      for (let line of lines) {
        const trimmedLine = line.trim();
        // Check for inline KEY / INDEX (not PRIMARY KEY or FOREIGN KEY)
        const keyMatch = trimmedLine.match(/^(?:UNIQUE\s+)?(?:KEY|INDEX)\s+("?[A-Za-z0-9_]+"?)\s*\(([^)]+)\)/i);
        const isUnique = /^UNIQUE\s+(?:KEY|INDEX)/i.test(trimmedLine);

        if (keyMatch && !/^PRIMARY\s+KEY/i.test(trimmedLine) && !/^FOREIGN\s+KEY/i.test(trimmedLine)) {
          const indexName = keyMatch[1].replace(/"/g, '');
          const indexCols = keyMatch[2];
          standaloneIndexes.push(`CREATE ${isUnique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS "idx_${cleanTableName}_${indexName}" ON "${cleanTableName}" (${indexCols});`);
        } else {
          filteredLines.push(line);
        }
      }

      // Reconstruct CREATE TABLE without trailing comma bugs
      let newBody = filteredLines.join(',\n').trim();
      newBody = newBody.replace(/,\s*$/, '');
      return `CREATE TABLE IF NOT EXISTS "${cleanTableName}" (\n${newBody}\n);`;
    });

    if (standaloneIndexes.length > 0) {
      out += '\n\n' + standaloneIndexes.join('\n');
    }

    return out.trim();
  }

  /**
   * Translate PostgreSQL Dump / DDL / DML to SQLite compatible SQL.
   */
  public static translatePostgres(sql: string): string {
    let out = sql;

    // 1. Remove Postgres comments and administrative statements
    out = out.replace(/^(SET\s+[^;]+|SELECT\s+pg_catalog\.[^;]+|ALTER\s+TABLE\s+[^;]+OWNER\s+TO\s+[^;]+|COMMENT\s+ON\s+[^;]+);?/gim, '');
    out = out.replace(/^(CREATE\s+SEQUENCE|ALTER\s+SEQUENCE|SELECT\s+setval)[^;]*;/gim, '');

    // 2. Remove schema prefixes: "public"."users" -> "users", public.users -> users
    out = out.replace(/"?public"?\."?([A-Za-z0-9_]+)"?/gi, '"$1"');

    // 3. Transform SERIAL types
    out = out.replace(/\b(BIGSERIAL|SERIAL|SMALLSERIAL)\b(?:\s+PRIMARY\s+KEY)?/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');

    // 4. Map Postgres Data Types to SQLite
    out = out.replace(/\b(CHARACTER\s+VARYING|VARCHAR|CHAR|CHARACTER)\b(?:\s*\(\d+\))?/gi, 'TEXT');
    out = out.replace(/\b(JSONB|JSON|UUID|CITEXT|XML|TEXT)\b/gi, 'TEXT');
    out = out.replace(/\b(INT2|INT4|INT8|SMALLINT|BIGINT|INT|INTEGER)\b/gi, 'INTEGER');
    out = out.replace(/\b(FLOAT4|FLOAT8|DOUBLE\s+PRECISION|NUMERIC|DECIMAL|REAL)\b(?:\s*\(\d+(?:,\s*\d+)?\))?/gi, 'REAL');
    out = out.replace(/\b(TIMESTAMPTZ|TIMESTAMP\s+WITH\s+TIME\s+ZONE|TIMESTAMP\s+WITHOUT\s+TIME\s+ZONE|TIMESTAMP|DATE|TIME|INTERVAL)\b/gi, 'TEXT');
    out = out.replace(/\b(BYTEA|BLOB)\b/gi, 'BLOB');
    out = out.replace(/\b(BOOLEAN|BOOL)\b/gi, 'INTEGER');

    // 5. Convert PostgreSQL COPY blocks to standard INSERT statements
    // Matches: COPY "orders" ("id", "customer", "payload") FROM stdin; ... \.
    out = out.replace(/COPY\s+("?[A-Za-z0-9_]+"?)\s*\(([^)]+)\)\s+FROM\s+stdin;([\s\S]*?)(?:\r?\n\s*\\\.)/gi, (match, tableName, colList, dataBlock) => {
      const cleanTable = tableName.replace(/"/g, '');
      const cols = colList.split(',').map((c: string) => `"${c.trim().replace(/"/g, '')}"`).join(', ');
      const rows = dataBlock.trim().split(/\r?\n/).filter((l: string) => l.trim().length > 0 && l.trim() !== '\\.');

      const insertStatements: string[] = [];
      for (const row of rows) {
        const values = row.split('\t').map((val: string) => {
          const cleanVal = val.trim();
          if (cleanVal === '\\N' || cleanVal === '') return 'NULL';
          return `'${cleanVal.replace(/'/g, "''")}'`;
        });
        insertStatements.push(`INSERT INTO "${cleanTable}" (${cols}) VALUES (${values.join(', ')});`);
      }
      return insertStatements.join('\n');
    });

    return out.trim();
  }

  /**
   * Infer schema from JSON array / NDJSON (Mongo export) and generate CREATE TABLE + INSERT INTO.
   */
  public static inferSchemaFromJson(jsonData: any[], tableName = 'imported_data'): { ddl: string; dml: string[]; rowCount: number } {
    if (!Array.isArray(jsonData) || jsonData.length === 0) {
      throw new Error('Invalid JSON payload: expected a non-empty array of objects');
    }

    const cleanTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    const columnTypeMap: Map<string, string> = new Map();

    // Sample up to first 500 rows to infer column types
    const sampleSize = Math.min(jsonData.length, 500);
    for (let i = 0; i < sampleSize; i++) {
      const row = jsonData[i];
      if (row && typeof row === 'object' && !Array.isArray(row)) {
        for (const [key, val] of Object.entries(row)) {
          const cleanCol = key.replace(/[^a-zA-Z0-9_]/g, '_');
          if (!columnTypeMap.has(cleanCol)) {
            columnTypeMap.set(cleanCol, 'TEXT');
          }

          if (val === null || val === undefined) continue;

          if (typeof val === 'number') {
            const current = columnTypeMap.get(cleanCol);
            if (Number.isInteger(val) && current !== 'REAL' && current !== 'TEXT') {
              columnTypeMap.set(cleanCol, 'INTEGER');
            } else {
              columnTypeMap.set(cleanCol, 'REAL');
            }
          } else if (typeof val === 'boolean') {
            if (columnTypeMap.get(cleanCol) !== 'TEXT') {
              columnTypeMap.set(cleanCol, 'INTEGER');
            }
          } else if (typeof val === 'object') {
            columnTypeMap.set(cleanCol, 'TEXT'); // Stored as JSON string
          } else {
            columnTypeMap.set(cleanCol, 'TEXT');
          }
        }
      }
    }

    const colsDef = Array.from(columnTypeMap.entries()).map(([col, type]) => `"${col}" ${type}`);
    const ddl = `CREATE TABLE IF NOT EXISTS "${cleanTableName}" (\n  "id" INTEGER PRIMARY KEY AUTOINCREMENT,\n  ${colsDef.join(',\n  ')}\n);`;

    const dml: string[] = [];
    const cols = Array.from(columnTypeMap.keys());
    const colsEscaped = cols.map(c => `"${c}"`).join(', ');

    for (const row of jsonData) {
      if (!row || typeof row !== 'object') continue;
      const values = cols.map(c => {
        const v = row[c] ?? row[Object.keys(row).find(k => k.replace(/[^a-zA-Z0-9_]/g, '_') === c) || ''];
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'number') return String(v);
        if (typeof v === 'boolean') return v ? '1' : '0';
        if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
        return `'${String(v).replace(/'/g, "''")}'`;
      });

      dml.push(`INSERT INTO "${cleanTableName}" (${colsEscaped}) VALUES (${values.join(', ')});`);
    }

    return { ddl, dml, rowCount: dml.length };
  }

  /**
   * Parse NDJSON (Newline Delimited JSON) into JSON array.
   */
  public static parseNdjson(content: string): any[] {
    const lines = content.split('\n');
    const items: any[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        items.push(JSON.parse(trimmed));
      } catch {
        // Skip unparseable lines
      }
    }
    return items;
  }
}
