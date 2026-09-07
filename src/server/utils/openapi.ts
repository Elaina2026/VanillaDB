// OpenAPI 3.0.3 Specification Generator for VanillaDatabase Data Plane API
export function getOpenApiSpec(baseUrl = 'http://localhost:3000'): Record<string, any> {
  return {
    openapi: '3.0.3',
    info: {
      title: 'VanillaDatabase Data Plane API',
      version: '1.3.2',
      description: 'High-performance, multi-tenant SQLite Cloud engine with WAL concurrency, transactional batches, REST table APIs, range-streaming file storage, and Server-Sent Events (SSE).',
      contact: {
        name: 'VanillaDatabase Support',
        url: 'https://github.com/Elaina2026/VanillaDB',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: baseUrl,
        description: 'Target VanillaDatabase Server Instance',
      },
    ],
    security: [
      {
        BearerAuth: [],
      },
    ],
    paths: {
      '/v1/databases/{databaseId}/query': {
        post: {
          summary: 'Execute Parameterized SQL Query',
          description: 'Executes a single read or write SQL statement against the tenant SQLite database with parameter binding.',
          tags: ['SQL Queries'],
          parameters: [
            {
              name: 'databaseId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Unique identifier of the target database (e.g. db_xatUW_AhALfMJK4_)',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['sql'],
                  properties: {
                    sql: {
                      type: 'string',
                      example: 'SELECT * FROM users WHERE status = ? LIMIT 10;',
                    },
                    params: {
                      type: 'array',
                      items: {},
                      example: ['active'],
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Query executed successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      data: {
                        type: 'object',
                        properties: {
                          rows: { type: 'array', items: { type: 'object' } },
                          columns: { type: 'array', items: { type: 'string' } },
                          changes: { type: 'number', example: 0 },
                          lastInsertRowid: { type: 'number', example: 1 },
                          durationMs: { type: 'number', example: 0.8 },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Bad Request / SQL syntax error / Prohibited statement' },
            '401': { description: 'Unauthorized / Missing or invalid API Token' },
            '403': { description: 'Forbidden / Token lacks database:read or database:write scope' },
            '429': { description: 'Too Many Requests / IP or Token rate limit exceeded' },
          },
        },
      },
      '/v1/databases/{databaseId}/batch': {
        post: {
          summary: 'Execute Atomic Transactional Batch',
          description: 'Executes multiple SQL statements sequentially inside an atomic BEGIN ... COMMIT transaction block. Rolls back completely on failure.',
          tags: ['SQL Queries'],
          parameters: [
            {
              name: 'databaseId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['statements'],
                  properties: {
                    transaction: { type: 'boolean', default: true },
                    statements: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['sql'],
                        properties: {
                          sql: { type: 'string', example: 'INSERT INTO logs (msg) VALUES (?);' },
                          params: { type: 'array', items: {}, example: ['event triggered'] },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'All batch statements executed atomically' },
            '400': { description: 'Batch execution error / Transaction automatically rolled back' },
          },
        },
      },
      '/v1/databases/{databaseId}/tables/{table}/rows': {
        get: {
          summary: 'List & Filter Table Rows',
          description: 'Retrieves rows from the specified table with limit, offset, and ordering parameters.',
          tags: ['REST Table Operations'],
          parameters: [
            { name: 'databaseId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'table', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 500 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
            { name: 'orderBy', in: 'query', schema: { type: 'string' } },
            { name: 'orderDir', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' } },
          ],
          responses: {
            '200': { description: 'Rows retrieved successfully' },
            '404': { description: 'Table not found' },
          },
        },
        post: {
          summary: 'Insert Table Row',
          description: 'Inserts a new record into the specified table.',
          tags: ['REST Table Operations'],
          parameters: [
            { name: 'databaseId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'table', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', example: { name: 'Alice', email: 'alice@example.com' } },
              },
            },
          },
          responses: {
            '201': { description: 'Row created successfully' },
            '400': { description: 'Validation or constraint error' },
          },
        },
        put: {
          summary: 'Update Table Rows',
          description: 'Updates matching rows in the specified table.',
          tags: ['REST Table Operations'],
          parameters: [
            { name: 'databaseId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'table', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['values', 'where'],
                  properties: {
                    values: { type: 'object', example: { score: 100 } },
                    where: { type: 'object', example: { id: 1 } },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Row updated successfully' },
          },
        },
        delete: {
          summary: 'Delete Table Rows',
          description: 'Deletes matching rows from the specified table based on criteria.',
          tags: ['REST Table Operations'],
          parameters: [
            { name: 'databaseId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'table', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['where'],
                  properties: {
                    where: { type: 'object', example: { id: 1 } },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Row deleted successfully' },
          },
        },
      },
      '/v1/databases/{databaseId}/realtime': {
        get: {
          summary: 'Realtime Server-Sent Events (SSE) Stream',
          description: 'Connects to a persistent live event stream broadcasting database mutations (INSERT, UPDATE, DELETE, DDL).',
          tags: ['Realtime Streams'],
          parameters: [
            { name: 'databaseId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'table', in: 'query', schema: { type: 'string' }, description: 'Optional table filter' },
          ],
          responses: {
            '200': {
              description: 'SSE stream connection established',
              content: {
                'text/event-stream': {
                  schema: { type: 'string', example: 'data: {"type":"insert","table":"users","timestamp":1788770000000}\n\n' },
                },
              },
            },
          },
        },
      },
      '/v1/databases/{databaseId}/files': {
        get: {
          summary: 'List Media & Binary Storage Files',
          tags: ['Media & File Storage'],
          parameters: [
            { name: 'databaseId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'List of uploaded files for this database' },
          },
        },
        post: {
          summary: 'Upload Binary Media File',
          tags: ['Media & File Storage'],
          parameters: [
            { name: 'databaseId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    file: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'File uploaded and stored' },
            '413': { description: 'File size exceeds database quota or platform upload cap' },
          },
        },
      },
      '/v1/files/{fileId}/view': {
        get: {
          summary: 'Stream / View Binary Media File (Range HTTP 206 Supported)',
          tags: ['Media & File Storage'],
          parameters: [
            { name: 'fileId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '200': { description: 'Full file stream' },
            '206': { description: 'Partial content range stream' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Token',
          description: 'Enter your VanillaDatabase API Token (starts with vdb_live_)',
        },
      },
    },
  };
}

export function getSwaggerHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VanillaDatabase Data Plane API - Swagger UI</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2'%3E%3Cpath d='M12 2C6.48 2 2 4.02 2 6.5s4.48 4.5 10 4.5 10-2.02 10-4.5S17.52 2 12 2z'/%3E%3Cpath d='M2 12c0 2.48 4.48 4.5 10 4.5s10-2.02 10-4.5'/%3E%3Cpath d='M2 17.5c0 2.48 4.48 4.5 10 4.5s10-2.02 10-4.5'/%3E%3C/svg%3E" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #0f172a;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    .top-navbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 24px;
      background: #1e293b;
      border-bottom: 1px solid #334155;
    }
    .top-navbar .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 15px;
      color: #38bdf8;
    }
    .top-navbar .links {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .top-navbar a {
      color: #94a3b8;
      text-decoration: none;
      font-size: 12px;
      padding: 6px 12px;
      border: 1px solid #475569;
      border-radius: 6px;
      transition: all 0.2s;
    }
    .top-navbar a:hover {
      color: #ffffff;
      background: #334155;
      border-color: #64748b;
    }
    /* Dark Theme overrides for Swagger UI */
    .swagger-ui {
      background: #0f172a !important;
      padding-bottom: 60px;
    }
    .swagger-ui .topbar { display: none !important; }
    .swagger-ui .info .title, .swagger-ui .info p, .swagger-ui .info a {
      color: #f1f5f9 !important;
    }
    .swagger-ui .opblock-tag {
      color: #38bdf8 !important;
      border-bottom: 1px solid #334155 !important;
    }
    .swagger-ui .opblock {
      background: #1e293b !important;
      border-color: #334155 !important;
      border-radius: 8px !important;
    }
    .swagger-ui .opblock-summary-path, .swagger-ui .opblock-summary-description {
      color: #e2e8f0 !important;
    }
    .swagger-ui .tabli button {
      color: #cbd5e1 !important;
    }
    .swagger-ui .scheme-container {
      background: #1e293b !important;
      border-bottom: 1px solid #334155 !important;
      box-shadow: none !important;
    }
    .swagger-ui select, .swagger-ui input[type="text"], .swagger-ui textarea {
      background: #0f172a !important;
      color: #f1f5f9 !important;
      border: 1px solid #475569 !important;
      border-radius: 4px !important;
    }
    .swagger-ui .btn.authorize {
      color: #38bdf8 !important;
      border-color: #38bdf8 !important;
    }
    .swagger-ui .btn.authorize svg {
      fill: #38bdf8 !important;
    }
  </style>
</head>
<body>
  <div class="top-navbar">
    <div class="brand">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2C6.48 2 2 4.02 2 6.5s4.48 4.5 10 4.5 10-2.02 10-4.5S17.52 2 12 2z"/>
        <path d="M2 12c0 2.48 4.48 4.5 10 4.5s10-2.02 10-4.5"/>
        <path d="M2 17.5c0 2.48 4.48 4.5 10 4.5s10-2.02 10-4.5"/>
      </svg>
      <span>VanillaDatabase Data Plane API (OpenAPI 3.0)</span>
    </div>
    <div class="links">
      <a href="/v1/openapi.json" target="_blank">View OpenAPI JSON</a>
      <a href="/#/overview">Back to Dashboard</a>
    </div>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/v1/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;
}
