import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Guards } from './pages/Guards';
import { Sites } from './pages/Sites';
import { Deployments } from './pages/Deployments';
import { Users } from './pages/Users';
import { Audit } from './pages/Audit';
import { SkeletonTable } from './components/Skeleton';

function Protected({ children, permission }: { children: React.ReactNode; permission?: string }) {
  const { user, loading, can } = useAuth();
  if (loading) {
    return (
      <div style={{ padding: 40 }}>
        <SkeletonTable rows={4} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !can(permission)) {
    return (
      <div style={{ padding: 40 }}>
        <h2 style={{ color: 'var(--color-primary)' }}>Access denied</h2>
        <p style={{ color: 'var(--color-text-muted)' }}>
          You do not have permission to view this screen. Contact a Super Admin if you need access.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="guards" element={<Protected permission="guards:read"><Guards /></Protected>} />
        <Route path="sites" element={<Protected permission="sites:read"><Sites /></Protected>} />
        <Route path="deployments" element={<Protected permission="deployments:read"><Deployments /></Protected>} />
        <Route path="users" element={<Protected permission="users:read"><Users /></Protected>} />
        <Route path="audit" element={<Protected permission="audit:read"><Audit /></Protected>} />
        <Route path="shifts" element={<Protected permission="shifts:read"><div><h1 style={{ color: 'var(--color-primary)' }}>Shifts</h1><p>Day 06:00–18:00 / Night 18:00–06:00</p></div></Protected>} />
        <Route path="roles" element={<Protected permission="roles:read"><div><h1 style={{ color: 'var(--color-primary)' }}>Roles</h1><p>Role and permission management is available for Super Admin via the API and Users screen.</p></div></Protected>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
