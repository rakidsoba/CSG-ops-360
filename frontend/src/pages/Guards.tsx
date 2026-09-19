import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { SkeletonTable } from '../components/Skeleton';

interface Guard {
  id: string;
  guard_number: string;
  full_name: string;
  phone: string | null;
  status: string;
  hired_at: string | null;
}

export function Guards() {
  const { can } = useAuth();
  const [data, setData] = useState<Guard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ guard_number: '', full_name: '', phone: '', status: 'Active' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Guard[]; total: number }>(`/security-guards?limit=100&q=${encodeURIComponent(q)}`);
      setData(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/security-guards', form);
      setShowForm(false);
      setForm({ guard_number: '', full_name: '', phone: '', status: 'Active' });
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Mark this guard as Former?')) return;
    try {
      await api.del(`/security-guards/${id}`);
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: 'var(--color-primary)' }}>Security Guards</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-muted)', fontSize: 14 }}>{total} records</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="Search name or number..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', width: 220 }}
          />
          <button
            onClick={load}
            style={{ padding: '8px 14px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
          >
            Search
          </button>
          {can('guards:create') && (
            <button
              onClick={() => setShowForm(true)}
              style={{ padding: '8px 14px', background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600 }}
            >
              Add Guard
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 20,
            marginBottom: 20,
          }}
        >
          <h3 style={{ marginTop: 0 }}>New Guard</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input required placeholder="Guard number" value={form.guard_number} onChange={(e) => setForm({ ...form, guard_number: e.target.value })} style={inputStyle} />
            <input required placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} style={inputStyle} />
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={inputStyle}>
              <option value="Active">Active</option>
              <option value="Suspended">Suspended</option>
              <option value="Former">Former</option>
            </select>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button type="submit" style={{ padding: '8px 16px', background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Save</button>
            <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <SkeletonTable rows={8} />
      ) : error ? (
        <div style={{ color: 'var(--color-danger)' }}>{error}</div>
      ) : (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)', textAlign: 'left' }}>
                <th style={thStyle}>Number</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Hired</th>
                {can('guards:delete') && <th style={thStyle}></th>}
              </tr>
            </thead>
            <tbody>
              {data.map((g) => (
                <tr key={g.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td style={tdStyle}>{g.guard_number}</td>
                  <td style={tdStyle}>{g.full_name}</td>
                  <td style={tdStyle}>{g.phone || '—'}</td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        background: g.status === 'Active' ? '#e6f4ea' : g.status === 'Suspended' ? '#fff8e1' : '#f5f5f5',
                        color: g.status === 'Active' ? 'var(--color-success)' : g.status === 'Suspended' ? 'var(--color-warning)' : 'var(--color-text-muted)',
                      }}
                    >
                      {g.status}
                    </span>
                  </td>
                  <td style={tdStyle}>{g.hired_at || '—'}</td>
                  {can('guards:delete') && g.status === 'Active' && (
                    <td style={tdStyle}>
                      <button
                        onClick={() => handleDeactivate(g.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: 13 }}
                      >
                        Deactivate
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  width: '100%',
};
const thStyle: React.CSSProperties = { padding: '12px 16px', fontWeight: 600, fontSize: 13, color: 'var(--color-text-muted)' };
const tdStyle: React.CSSProperties = { padding: '12px 16px' };
