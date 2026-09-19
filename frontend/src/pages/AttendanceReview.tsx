import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { SkeletonTable } from '../components/Skeleton';

interface AttendanceRow {
  id: string;
  attendance_date: string;
  status: string;
  is_locked: boolean;
  notes: string | null;
  guard_number: string;
  guard_name: string;
  site_name: string;
  shift_name: string;
  captured_at: string;
  photo_file_id: string | null;
}

interface CorrectionRow {
  id: string;
  attendance_id: string;
  reason: string;
  proposed_status: string;
  proposed_notes: string | null;
  status: string;
  guard_name: string;
  site_name: string;
  attendance_date: string;
  current_status: string;
  requester_name: string;
  created_at: string;
}

export function AttendanceReview() {
  const { can, user } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'attendance' | 'corrections'>('attendance');
  const [msg, setMsg] = useState('');

  const canConfirm = can('deployments:update') || user?.isSuperAdmin;

  const load = async () => {
    setLoading(true);
    try {
      const [att, corr] = await Promise.all([
        api.get<{ data: AttendanceRow[] }>(`/attendance?date=${date}&limit=100`),
        api.get<{ data: CorrectionRow[] }>('/corrections?status=pending'),
      ]);
      setRows(att.data);
      setCorrections(corr.data);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [date]);

  const confirm = async (id: string) => {
    try {
      await api.post(`/attendance/${id}/confirm`, {});
      setMsg('Attendance locked');
      load();
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  const review = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      await api.post(`/corrections/${id}/review`, { decision });
      setMsg(`Correction ${decision}`);
      load();
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Attendance Review</h1>
      <p className="page-sub">Controller confirmation and correction requests. Locked records cannot be edited without approval.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          className="btn"
          style={{ background: tab === 'attendance' ? 'var(--color-accent)' : 'var(--color-surface)', color: tab === 'attendance' ? '#fff' : 'var(--color-text)', border: '1px solid var(--color-border)' }}
          onClick={() => setTab('attendance')}
        >
          Attendance
        </button>
        <button
          className="btn"
          style={{ background: tab === 'corrections' ? 'var(--color-accent)' : 'var(--color-surface)', color: tab === 'corrections' ? '#fff' : 'var(--color-text)', border: '1px solid var(--color-border)' }}
          onClick={() => setTab('corrections')}
        >
          Corrections ({corrections.length})
        </button>
        <input type="date" className="input" style={{ width: 'auto' }} value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn btn-secondary" onClick={load}>Refresh</button>
      </div>

      {msg && <div style={{ marginBottom: 12, fontSize: 13 }}>{msg}</div>}

      {loading ? (
        <SkeletonTable rows={6} />
      ) : tab === 'attendance' ? (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)', textAlign: 'left' }}>
                <th style={{ padding: 10 }}>Guard</th>
                <th style={{ padding: 10 }}>Site</th>
                <th style={{ padding: 10 }}>Status</th>
                <th style={{ padding: 10 }}>Captured</th>
                <th style={{ padding: 10 }}>Lock</th>
                {canConfirm && <th style={{ padding: 10 }}></th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)' }}>No records for this date</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td style={{ padding: 10 }}>{r.guard_number} — {r.guard_name}</td>
                  <td style={{ padding: 10 }}>{r.site_name}</td>
                  <td style={{ padding: 10 }}>{r.status}</td>
                  <td style={{ padding: 10 }}>{r.captured_at ? new Date(r.captured_at).toLocaleString() : '—'}</td>
                  <td style={{ padding: 10 }}>{r.is_locked ? 'Locked' : 'Open'}</td>
                  {canConfirm && (
                    <td style={{ padding: 10 }}>
                      {!r.is_locked && (
                        <button className="btn btn-primary" style={{ minHeight: 36, padding: '6px 12px', fontSize: 12 }} onClick={() => confirm(r.id)}>
                          Confirm
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          {corrections.length === 0 ? (
            <div className="card" style={{ color: 'var(--color-text-muted)' }}>No pending correction requests.</div>
          ) : corrections.map((c) => (
            <div key={c.id} className="card">
              <div style={{ fontWeight: 600 }}>{c.guard_name} · {c.site_name}</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
                {c.attendance_date} · current: {c.current_status} → proposed: {c.proposed_status}
              </div>
              <div style={{ fontSize: 13, marginTop: 8 }}>{c.reason}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                Requested by {c.requester_name} · {new Date(c.created_at).toLocaleString()}
              </div>
              {canConfirm && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => review(c.id, 'approved')}>Approve</button>
                  <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => review(c.id, 'rejected')}>Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
