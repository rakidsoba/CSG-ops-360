const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const ACCESS_EXPIRES = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_DAYS = parseInt(process.env.REFRESH_TOKEN_DAYS || '14', 10);

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function signAccessToken(userId, email) {
  return jwt.sign(
    { sub: userId, email, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES }
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

/**
 * Issue a new refresh token, store only the hash.
 * Optionally revoke previous tokens for the user (rotation family).
 */
async function issueRefreshToken(userId, { revokeExisting = false } = {}) {
  if (revokeExisting) {
    await db.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
  }
  const raw = generateRefreshToken();
  const token_hash = hashToken(raw);
  const expires_at = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, token_hash, expires_at]
  );
  return { refreshToken: raw, expiresAt: expires_at };
}

/**
 * Rotate: validate incoming refresh token, revoke it, issue a new pair.
 * Detects reuse of revoked tokens (possible theft) and revokes all for user.
 */
async function rotateRefreshToken(rawRefreshToken) {
  if (!rawRefreshToken) {
    return { error: 'Refresh token required', code: 'NO_REFRESH' };
  }
  const token_hash = hashToken(rawRefreshToken);
  const { rows } = await db.query(
    `SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = $1`,
    [token_hash]
  );
  if (!rows.length) {
    return { error: 'Invalid refresh token', code: 'INVALID_REFRESH' };
  }
  const row = rows[0];

  // Reuse of an already-revoked token → revoke all sessions for this user
  if (row.revoked_at) {
    await db.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [row.user_id]
    );
    return { error: 'Refresh token reuse detected — all sessions revoked', code: 'TOKEN_REUSE' };
  }

  if (new Date(row.expires_at) < new Date()) {
    await db.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [row.id]);
    return { error: 'Refresh token expired', code: 'REFRESH_EXPIRED' };
  }

  // User still active?
  const userRes = await db.query(
    `SELECT id, email, is_active, locked_until FROM users WHERE id = $1`,
    [row.user_id]
  );
  if (!userRes.rows.length || !userRes.rows[0].is_active) {
    await db.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [row.id]);
    return { error: 'User inactive', code: 'USER_INACTIVE' };
  }
  if (userRes.rows[0].locked_until && new Date(userRes.rows[0].locked_until) > new Date()) {
    return { error: 'Account locked', code: 'ACCOUNT_LOCKED' };
  }

  // Rotate: revoke current, issue new
  await db.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`, [row.id]);
  const { refreshToken, expiresAt } = await issueRefreshToken(row.user_id);
  const accessToken = signAccessToken(userRes.rows[0].id, userRes.rows[0].email);

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_EXPIRES,
    refreshExpiresAt: expiresAt,
    user: { id: userRes.rows[0].id, email: userRes.rows[0].email },
  };
}

async function revokeRefreshToken(rawRefreshToken) {
  if (!rawRefreshToken) return;
  const token_hash = hashToken(rawRefreshToken);
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [token_hash]
  );
}

async function revokeAllUserTokens(userId) {
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}

module.exports = {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  ACCESS_EXPIRES,
};
