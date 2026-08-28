export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const isPostOrPut = options.method && ['POST', 'PUT', 'PATCH'].includes(options.method.toUpperCase());
  const body = options.body !== undefined ? options.body : (isPostOrPut ? '{}' : undefined);

  const res = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const errorMsg = json.error?.message || `Request failed with status ${res.status}`;
    const err: any = new Error(errorMsg);
    err.code = json.error?.code;
    err.status = res.status;
    throw err;
  }

  return json.data !== undefined ? json.data : json;
}
