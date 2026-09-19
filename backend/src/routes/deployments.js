const express = require('express');
const db = require('../config/db');
const { authenticate, requirePermissions } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermissions('deployments:read'), async (req, res) => {
  try {
    const { active, site_id, guard_id, page = 1, limit = 50 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, parseInt(limit, 10));
    const params = [];
    let where = 'WHERE 1=1';
    if (active !== undefined) { params.push(active === 'true' || active === true); where += ` AND d.active = $${params.length}`; }
    if (site_id) { params.push(site_id); where += ` AND d.site_id = $${params.length}`; }
    if (guard_id) { params.push(guard_id); where += ` AND d.guard_id = $${params.length}`; }
    params.push(Math.min(100, parseInt(limit, 10)), offset);

    const { rows } = await db.query(
      `SELECT d.*,
              g.guard_number, g.full_name AS guard_name, g.status AS guard_status,
              s.site_code, s.name AS site_name,
              sh.type AS shift_type, sh.name AS shift_name, sh.start_time, sh.end_time,
              u.full_name AS supervisor_name
       FROM deployments d
       JOIN security_guards g ON g.id = d.guard_id
       JOIN client_sites s ON s.id = d.site_id
       JOIN shifts sh ON sh.id = d.shift_id
       LEFT JOIN users u ON u.id = d.supervisor_id
       ${where}
       ORDER BY d.effective_from DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countRes = await db.query(`SELECT COUNT(*)::int AS total FROM deployments d ${where}`, params.slice(0, -2));
    res.json({ data: rows, total: countRes.rows[0].total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list deployments' });
  }
});

router.get('/:id', requirePermissions('deployments:read'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT d.*, g.guard_number, g.full_name AS guard_name, s.site_code, s.name AS site_name, sh.type AS shift_type
     FROM deployments d
     JOIN security_guards g ON g.id = d.guard_id
     JOIN client_sites s ON s.id = d.site_id
     JOIN shifts sh ON sh.id = d.shift_id
     WHERE d.id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Deployment not found' });
  res.json(rows[0]);
});

router.post('/', requirePermissions('deployments:create'), async (req, res) => {
  const b = req.body || {};
  if (!b.guard_id || !b.site_id || !b.shift_id || !b.effective_from) {
    return res.status(400).json({ error: 'guard_id, site_id, shift_id, effective_from required' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO deployments (guard_id, site_id, shift_id, supervisor_id, effective_from, effective_to, active, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [b.guard_id, b.site_id, b.shift_id, b.supervisor_id || null, b.effective_from, b.effective_to || null, b.active !== false, b.notes || null]
    );
    await writeAudit({ userId: req.user.id, action: 'CREATE', entityType: 'deployment', entityId: rows[0].id, newValue: rows[0], ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create deployment' });
  }
});

router.patch('/:id', requirePermissions('deployments:update'), async (req, res) => {
  const allowed = ['supervisor_id', 'effective_from', 'effective_to', 'active', 'notes', 'shift_id', 'site_id'];
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
  const old = await db.query(`SELECT * FROM deployments WHERE id = $1`, [req.params.id]);
  if (!old.rows.length) return res.status(404).json({ error: 'Deployment not found' });
  const { rows } = await db.query(`UPDATE deployments SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`, params);
  await writeAudit({ userId: req.user.id, action: 'UPDATE', entityType: 'deployment', entityId: rows[0].id, oldValue: old.rows[0], newValue: rows[0], ipAddress: req.ip, userAgent: req.get('user-agent') });
  res.json(rows[0]);
});

router.delete('/:id', requirePermissions('deployments:delete'), async (req, res) => {
  const old = await db.query(`SELECT * FROM deployments WHERE id = $1`, [req.params.id]);
  if (!old.rows.length) return res.status(404).json({ error: 'Deployment not found' });
  const { rows } = await db.query(`UPDATE deployments SET active = false, updated_at = NOW() WHERE id = $1 RETURNING *`, [req.params.id]);
  await writeAudit({ userId: req.user.id, action: 'DEACTIVATE', entityType: 'deployment', entityId: rows[0].id, oldValue: { active: true }, newValue: { active: false }, ipAddress: req.ip, userAgent: req.get('user-agent') });
  res.json(rows[0]);
});

module.exports = router;
