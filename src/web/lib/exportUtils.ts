export function exportQueryResults(
  rows: Record<string, any>[],
  columns: string[],
  format: 'csv' | 'jsonl' | 'excel',
  filename = 'query_results'
): void {
  if (!rows || rows.length === 0) return;

  let content = '';
  let mimeType = 'text/plain';
  let extension: string = format;

  if (format === 'csv') {
    mimeType = 'text/csv;charset=utf-8;';
    const header = columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(',');
    const body = rows
      .map((r) =>
        columns
          .map((c) => {
            const val = r[c];
            if (val === null || val === undefined) return '';
            const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
            return `"${str.replace(/"/g, '""')}"`;
          })
          .join(',')
      )
      .join('\r\n');
    content = '﻿' + header + '\r\n' + body; // UTF-8 BOM for Excel compatibility
  } else if (format === 'jsonl') {
    mimeType = 'application/x-ndjson;charset=utf-8;';
    extension = 'jsonl';
    content = rows.map((r) => JSON.stringify(r)).join('\n');
  } else if (format === 'excel') {
    mimeType = 'application/vnd.ms-excel;charset=utf-8;';
    extension = 'xls';
    // ponytail: Render HTML spreadsheet table natively readable by MS Excel, Apple Numbers, Google Sheets
    const ths = columns.map((c) => `<th style="background-color:#1e293b;color:#ffffff;border:1px solid #475569;">${c}</th>`).join('');
    const trs = rows
      .map((r) => {
        const tds = columns
          .map((c) => {
            const val = r[c] === null ? '' : typeof r[c] === 'object' ? JSON.stringify(r[c]) : String(r[c]);
            return `<td style="border:1px solid #cbd5e1;">${val}</td>`;
          })
          .join('');
        return `<tr>${tds}</tr>`;
      })
      .join('');
    content = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head><meta charset="UTF-8"></head>
        <body>
          <table>
            <thead><tr>${ths}</tr></thead>
            <tbody>${trs}</tbody>
          </table>
        </body>
      </html>
    `;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.${extension}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
