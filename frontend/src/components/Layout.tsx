import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { path: '/', label: 'Home', permission: null },
  { path: '/field', label: 'Check-In', permission: 'deployments:read' },
  { path: '/review', label: 'Review', permission: 'deployments:read' },
  { path: '/guards', label: 'Guards', permission: 'guards:read' },
  { path: '/sites', label: 'Sites', permission: 'sites:read' },
  { path: '/deployments', label: 'Deployments', permission: 'deployments:read' },
  { path: '/users', label: 'Users', permission: 'users:read' },
  { path: '/audit', label: 'Audit', permission: 'audit:read' },
];

export function Layout() {
  const { user, logout, can } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const visibleNav = NAV_ITEMS.filter((item) => !item.permission || can(item.permission));

  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>
      {/* Top bar — always visible, mobile friendly */}
      <header
        style={{
          height: 'var(--header-height)',
          background: 'var(--color-primary)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="mobile-only"
            onClick={() => setMenuOpen((o) => !o)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff',
              padding: '6px 10px',
              borderRadius: 4,
              minHeight: 36,
              cursor: 'pointer',
            }}
            aria-label="Menu"
          >
            Menu
          </button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>CharteredOps 360</div>
            <div style={{ fontSize: 11, opacity: 0.75 }} className="desktop-only">Workforce Operations</div>
          </div>
        </div>
        <div style={{ fontSize: 12, textAlign: 'right' }}>
          <div style={{ fontWeight: 600 }}>{user?.fullName?.split(' ')[0]}</div>
          <button
            onClick={logout}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.85)',
              cursor: 'pointer',
              fontSize: 11,
              padding: 0,
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Desktop sidebar */}
        <aside
          className="desktop-only"
          style={{
            width: 'var(--sidebar-width)',
            background: 'var(--color-primary)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}
        >
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
            <div style={{ opacity: 0.7 }}>{user?.roles?.join(', ')}</div>
          </div>
        </aside>

        {/* Mobile slide-down menu */}
        {menuOpen && (
          <div
            className="mobile-only"
            style={{
              position: 'fixed',
              top: 'var(--header-height)',
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 40,
            }}
            onClick={() => setMenuOpen(false)}
          >
            <nav
              style={{
                background: 'var(--color-primary)',
                padding: 12,
                maxHeight: '70vh',
                overflow: 'auto',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {visibleNav.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={() => setMenuOpen(false)}
                  style={({ isActive }) => ({
                    display: 'block',
                    padding: '14px 12px',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: 2,
                    color: isActive ? 'var(--color-primary)' : '#fff',
                    background: isActive ? 'var(--color-highlight)' : 'transparent',
                    fontWeight: isActive ? 600 : 400,
                    fontSize: 15,
                  })}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}

        <main style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom quick nav for field users */}
      <nav
        className="mobile-only"
        style={{
          display: 'flex',
          background: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
          paddingBottom: 'var(--safe-bottom)',
          position: 'sticky',
          bottom: 0,
          zIndex: 30,
        }}
      >
        {visibleNav.slice(0, 4).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            style={({ isActive }) => ({
              flex: 1,
              textAlign: 'center',
              padding: '10px 4px',
              fontSize: 12,
              fontWeight: isActive ? 700 : 400,
              color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
              minHeight: 'var(--touch-min)',
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
