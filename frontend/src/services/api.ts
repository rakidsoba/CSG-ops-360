const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

function getToken(): string | null {
  return localStorage.getItem('csg_token');
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem('csg_token', token);
  else localStorage.removeItem('csg_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    setToken(null);
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: { id: string; email: string; fullName: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () =>
    request<{
      id: string;
      email: string;
      fullName: string;
      roles: string[];
      permissions: string[];
      isSuperAdmin: boolean;
    }>('/auth/me'),
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function hasPermission(permissions: string[], code: string, isSuperAdmin?: boolean): boolean {
  if (isSuperAdmin) return true;
  return permissions.includes(code);
}
