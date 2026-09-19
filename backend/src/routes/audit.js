const express = require('express');
const db = require('../config/db');
const { authenticate, requirePermissions } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', requirePermissions('audit:read'), async (req, res) => {
  try {
    const { entity_type, user_id, page = 1, limit = 50 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, parseInt(limit, 10));
    const params = [];
    let where = 'WHERE 1=1';
    if (entity_type) { params.push(entity_type); where += ` AND a.entity_type = $${params.length}`; }
    if (user_id) { params.push(user_id); where += ` AND a.user_id = $${params.length}`; }
    params.push(Math.min(100, parseInt(limit, 10)), offset);

    const { rows } = await db.query(
      `SELECT a.*, u.full_name AS actor_name, u.email AS actor_email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const countRes = await db.query(`SELECT COUNT(*)::int AS total FROM audit_logs a ${where}`, params.slice(0, -2));
    res.json({ data: rows, total: countRes.rows[0].total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list audit logs' });
  }
});

module.exports = router;
