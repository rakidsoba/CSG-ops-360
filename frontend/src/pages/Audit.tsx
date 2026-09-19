import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { SkeletonTable } from '../components/Skeleton';

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_name: string | null;
  created_at: string;
}

export function Audit() {
  const [data, setData] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ data: AuditEntry[] }>('/audit?limit=100')
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonTable rows={10} />;

  return (
    <div>
      <h1 style={{ margin: '0 0 4px', fontSize: 22, color: 'var(--color-primary)' }}>Audit Log</h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 20 }}>
        Append-only. Every create, update, deactivate, role grant and login is recorded. Entries cannot be edited or deleted.
      </p>
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--color-bg)', textAlign: 'left' }}>
              <th style={{ padding: '10px 14px' }}>When</th>
              <th style={{ padding: '10px 14px' }}>Actor</th>
              <th style={{ padding: '10px 14px' }}>Action</th>
              <th style={{ padding: '10px 14px' }}>Entity</th>
            </tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleString()}</td>
                <td style={{ padding: '10px 14px' }}>{a.actor_name || '—'}</td>
                <td style={{ padding: '10px 14px' }}>{a.action}</td>
                <td style={{ padding: '10px 14px' }}>{a.entity_type}{a.entity_id ? ` / ${a.entity_id.slice(0, 8)}…` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
