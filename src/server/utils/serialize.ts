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
  const serialized: Record<string, any> = {};
  for (const [key, val] of Object.entries(row)) {
    serialized[key] = serializeSqlValue(val);
  }
  return serialized;
}

export function deserializeSqlParam(val: any): any {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && val.$type === 'blob' && val.encoding === 'base64' && typeof val.data === 'string') {
    return Buffer.from(val.data, 'base64');
  }
  return val;
}
