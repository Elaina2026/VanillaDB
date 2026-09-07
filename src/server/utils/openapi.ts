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
<html lang="vi" class="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VanillaDatabase Data Plane API - Developer Documentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512' fill='none'%3E%3Cpath d='M256 32C141.1 32 48 67.8 48 112v288c0 44.2 93.1 80 208 80s208-35.8 208-80V112c0-44.2-93.1-80-208-80z' fill='%230284c7'/%3E%3Cpath d='M256 32c114.9 0 208 35.8 208 80s-93.1 80-208 80-208-35.8-208-80 93.1-80 208-80z' fill='%2338bdf8'/%3E%3C/svg%3E" />
  <style>
    :root {
      --background: #030712;
      --card: #0b0f19;
      --card-hover: #0e1526;
      --border: #1e293b;
      --foreground: #f8fafc;
      --muted: #94a3b8;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background-color: var(--background);
      color: var(--foreground);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }

    /* Top Navigation matching VanillaDatabase Dashboard */
    .vdb-navbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 24px;
      background: #0b0f19;
      border-bottom: 1px solid #1e293b;
      position: sticky;
      top: 0;
      z-index: 1000;
      backdrop-filter: blur(8px);
    }
    .vdb-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .vdb-logo {
      width: 28px;
      height: 28px;
    }
    .vdb-brand-text {
      display: flex;
      flex-direction: column;
    }
    .vdb-title {
      font-size: 14px;
      font-weight: 700;
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 8px;
      letter-spacing: -0.01em;
    }
    .vdb-badge-cyan {
      font-size: 10px;
      font-weight: 600;
      background: rgba(56, 189, 248, 0.1);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 9999px;
      padding: 1px 8px;
    }
    .vdb-badge-green {
      font-size: 10px;
      font-weight: 600;
      background: rgba(16, 185, 129, 0.1);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.25);
      border-radius: 9999px;
      padding: 1px 8px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .vdb-badge-green::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10b981;
    }
    .vdb-subtitle {
      font-size: 11px;
      color: #94a3b8;
    }
    .vdb-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .vdb-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 500;
      color: #cbd5e1;
      background: #0f172a;
      border: 1px solid #1e293b;
      padding: 6px 14px;
      border-radius: 6px;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.15s ease-in-out;
    }
    .vdb-btn:hover {
      color: #ffffff;
      background: #1e293b;
      border-color: #334155;
    }
    .vdb-btn-primary {
      background: #2563eb;
      color: #ffffff;
      border-color: #1d4ed8;
      font-weight: 600;
    }
    .vdb-btn-primary:hover {
      background: #1d4ed8;
      border-color: #1e40af;
    }
    .vdb-tab-btn {
      font-size: 11px;
      font-weight: 600;
      padding: 5px 12px;
      border-radius: 6px;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s;
    }
    .vdb-tab-btn.active {
      background: #1e293b;
      color: #38bdf8;
      border-color: #334155;
    }
    .vdb-tab-btn:not(.active) {
      background: transparent;
      color: #94a3b8;
    }
    .vdb-tab-btn:not(.active):hover {
      color: #f8fafc;
    }

    /* Container */
    .docs-container {
      max-width: 1380px;
      margin: 0 auto;
      padding: 20px 24px 60px 24px;
    }

    /* ========================================================
       SWAGGER UI DEEP THEME OVERRIDES (100% VanillaDB Aesthetic)
       ======================================================== */
    .swagger-ui {
      background: var(--background) !important;
      color: var(--foreground) !important;
    }
    .swagger-ui .topbar { display: none !important; }
    .swagger-ui .wrapper {
      padding: 0 !important;
      max-width: 100% !important;
    }

    /* Info header */
    .swagger-ui .info {
      margin: 20px 0 28px 0 !important;
    }
    .swagger-ui .info .title {
      color: #f8fafc !important;
      font-size: 26px !important;
      font-weight: 800 !important;
      letter-spacing: -0.02em !important;
    }
    .swagger-ui .info p, .swagger-ui .info li, .swagger-ui .info table {
      color: #94a3b8 !important;
      font-size: 13px !important;
      line-height: 1.6 !important;
    }
    .swagger-ui .info a {
      color: #60a5fa !important;
      text-decoration: none !important;
    }
    .swagger-ui .info a:hover {
      text-decoration: underline !important;
    }

    /* Scheme Container & Authorize Button */
    .swagger-ui .scheme-container {
      background: #0b0f19 !important;
      border: 1px solid #1e293b !important;
      border-radius: 10px !important;
      padding: 16px 20px !important;
      box-shadow: none !important;
      margin-bottom: 24px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
    }
    .swagger-ui .btn.authorize {
      background: #2563eb !important;
      color: #ffffff !important;
      border: 1px solid #1d4ed8 !important;
      border-radius: 6px !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      padding: 8px 18px !important;
      box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
      transition: all 0.15s !important;
    }
    .swagger-ui .btn.authorize:hover {
      background: #1d4ed8 !important;
    }
    .swagger-ui .btn.authorize svg {
      fill: #ffffff !important;
      margin-right: 6px !important;
    }

    /* Tag headers */
    .swagger-ui .opblock-tag {
      color: #f8fafc !important;
      font-size: 15px !important;
      font-weight: 700 !important;
      border-bottom: 1px solid #1e293b !important;
      padding: 18px 0 10px 0 !important;
      letter-spacing: -0.01em !important;
    }
    .swagger-ui .opblock-tag:hover {
      color: #38bdf8 !important;
    }
    .swagger-ui .opblock-tag small {
      color: #94a3b8 !important;
      font-size: 12px !important;
    }

    /* Operation Blocks */
    .swagger-ui .opblock {
      background: #0b0f19 !important;
      border: 1px solid #1e293b !important;
      border-radius: 10px !important;
      box-shadow: none !important;
      margin: 0 0 12px 0 !important;
      overflow: hidden !important;
      transition: border-color 0.15s ease !important;
    }
    .swagger-ui .opblock:hover {
      border-color: #334155 !important;
    }
    .swagger-ui .opblock .opblock-summary {
      border: none !important;
      padding: 10px 16px !important;
      background: #0b0f19 !important;
    }
    .swagger-ui .opblock .opblock-summary:hover {
      background: #0e1526 !important;
    }

    /* Method Badges */
    .swagger-ui .opblock .opblock-summary-method {
      border-radius: 6px !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
      font-size: 11px !important;
      font-weight: 700 !important;
      min-width: 68px !important;
      text-align: center !important;
      padding: 5px 0 !important;
    }
    .swagger-ui .opblock.opblock-get .opblock-summary-method {
      background: rgba(59, 130, 246, 0.15) !important;
      color: #60a5fa !important;
      border: 1px solid rgba(59, 130, 246, 0.3) !important;
    }
    .swagger-ui .opblock.opblock-post .opblock-summary-method {
      background: rgba(16, 185, 129, 0.15) !important;
      color: #34d399 !important;
      border: 1px solid rgba(16, 185, 129, 0.3) !important;
    }
    .swagger-ui .opblock.opblock-put .opblock-summary-method {
      background: rgba(245, 158, 11, 0.15) !important;
      color: #fbbf24 !important;
      border: 1px solid rgba(245, 158, 11, 0.3) !important;
    }
    .swagger-ui .opblock.opblock-delete .opblock-summary-method {
      background: rgba(239, 68, 68, 0.15) !important;
      color: #f87171 !important;
      border: 1px solid rgba(239, 68, 68, 0.3) !important;
    }

    /* Path & Summary */
    .swagger-ui .opblock .opblock-summary-path {
      color: #f8fafc !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
      font-size: 13px !important;
      font-weight: 600 !important;
    }
    .swagger-ui .opblock .opblock-summary-path:hover {
      color: #38bdf8 !important;
    }
    .swagger-ui .opblock .opblock-summary-description {
      color: #94a3b8 !important;
      font-size: 12px !important;
    }

    /* Expanded Block Body */
    .swagger-ui .opblock-body {
      background: #060a12 !important;
      border-top: 1px solid #1e293b !important;
      padding: 18px !important;
    }
    .swagger-ui .opblock-description-wrapper p, .swagger-ui .opblock-external-docs-wrapper p {
      color: #cbd5e1 !important;
      font-size: 13px !important;
    }
    .swagger-ui .opblock-section-header {
      background: #0b0f19 !important;
      border: 1px solid #1e293b !important;
      border-radius: 6px !important;
      padding: 8px 12px !important;
    }
    .swagger-ui .opblock-section-header h4 {
      color: #f8fafc !important;
      font-size: 12px !important;
      font-weight: 600 !important;
    }

    /* Parameters & Tables */
    .swagger-ui table thead tr th, .swagger-ui table thead tr td {
      color: #94a3b8 !important;
      border-bottom: 1px solid #1e293b !important;
      font-size: 11px !important;
      font-weight: 600 !important;
    }
    .swagger-ui .parameters-col_name {
      color: #f8fafc !important;
    }
    .swagger-ui .parameter__name {
      color: #38bdf8 !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
      font-size: 12px !important;
    }
    .swagger-ui .parameter__name.required::after {
      color: #f87171 !important;
    }
    .swagger-ui .parameter__type {
      color: #c084fc !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
      font-size: 11px !important;
    }
    .swagger-ui .parameter__in {
      color: #64748b !important;
      font-style: italic !important;
    }

    /* Inputs, Selects, Textareas */
    .swagger-ui input[type="text"], .swagger-ui select, .swagger-ui textarea {
      background: #0b0f19 !important;
      color: #f8fafc !important;
      border: 1px solid #1e293b !important;
      border-radius: 6px !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
      font-size: 12px !important;
      padding: 6px 10px !important;
    }
    .swagger-ui input[type="text"]:focus, .swagger-ui select:focus, .swagger-ui textarea:focus {
      border-color: #3b82f6 !important;
      outline: none !important;
    }

    /* Buttons: Try it out, Execute, Clear */
    .swagger-ui .btn.try-out__btn {
      background: #1e293b !important;
      color: #cbd5e1 !important;
      border: 1px solid #334155 !important;
      border-radius: 6px !important;
      font-size: 12px !important;
    }
    .swagger-ui .btn.try-out__btn:hover {
      color: #ffffff !important;
      background: #334155 !important;
    }
    .swagger-ui .btn.execute {
      background: #2563eb !important;
      color: #ffffff !important;
      border: none !important;
      border-radius: 6px !important;
      font-size: 12px !important;
      font-weight: 600 !important;
    }
    .swagger-ui .btn.execute:hover {
      background: #1d4ed8 !important;
    }
    .swagger-ui .btn.btn-clear {
      background: #1e293b !important;
      color: #cbd5e1 !important;
      border: 1px solid #334155 !important;
      border-radius: 6px !important;
    }

    /* Code Blocks & Responses */
    .swagger-ui .highlight-code, .swagger-ui pre, .swagger-ui .microlight {
      background: #030712 !important;
      color: #38bdf8 !important;
      border: 1px solid #1e293b !important;
      border-radius: 6px !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
      font-size: 12px !important;
    }
    .swagger-ui .response-col_status {
      color: #34d399 !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
      font-weight: 700 !important;
    }
    .swagger-ui .responses-table {
      background: transparent !important;
    }
    .swagger-ui .responses-inner h4, .swagger-ui .responses-inner h5 {
      color: #f8fafc !important;
      font-size: 12px !important;
    }

    /* Models Section */
    .swagger-ui section.models {
      border: 1px solid #1e293b !important;
      background: #0b0f19 !important;
      border-radius: 10px !important;
      margin-top: 24px !important;
    }
    .swagger-ui section.models h4 {
      color: #f8fafc !important;
      font-size: 14px !important;
    }
    .swagger-ui .model-box {
      background: #060a12 !important;
    }
    .swagger-ui .model {
      color: #94a3b8 !important;
    }
    .swagger-ui .model-title {
      color: #f8fafc !important;
    }

    /* Authorize Modal Popup */
    .swagger-ui .dialog-ux .backdrop-ux {
      background: rgba(0, 0, 0, 0.75) !important;
      backdrop-filter: blur(4px) !important;
    }
    .swagger-ui .dialog-ux .modal-ux {
      background: #0b0f19 !important;
      border: 1px solid #1e293b !important;
      border-radius: 12px !important;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.75) !important;
      color: #f8fafc !important;
      max-width: 540px !important;
    }
    .swagger-ui .dialog-ux .modal-ux-header {
      border-bottom: 1px solid #1e293b !important;
      padding: 16px 20px !important;
    }
    .swagger-ui .dialog-ux .modal-ux-header h3 {
      color: #f8fafc !important;
      font-size: 15px !important;
      font-weight: 700 !important;
    }
    .swagger-ui .dialog-ux .modal-ux-content {
      padding: 20px !important;
      color: #cbd5e1 !important;
    }
    .swagger-ui .dialog-ux .modal-ux-content p {
      color: #94a3b8 !important;
      font-size: 12px !important;
    }
    .swagger-ui .auth-btn-wrapper {
      display: flex !important;
      justify-content: flex-end !important;
      gap: 10px !important;
      margin-top: 16px !important;
    }
    .swagger-ui .btn.modal-btn.auth {
      background: #2563eb !important;
      border: none !important;
      color: #ffffff !important;
      border-radius: 6px !important;
      font-weight: 600 !important;
    }
    .swagger-ui .btn.modal-btn.btn-done {
      background: #1e293b !important;
      border: 1px solid #334155 !important;
      color: #cbd5e1 !important;
      border-radius: 6px !important;
    }

    /* Scalar View Container */
    #scalar-container {
      display: none;
      min-height: calc(100vh - 60px);
    }
  </style>
