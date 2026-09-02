import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createSecureAttachment,
  getAttachmentMetadata,
  previewAttachment,
  downloadAttachment,
  revokeAttachment,
  getUserSecureAttachments,
} from '../services/secureAttachmentService.js';

const router = Router();

/**
 * POST /api/secure-attachments/upload
 * Authenticated endpoint to encrypt and store a controlled secure attachment
 */
router.post('/upload', requireAuth, async (req, res, next) => {
  try {
    const {
      filename,
      contentType,
      bufferBase64,
      maxViews,
      maxDownloads,
      watermarkText,
      expiresInHours,
    } = req.body;

    if (!filename || !bufferBase64) {
      return res.status(400).json({ error: 'Filename and bufferBase64 are required' });
    }

    const buffer = Buffer.from(bufferBase64, 'base64');
    const result = await createSecureAttachment({
      userId: req.user.id,
      filename,
      contentType: contentType || 'application/octet-stream',
      buffer,
      maxViews: maxViews ? parseInt(maxViews, 10) : null,
      maxDownloads: maxDownloads !== undefined && maxDownloads !== null && maxDownloads !== '' ? parseInt(maxDownloads, 10) : null,
      watermarkText: watermarkText || null,
      expiresInHours: expiresInHours ? parseFloat(expiresInHours) : null,
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/secure-attachments/status/:token
 * Public metadata inspection endpoint for an attachment token
 */
router.get('/status/:token', async (req, res, next) => {
  try {
    const meta = await getAttachmentMetadata(req.params.token);
    if (!meta) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    res.json({
      id: meta.id,
      filename: meta.filename,
      contentType: meta.content_type,
      fileSize: meta.file_size,
      maxViews: meta.max_views,
      viewCount: meta.view_count,
      maxDownloads: meta.max_downloads,
      downloadCount: meta.download_count,
      remainingViews: meta.remainingViews,
      remainingDownloads: meta.remainingDownloads,
      watermarkText: meta.watermark_text,
      isExpired: meta.isExpired,
      isRevoked: meta.isRevoked,
      isViewExhausted: meta.isViewExhausted,
      isDownloadExhausted: meta.isDownloadExhausted,
      isAccessible: meta.isAccessible,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/secure-attachments/preview/:token
 * Stream decrypted content for in-browser sandboxed reader
 */
router.get('/preview/:token', async (req, res, next) => {
  try {
    const result = await previewAttachment(req.params.token, req);
    if (!result.ok) {
      return res.status(result.code || 403).json({
        error: result.error,
        code: result.code,
        revoked: result.revoked,
        expired: result.expired,
        exhausted: result.exhausted,
      });
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(result.filename)}"`);
    res.setHeader('X-Attachment-Remaining-Views', String(result.remainingViews !== null ? result.remainingViews : 'unlimited'));
    res.send(result.buffer);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/secure-attachments/download/:token
 * Stream binary file download with download cap enforcement
 */
router.get('/download/:token', async (req, res, next) => {
  try {
    const result = await downloadAttachment(req.params.token, req);
    if (!result.ok) {
      return res.status(result.code || 403).json({
        error: result.error,
        code: result.code,
        viewOnly: result.viewOnly,
        revoked: result.revoked,
        expired: result.expired,
        exhausted: result.exhausted,
      });
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.filename)}"`);
    res.setHeader('X-Attachment-Remaining-Downloads', String(result.remainingDownloads !== null ? result.remainingDownloads : 'unlimited'));
    res.send(result.buffer);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/secure-attachments/revoke/:id
 * Senders can revoke an attachment at any time
 */
router.post('/revoke/:id', requireAuth, async (req, res, next) => {
  try {
    const revoked = await revokeAttachment(req.params.id, req.user.id);
    if (!revoked) {
      return res.status(404).json({ error: 'Attachment not found or not owned by you' });
    }
    res.json({ message: 'Attachment access revoked successfully', revoked });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/secure-attachments/my
 * List sender's secure attachments
 */
router.get('/my', requireAuth, async (req, res, next) => {
  try {
    const list = await getUserSecureAttachments(req.user.id);
    res.json({ attachments: list });
  } catch (err) {
    next(err);
  }
});

export default router;
