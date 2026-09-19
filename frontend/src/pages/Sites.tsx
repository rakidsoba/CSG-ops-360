import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { SkeletonTable } from '../components/Skeleton';

interface Site {
  id: string;
  site_code: string;
  name: string;
  client_name: string | null;
  operational_status: string;
  geofence_radius: number;
  latitude: number | null;
  longitude: number | null;
}

export function Sites() {
  const { can } = useAuth();
  const [data, setData] = useState<Site[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ data: Site[]; total: number }>('/client-sites?limit=100')
      .then((res) => { setData(res.data); setTotal(res.total); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonTable rows={8} />;

  return (
    <div>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, color: 'var(--color-primary)' }}>Client Sites</h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 20 }}>{total} sites</p>
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--color-bg)', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px' }}>Code</th>
              <th style={{ padding: '12px 16px' }}>Name</th>
              <th style={{ padding: '12px 16px' }}>Client</th>
              <th style={{ padding: '12px 16px' }}>Status</th>
              <th style={{ padding: '12px 16px' }}>Geofence (m)</th>
              <th style={{ padding: '12px 16px' }}>GPS</th>
            </tr>
          </thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td style={{ padding: '12px 16px' }}>{s.site_code}</td>
                <td style={{ padding: '12px 16px' }}>{s.name}</td>
                <td style={{ padding: '12px 16px' }}>{s.client_name || '—'}</td>
                <td style={{ padding: '12px 16px' }}>{s.operational_status}</td>
                <td style={{ padding: '12px 16px' }}>{s.geofence_radius}</td>
                <td style={{ padding: '12px 16px' }}>{s.latitude && s.longitude ? `${s.latitude}, ${s.longitude}` : 'Not set'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!can('sites:update') && (
        <p style={{ marginTop: 12, fontSize: 13, color: 'var(--color-text-muted)' }}>
          You have read-only access. Contact a Controller or Super Admin to update site coordinates for geofencing.
        </p>
      )}
    </div>
  );
}
