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
import { FieldCheckIn } from './pages/FieldCheckIn';
import { AttendanceReview } from './pages/AttendanceReview';
import { SkeletonTable } from './components/Skeleton';

function Protected({ children, permission }: { children: React.ReactNode; permission?: string }) {
  const { user, loading, can } = useAuth();
  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <SkeletonTable rows={4} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !can(permission)) {
    return (
      <div className="page">
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
        <Route path="field" element={<Protected permission="deployments:read"><FieldCheckIn /></Protected>} />
        <Route path="review" element={<Protected permission="deployments:read"><AttendanceReview /></Protected>} />
        <Route path="guards" element={<Protected permission="guards:read"><Guards /></Protected>} />
        <Route path="sites" element={<Protected permission="sites:read"><Sites /></Protected>} />
        <Route path="deployments" element={<Protected permission="deployments:read"><Deployments /></Protected>} />
        <Route path="users" element={<Protected permission="users:read"><Users /></Protected>} />
        <Route path="audit" element={<Protected permission="audit:read"><Audit /></Protected>} />
        <Route path="shifts" element={<Protected permission="shifts:read"><div className="page"><h1 className="page-title">Shifts</h1><p className="page-sub">Day 06:00–18:00 / Night 18:00–06:00</p></div></Protected>} />
        <Route path="roles" element={<Protected permission="roles:read"><div className="page"><h1 className="page-title">Roles</h1><p className="page-sub">Role and permission management is available for Super Admin via Users screen and API.</p></div></Protected>} />
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
