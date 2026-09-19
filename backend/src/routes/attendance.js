const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { authenticate, requirePermissions } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { checkGeofence } = require('../utils/geo');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/attendance/roster?date=YYYY-MM-DD&site_id=...
 * Returns expected roster for a site/day derived from active deployments.
 * Supervisor only needs to log exceptions.
 */
router.get('/roster', requirePermissions('deployments:read'), async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const { site_id, shift_id } = req.query;
  try {
    const params = [date];
    let where = `WHERE d.active = true
      AND d.effective_from <= $1
      AND (d.effective_to IS NULL OR d.effective_to >= $1)`;
    if (site_id) {
      params.push(site_id);
      where += ` AND d.site_id = $${params.length}`;
    }
    if (shift_id) {
      params.push(shift_id);
      where += ` AND d.shift_id = $${params.length}`;
    }

    // Only show sites the supervisor is assigned to (if not Super Admin / Controller)
    if (!req.user.isSuperAdmin && !req.user.roles.includes('Controller') && !req.user.roles.includes('Director')) {
      params.push(req.user.id);
      where += ` AND d.supervisor_id = $${params.length}`;
    }

    const { rows } = await db.query(
      `SELECT d.id AS deployment_id, d.guard_id, d.site_id, d.shift_id,
              g.guard_number, g.full_name AS guard_name, g.phone AS guard_phone,
              s.site_code, s.name AS site_name, s.latitude, s.longitude, s.geofence_radius,
              sh.type AS shift_type, sh.name AS shift_name, sh.start_time, sh.end_time,
              ar.id AS attendance_id, ar.status AS attendance_status, ar.is_locked,
              ar.captured_at, ar.notes AS attendance_notes
       FROM deployments d
       JOIN security_guards g ON g.id = d.guard_id AND g.status = 'Active'
       JOIN client_sites s ON s.id = d.site_id AND s.operational_status = 'active'
       JOIN shifts sh ON sh.id = d.shift_id
       LEFT JOIN attendance_records ar
         ON ar.guard_id = d.guard_id
        AND ar.site_id = d.site_id
        AND ar.shift_id = d.shift_id
        AND ar.attendance_date = $1
       ${where}
       ORDER BY s.name, sh.start_time, g.full_name`,
      params
    );
    res.json({ date, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load roster' });
  }
});

/**
 * POST /api/attendance/submit
 * Single or batch attendance submission (online path).
 * Body: { records: [ { deployment_id, guard_id, site_id, shift_id, attendance_date,
 *   status, notes, captured_at, latitude, longitude, gps_accuracy_m, client_event_id, pin_confirmed } ] }
 */
router.post('/submit', requirePermissions('deployments:read'), async (req, res) => {
  const records = Array.isArray(req.body?.records) ? req.body.records : [req.body];
  if (!records.length) return res.status(400).json({ error: 'No records provided' });

  const results = [];
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    for (const rec of records) {
      if (!rec.guard_id || !rec.site_id || !rec.shift_id || !rec.attendance_date || !rec.captured_at) {
        results.push({ client_event_id: rec.client_event_id, status: 'rejected', error: 'Missing required fields' });
        continue;
      }
      // Dedup by client_event_id if present
      if (rec.client_event_id) {
        const existing = await client.query(
          `SELECT id FROM sync_events WHERE user_id = $1 AND client_event_id = $2`,
          [req.user.id, rec.client_event_id]
        );
        if (existing.rows.length) {
          results.push({ client_event_id: rec.client_event_id, status: 'duplicate' });
          continue;
        }
      }

      // Geofence check when site has coordinates
      const siteRes = await client.query(
        `SELECT latitude, longitude, geofence_radius FROM client_sites WHERE id = $1`,
        [rec.site_id]
      );
      let geoMeta = null;
      if (siteRes.rows.length) {
        const site = siteRes.rows[0];
        const geo = checkGeofence(
          rec.latitude, rec.longitude,
          site.latitude, site.longitude,
          site.geofence_radius
        );
        geoMeta = geo;
        // Enforce only when site has GPS; otherwise warn but allow
        if (!geo.ok && site.latitude != null && site.longitude != null) {
          results.push({
            client_event_id: rec.client_event_id,
            status: 'rejected',
            error: geo.reason,
            geofence: geo,
          });
          continue;
        }
      }

      const status = rec.status || 'present';
      const { rows } = await client.query(
        `INSERT INTO attendance_records
          (deployment_id, guard_id, site_id, shift_id, attendance_date, status, notes,
           captured_at, synced_at, submitted_by, client_event_id, latitude, longitude, gps_accuracy_m, photo_file_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9,$10,$11,$12,$13,$14)
         ON CONFLICT (guard_id, site_id, shift_id, attendance_date)
         DO UPDATE SET
           status = EXCLUDED.status,
           notes = COALESCE(EXCLUDED.notes, attendance_records.notes),
           captured_at = EXCLUDED.captured_at,
           synced_at = NOW(),
           latitude = COALESCE(EXCLUDED.latitude, attendance_records.latitude),
           longitude = COALESCE(EXCLUDED.longitude, attendance_records.longitude),
           gps_accuracy_m = COALESCE(EXCLUDED.gps_accuracy_m, attendance_records.gps_accuracy_m),
           photo_file_id = COALESCE(EXCLUDED.photo_file_id, attendance_records.photo_file_id),
           updated_at = NOW()
         WHERE attendance_records.is_locked = false
         RETURNING id, status, is_locked`,
        [
          rec.deployment_id || null,
          rec.guard_id,
          rec.site_id,
          rec.shift_id,
          rec.attendance_date,
          status,
          rec.notes || null,
          rec.captured_at,
          req.user.id,
          rec.client_event_id || null,
          rec.latitude || null,
          rec.longitude || null,
          rec.gps_accuracy_m || null,
          rec.photo_file_id || null,
        ]
      );

      if (!rows.length) {
        results.push({ client_event_id: rec.client_event_id, status: 'rejected', error: 'Record locked or conflict' });
        continue;
      }

      if (rec.client_event_id) {
        await client.query(
          `INSERT INTO sync_events (client_event_id, user_id, event_type, payload, status, result_ref)
           VALUES ($1,$2,'attendance_submit',$3,'accepted',$4)`,
          [rec.client_event_id, req.user.id, JSON.stringify(rec), rows[0].id]
        );
      }

      if (rec.pin_confirmed !== undefined) {
        await client.query(
          `INSERT INTO guard_pin_confirmations (attendance_id, guard_id, confirmed, captured_at)
           VALUES ($1,$2,$3,$4)`,
          [rows[0].id, rec.guard_id, !!rec.pin_confirmed, rec.captured_at]
        );
      }

      results.push({ client_event_id: rec.client_event_id, status: 'accepted', attendance_id: rows[0].id, geofence: geoMeta });
    }
    await client.query('COMMIT');

    await writeAudit({
      userId: req.user.id,
      action: 'ATTENDANCE_SUBMIT',
      entityType: 'attendance_batch',
      newValue: { count: results.length, accepted: results.filter((r) => r.status === 'accepted').length },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ results });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Attendance submit failed' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/attendance/sync
 * Offline batch sync endpoint. Same shape as submit but optimised for queues.
 */
router.post('/sync', requirePermissions('deployments:read'), async (req, res) => {
  // Re-use submit logic by forwarding
  req.url = '/submit';
  return router.handle(req, res);
});

/**
 * GET /api/attendance
 * List attendance records (Controller / HR / Super Admin)
 */
router.get('/', requirePermissions('deployments:read'), async (req, res) => {
  const { date, site_id, status, page = 1, limit = 50 } = req.query;
  const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, parseInt(limit, 10));
  const params = [];
  let where = 'WHERE 1=1';
  if (date) { params.push(date); where += ` AND ar.attendance_date = $${params.length}`; }
  if (site_id) { params.push(site_id); where += ` AND ar.site_id = $${params.length}`; }
  if (status) { params.push(status); where += ` AND ar.status = $${params.length}`; }
  params.push(Math.min(100, parseInt(limit, 10)), offset);

  try {
    const { rows } = await db.query(
      `SELECT ar.*, g.guard_number, g.full_name AS guard_name,
              s.site_code, s.name AS site_name, sh.name AS shift_name
       FROM attendance_records ar
       JOIN security_guards g ON g.id = ar.guard_id
       JOIN client_sites s ON s.id = ar.site_id
       JOIN shifts sh ON sh.id = ar.shift_id
       ${where}
       ORDER BY ar.attendance_date DESC, s.name
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list attendance' });
  }
});


/**
 * POST /api/attendance/:id/confirm
 * Controller locks the attendance record.
 */
router.post('/:id/confirm', requirePermissions('deployments:update'), async (req, res) => {
  try {
    const { rows: existing } = await db.query(
      `SELECT id, is_locked, status FROM attendance_records WHERE id = $1`,
      [req.params.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Attendance not found' });
    if (existing[0].is_locked) return res.status(400).json({ error: 'Already locked' });

    const { rows } = await db.query(
      `UPDATE attendance_records
       SET is_locked = true, confirmed_at = NOW(), confirmed_by = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, status, is_locked, confirmed_at`,
      [req.user.id, req.params.id]
    );

    await writeAudit({
      userId: req.user.id,
      action: 'ATTENDANCE_CONFIRM',
      entityType: 'attendance_record',
      entityId: rows[0].id,
      newValue: { is_locked: true },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Confirm failed' });
  }
});


module.exports = router;
