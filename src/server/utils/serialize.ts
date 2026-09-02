export function serializeSqlValue(val: any): any {
  if (val === null || val === undefined) return null;
  if (typeof val === 'bigint') {
    return val.toString();
  }
  if (val instanceof Uint8Array || Buffer.isBuffer(val)) {
    return {
      $type: 'blob',
      encoding: 'base64',
      data: Buffer.from(val).toString('base64'),
    };
  }
  return val;
}

export function serializeSqlRow(row: Record<string, any>): Record<string, any> {
  // Fast in-place mutation to eliminate millions of intermediate Object.entries tuple allocations
  for (const key in row) {
    const val = row[key];
    if (typeof val === 'bigint' || (val !== null && typeof val === 'object' && (val instanceof Uint8Array || Buffer.isBuffer(val)))) {
      row[key] = serializeSqlValue(val);
    }
  }
  return row;
}

export function deserializeSqlParam(val: any): any {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && val.$type === 'blob' && val.encoding === 'base64' && typeof val.data === 'string') {
    return Buffer.from(val.data, 'base64');
  }
  return val;
}
