const express = require('express');
const db = require('../config/db');
const { authenticate, requirePermissions } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermissions('roles:read'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT r.*,
            COALESCE(json_agg(p.code) FILTER (WHERE p.id IS NOT NULL), '[]') AS permissions
     FROM roles r
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN permissions p ON p.id = rp.permission_id
     GROUP BY r.id
     ORDER BY r.name`
  );
  res.json({ data: rows });
});

router.get('/permissions', requirePermissions('permissions:read'), async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM permissions ORDER BY resource, action`);
  res.json({ data: rows });
});

// Super Admin can create/edit roles and assign permissions
router.post('/', requirePermissions('roles:create'), async (req, res) => {
  const { name, description, permissionCodes = [] } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO roles (name, description) VALUES ($1,$2) RETURNING *`,
      [name, description || null]
    );
    const role = rows[0];
    for (const code of permissionCodes) {
      const p = await db.query(`SELECT id FROM permissions WHERE code = $1`, [code]);
      if (p.rows.length) {
        await db.query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [role.id, p.rows[0].id]);
      }
    }
    await writeAudit({ userId: req.user.id, action: 'CREATE', entityType: 'role', entityId: role.id, newValue: { ...role, permissionCodes }, ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.status(201).json(role);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Role name exists' });
    res.status(500).json({ error: 'Failed to create role' });
  }
});

router.patch('/:id', requirePermissions('roles:update'), async (req, res) => {
  const { name, description, permissionCodes } = req.body || {};
  try {
    const old = await db.query(`SELECT * FROM roles WHERE id = $1`, [req.params.id]);
    if (!old.rows.length) return res.status(404).json({ error: 'Role not found' });
    if (old.rows[0].is_system && name && name !== old.rows[0].name) {
      return res.status(400).json({ error: 'Cannot rename system role' });
    }
    const updates = [];
    const params = [];
    if (name) { params.push(name); updates.push(`name = $${params.length}`); }
    if (description !== undefined) { params.push(description); updates.push(`description = $${params.length}`); }
    if (updates.length) {
      params.push(req.params.id);
      await db.query(`UPDATE roles SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params);
    }
    if (Array.isArray(permissionCodes)) {
      await db.query(`DELETE FROM role_permissions WHERE role_id = $1`, [req.params.id]);
      for (const code of permissionCodes) {
        const p = await db.query(`SELECT id FROM permissions WHERE code = $1`, [code]);
        if (p.rows.length) {
          await db.query(`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2)`, [req.params.id, p.rows[0].id]);
        }
      }
    }
    const { rows } = await db.query(`SELECT * FROM roles WHERE id = $1`, [req.params.id]);
    await writeAudit({ userId: req.user.id, action: 'UPDATE', entityType: 'role', entityId: req.params.id, oldValue: old.rows[0], newValue: { ...rows[0], permissionCodes }, ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

module.exports = router;
