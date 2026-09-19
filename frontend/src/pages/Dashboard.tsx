import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { SkeletonCard } from '../components/Skeleton';

export function Dashboard() {
  const { user, can } = useAuth();
  const [stats, setStats] = useState<{ guards?: number; sites?: number; deployments?: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const results: any = {};
        if (can('guards:read')) {
          const g = await api.get<{ total: number }>('/security-guards?limit=1');
          results.guards = g.total;
        }
        if (can('sites:read')) {
          const s = await api.get<{ total: number }>('/client-sites?limit=1');
          results.sites = s.total;
        }
        if (can('deployments:read')) {
          const d = await api.get<{ total: number }>('/deployments?active=true&limit=1');
          results.deployments = d.total;
        }
        setStats(results);
      } catch {
        setStats({});
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [can]);

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 8px', fontSize: 22, color: 'var(--color-primary)' }}>
        Welcome, {user?.fullName?.split(' ')[0]}
      </h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 24 }}>
        Operational overview — data driven by active deployments.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        {stats?.guards !== undefined && (
          <StatCard label="Active Guards" value={stats.guards} />
        )}
        {stats?.sites !== undefined && (
          <StatCard label="Client Sites" value={stats.sites} />
        )}
        {stats?.deployments !== undefined && (
          <StatCard label="Active Deployments" value={stats.deployments} />
        )}
      </div>
      <div
        style={{
          marginTop: 32,
          padding: 20,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>System status</h2>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-muted)' }}>
          Phase 1 foundation is live: authentication, RBAC, guard registry, client sites, shifts and deployments.
          Field attendance (Phase 2) will use the deployment record as the expected roster and support offline capture.
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: 20,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-primary)' }}>{value}</div>
    </div>
  );
}