</head>
<body>
  <!-- Top Navigation Header -->
  <header class="vdb-navbar">
    <div class="vdb-brand">
      <svg class="vdb-logo" viewBox="0 0 512 512" fill="none">
        <linearGradient id="vdbCyl" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#0284c7" />
          <stop offset="35%" stop-color="#2563eb" />
          <stop offset="70%" stop-color="#3b82f6" />
          <stop offset="100%" stop-color="#1d4ed8" />
        </linearGradient>
        <path d="M256 32C141.1 32 48 67.8 48 112v288c0 44.2 93.1 80 208 80s208-35.8 208-80V112c0-44.2-93.1-80-208-80z" fill="url(#vdbCyl)"/>
        <path d="M256 32c114.9 0 208 35.8 208 80s-93.1 80-208 80-208-35.8-208-80 93.1-80 208-80z" fill="#38bdf8"/>
        <path d="M256 176c114.9 0 208 35.8 208 80s-93.1 80-208 80-208-35.8-208-80 93.1-80 208-80z" fill="#1e3a8a" opacity="0.6"/>
        <path d="M200 100l56 120 56-120h40l-96 190-96-190h40z" fill="#ffffff"/>
      </svg>
      <div class="vdb-brand-text">
        <div class="vdb-title">
          <span>VanillaDatabase</span>
          <span class="vdb-badge-cyan">Data Plane API v1.3.2</span>
          <span class="vdb-badge-green">100% WAL Mode</span>
        </div>
        <div class="vdb-subtitle">Multi-Tenant SQLite Cloud & REST Table Engine</div>
      </div>
    </div>

    <div class="vdb-actions">
      <!-- Layout Mode Switcher -->
      <div style="display: flex; background: #070b14; padding: 2px; border-radius: 8px; border: 1px solid #1e293b; margin-right: 6px;">
        <button id="btn-swagger" class="vdb-tab-btn active" onclick="switchView('swagger')">Swagger UI</button>
        <button id="btn-scalar" class="vdb-tab-btn" onclick="switchView('scalar')">Scalar Modern</button>
      </div>

      <a href="/v1/openapi.json" target="_blank" class="vdb-btn" title="Open raw OpenAPI 3.0 specification JSON">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        <span>openapi.json</span>
      </a>

      <a href="/#/overview" class="vdb-btn vdb-btn-primary" title="Quay lại trang quản trị VanillaDatabase">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span>Dashboard</span>
      </a>
    </div>
  </header>

  <!-- Swagger UI View -->
  <main id="swagger-container" class="docs-container">
    <div id="swagger-ui"></div>
  </main>

  <!-- Scalar Modern View -->
  <div id="scalar-container">
    <script
      id="api-reference"
      data-url="/v1/openapi.json"
      data-configuration='{
        "theme": "deepSpace",
        "darkMode": true,
        "showSidebar": true,
        "hideDownloadButton": false,
        "searchHotKey": "k"
      }'
    ></script>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    let scalarScriptLoaded = false;

    function switchView(view) {
      const swaggerContainer = document.getElementById('swagger-container');
      const scalarContainer = document.getElementById('scalar-container');
      const btnSwagger = document.getElementById('btn-swagger');
      const btnScalar = document.getElementById('btn-scalar');

      if (view === 'scalar') {
        swaggerContainer.style.display = 'none';
        scalarContainer.style.display = 'block';
        btnScalar.classList.add('active');
        btnSwagger.classList.remove('active');

        if (!scalarScriptLoaded) {
          scalarScriptLoaded = true;
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference';
          document.body.appendChild(script);
        }
      } else {
        swaggerContainer.style.display = 'block';
        scalarContainer.style.display = 'none';
        btnSwagger.classList.add('active');
        btnScalar.classList.remove('active');
      }
    }

    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/v1/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout",
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1,
        docExpansion: "list"
      });
    };
  </script>
</body>
</html>`;
}

