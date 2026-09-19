const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const ACCESS_KEY = 'csg_token';
const REFRESH_KEY = 'csg_refresh';

export function getToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string | null, refresh?: string | null) {
  if (access) localStorage.setItem(ACCESS_KEY, access);
  else localStorage.removeItem(ACCESS_KEY);
  if (refresh !== undefined) {
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    else localStorage.removeItem(REFRESH_KEY);
  }
}

/** @deprecated use setTokens */
export function setToken(token: string | null) {
  setTokens(token, token ? getRefreshToken() : null);
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) {
      setTokens(null, null);
      return false;
    }
    const data = await res.json();
    setTokens(data.accessToken || data.token, data.refreshToken);
    return true;
  } catch {
    setTokens(null, null);
    return false;
  }
}

async function request<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
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

  if (res.status === 401 && !retried && !path.includes('/auth/login') && !path.includes('/auth/refresh')) {
    // Single-flight refresh
    if (!refreshPromise) {
      refreshPromise = tryRefresh().finally(() => {
        refreshPromise = null;
      });
    }
    const ok = await refreshPromise;
    if (ok) {
      return request<T>(path, options, true);
    }
    setTokens(null, null);
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  login: async (email: string, password: string) => {
    const data = await request<{
      token: string;
      accessToken?: string;
      refreshToken?: string;
      user: { id: string; email: string; fullName: string };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setTokens(data.accessToken || data.token, data.refreshToken || null);
    return data;
  },
  logout: async () => {
    const refresh = getRefreshToken();
    try {
      if (refresh) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refresh }),
        });
      }
    } catch {
      /* ignore */
    }
    setTokens(null, null);
  },
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
