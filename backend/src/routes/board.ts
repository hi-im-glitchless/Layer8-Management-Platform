import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { readRateLimiter, mutationRateLimiter } from '../middleware/rateLimit.js';
import * as boardService from '../services/boardService.js';
import { emitBoardInvalidate } from '../services/socketService.js';
import filesRouter from './boardFiles.js';
import commentsRouter from './boardComments.js';
import notesRouter from './boardNotes.js';
import adminRouter from './boardAdmin.js';
import notificationsRouter from './boardNotifications.js';

const router = Router();

const StageEnum = z.enum(['upcoming', 'preparation', 'execution', 'closing', 'done', 'archived']);

const ChecklistItemSchema = z.object({
  label: z.string(),
  checked: z.boolean(),
  order: z.number(),
});

// ── Sub-routers (Phase 23 plan 23-01 split) ─────────────────────
//
// Files / comments handlers live in their own router files so wave-2 plans
// can each modify their own router file in parallel without merge conflicts.
// `mergeParams: true` on the sub-routers exposes `:cardId` to their handlers.
// Path patterns are preserved exactly (e.g. `GET /api/board/cards/:id/files`
// → `filesRouter` `GET /`) so existing endpoints behave identically.
router.use('/cards/:cardId/files', filesRouter);
router.use('/cards/:cardId/comments', commentsRouter);
router.use('/cards/:cardId/notes', notesRouter);
router.use('/cards/:cardId/admin', adminRouter);
router.use('/notifications', notificationsRouter);

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
      // Phase 24-R02: allow filtering by side so the Dashboard's ProjectCard
      // can fetch the exact card for the project half it represents.
      side: z.enum(['primary', 'secondary']).optional(),
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
 * Update a board card.
 * - PM/ADMIN: full access (any field, any stage including archived).
 * - NORMAL: only when the card's assignment belongs to the caller's TeamMember.
 *   Stage moves are limited to non-archived stages, and `stageLockedBy` cannot
 *   be set (the manual-pin override is reserved for PM/ADMIN).
 */
router.patch('/cards/:id', requireAuth, mutationRateLimiter, async (req, res) => {
  try {
    const schema = z.object({
      stage: StageEnum.optional(),
      notes: z.string().optional(),
      checklist: z.array(ChecklistItemSchema).optional(),
      stageLockedBy: z.string().nullable().optional(),
    });
    const data = schema.parse(req.body);
    const id = req.params.id as string;
    const role = req.session.role;
    const isManager = role === 'PM' || role === 'ADMIN';

    if (!isManager) {
      const existing = await boardService.getCard(id);
      if (!existing) {
        return res.status(404).json({ error: 'Card not found' });
      }
      const ownerUserId = existing.assignment?.teamMember?.userId ?? null;
      if (!ownerUserId || ownerUserId !== req.session.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (data.stage === 'archived') {
        return res.status(403).json({ error: 'Only PM or ADMIN can archive cards' });
      }
      if (data.stageLockedBy !== undefined) {
        return res.status(403).json({ error: 'Only PM or ADMIN can change stage lock' });
      }
    }

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

export default router;
