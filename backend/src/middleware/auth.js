const jwt = require('jsonwebtoken');
const db = require('../config/db');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
  }

  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
  }

  try {
    const { rows } = await db.query(
      `SELECT id, email, full_name, is_active, locked_until
       FROM users WHERE id = $1`,
      [payload.sub]
    );
    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ error: 'User inactive or not found', code: 'USER_INACTIVE' });
    }
    if (rows[0].locked_until && new Date(rows[0].locked_until) > new Date()) {
      return res.status(403).json({ error: 'Account temporarily locked', code: 'ACCOUNT_LOCKED' });
    }

    const rolesRes = await db.query(
      `SELECT r.id, r.name
       FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = $1`,
      [payload.sub]
    );
    const roles = rolesRes.rows;

    const permsRes = await db.query(
      `SELECT DISTINCT p.code
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = $1`,
      [payload.sub]
    );
    let permissions = permsRes.rows.map((r) => r.code);

    const isSuperAdmin = roles.some((r) => r.name === 'Super Admin');
    if (isSuperAdmin) {
      const allPerms = await db.query(`SELECT code FROM permissions`);
      permissions = allPerms.rows.map((r) => r.code);
    }

    req.user = {
      id: rows[0].id,
      email: rows[0].email,
      fullName: rows[0].full_name,
      roles: roles.map((r) => r.name),
      roleIds: roles.map((r) => r.id),
      permissions,
      isSuperAdmin,
    };
    next();
  } catch (err) {
    console.error('Auth resolve error', err);
    return res.status(500).json({ error: 'Authentication service error' });
  }
}

function requirePermissions(...required) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (req.user.isSuperAdmin) {
      return next();
    }
    const has = required.some((code) => req.user.permissions.includes(code));
    if (!has) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        required,
      });
    }
    next();
  };
}

module.exports = { authenticate, requirePermissions };
