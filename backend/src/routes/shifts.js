const express = require('express');
const db = require('../config/db');
const { authenticate, requirePermissions } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermissions('shifts:read'), async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM shifts ORDER BY start_time`);
  res.json({ data: rows });
});

router.get('/:id', requirePermissions('shifts:read'), async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM shifts WHERE id = $1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Shift not found' });
  res.json(rows[0]);
});

router.post('/', requirePermissions('shifts:create'), async (req, res) => {
  const { type, name, start_time, end_time, description } = req.body || {};
  if (!type || !name || !start_time || !end_time) return res.status(400).json({ error: 'type, name, start_time, end_time required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO shifts (type, name, start_time, end_time, description) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [type, name, start_time, end_time, description || null]
    );
    await writeAudit({ userId: req.user.id, action: 'CREATE', entityType: 'shift', entityId: rows[0].id, newValue: rows[0], ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Shift type already exists' });
    res.status(500).json({ error: 'Failed to create shift' });
  }
});

router.patch('/:id', requirePermissions('shifts:update'), async (req, res) => {
  const allowed = ['name', 'start_time', 'end_time', 'description', 'is_active'];
  const updates = [];
  const params = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      params.push(req.body[key]);
      updates.push(`${key} = $${params.length}`);
    }
  }
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });
  params.push(req.params.id);
  const old = await db.query(`SELECT * FROM shifts WHERE id = $1`, [req.params.id]);
  if (!old.rows.length) return res.status(404).json({ error: 'Shift not found' });
  const { rows } = await db.query(`UPDATE shifts SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`, params);
  await writeAudit({ userId: req.user.id, action: 'UPDATE', entityType: 'shift', entityId: rows[0].id, oldValue: old.rows[0], newValue: rows[0], ipAddress: req.ip, userAgent: req.get('user-agent') });
  res.json(rows[0]);
});

router.delete('/:id', requirePermissions('shifts:delete'), async (req, res) => {
  const old = await db.query(`SELECT * FROM shifts WHERE id = $1`, [req.params.id]);
  if (!old.rows.length) return res.status(404).json({ error: 'Shift not found' });
  const { rows } = await db.query(`UPDATE shifts SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *`, [req.params.id]);
  await writeAudit({ userId: req.user.id, action: 'DEACTIVATE', entityType: 'shift', entityId: rows[0].id, oldValue: { is_active: true }, newValue: { is_active: false }, ipAddress: req.ip, userAgent: req.get('user-agent') });
  res.json(rows[0]);
});

module.exports = router;
