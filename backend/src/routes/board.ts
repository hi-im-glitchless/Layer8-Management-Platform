import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { readRateLimiter, mutationRateLimiter } from '../middleware/rateLimit.js';
import * as boardService from '../services/boardService.js';
import { emitBoardInvalidate } from '../services/socketService.js';

const router = Router();

const StageEnum = z.enum(['upcoming', 'preparation', 'execution', 'closing', 'done', 'archived']);

const ChecklistItemSchema = z.object({
  label: z.string(),
  checked: z.boolean(),
  order: z.number(),
});

// ── Multer configuration for board file uploads ─────────────────

const BOARD_UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'board');

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const cardId = req.params.id as string;
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

// ── Cards ────────────────────────────────────────────────────────

/**
 * GET /cards
 * List board cards (all authenticated users)
 */
router.get('/cards', requireAuth, readRateLimiter, async (req, res) => {
  try {
    const schema = z.object({
      stage: StageEnum.optional(),
      assignmentId: z.string().optional(),
    });
    const filters = schema.parse(req.query);
    const cards = await boardService.listCards(filters);
    res.json({ cards });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('[board routes] Error listing cards:', error);
    res.status(500).json({ error: 'Failed to list cards' });
  }
});

/**
 * POST /cards
 * Create a board card (PM+)
 */
router.post('/cards', requireRole('PM'), mutationRateLimiter, async (req, res) => {
  try {
    const schema = z.object({
      assignmentId: z.string().optional(),
      stage: StageEnum.optional(),
      checklist: z.array(ChecklistItemSchema).optional(),
      notes: z.string().optional(),
    });
    const data = schema.parse(req.body);
    const card = await boardService.createCard(data);
    res.status(201).json({ card });
    emitBoardInvalidate('cards');
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'A card already exists for this assignment' });
    }
    console.error('[board routes] Error creating card:', error);
    res.status(500).json({ error: 'Failed to create card' });
  }
});

/**
 * POST /cards/sync
 * Bulk-create BoardCards for assignments that lack one (PM+)
 */
router.post('/cards/sync', requireRole('PM'), mutationRateLimiter, async (_req, res) => {
  try {
    const result = await boardService.syncCardsFromAssignments();
    res.json({ created: result.created });
    if (result.created > 0) {
      emitBoardInvalidate('cards');
    }
  } catch (error) {
    console.error('[board routes] Error syncing cards:', error);
    res.status(500).json({ error: 'Failed to sync cards from assignments' });
  }
});

/**
 * GET /cards/:id
 * Get a single board card (all authenticated users)
 */
router.get('/cards/:id', requireAuth, readRateLimiter, async (req, res) => {
  try {
    const id = req.params.id as string;
    const card = await boardService.getCard(id);
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    res.json({ card });
  } catch (error) {
    console.error('[board routes] Error getting card:', error);
    res.status(500).json({ error: 'Failed to get card' });
  }
});

/**
 * PATCH /cards/:id
 * Update a board card (PM+)
 */
router.patch('/cards/:id', requireRole('PM'), mutationRateLimiter, async (req, res) => {
  try {
    const schema = z.object({
      stage: StageEnum.optional(),
      notes: z.string().optional(),
      checklist: z.array(ChecklistItemSchema).optional(),
      stageLockedBy: z.string().nullable().optional(),
    });
    const data = schema.parse(req.body);

    const updateData: {
      stage?: string;
      notes?: string;
      checklist?: { label: string; checked: boolean; order: number }[];
      stageLockedBy?: string | null;
      archivedAt?: Date | null;
    } = { ...data };

    // Set archivedAt when moving to archived stage
    if (data.stage === 'archived') {
      updateData.archivedAt = new Date();
    }

    const id = req.params.id as string;
    const card = await boardService.updateCard(id, updateData);
    res.json({ card });
    emitBoardInvalidate('cards');
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Card not found' });
    }
    console.error('[board routes] Error updating card:', error);
    res.status(500).json({ error: 'Failed to update card' });
  }
});

/**
 * POST /cards/auto-move
 * Trigger auto-move logic for all eligible cards (PM+)
 */
router.post('/cards/auto-move', requireRole('PM'), mutationRateLimiter, async (_req, res) => {
  try {
    const moved = await boardService.autoMoveCards();
    res.json({ moved });
    if (moved > 0) {
      emitBoardInvalidate('cards');
    }
  } catch (error) {
    console.error('[board routes] Error auto-moving cards:', error);
    res.status(500).json({ error: 'Failed to auto-move cards' });
  }
});

/**
 * DELETE /cards/:id
 * Delete a board card (ADMIN only)
 */
router.delete('/cards/:id', requireRole('ADMIN'), mutationRateLimiter, async (req, res) => {
  try {
    const id = req.params.id as string;
    await boardService.deleteCard(id);
    res.json({ success: true });
    emitBoardInvalidate('cards');
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Card not found' });
    }
    console.error('[board routes] Error deleting card:', error);
    res.status(500).json({ error: 'Failed to delete card' });
  }
});

// ── Comments ─────────────────────────────────────────────────────

/**
 * GET /cards/:id/comments
 * List comments for a card (all authenticated users)
 */
router.get('/cards/:id/comments', requireAuth, readRateLimiter, async (req, res) => {
  try {
    const id = req.params.id as string;
    const card = await boardService.getCard(id);
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    res.json({ comments: card.comments });
  } catch (error) {
    console.error('[board routes] Error listing comments:', error);
    res.status(500).json({ error: 'Failed to list comments' });
  }
});

/**
 * POST /cards/:id/comments
 * Add a comment to a card (all authenticated users)
 */
router.post('/cards/:id/comments', requireAuth, mutationRateLimiter, async (req, res) => {
  try {
    const schema = z.object({ body: z.string().min(1) });
    const data = schema.parse(req.body);
    const id = req.params.id as string;
    const comment = await boardService.addComment(id, req.session.userId!, data.body);
    res.status(201).json({ comment });
    emitBoardInvalidate('comments');
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return res.status(404).json({ error: 'Card not found' });
    }
    console.error('[board routes] Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

/**
 * DELETE /cards/:cardId/comments/:commentId
 * Delete a comment (PM+ or comment author)
 */
router.delete('/cards/:cardId/comments/:commentId', requireAuth, mutationRateLimiter, async (req, res) => {
  try {
    const commentId = req.params.commentId as string;
    const comment = await boardService.getComment(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Allow deletion if user is PM+ or is the comment author
    const userRole = req.session.role ?? '';
    const isPMOrAbove = userRole === 'PM' || userRole === 'ADMIN';
    const isAuthor = comment.authorId === req.session.userId;

    if (!isPMOrAbove && !isAuthor) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await boardService.deleteComment(commentId);
    res.json({ success: true });
    emitBoardInvalidate('comments');
  } catch (error) {
    console.error('[board routes] Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// ── Files ────────────────────────────────────────────────────────

/**
 * GET /cards/:id/files
 * List files for a card (all authenticated users)
 */
router.get('/cards/:id/files', requireAuth, readRateLimiter, async (req, res) => {
  try {
    const id = req.params.id as string;
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
router.post('/cards/:id/files', requireRole('PM'), mutationRateLimiter, (req, res, next) => {
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

    const record = await boardService.addFile({
      cardId: req.params.id as string,
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
router.delete('/cards/:cardId/files/:fileId', requireRole('PM'), mutationRateLimiter, async (req, res) => {
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
