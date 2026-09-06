export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const isPostOrPut = options.method && ['POST', 'PUT', 'PATCH'].includes(options.method.toUpperCase());
  const body = options.body !== undefined ? options.body : (isPostOrPut ? '{}' : undefined);

  const controller = new AbortController();
  const timeoutMs = 12000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      signal: options.signal || controller.signal,
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body,
    });

    clearTimeout(timeoutId);

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      const errorMsg = json.error?.message || `Request failed with status ${res.status}`;
      const err: any = new Error(errorMsg);
      err.code = json.error?.code;
      err.status = res.status;
      throw err;
    }

    return json.data !== undefined ? json.data : json;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const timeoutErr: any = new Error(`Request timed out after ${timeoutMs / 1000}s`);
      timeoutErr.status = 504;
      throw timeoutErr;
    }
    throw err;
  }
}
