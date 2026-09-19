import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { SkeletonTable } from '../components/Skeleton';

interface Deployment {
  id: string;
  guard_number: string;
  guard_name: string;
  site_code: string;
  site_name: string;
  shift_type: string;
  shift_name: string;
  effective_from: string;
  effective_to: string | null;
  active: boolean;
  supervisor_name: string | null;
}

export function Deployments() {
  const [data, setData] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ data: Deployment[] }>('/deployments?active=true&limit=100')
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonTable rows={8} />;

  return (
    <div>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, color: 'var(--color-primary)' }}>Active Deployments</h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 20 }}>
        Source of truth for expected roster. Field check-in will start from these records.
      </p>
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--color-bg)', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px' }}>Guard</th>
              <th style={{ padding: '12px 16px' }}>Site</th>
              <th style={{ padding: '12px 16px' }}>Shift</th>
              <th style={{ padding: '12px 16px' }}>From</th>
              <th style={{ padding: '12px 16px' }}>Supervisor</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-muted)' }}>No active deployments</td></tr>
            ) : data.map((d) => (
              <tr key={d.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td style={{ padding: '12px 16px' }}>{d.guard_number} — {d.guard_name}</td>
                <td style={{ padding: '12px 16px' }}>{d.site_name}</td>
                <td style={{ padding: '12px 16px' }}>{d.shift_name || d.shift_type}</td>
                <td style={{ padding: '12px 16px' }}>{d.effective_from}</td>
                <td style={{ padding: '12px 16px' }}>{d.supervisor_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
