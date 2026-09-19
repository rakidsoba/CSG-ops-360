const express = require('express');
const db = require('../config/db');
const { authenticate, requirePermissions } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { hashPassword } = require('../utils/password'); // for PIN if needed

const router = express.Router();

router.use(authenticate);

// LIST
router.get('/', requirePermissions('guards:read'), async (req, res) => {
  try {
    const { status, q, page = 1, limit = 50 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, parseInt(limit, 10));
    const params = [];
    let where = 'WHERE 1=1';
    if (status) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (full_name ILIKE $${params.length} OR guard_number ILIKE $${params.length})`;
    }
    params.push(Math.min(100, parseInt(limit, 10)), offset);
    const { rows } = await db.query(
      `SELECT id, guard_number, full_name, phone, status, hired_at, separated_at, residential_location, date_of_birth, created_at, updated_at
       FROM security_guards ${where}
       ORDER BY full_name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countRes = await db.query(`SELECT COUNT(*)::int AS total FROM security_guards ${where}`, params.slice(0, -2));
    res.json({ data: rows, total: countRes.rows[0].total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list guards' });
  }
});

// GET ONE
router.get('/:id', requirePermissions('guards:read'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, guard_number, full_name, phone, status, hired_at, separated_at, residential_location, date_of_birth, created_at, updated_at
       FROM security_guards WHERE id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Guard not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch guard' });
  }
});

// CREATE
router.post('/', requirePermissions('guards:create'), async (req, res) => {
  const { guard_number, full_name, phone, status = 'Active', hired_at, residential_location, date_of_birth, pin } = req.body || {};
  if (!guard_number || !full_name) {
    return res.status(400).json({ error: 'guard_number and full_name are required' });
  }
  try {
    let pin_hash = null;
    if (pin) {
      const { hashPassword } = require('../utils/password');
      pin_hash = await hashPassword(String(pin));
    }
    const { rows } = await db.query(
      `INSERT INTO security_guards (guard_number, full_name, phone, status, hired_at, residential_location, date_of_birth, pin_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, guard_number, full_name, phone, status, hired_at, separated_at, residential_location, date_of_birth, created_at, updated_at`,
      [guard_number, full_name, phone || null, status, hired_at || null, residential_location || null, date_of_birth || null, pin_hash]
    );
    await writeAudit({
      userId: req.user.id,
      action: 'CREATE',
      entityType: 'security_guard',
      entityId: rows[0].id,
      newValue: rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Guard number already exists' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create guard' });
  }
});

// UPDATE
router.patch('/:id', requirePermissions('guards:update'), async (req, res) => {
  const allowed = ['full_name', 'phone', 'status', 'hired_at', 'separated_at', 'separation_reason', 'residential_location', 'date_of_birth'];
  const updates = [];
  const params = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      params.push(req.body[key]);
      updates.push(`${key} = $${params.length}`);
    }
  }
  if (req.body.pin) {
    const { hashPassword } = require('../utils/password');
    params.push(await hashPassword(String(req.body.pin)));
    updates.push(`pin_hash = $${params.length}`);
  }
  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });

  params.push(req.params.id);
  try {
    const old = await db.query(`SELECT * FROM security_guards WHERE id = $1`, [req.params.id]);
    if (!old.rows.length) return res.status(404).json({ error: 'Guard not found' });

    const { rows } = await db.query(
      `UPDATE security_guards SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length}
       RETURNING id, guard_number, full_name, phone, status, hired_at, separated_at, residential_location, date_of_birth, created_at, updated_at`,
      params
    );
    await writeAudit({
      userId: req.user.id,
      action: 'UPDATE',
      entityType: 'security_guard',
      entityId: rows[0].id,
      oldValue: old.rows[0],
      newValue: rows[0],
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update guard' });
  }
});

// SOFT DELETE / deactivate
router.delete('/:id', requirePermissions('guards:delete'), async (req, res) => {
  try {
    const old = await db.query(`SELECT * FROM security_guards WHERE id = $1`, [req.params.id]);
    if (!old.rows.length) return res.status(404).json({ error: 'Guard not found' });

    const { rows } = await db.query(
      `UPDATE security_guards SET status = 'Former', separated_at = COALESCE(separated_at, CURRENT_DATE), updated_at = NOW()
       WHERE id = $1
       RETURNING id, guard_number, full_name, status, separated_at`,
      [req.params.id]
    );
    await writeAudit({
      userId: req.user.id,
      action: 'DEACTIVATE',
      entityType: 'security_guard',
      entityId: rows[0].id,
      oldValue: { status: old.rows[0].status },
      newValue: { status: 'Former' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate guard' });
  }
});

module.exports = router;
