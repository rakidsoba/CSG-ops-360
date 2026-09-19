const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { hashPassword, verifyPassword } = require('../utils/password');
const { writeAudit } = require('../utils/audit');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const ip = req.ip || req.connection?.remoteAddress;
  const ua = req.get('user-agent');

  try {
    const { rows } = await db.query(
      `SELECT id, email, full_name, password_hash, is_active, failed_login_attempts, locked_until
       FROM users WHERE LOWER(email) = LOWER($1)`,
      [email.trim()]
    );

    if (!rows.length) {
      await writeAudit({
        action: 'LOGIN_FAILED',
        entityType: 'user',
        newValue: { email, reason: 'not_found' },
        ipAddress: ip,
        userAgent: ua,
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(403).json({
        error: 'Account temporarily locked due to multiple failed attempts',
        lockedUntil: user.locked_until,
      });
    }

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is inactive' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      const attempts = (user.failed_login_attempts || 0) + 1;
      let lockedUntil = null;
      if (attempts >= MAX_FAILED) {
        lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      }
      await db.query(
        `UPDATE users SET failed_login_attempts = $1, locked_until = $2, updated_at = NOW() WHERE id = $3`,
        [attempts, lockedUntil, user.id]
      );
      await writeAudit({
        userId: user.id,
        action: 'LOGIN_FAILED',
        entityType: 'user',
        entityId: user.id,
        newValue: { attempts, locked: !!lockedUntil },
        ipAddress: ip,
        userAgent: ua,
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await db.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [user.id]
    );

    const token = jwt.sign(
      { sub: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
    );

    await writeAudit({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'user',
      entityId: user.id,
      ipAddress: ip,
      userAgent: ua,
    });

    res.json({
      token,
      expiresIn: process.env.JWT_EXPIRES_IN || '12h',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
      },
    });
  } catch (err) {
    console.error('Login error', err);
    res.status(500).json({ error: 'Login service error' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    fullName: req.user.fullName,
    roles: req.user.roles,
    permissions: req.user.permissions,
    isSuperAdmin: req.user.isSuperAdmin,
  });
});

module.exports = router;
