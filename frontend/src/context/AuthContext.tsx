import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, hasPermission } from '../services/api';

interface User {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  isSuperAdmin: boolean;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  can: (code: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch {
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('csg_token');
    if (token) refresh();
    else setLoading(false);
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    setToken(res.token);
    await refresh();
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    window.location.href = '/login';
  };

  const can = (code: string) => {
    if (!user) return false;
    return hasPermission(user.permissions, code, user.isSuperAdmin);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
