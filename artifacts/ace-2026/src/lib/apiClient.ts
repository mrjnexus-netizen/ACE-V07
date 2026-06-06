const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data: T | null; error: string | null; code: string | null; timestamp: string }> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!res.ok || !json?.success) {
    return {
      success: false,
      data: null,
      error: json?.error || 'Request failed',
      code: json?.code || 'UNKNOWN',
      timestamp: new Date().toISOString(),
    };
  }
  return json;
}

export const apiGet = <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' });
export const apiPost = <T>(endpoint: string, body: any) =>
  request<T>(endpoint, { method: 'POST', body: JSON.stringify(body) });
export const apiPut = <T>(endpoint: string, body: any) =>
  request<T>(endpoint, { method: 'PUT', body: JSON.stringify(body) });
export const apiDelete = <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' });