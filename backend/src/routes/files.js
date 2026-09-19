const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { authenticate, requirePermissions } = require('../middleware/auth');
const { writeAudit } = require('../utils/audit');

const router = express.Router();
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads/photos');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

router.use(authenticate);

/**
 * POST /api/files/photo
 * Accepts multipart OR base64 JSON { dataUrl, entity_type, entity_id, original_name }
 * Live camera photos only by design — client should send camera capture, not gallery.
 * Stores file on disk; metadata in stored_files. Never stores binary in PostgreSQL.
 */
router.post('/photo', requirePermissions('deployments:read'), async (req, res) => {
  try {
    let buffer;
    let mime = 'image/jpeg';
    let originalName = 'capture.jpg';
    const entityType = req.body?.entity_type || 'attendance';
    const entityId = req.body?.entity_id || null;

    if (req.body?.dataUrl && typeof req.body.dataUrl === 'string') {
      const match = req.body.dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (!match) {
        return res.status(400).json({ error: 'Invalid dataUrl. Expected data:image/...;base64,...' });
      }
      mime = match[1];
      buffer = Buffer.from(match[2], 'base64');
      originalName = req.body.original_name || `capture_${Date.now()}.jpg`;
    } else {
      return res.status(400).json({
        error: 'Send JSON body with dataUrl (base64 from live camera). Gallery uploads are not accepted by design.',
      });
    }

    // Size limit ~2.5MB for field devices
    if (buffer.length > 2.5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Photo too large (max 2.5MB)' });
    }

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(mime)) {
      return res.status(400).json({ error: 'Only JPEG, PNG or WebP allowed' });
    }

    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const fileId = uuidv4();
    const filename = `${fileId}.${ext}`;
    const storagePath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(storagePath, buffer);

    const publicUrl = `/uploads/photos/${filename}`;

    const { rows } = await db.query(
      `INSERT INTO stored_files
        (id, original_name, storage_path, public_url, mime_type, size_bytes, entity_type, entity_id, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, public_url, mime_type, size_bytes, created_at`,
      [fileId, originalName, storagePath, publicUrl, mime, buffer.length, entityType, entityId, req.user.id]
    );

    await writeAudit({
      userId: req.user.id,
      action: 'UPLOAD_PHOTO',
      entityType: 'stored_file',
      entityId: fileId,
      newValue: { size: buffer.length, mime },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Photo upload error', err);
    res.status(500).json({ error: 'Failed to store photo' });
  }
});

router.get('/:id', requirePermissions('deployments:read'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, original_name, public_url, mime_type, size_bytes, entity_type, entity_id, created_at
     FROM stored_files WHERE id = $1`,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'File not found' });
  res.json(rows[0]);
});

module.exports = router;
