const db = require('../config/db');

/**
 * Append-only audit logger. Never mutates existing rows.
 */
async function writeAudit({
  userId = null,
  action,
  entityType,
  entityId = null,
  oldValue = null,
  newValue = null,
  ipAddress = null,
  userAgent = null,
}) {
  try {
    await db.query(
      `INSERT INTO audit_logs
        (user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        action,
        entityType,
        entityId,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        ipAddress,
        userAgent,
      ]
    );
  } catch (err) {
    // Never let audit failure break the main request, but log loudly
    console.error('[AUDIT_FAIL]', err.message, { action, entityType, entityId });
  }
}

module.exports = { writeAudit };
