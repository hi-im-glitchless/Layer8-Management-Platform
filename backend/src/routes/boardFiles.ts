import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import { requireCardAccess } from '../middleware/boardAuth.js';
import { readRateLimiter, mutationRateLimiter } from '../middleware/rateLimit.js';
import * as boardService from '../services/boardService.js';
import {
  ALLOWED_MIME_TYPES,
  MAX_CARD_BYTES,
  MAX_FILE_BYTES,
  getCardStorageUsed,
} from '../services/boardFileService.js';
import { scanFile } from '../services/clamService.js';
import { logAuditEvent } from '../services/audit.js';
import { emitBoardInvalidate } from '../services/socketService.js';
import { config } from '../config.js';

/**
 * Sub-router for board card file routes. Mounted from `board.ts` at
 * `/cards/:cardId/files` with `mergeParams: true` so `:cardId` is visible here
 * via `req.params.cardId`. The pre-Phase-23 routes used `req.params.id` because
 * they were defined directly on the parent router (`/cards/:id/files`); this
 * file preserves that legacy resolution by reading either parameter so the
 * existing endpoints continue to behave identically — no HTTP behaviour change
 * in plan 23-01 (the route-file split is mechanical only).
 *
 * Wave-2 plan 23-03 hardens the upload pipeline: MIME whitelist via multer
 * fileFilter, pre-write per-card 500 MB quota guard using Content-Length,
 * ClamAV scan after disk write but before DB insert (fail-closed 503), and
 * audit logging on upload + quarantine events.
 *
 * SCHEDULE-ISOLATION INVARIANT: this router MUST NOT read or write
 * Assignment / TeamMember / Absence / Holiday tables. Reads via
 * `requireCardAccess` (the auth middleware) are permitted; this file itself
 * only touches BoardFile (and emits audit events).
 */
const router = Router({ mergeParams: true });

// ── Multer configuration for board file uploads ─────────────────

const BOARD_UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'board');

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const cardId = (req.params.cardId ?? req.params.id) as string;
    const dir = path.join(BOARD_UPLOADS_DIR, cardId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('MIME_NOT_ALLOWED'));
  },
});

/**
 * Extracts the client IP using the same precedence as `auth.ts` and
 * `audit.ts` (x-forwarded-for first hop → req.ip → socket.remoteAddress
 * → 'unknown'). Co-located here to keep boardFiles self-contained until
 * a shared `lib/requestIp.ts` is introduced.
 */
function extractIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

/**
 * Pre-write quota guard. Runs BEFORE multer so quota-busting uploads are
 * rejected without ever writing to disk. Uses the declared `Content-Length`
 * header as the upper bound on the incoming body — this is approximate
 * (multipart envelope adds a few bytes) but conservative enough to enforce
 * the 500 MB per-card cap with no TOCTOU window.
 */
async function quotaGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const cardId = (req.params.cardId ?? req.params.id) as string | undefined;
  if (!cardId) {
    res.status(400).json({ error: 'Missing card id' });
    return;
  }

  const declaredLength = Number(req.headers['content-length'] ?? '0');
  if (!Number.isFinite(declaredLength) || declaredLength < 0) {
    res.status(400).json({ error: 'Invalid Content-Length header' });
    return;
  }

  try {
    const usedBytes = await getCardStorageUsed(cardId);
    if (usedBytes + declaredLength > MAX_CARD_BYTES) {
      res.status(413).json({
        error: 'Per-card 500 MB quota exceeded',
        usedBytes,
        maxBytes: MAX_CARD_BYTES,
      });
      return;
    }
    next();
  } catch (err) {
    console.error('[boardFiles] quota guard error:', err);
    res.status(500).json({ error: 'Failed to check card storage quota' });
  }
}

/**
 * Wraps `upload.single('file')` so multer errors are mapped to the
 * status codes documented in the plan: 415 for MIME rejection, 413 for
 * over-size, 400 otherwise.
 */
