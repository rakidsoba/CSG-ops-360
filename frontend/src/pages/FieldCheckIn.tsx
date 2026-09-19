import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  enqueueAttendance,
  flushQueue,
  getQueuedAttendance,
  newClientEventId,
  QueuedAttendance,
} from '../services/offlineQueue';
import { SkeletonTable } from '../components/Skeleton';

interface RosterItem {
  deployment_id: string;
  guard_id: string;
  site_id: string;
  shift_id: string;
  guard_number: string;
  guard_name: string;
  site_code: string;
  site_name: string;
  shift_name: string;
  shift_type: string;
  attendance_id?: string;
  attendance_status?: string;
  is_locked?: boolean;
  latitude?: number;
  longitude?: number;
  geofence_radius?: number;
}

const STATUSES = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
  { value: 'redeployed', label: 'Redeployed' },
  { value: 'replaced', label: 'Replaced' },
  { value: 'deserted', label: 'Deserted' },
  { value: 'on_leave', label: 'On leave' },
];

export function FieldCheckIn() {
  const { can } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [edits, setEdits] = useState<Record<string, { status: string; notes: string }>>({});
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);

  const refreshQueueCount = useCallback(async () => {
    const q = await getQueuedAttendance();
    setQueueCount(q.length);
  }, []);

  const loadRoster = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await api.get<{ data: RosterItem[] }>(`/attendance/roster?date=${date}`);
      setRoster(res.data);
      setOffline(false);
    } catch {
      setOffline(true);
      setMessage('Offline — showing last known data if available. Changes will queue.');
    } finally {
      setLoading(false);
      refreshQueueCount();
    }
  }, [date, refreshQueueCount]);

  useEffect(() => {
    loadRoster();
    const onOnline = () => {
      setOffline(false);
      flushAndReload();
    };
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [loadRoster]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const flushAndReload = async () => {
    setSyncing(true);
    try {
      const synced = await flushQueue(async (records) => {
        return api.post<{ results: { client_event_id: string; status: string }[] }>(
          '/attendance/sync',
          { records }
        );
      });
      if (synced > 0) setMessage(`Synced ${synced} offline record(s).`);
      await loadRoster();
    } finally {
      setSyncing(false);
      refreshQueueCount();
    }
  };

  const setEdit = (key: string, field: 'status' | 'notes', value: string) => {
    setEdits((prev) => ({
      ...prev,
      [key]: {
        status: prev[key]?.status || 'present',
        notes: prev[key]?.notes || '',
        [field]: value,
      },
    }));
  };

  const submitOne = async (item: RosterItem) => {
    const key = item.deployment_id;
    const edit = edits[key] || { status: 'present', notes: '' };
    const client_event_id = newClientEventId();
    const payload: QueuedAttendance = {
      client_event_id,
      deployment_id: item.deployment_id,
      guard_id: item.guard_id,
      site_id: item.site_id,
      shift_id: item.shift_id,
      attendance_date: date,
      status: edit.status,
      notes: edit.notes || undefined,
      captured_at: new Date().toISOString(),
      latitude: gps?.lat,
      longitude: gps?.lng,
      gps_accuracy_m: gps?.accuracy,
      pin_confirmed: edit.status === 'present',
      created_local: new Date().toISOString(),
    };

    if (!navigator.onLine) {
      await enqueueAttendance(payload);
      setMessage(`Saved offline: ${item.guard_name}`);
      refreshQueueCount();
      return;
    }

    try {
      await api.post('/attendance/submit', { records: [payload] });
      setMessage(`Recorded: ${item.guard_name} — ${edit.status}`);
      loadRoster();
    } catch {
      await enqueueAttendance(payload);
      setMessage(`Network issue — queued offline: ${item.guard_name}`);
      refreshQueueCount();
    }
  };

  const submitAllPresent = async () => {
    const unmarked = roster.filter((r) => !r.attendance_id && !r.is_locked);
    for (const item of unmarked) {
      if (!edits[item.deployment_id]) {
        setEdits((prev) => ({ ...prev, [item.deployment_id]: { status: 'present', notes: '' } }));
      }
    }
    // sequential to keep UI simple on low-end devices
    for (const item of unmarked) {
      await submitOne(item);
    }
  };

  if (!can('deployments:read')) {
    return <div className="page"><p>You do not have access to field check-in.</p></div>;
  }

  return (
    <div className="page">
      <h1 className="page-title">Field Check-In</h1>
      <p className="page-sub">
        Roster from active deployments. Mark exceptions only — unmarked = present after save.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input
          type="date"
          className="input"
          style={{ width: 'auto', minWidth: 140 }}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button className="btn btn-secondary" onClick={loadRoster} disabled={loading}>
          Refresh
        </button>
        {queueCount > 0 && (
          <button className="btn btn-primary" onClick={flushAndReload} disabled={syncing || offline}>
            {syncing ? 'Syncing…' : `Sync ${queueCount} offline`}
          </button>
        )}
      </div>

      {(offline || queueCount > 0) && (
        <div
          style={{
            padding: '10px 12px',
            marginBottom: 12,
            borderRadius: 'var(--radius-sm)',
            background: offline ? '#fde8e8' : '#fff8e1',
            color: offline ? 'var(--color-danger)' : 'var(--color-warning)',
            fontSize: 13,
          }}
        >
          {offline ? 'You are offline. Submissions are queued on this device.' : `${queueCount} record(s) waiting to sync.`}
          {gps && (
            <span style={{ display: 'block', marginTop: 4, opacity: 0.85 }}>
              GPS: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)} (±{Math.round(gps.accuracy)}m)
            </span>
          )}
        </div>
      )}

      {message && (
        <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--color-success)' }}>{message}</div>
      )}

      {loading ? (
        <SkeletonTable rows={5} />
      ) : roster.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
          No deployments assigned for this date.
        </div>
      ) : (
        <>
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginBottom: 12 }}
            onClick={submitAllPresent}
          >
            Mark all remaining as Present
          </button>
          {roster.map((item) => {
            const key = item.deployment_id;
            const currentStatus = edits[key]?.status || item.attendance_status || 'present';
            const locked = !!item.is_locked;
            return (
              <div key={key} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.guard_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {item.guard_number} · {item.site_name} · {item.shift_name || item.shift_type}
                    </div>
                  </div>
                  {item.attendance_status && (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: item.attendance_status === 'present' ? '#e6f4ea' : '#fde8e8',
                        color: item.attendance_status === 'present' ? 'var(--color-success)' : 'var(--color-danger)',
                        alignSelf: 'flex-start',
                      }}
                    >
                      {item.attendance_status}
                      {locked ? ' (locked)' : ''}
                    </span>
                  )}
                </div>
                {!locked && (
                  <>
                    <select
                      className="select"
                      style={{ marginBottom: 8 }}
                      value={currentStatus}
                      onChange={(e) => setEdit(key, 'status', e.target.value)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                    <input
                      className="input"
                      placeholder="Notes (optional)"
                      style={{ marginBottom: 8 }}
                      value={edits[key]?.notes || ''}
                      onChange={(e) => setEdit(key, 'notes', e.target.value)}
                    />
                    <button
                      className="btn btn-secondary"
                      style={{ width: '100%' }}
                      onClick={() => submitOne(item)}
                    >
                      Save
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
