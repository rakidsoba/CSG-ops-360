const express = require('express');
const db = require('../config/db');
const { authenticate, requirePermissions } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermissions('sites:read'), async (req, res) => {
  try {
    const { status, q, page = 1, limit = 50 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, parseInt(limit, 10));
    const params = [];
    let where = 'WHERE 1=1';
    if (status) { params.push(status); where += ` AND operational_status = $${params.length}`; }
    if (q) { params.push(`%${q}%`); where += ` AND (name ILIKE $${params.length} OR site_code ILIKE $${params.length} OR client_name ILIKE $${params.length})`; }
    params.push(Math.min(100, parseInt(limit, 10)), offset);
    const { rows } = await db.query(
      `SELECT id, site_code, name, client_name, address, latitude, longitude, geofence_radius, operational_status, required_visit_frequency, notes, created_at, updated_at
       FROM client_sites ${where} ORDER BY name ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countRes = await db.query(`SELECT COUNT(*)::int AS total FROM client_sites ${where}`, params.slice(0, -2));
    res.json({ data: rows, total: countRes.rows[0].total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list sites' });
  }
});

router.get('/:id', requirePermissions('sites:read'), async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM client_sites WHERE id = $1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Site not found' });
  res.json(rows[0]);
});

router.post('/', requirePermissions('sites:create'), async (req, res) => {
  const b = req.body || {};
  if (!b.site_code || !b.name) return res.status(400).json({ error: 'site_code and name required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO client_sites (site_code, name, client_name, address, latitude, longitude, geofence_radius, operational_status, required_visit_frequency, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [b.site_code, b.name, b.client_name || null, b.address || null, b.latitude || null, b.longitude || null, b.geofence_radius || 150, b.operational_status || 'active', b.required_visit_frequency || 'daily', b.notes || null]
    );
    await writeAudit({ userId: req.user.id, action: 'CREATE', entityType: 'client_site', entityId: rows[0].id, newValue: rows[0], ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Site code already exists' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create site' });
  }
});

router.patch('/:id', requirePermissions('sites:update'), async (req, res) => {
  const allowed = ['name', 'client_name', 'address', 'latitude', 'longitude', 'geofence_radius', 'operational_status', 'required_visit_frequency', 'notes'];
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
  try {
    const old = await db.query(`SELECT * FROM client_sites WHERE id = $1`, [req.params.id]);
    if (!old.rows.length) return res.status(404).json({ error: 'Site not found' });
    const { rows } = await db.query(
      `UPDATE client_sites SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
      params
    );
    await writeAudit({ userId: req.user.id, action: 'UPDATE', entityType: 'client_site', entityId: rows[0].id, oldValue: old.rows[0], newValue: rows[0], ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update site' });
  }
});

router.delete('/:id', requirePermissions('sites:delete'), async (req, res) => {
  try {
    const old = await db.query(`SELECT * FROM client_sites WHERE id = $1`, [req.params.id]);
    if (!old.rows.length) return res.status(404).json({ error: 'Site not found' });
    const { rows } = await db.query(
      `UPDATE client_sites SET operational_status = 'inactive', updated_at = NOW() WHERE id = $1 RETURNING id, site_code, name, operational_status`,
      [req.params.id]
    );
    await writeAudit({ userId: req.user.id, action: 'DEACTIVATE', entityType: 'client_site', entityId: rows[0].id, oldValue: { operational_status: old.rows[0].operational_status }, newValue: { operational_status: 'inactive' }, ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate site' });
  }
});

module.exports = router;
