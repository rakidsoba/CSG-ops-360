const express = require('express');
const db = require('../config/db');
const { authenticate, requirePermissions } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');

const router = express.Router();
router.use(authenticate);

/**
 * POST /api/corrections
 * Supervisor or Controller requests a change to a locked/confirmed attendance.
 */
router.post('/', requirePermissions('deployments:read'), async (req, res) => {
  const { attendance_id, reason, proposed_status, proposed_notes } = req.body || {};
  if (!attendance_id || !reason || !proposed_status) {
    return res.status(400).json({ error: 'attendance_id, reason, proposed_status required' });
  }
  try {
    const att = await db.query(`SELECT id, is_locked, status FROM attendance_records WHERE id = $1`, [attendance_id]);
    if (!att.rows.length) return res.status(404).json({ error: 'Attendance not found' });

    const { rows } = await db.query(
      `INSERT INTO correction_requests
        (attendance_id, requested_by, reason, proposed_status, proposed_notes)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [attendance_id, req.user.id, reason, proposed_status, proposed_notes || null]
    );
    await writeAudit({
      userId: req.user.id,
      action: 'CORRECTION_REQUEST',
      entityType: 'correction_request',
      entityId: rows[0].id,
      newValue: rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create correction request' });
  }
});

/**
 * GET /api/corrections?status=pending
 * Controller / Super Admin list
 */
router.get('/', requirePermissions('deployments:read'), async (req, res) => {
  // Controllers and above; Super Admin always ok via isSuperAdmin
  const canReview =
    req.user.isSuperAdmin ||
    req.user.roles.includes('Controller') ||
    req.user.roles.includes('Director') ||
    req.user.permissions.includes('deployments:update');

  const status = req.query.status || 'pending';
  const params = [status];
  let where = 'WHERE cr.status = $1';
  if (!canReview) {
    params.push(req.user.id);
    where += ` AND cr.requested_by = $${params.length}`;
  }

  try {
    const { rows } = await db.query(
      `SELECT cr.*,
              ar.attendance_date, ar.status AS current_status, ar.is_locked,
              g.guard_number, g.full_name AS guard_name,
              s.name AS site_name,
              u.full_name AS requester_name
       FROM correction_requests cr
       JOIN attendance_records ar ON ar.id = cr.attendance_id
       JOIN security_guards g ON g.id = ar.guard_id
       JOIN client_sites s ON s.id = ar.site_id
       JOIN users u ON u.id = cr.requested_by
       ${where}
       ORDER BY cr.created_at DESC
       LIMIT 100`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list corrections' });
  }
});

/**
 * POST /api/corrections/:id/review
 * Body: { decision: 'approved' | 'rejected', review_notes }
 * Controller / Super Admin only
 */
router.post('/:id/review', requirePermissions('deployments:update'), async (req, res) => {
  const { decision, review_notes } = req.body || {};
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows: reqs } = await client.query(
      `SELECT * FROM correction_requests WHERE id = $1 FOR UPDATE`,
      [req.params.id]
    );
    if (!reqs.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Correction request not found' });
    }
    const cr = reqs[0];
    if (cr.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Already reviewed' });
    }

    await client.query(
      `UPDATE correction_requests
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_notes = $3, updated_at = NOW()
       WHERE id = $4`,
      [decision, req.user.id, review_notes || null, cr.id]
    );

    if (decision === 'approved') {
      // Apply change and keep locked
      await client.query(
        `UPDATE attendance_records
         SET status = $1, notes = COALESCE($2, notes), updated_at = NOW()
         WHERE id = $3`,
        [cr.proposed_status, cr.proposed_notes, cr.attendance_id]
      );
    }

    await client.query('COMMIT');

    await writeAudit({
      userId: req.user.id,
      action: decision === 'approved' ? 'CORRECTION_APPROVED' : 'CORRECTION_REJECTED',
      entityType: 'correction_request',
      entityId: cr.id,
      newValue: { decision, attendance_id: cr.attendance_id },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ ok: true, decision });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Review failed' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/attendance/:id/confirm  — also exposed via corrections router mount alternative
 * Controller locks the record.
 */
module.exports = router;
