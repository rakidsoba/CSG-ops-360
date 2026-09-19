import React, { useEffect, useState, useCallback, useRef } from 'react';
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
import { getCurrentPosition } from '../services/native';

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
  const [edits, setEdits] = useState<Record<string, { status: string; notes: string; photoDataUrl?: string; photoFileId?: string }>>({});
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [cameraFor, setCameraFor] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
      setMessage('Offline — changes will queue on this device.');
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
      stopCamera();
    };
  }, [loadRoster]);

  useEffect(() => {
    getCurrentPosition().then((pos) => {
      if (pos) setGps(pos);
    });
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraFor(null);
  };

  const startCamera = async (deploymentId: string) => {
    stopCamera();
    setCameraFor(deploymentId);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setMessage('Camera permission denied or unavailable. Photo is optional when offline.');
      setCameraFor(null);
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !cameraFor) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    setEdits((prev) => ({
      ...prev,
      [cameraFor]: {
        status: prev[cameraFor]?.status || 'present',
        notes: prev[cameraFor]?.notes || '',
        photoDataUrl: dataUrl,
      },
    }));
    stopCamera();
  };

  const uploadPhotoIfNeeded = async (edit: { photoDataUrl?: string; photoFileId?: string }) => {
    if (edit.photoFileId) return edit.photoFileId;
    if (!edit.photoDataUrl || !navigator.onLine) return undefined;
    try {
      const res = await api.post<{ id: string }>('/files/photo', {
        dataUrl: edit.photoDataUrl,
        entity_type: 'attendance',
        original_name: `checkin_${Date.now()}.jpg`,
      });
      return res.id;
    } catch {
      return undefined;
    }
  };

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
        photoDataUrl: prev[key]?.photoDataUrl,
        photoFileId: prev[key]?.photoFileId,
        [field]: value,
      },
    }));
  };

  const submitOne = async (item: RosterItem) => {
    const key = item.deployment_id;
    const edit = edits[key] || { status: 'present', notes: '' };
    const client_event_id = newClientEventId();
    const photo_file_id = await uploadPhotoIfNeeded(edit);

    const payload: QueuedAttendance & { photo_file_id?: string } = {
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
      photo_file_id,
    };

    if (!navigator.onLine) {
      await enqueueAttendance(payload);
      setMessage(`Saved offline: ${item.guard_name}`);
      refreshQueueCount();
      return;
    }

    try {
      const res = await api.post<{ results: { status: string; error?: string; geofence?: { distance_m?: number } }[] }>(
        '/attendance/submit',
        { records: [payload] }
      );
      const r = res.results?.[0];
      if (r?.status === 'rejected') {
        setMessage(r.error || 'Rejected by server');
      } else {
        const dist = r?.geofence?.distance_m;
        setMessage(
          `Recorded: ${item.guard_name} — ${edit.status}` +
            (dist != null ? ` (${dist}m from site)` : '')
        );
        loadRoster();
      }
    } catch (err: any) {
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
        Roster from active deployments. Live camera only (no gallery). Geofence enforced when site GPS is set.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input
          type="date"
          className="input"
          style={{ width: 'auto', minWidth: 140 }}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button className="btn btn-secondary" onClick={loadRoster} disabled={loading}>Refresh</button>
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
        <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--color-text)' }}>{message}</div>
      )}

      {/* Live camera overlay */}
      {cameraFor && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: '#000',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <video ref={videoRef} playsInline muted style={{ flex: 1, width: '100%', objectFit: 'cover' }} />
          <div style={{ display: 'flex', gap: 12, padding: 16, paddingBottom: 'calc(16px + var(--safe-bottom))' }}>
            <button className="btn btn-ghost" style={{ flex: 1, color: '#fff', borderColor: '#fff' }} onClick={stopCamera}>
              Cancel
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={capturePhoto}>
              Capture
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={5} />
      ) : roster.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
          No deployments assigned for this date.
        </div>
      ) : (
        <>
          <button className="btn btn-primary" style={{ width: '100%', marginBottom: 12 }} onClick={submitAllPresent}>
            Mark all remaining as Present
          </button>
          {roster.map((item) => {
            const key = item.deployment_id;
            const currentStatus = edits[key]?.status || item.attendance_status || 'present';
            const locked = !!item.is_locked;
            const hasPhoto = !!edits[key]?.photoDataUrl || !!edits[key]?.photoFileId;
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
                    {edits[key]?.photoDataUrl && (
                      <img
                        src={edits[key].photoDataUrl}
                        alt="Capture"
                        style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 6, marginBottom: 8 }}
                      />
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ flex: 1 }}
                        onClick={() => startCamera(key)}
                      >
                        {hasPhoto ? 'Retake photo' : 'Live photo'}
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ flex: 1 }}
                        onClick={() => submitOne(item)}
                      >
                        Save
                      </button>
                    </div>
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
