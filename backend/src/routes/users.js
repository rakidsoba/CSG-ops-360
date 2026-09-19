const express = require('express');
const db = require('../config/db');
const { authenticate, requirePermissions } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');
const { hashPassword } = require('../utils/password');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermissions('users:read'), async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.full_name, u.phone, u.is_active, u.last_login_at, u.created_at,
              COALESCE(json_agg(json_build_object('id', r.id, 'name', r.name)) FILTER (WHERE r.id IS NOT NULL), '[]') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       GROUP BY u.id
       ORDER BY u.full_name`
    );
    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

router.get('/:id', requirePermissions('users:read'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.full_name, u.phone, u.is_active, u.last_login_at, u.created_at,
            COALESCE(json_agg(json_build_object('id', r.id, 'name', r.name)) FILTER (WHERE r.id IS NOT NULL), '[]') AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.id = $1
     GROUP BY u.id`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

router.post('/', requirePermissions('users:create'), async (req, res) => {
  const { email, password, full_name, phone, roleIds = [] } = req.body || {};
  if (!email || !password || !full_name) return res.status(400).json({ error: 'email, password, full_name required' });
  try {
    const password_hash = await hashPassword(password);
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash, full_name, phone) VALUES ($1,$2,$3,$4) RETURNING id, email, full_name, phone, is_active, created_at`,
      [email.trim().toLowerCase(), password_hash, full_name, phone || null]
    );
    const user = rows[0];
    for (const roleId of roleIds) {
      await db.query(`INSERT INTO user_roles (user_id, role_id, granted_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [user.id, roleId, req.user.id]);
    }
    await writeAudit({ userId: req.user.id, action: 'CREATE', entityType: 'user', entityId: user.id, newValue: { ...user, roleIds }, ipAddress: req.ip, userAgent: req.get('user-agent') });
    res.status(201).json(user);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.patch('/:id', requirePermissions('users:update'), async (req, res) => {
  const allowed = ['full_name', 'phone', 'is_active'];
  const updates = [];
  const params = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      params.push(req.body[key]);
      updates.push(`${key} = $${params.length}`);
    }
  }
  if (req.body.password) {
    params.push(await hashPassword(req.body.password));
    updates.push(`password_hash = $${params.length}`);
    updates.push(`password_changed_at = NOW()`);
  }
  if (!updates.length && !req.body.roleIds) return res.status(400).json({ error: 'No valid fields' });

  try {
    const old = await db.query(`SELECT id, email, full_name, phone, is_active FROM users WHERE id = $1`, [req.params.id]);
    if (!old.rows.length) return res.status(404).json({ error: 'User not found' });

    let user = old.rows[0];
    if (updates.length) {
      params.push(req.params.id);
      const { rows } = await db.query(
        `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length}
         RETURNING id, email, full_name, phone, is_active`,
        params
      );
      user = rows[0];
    }

    if (Array.isArray(req.body.roleIds)) {
      // Full replace of roles (Super Admin power)
      await db.query(`DELETE FROM user_roles WHERE user_id = $1`, [req.params.id]);
      for (const roleId of req.body.roleIds) {
        await db.query(`INSERT INTO user_roles (user_id, role_id, granted_by) VALUES ($1,$2,$3)`, [req.params.id, roleId, req.user.id]);
      }
    }

    await writeAudit({
      userId: req.user.id,
      action: 'UPDATE',
      entityType: 'user',
      entityId: user.id,
      oldValue: old.rows[0],
      newValue: { ...user, roleIds: req.body.roleIds },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Grant role
router.post('/:id/roles/:roleId', requirePermissions('users:update'), async (req, res) => {
  try {
    await db.query(
      `INSERT INTO user_roles (user_id, role_id, granted_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [req.params.id, req.params.roleId, req.user.id]
    );
    await writeAudit({
      userId: req.user.id,
      action: 'GRANT_ROLE',
      entityType: 'user',
      entityId: req.params.id,
      newValue: { roleId: req.params.roleId },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to grant role' });
  }
});

// Revoke role
router.delete('/:id/roles/:roleId', requirePermissions('users:update'), async (req, res) => {
  try {
    await db.query(`DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2`, [req.params.id, req.params.roleId]);
    await writeAudit({
      userId: req.user.id,
      action: 'REVOKE_ROLE',
      entityType: 'user',
      entityId: req.params.id,
      oldValue: { roleId: req.params.roleId },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to revoke role' });
  }
});

router.delete('/:id', requirePermissions('users:delete'), async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot deactivate yourself' });
  const { rows } = await db.query(
    `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id, email, is_active`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  await writeAudit({ userId: req.user.id, action: 'DEACTIVATE', entityType: 'user', entityId: rows[0].id, newValue: { is_active: false }, ipAddress: req.ip, userAgent: req.get('user-agent') });
  res.json(rows[0]);
});

module.exports = router;
