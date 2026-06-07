import type { ApiResponse } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

const RETRY_DELAYS = [1000, 2000, 4000];

async function withRetry<T>(fn: () => Promise<T>, attempts: number = RETRY_DELAYS.length): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (attempts <= 1) throw err;
    await new Promise<void>(r => setTimeout(r, RETRY_DELAYS[RETRY_DELAYS.length - attempts]));
    return withRetry(fn, attempts - 1);
  }
}

async function unwrap<T>(res: Response): Promise<T> {
  const body: ApiResponse<T> = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(`[apiClient] ${body.code ?? res.status}: ${body.error ?? 'Request failed'}`);
  }
  return body.data as T;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (!(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  return withRetry(() =>
    fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    }).then(unwrap<T>)
  );
}

export const apiGet = <T>(path: string): Promise<T> => {
  if (DEMO_MODE) return Promise.resolve(null as unknown as T);
  return request<T>('GET', path);
};

export const apiPost = <T>(path: string, body: unknown): Promise<T> => {
  if (DEMO_MODE) return Promise.resolve(null as unknown as T);
  return request<T>('POST', path, body);
};

export const apiPut = <T>(path: string, body: unknown): Promise<T> => {
  if (DEMO_MODE) return Promise.resolve(body as unknown as T);
  return request<T>('PUT', path, body);
};

export const apiDelete = <T>(path: string): Promise<T> => {
  if (DEMO_MODE) return Promise.resolve(null as unknown as T);
  return request<T>('DELETE', path);
};