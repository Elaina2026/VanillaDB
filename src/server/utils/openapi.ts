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
      --background: #020617;
      --card: #090d16;
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
      height: 100vh;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
    }

    /* Custom subtle scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(150, 150, 150, 0.25); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(150, 150, 150, 0.45); }

    /* App Shell Layout */
    .app-layout {
      display: flex;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
    }

    /* Left Sidebar (Matching DashboardLayout.tsx) */
    .sidebar {
      width: 256px;
      flex-shrink: 0;
      background: #090d16;
      border-right: 1px solid #1e293b;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      user-select: none;
    }
    @media (max-width: 768px) {
      .sidebar { display: none; }
    }
    .sidebar-header {
      height: 56px;
      border-bottom: 1px solid #1e293b;
      padding: 0 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .sidebar-logo {
      width: 30px;
      height: 30px;
      flex-shrink: 0;
    }
    .sidebar-brand-name {
      font-size: 13px;
      font-weight: 700;
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .sidebar-version {
      font-size: 9px;
      font-weight: 700;
      font-family: monospace;
      color: #34d399;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      border-radius: 4px;
      padding: 1px 4px;
    }
    .sidebar-sub {
      font-size: 10px;
      color: #94a3b8;
      margin-top: -2px;
    }
    .sidebar-nav {
      flex: 1;
      padding: 12px 8px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .sidebar-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-radius: 6px;
      color: #94a3b8;
      text-decoration: none;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.15s;
    }
    .sidebar-item:hover {
      color: #f8fafc;
      background: rgba(255, 255, 255, 0.04);
    }
    .sidebar-item.active {
      color: #3b82f6;
      background: rgba(59, 130, 246, 0.1);
      font-weight: 600;
      border-left: 2px solid #3b82f6;
      border-radius: 0 6px 6px 0;
    }
    .sidebar-item svg {
      width: 15px;
      height: 15px;
      flex-shrink: 0;
    }
    .sidebar-footer {
      border-top: 1px solid #1e293b;
      padding: 12px 14px;
      background: #060a12;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sidebar-status-badge {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: #94a3b8;
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10b981;
      display: inline-block;
      margin-right: 4px;
    }

    /* Main View Area */
    .main-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      background: #020617;
    }

    /* Header Bar */
    .header-bar {
      height: 56px;
      border-bottom: 1px solid #1e293b;
      background: rgba(9, 13, 22, 0.85);
      backdrop-filter: blur(12px);
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      z-index: 20;
    }
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #94a3b8;
    }
    .breadcrumb strong {
      color: #f8fafc;
      font-weight: 600;
    }
    .breadcrumb-sep {
      color: #475569;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .token-quickbar {
      display: flex;
      align-items: center;
      background: #020617;
      border: 1px solid #1e293b;
      border-radius: 6px;
      padding: 2px 4px 2px 8px;
      gap: 6px;
    }
    .token-input {
      background: transparent;
      border: none;
      color: #34d399;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11px;
      outline: none;
      width: 170px;
    }
    .token-input::placeholder { color: #64748b; }
    .btn-auth-quick {
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-auth-quick:hover { background: #1d4ed8; }

    .view-toggle {
      display: flex;
      background: #060a12;
      border: 1px solid #1e293b;
      border-radius: 6px;
      padding: 2px;
    }
    .toggle-btn {
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      border: none;
      background: transparent;
      color: #94a3b8;
      transition: all 0.15s;
    }
    .toggle-btn.active {
      background: #1e293b;
      color: #38bdf8;
    }
    .nav-link-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 500;
      color: #cbd5e1;
      background: #090d16;
      border: 1px solid #1e293b;
      padding: 5px 12px;
      border-radius: 6px;
      text-decoration: none;
      transition: all 0.15s;
    }
    .nav-link-btn:hover {
      color: #fff;
      background: #1e293b;
      border-color: #334155;
    }

    /* Scrollable Content */
    .content-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 24px 32px 64px 32px;
    }

    /* Hero Banner */
    .hero-banner {
      background: #090d16;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 24px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .hero-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .hero-title {
      font-size: 18px;
      font-weight: 700;
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
    }
    .hero-desc {
      font-size: 12px;
      color: #94a3b8;
      margin: 0;
      max-width: 800px;
      line-height: 1.5;
    }
    .hero-badges {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .tag-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 6px;
    }
    .tag-blue { background: rgba(59, 130, 246, 0.1); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.25); }
    .tag-green { background: rgba(16, 185, 129, 0.1); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.25); }
    .tag-purple { background: rgba(168, 85, 247, 0.1); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.25); }

    /* ========================================================
       SWAGGER UI DEEP DARK RESKIN (100% Matching Main Web App)
       ======================================================== */
    .swagger-ui {
      background: transparent !important;
      color: #f8fafc !important;
    }
    .swagger-ui .topbar, .swagger-ui .information-container {
      display: none !important;
    }
    .swagger-ui .wrapper {
      padding: 0 !important;
      max-width: 100% !important;
    }

    /* Schemes & Global Authorization Bar */
    .swagger-ui .scheme-container {
      background: #090d16 !important;
      border: 1px solid #1e293b !important;
      border-radius: 10px !important;
      padding: 14px 20px !important;
      box-shadow: none !important;
      margin-bottom: 20px !important;
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
      padding: 6px 16px !important;
      box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
      transition: all 0.15s !important;
    }
    .swagger-ui .btn.authorize:hover { background: #1d4ed8 !important; }
    .swagger-ui .btn.authorize svg { fill: #ffffff !important; }

    /* Tags & Groups */
    .swagger-ui .opblock-tag {
      color: #f8fafc !important;
      font-size: 15px !important;
      font-weight: 700 !important;
      border-bottom: 1px solid #1e293b !important;
      padding: 16px 0 10px 0 !important;
      letter-spacing: -0.01em !important;
    }
    .swagger-ui .opblock-tag:hover { color: #38bdf8 !important; }
    .swagger-ui .opblock-tag small { color: #94a3b8 !important; font-size: 12px !important; }

    /* Operations Cards */
    .swagger-ui .opblock {
      background: #090d16 !important;
      border: 1px solid #1e293b !important;
      border-radius: 10px !important;
      box-shadow: none !important;
      margin: 0 0 10px 0 !important;
      overflow: hidden !important;
      transition: border-color 0.15s ease !important;
    }
    .swagger-ui .opblock:hover {
      border-color: #334155 !important;
    }
    .swagger-ui .opblock .opblock-summary {
      border: none !important;
      padding: 10px 16px !important;
      background: #090d16 !important;
      align-items: center !important;
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
    .swagger-ui .opblock .opblock-summary-path:hover { color: #38bdf8 !important; }
    .swagger-ui .opblock .opblock-summary-description {
      color: #94a3b8 !important;
      font-size: 12px !important;
    }

    /* Expanded Body */
    .swagger-ui .opblock-body {
      background: #040711 !important;
      border-top: 1px solid #1e293b !important;
      padding: 16px !important;
    }
    .swagger-ui .opblock-description-wrapper p {
      color: #cbd5e1 !important;
      font-size: 12px !important;
    }
    .swagger-ui .opblock-section-header {
      background: #090d16 !important;
      border: 1px solid #1e293b !important;
      border-radius: 6px !important;
      padding: 8px 12px !important;
    }
    .swagger-ui .opblock-section-header h4 {
      color: #f8fafc !important;
      font-size: 12px !important;
      font-weight: 600 !important;
    }

    /* Tables & Parameter Rows */
    .swagger-ui table thead tr th, .swagger-ui table thead tr td {
      color: #94a3b8 !important;
      border-bottom: 1px solid #1e293b !important;
      font-size: 11px !important;
    }
    .swagger-ui .parameter__name {
      color: #38bdf8 !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
      font-size: 12px !important;
    }
    .swagger-ui .parameter__type {
      color: #c084fc !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
      font-size: 11px !important;
    }
    .swagger-ui .parameter__in {
      color: #64748b !important;
    }
    .swagger-ui input[type="text"], .swagger-ui select, .swagger-ui textarea {
      background: #090d16 !important;
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

    /* Buttons */
    .swagger-ui .btn.try-out__btn {
      background: #1e293b !important;
      color: #cbd5e1 !important;
      border: 1px solid #334155 !important;
      border-radius: 6px !important;
      font-size: 12px !important;
    }
    .swagger-ui .btn.try-out__btn:hover { color: #fff !important; background: #334155 !important; }
    .swagger-ui .btn.execute {
      background: #2563eb !important;
      color: #ffffff !important;
      border: none !important;
      border-radius: 6px !important;
      font-size: 12px !important;
      font-weight: 600 !important;
    }
    .swagger-ui .btn.execute:hover { background: #1d4ed8 !important; }
    .swagger-ui .btn.btn-clear {
      background: #1e293b !important;
      color: #cbd5e1 !important;
      border: 1px solid #334155 !important;
      border-radius: 6px !important;
    }

    /* Code Blocks */
    .swagger-ui .highlight-code, .swagger-ui pre, .swagger-ui .microlight {
      background: #020617 !important;
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
    .swagger-ui .responses-table { background: transparent !important; }
    .swagger-ui .responses-inner h4, .swagger-ui .responses-inner h5 {
      color: #f8fafc !important;
      font-size: 12px !important;
    }

    /* Models */
    .swagger-ui section.models {
      border: 1px solid #1e293b !important;
      background: #090d16 !important;
      border-radius: 10px !important;
      margin-top: 24px !important;
    }
    .swagger-ui section.models h4 { color: #f8fafc !important; font-size: 14px !important; }
    .swagger-ui .model-box { background: #040711 !important; }
    .swagger-ui .model { color: #94a3b8 !important; }
    .swagger-ui .model-title { color: #f8fafc !important; }

    /* Modal Authorize Popup */
    .swagger-ui .dialog-ux .backdrop-ux {
      background: rgba(0, 0, 0, 0.8) !important;
      backdrop-filter: blur(4px) !important;
    }
    .swagger-ui .dialog-ux .modal-ux {
      background: #090d16 !important;
      border: 1px solid #1e293b !important;
      border-radius: 12px !important;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8) !important;
      color: #f8fafc !important;
      max-width: 520px !important;
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
    .swagger-ui .dialog-ux .modal-ux-content p { color: #94a3b8 !important; font-size: 12px !important; }
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

    /* Scalar View */
    #scalar-container {
      display: none;
      height: calc(100vh - 56px);
      overflow-y: auto;
    }
  </style>
</head>
<body>
  <div class="app-layout">
    <!-- Left Sidebar (Identical to VanillaDatabase DashboardLayout) -->
    <aside class="sidebar">
      <div>
        <div class="sidebar-header">
          <svg class="sidebar-logo" viewBox="0 0 512 512" fill="none">
            <linearGradient id="sbCyl" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#0284c7" />
              <stop offset="35%" stop-color="#2563eb" />
              <stop offset="70%" stop-color="#3b82f6" />
              <stop offset="100%" stop-color="#1d4ed8" />
            </linearGradient>
            <path d="M256 32C141.1 32 48 67.8 48 112v288c0 44.2 93.1 80 208 80s208-35.8 208-80V112c0-44.2-93.1-80-208-80z" fill="url(#sbCyl)"/>
            <path d="M256 32c114.9 0 208 35.8 208 80s-93.1 80-208 80-208-35.8-208-80 93.1-80 208-80z" fill="#38bdf8"/>
            <path d="M256 176c114.9 0 208 35.8 208 80s-93.1 80-208 80-208-35.8-208-80 93.1-80 208-80z" fill="#1e3a8a" opacity="0.6"/>
            <path d="M200 100l56 120 56-120h40l-96 190-96-190h40z" fill="#ffffff"/>
          </svg>
          <div>
            <div class="sidebar-brand-name">
              <span>VanillaDatabase</span>
              <span class="sidebar-version">v1.3.2</span>
            </div>
            <div class="sidebar-sub">SQLite Cloud Platform</div>
          </div>
        </div>

        <nav class="sidebar-nav">
          <a href="/#/overview" class="sidebar-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
            <span>Overview</span>
          </a>
          <a href="/#/databases" class="sidebar-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>
            <span>Databases</span>
          </a>
          <a href="/#/telemetry" class="sidebar-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
            <span>Live Telemetry</span>
          </a>
          <a href="/#/activity" class="sidebar-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.48 12H2"/></svg>
            <span>Activity Logs</span>
          </a>
          <a href="/v1/docs" class="sidebar-item active">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>
            <span>API Docs (v1)</span>
          </a>
          <a href="/#/settings" class="sidebar-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>Settings</span>
          </a>
        </nav>
      </div>

      <div class="sidebar-footer">
        <div class="sidebar-status-badge">
          <span><span class="status-dot"></span>100% WAL Mode</span>
          <span style="color: #c084fc; font-size: 10px;">AES-256-GCM</span>
        </div>
        <a href="/#/overview" class="nav-link-btn" style="justify-content: center; width: 100%;">
          <span>Quay lại Dashboard</span>
        </a>
      </div>
    </aside>

    <!-- Main Content -->
    <div class="main-area">
      <!-- Header Bar -->
      <header class="header-bar">
        <div class="breadcrumb">
          <span>VanillaDatabase</span>
          <span class="breadcrumb-sep">/</span>
          <span>API Reference</span>
          <span class="breadcrumb-sep">/</span>
          <strong>v1 Data Plane</strong>
        </div>

        <div class="header-actions">
          <!-- Fast Token Authorizer -->
          <div class="token-quickbar" title="Dán token vdb_live_... vào đây và bấm Lưu để Swagger tự động gửi Authorization header">
            <span style="color: #94a3b8; font-size: 11px;">Token:</span>
            <input id="quick-token-input" type="password" placeholder="vdb_live_..." class="token-input" />
            <button class="btn-auth-quick" onclick="applyQuickToken()">Lưu</button>
          </div>

          <!-- Mode Switcher -->
          <div class="view-toggle">
            <button id="btn-sw" class="toggle-btn active" onclick="switchView('swagger')">Swagger UI</button>
            <button id="btn-sc" class="toggle-btn" onclick="switchView('scalar')">Scalar Docs</button>
          </div>

          <a href="/v1/openapi.json" target="_blank" class="nav-link-btn">
            <span>openapi.json</span>
          </a>
        </div>
      </header>

      <!-- Scrollable Main Content -->
      <div id="swagger-container" class="content-scroll">
        <!-- Hero Card -->
        <div class="hero-banner">
          <div class="hero-title-row">
            <h1 class="hero-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2">
                <path d="M12 2C6.48 2 2 4.02 2 6.5s4.48 4.5 10 4.5 10-2.02 10-4.5S17.52 2 12 2z"/>
                <path d="M2 12c0 2.48 4.48 4.5 10 4.5s10-2.02 10-4.5"/>
                <path d="M2 17.5c0 2.48 4.48 4.5 10 4.5s10-2.02 10-4.5"/>
              </svg>
              <span>VanillaDatabase Data Plane API (v1.3.2)</span>
            </h1>
            <div class="hero-badges">
              <span class="tag-badge tag-blue">OpenAPI 3.0.3</span>
              <span class="tag-badge tag-green">WAL Concurrency</span>
              <span class="tag-badge tag-purple">Bearer Auth (vdb_live_*)</span>
            </div>
          </div>
          <p class="hero-desc">
            API hợp nhất đa người dùng trên nền SQLite. Toàn bộ các thao tác truy vấn (query), giao dịch theo mẻ (batch), bảng dữ liệu REST (tables), sự kiện trực tiếp (realtime SSE) và kho lưu trữ tệp (files) được ủy quyền an toàn qua API Tokens.
          </p>
        </div>

        <!-- Swagger UI Target -->
        <div id="swagger-ui"></div>
      </div>

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
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    let scalarLoaded = false;

    function applyQuickToken() {
      const val = document.getElementById('quick-token-input').value.trim();
      if (!val) return;
      if (window.ui && window.ui.preauthorizeApiKey) {
        window.ui.preauthorizeApiKey('BearerAuth', val);
        alert('Đã áp dụng API Token ' + val.slice(0, 12) + '... cho tất cả yêu cầu Swagger!');
      }
    }

    function switchView(view) {
      const sw = document.getElementById('swagger-container');
      const sc = document.getElementById('scalar-container');
      const btnSw = document.getElementById('btn-sw');
      const btnSc = document.getElementById('btn-sc');

      if (view === 'scalar') {
        sw.style.display = 'none';
        sc.style.display = 'block';
        btnSc.classList.add('active');
        btnSw.classList.remove('active');
        if (!scalarLoaded) {
          scalarLoaded = true;
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference';
          document.body.appendChild(s);
        }
      } else {
        sw.style.display = 'block';
        sc.style.display = 'none';
        btnSw.classList.add('active');
        btnSc.classList.remove('active');
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

