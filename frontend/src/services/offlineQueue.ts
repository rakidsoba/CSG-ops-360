/**
 * IndexedDB offline queue for attendance submissions.
 * Works on Android, iOS (Safari 15.4+), and desktop browsers.
 */

const DB_NAME = 'csg-ops-offline';
const STORE = 'attendance_queue';
const DB_VERSION = 1;

export interface QueuedAttendance {
  client_event_id: string;
  deployment_id?: string;
  guard_id: string;
  site_id: string;
  shift_id: string;
  attendance_date: string;
  status: string;
  notes?: string;
  captured_at: string;
  latitude?: number;
  longitude?: number;
  gps_accuracy_m?: number;
  pin_confirmed?: boolean;
  photo_file_id?: string;
  created_local: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'client_event_id' });
      }
    };
  });
}

export async function enqueueAttendance(record: QueuedAttendance): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueuedAttendance(): Promise<QueuedAttendance[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueued(clientEventId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(clientEventId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearQueue(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Attempt to flush queue to server. Returns number successfully synced. */
export async function flushQueue(
  submitFn: (records: QueuedAttendance[]) => Promise<{ results: { client_event_id: string; status: string }[] }>
): Promise<number> {
  const queue = await getQueuedAttendance();
  if (!queue.length) return 0;
  try {
    const res = await submitFn(queue);
    let synced = 0;
    for (const r of res.results || []) {
      if (r.status === 'accepted' || r.status === 'duplicate') {
        await removeQueued(r.client_event_id);
        synced++;
      }
    }
    return synced;
  } catch {
    return 0; // stay offline
  }
}

export function newClientEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
