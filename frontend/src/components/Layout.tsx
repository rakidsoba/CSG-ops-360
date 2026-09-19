import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', permission: null },
  { path: '/guards', label: 'Guards', permission: 'guards:read' },
  { path: '/sites', label: 'Client Sites', permission: 'sites:read' },
  { path: '/deployments', label: 'Deployments', permission: 'deployments:read' },
  { path: '/shifts', label: 'Shifts', permission: 'shifts:read' },
  { path: '/users', label: 'Users & Access', permission: 'users:read' },
  { path: '/roles', label: 'Roles', permission: 'roles:read' },
  { path: '/audit', label: 'Audit Log', permission: 'audit:read' },
];

export function Layout() {
  const { user, logout, can } = useAuth();

  const visibleNav = NAV_ITEMS.filter((item) => !item.permission || can(item.permission));

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        style={{
          width: 'var(--sidebar-width)',
          background: 'var(--color-primary)',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
          <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: 0.3 }}>CharteredOps 360</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Workforce Operations</div>
        </div>
        <nav style={{ flex: 1, padding: '12px 8px' }}>
          {visibleNav.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              style={({ isActive }) => ({
                display: 'block',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 2,
                color: isActive ? 'var(--color-primary)' : 'rgba(255,255,255,0.9)',
                background: isActive ? 'var(--color-highlight)' : 'transparent',
                fontWeight: isActive ? 600 : 400,
                fontSize: 14,
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,0.12)', fontSize: 13 }}>
          <div style={{ fontWeight: 600 }}>{user?.fullName}</div>
          <div style={{ opacity: 0.7, marginTop: 2 }}>{user?.roles?.join(', ')}</div>
          <button
            onClick={logout}
            style={{
              marginTop: 12,
              width: '100%',
              padding: '8px 12px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header
          style={{
            height: 'var(--header-height)',
            background: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 24px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>Operations Console</div>
        </header>
        <div style={{ flex: 1, padding: 24, overflow: 'auto' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
