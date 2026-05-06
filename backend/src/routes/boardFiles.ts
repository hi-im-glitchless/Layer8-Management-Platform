import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { readRateLimiter, mutationRateLimiter } from '../middleware/rateLimit.js';
import * as boardService from '../services/boardService.js';
import { emitBoardInvalidate } from '../services/socketService.js';

/**
 * Sub-router for board card file routes. Mounted from `board.ts` at
 * `/cards/:cardId/files` with `mergeParams: true` so `:cardId` is visible here
 * via `req.params.cardId`. The pre-Phase-23 routes used `req.params.id` because
 * they were defined directly on the parent router (`/cards/:id/files`); this
 * file preserves that legacy resolution by reading either parameter so the
 * existing endpoints continue to behave identically — no HTTP behaviour change
 * in plan 23-01 (the route-file split is mechanical only).
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
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

/**
 * GET /cards/:id/files
 * List files for a card (all authenticated users)
 */
router.get('/', requireAuth, readRateLimiter, async (req, res) => {
  try {
    const id = (req.params.cardId ?? req.params.id) as string;
    const files = await boardService.listFiles(id);
    res.json({ files });
  } catch (error) {
    console.error('[board routes] Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

/**
 * POST /cards/:id/files
 * Upload a file to a card (PM+)
 */
router.post('/', requireRole('PM'), mutationRateLimiter, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
      }
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const cardId = (req.params.cardId ?? req.params.id) as string;
    const record = await boardService.addFile({
      cardId,
      filename: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedBy: req.session.userId,
    });

    res.status(201).json({ file: record });
    emitBoardInvalidate('files');
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return res.status(404).json({ error: 'Card not found' });
    }
    console.error('[board routes] Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

/**
 * DELETE /cards/:cardId/files/:fileId
 * Delete a file from a card (PM+)
 */
router.delete('/:fileId', requireRole('PM'), mutationRateLimiter, async (req, res) => {
  try {
    const fileId = req.params.fileId as string;
    const fileRecord = await boardService.getFile(fileId);
    if (!fileRecord) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete from disk (log error but don't fail the request)
    const filePath = path.join(BOARD_UPLOADS_DIR, fileRecord.cardId, fileRecord.storedName);
    try {
      fs.unlinkSync(filePath);
    } catch (diskErr) {
      console.error('[board routes] Failed to delete file from disk:', diskErr);
    }

    await boardService.deleteFile(fileId);
    res.json({ success: true });
    emitBoardInvalidate('files');
  } catch (error) {
    console.error('[board routes] Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;
