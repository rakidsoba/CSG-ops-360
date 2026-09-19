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
  residential_location: string | null;
}

export function Guards() {
  const { can } = useAuth();
  const [data, setData] = useState<Guard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ guard_number: '', full_name: '', phone: '', status: 'Active', residential_location: '' });

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (q) params.set('q', q);
      if (statusFilter) params.set('status', statusFilter);
      const res = await api.get<{ data: Guard[]; total: number }>(`/security-guards?${params}`);
      setData(res.data);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.patch(`/security-guards/${editingId}`, {
          full_name: form.full_name,
          phone: form.phone || null,
          status: form.status,
          residential_location: form.residential_location || null,
        });
      } else {
        await api.post('/security-guards', form);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ guard_number: '', full_name: '', phone: '', status: 'Active', residential_location: '' });
      load();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const startEdit = (g: Guard) => {
    setEditingId(g.id);
    setForm({
      guard_number: g.guard_number,
      full_name: g.full_name,
      phone: g.phone || '',
      status: g.status,
      residential_location: g.residential_location || '',
    });
    setShowForm(true);
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

  const exportCsv = () => {
    const header = 'guard_number,full_name,phone,status,hired_at,residential_location\n';
    const body = data
      .map((g) =>
        [g.guard_number, g.full_name, g.phone || '', g.status, g.hired_at || '', (g.residential_location || '').replace(/,/g, ' ')].join(',')
      )
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `guards_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 className="page-title">Security Guards</h1>
          <p className="page-sub">{total} records</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="Search name or number..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            style={{ width: 180 }}
          />
          <select className="select" style={{ width: 120 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All status</option>
            <option value="Active">Active</option>
            <option value="Suspended">Suspended</option>
            <option value="Former">Former</option>
          </select>
          <button className="btn btn-secondary" onClick={load}>Filter</button>
          {can('guards:read') && (
            <button className="btn btn-ghost" onClick={exportCsv}>Export CSV</button>
          )}
          {can('guards:create') && (
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditingId(null);
                setForm({ guard_number: '', full_name: '', phone: '', status: 'Active', residential_location: '' });
                setShowForm(true);
              }}
            >
              Add Guard
            </button>
          )}
        </div>
      </div>

      {showForm && (can('guards:create') || can('guards:update')) && (
        <form onSubmit={handleCreate} className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit Guard' : 'New Guard'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            <input
              required
              className="input"
              placeholder="Guard number"
              value={form.guard_number}
              disabled={!!editingId}
              onChange={(e) => setForm({ ...form, guard_number: e.target.value })}
            />
            <input required className="input" placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <input className="input" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <input className="input" placeholder="Location" value={form.residential_location} onChange={(e) => setForm({ ...form, residential_location: e.target.value })} />
            <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="Active">Active</option>
              <option value="Suspended">Suspended</option>
              <option value="Former">Former</option>
            </select>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary">Save</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <SkeletonTable rows={8} />
      ) : error ? (
        <div style={{ color: 'var(--color-danger)' }}>{error}</div>
      ) : (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px' }}>Number</th>
                <th style={{ padding: '10px 12px' }}>Name</th>
                <th style={{ padding: '10px 12px' }}>Phone</th>
                <th style={{ padding: '10px 12px' }}>Status</th>
                <th style={{ padding: '10px 12px' }}>Location</th>
                {(can('guards:update') || can('guards:delete')) && <th style={{ padding: '10px 12px' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((g) => (
                <tr key={g.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 12px' }}>{g.guard_number}</td>
                  <td style={{ padding: '10px 12px' }}>{g.full_name}</td>
                  <td style={{ padding: '10px 12px' }}>{g.phone || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
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
                  <td style={{ padding: '10px 12px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.residential_location || '—'}</td>
                  {(can('guards:update') || can('guards:delete')) && (
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      {can('guards:update') && (
                        <button onClick={() => startEdit(g)} style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontSize: 13, marginRight: 8 }}>
                          Edit
                        </button>
                      )}
                      {can('guards:delete') && g.status === 'Active' && (
                        <button onClick={() => handleDeactivate(g.id)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 13 }}>
                          Deactivate
                        </button>
                      )}
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