function multerWithErrorMap(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File too large. Maximum size is 50MB.' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof Error) {
      if (err.message === 'MIME_NOT_ALLOWED') {
        res.status(415).json({ error: 'MIME type not allowed' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    next();
  });
}

/**
 * GET /cards/:id/files
 * List files for a card. Gated by `requireCardAccess` so NORMAL pentesters
 * only see files for cards assigned to them. Quarantined files are hidden
 * by default; ADMINs may pass `?includeQuarantined=true` to see all rows.
 * The opaque `storedName` is stripped from every record — clients reach
 * the bytes via `:fileId/download` exclusively.
 */
router.get('/', requireAuth, requireCardAccess, readRateLimiter, async (req, res) => {
  try {
    const id = (req.params.cardId ?? req.params.id) as string;
    const includeQuarantined =
      req.query.includeQuarantined === 'true' && req.session.role === 'ADMIN';
    const all = await boardService.listFiles(id);
    const filtered = includeQuarantined ? all : all.filter((f) => !f.isQuarantined);
    const sanitised = filtered.map(({ storedName: _stored, ...rest }) => rest);
    res.json({ files: sanitised });
  } catch (error) {
    console.error('[board routes] Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

/**
 * POST /cards/:cardId/files
 * Upload a file to a card. Pipeline (in order):
 *   1. requireAuth + requireCardAccess (session + ACL)
 *   2. mutationRateLimiter
 *   3. quotaGuard (pre-write, rejects 413 if Content-Length would bust quota)
 *   4. multer fileFilter (rejects 415 on MIME outside allowlist; 413 on >50 MB)
 *   5. ClamAV scan of the now-on-disk temp file:
 *        - infected → unlink + audit `board.file.quarantine` + 422
 *        - CLAMAV_UNREACHABLE → unlink + 503 (fail-closed)
 *   6. BoardFile DB insert with scanStatus: 'clean'
 *   7. audit `board.file.upload` + emitBoardInvalidate('files')
 */
router.post(
  '/',
  requireAuth,
  requireCardAccess,
  mutationRateLimiter,
  quotaGuard,
  multerWithErrorMap,
  async (req: Request, res: Response) => {
    const cardId = (req.params.cardId ?? req.params.id) as string;
    const userId = req.session.userId ?? null;
    const ipAddress = extractIp(req);
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // ── ClamAV scan (post-disk-write, pre-DB-insert) ──────────────
    // Bypass entirely when DISABLE_VIRUS_SCAN=true (internal-only deployments
    // where the pentester team handles potentially-malicious samples as part
    // of normal work).
    if (!config.DISABLE_VIRUS_SCAN) {
      try {
        const { clean, virus } = await scanFile(file.path);
        if (!clean) {
          try {
            fs.unlinkSync(file.path);
          } catch (unlinkErr) {
            console.error('[boardFiles] failed to unlink quarantined file:', unlinkErr);
          }
          await logAuditEvent({
            userId,
            action: 'board.file.quarantine',
            ipAddress,
            details: {
              cardId,
              filename: file.originalname,
              mimeType: file.mimetype,
              sizeBytes: file.size,
              virus,
            },
          });
          res.status(422).json({ error: 'File failed virus scan', virus });
          return;
        }
      } catch (err) {
        // Fail-closed: clamService throws Error('CLAMAV_UNREACHABLE') when
        // the daemon cannot be contacted — never silently accept.
        const message = (err as Error).message;
        try {
          fs.unlinkSync(file.path);
        } catch (unlinkErr) {
          console.error('[boardFiles] failed to unlink after scan error:', unlinkErr);
        }
        if (message === 'CLAMAV_UNREACHABLE') {
          res.status(503).json({ error: 'Virus scanner unavailable' });
          return;
        }
        console.error('[boardFiles] unexpected scan error:', err);
        res.status(500).json({ error: 'Failed to scan file' });
        return;
      }
    }

    // ── DB insert (only reached when scan returned clean) ─────────
    try {
      const record = await boardService.addFile({
        cardId,
        filename: file.originalname,
        storedName: file.filename,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedBy: req.session.userId,
      });

      await logAuditEvent({
        userId,
        action: 'board.file.upload',
        ipAddress,
        details: {
          cardId,
          fileId: record.id,
          filename: record.filename,
          mimeType: record.mimeType,
          sizeBytes: record.sizeBytes,
        },
      });

      // Strip storedName from response — opaque on-disk name must not leak
      const { storedName: _stored, ...sanitised } = record;
      res.status(201).json({ file: sanitised });
      emitBoardInvalidate('files');
    } catch (error) {
      // If DB insert fails after a successful scan, unlink the disk file
      // to avoid orphaned bytes.
      try {
        fs.unlinkSync(file.path);
      } catch (unlinkErr) {
        console.error('[boardFiles] failed to unlink after DB error:', unlinkErr);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        res.status(404).json({ error: 'Card not found' });
        return;
      }
      console.error('[board routes] Error uploading file:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  }
);

/**
 * GET /cards/:cardId/files/:fileId/download
 * Session-gated, audited file download. Returns the bytes via
 * `res.download(diskPath, originalFilename)` so the browser receives
 * `Content-Disposition: attachment; filename="<original>"` — the opaque
 * on-disk `storedName` is never exposed. Every successful read emits a
 * `board.file.download` audit event.
 */
router.get(
  '/:fileId/download',
  requireAuth,
  requireCardAccess,
  readRateLimiter,
  async (req, res) => {
    try {
      const cardId = (req.params.cardId ?? req.params.id) as string;
      const fileId = req.params.fileId as string;
      const file = await boardService.getFile(fileId);
      if (!file || file.cardId !== cardId) {
        res.status(404).json({ error: 'File not found' });
        return;
      }
      if (file.isQuarantined) {
        res.status(410).json({ error: 'File quarantined' });
        return;
      }

      const onDisk = path.join(BOARD_UPLOADS_DIR, file.cardId, file.storedName);
      if (!fs.existsSync(onDisk)) {
        res.status(404).json({ error: 'File missing on disk' });
        return;
      }

      await logAuditEvent({
        userId: req.session.userId ?? null,
        action: 'board.file.download',
        ipAddress: extractIp(req),
        details: {
          cardId,
          fileId: file.id,
          filename: file.filename,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
        },
      });
      res.download(onDisk, file.filename);
    } catch (error) {
      console.error('[board routes] Error downloading file:', error);
      res.status(500).json({ error: 'Failed to download file' });
    }
  },
);

/**
 * DELETE /cards/:cardId/files/:fileId
 * Delete a file from a card. `requireCardAccess` enforces ACL (ADMIN, PM,
 * or assigned pentester); the explicit role check below restricts deletes
 * to ADMIN/PM only — assigned NORMAL pentesters can read and download but
 * not destroy. Audits `board.file.delete` after disk + DB removal.
 */
router.delete(
  '/:fileId',
  requireAuth,
  requireCardAccess,
  mutationRateLimiter,
  async (req, res) => {
    try {
      if (req.session.role !== 'ADMIN' && req.session.role !== 'PM') {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const cardId = (req.params.cardId ?? req.params.id) as string;
      const fileId = req.params.fileId as string;
      const fileRecord = await boardService.getFile(fileId);
      if (!fileRecord || fileRecord.cardId !== cardId) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const captured = {
        filename: fileRecord.filename,
        mimeType: fileRecord.mimeType,
        sizeBytes: fileRecord.sizeBytes,
      };

      // Delete from disk (log error but don't fail the request)
      const filePath = path.join(BOARD_UPLOADS_DIR, fileRecord.cardId, fileRecord.storedName);
      try {
        fs.unlinkSync(filePath);
      } catch (diskErr) {
        console.error('[board routes] Failed to delete file from disk:', diskErr);
      }

      await boardService.deleteFile(fileId);

      await logAuditEvent({
        userId: req.session.userId ?? null,
        action: 'board.file.delete',
        ipAddress: extractIp(req),
        details: {
          cardId,
          fileId,
          ...captured,
        },
      });

      res.json({ success: true });
      emitBoardInvalidate('files');
    } catch (error) {
      console.error('[board routes] Error deleting file:', error);
      res.status(500).json({ error: 'Failed to delete file' });
    }
  },
);

export default router;
