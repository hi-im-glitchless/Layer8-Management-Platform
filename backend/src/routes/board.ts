import { Router, Request } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/db/prisma.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { readRateLimiter, mutationRateLimiter } from '../middleware/rateLimit.js';
import * as boardService from '../services/boardService.js';
import * as assignmentService from '../services/assignmentService.js';
import { logAuditEvent } from '../services/audit.js';
import { emitBoardInvalidate, emitScheduleInvalidate } from '../services/socketService.js';
import filesRouter from './boardFiles.js';
import commentsRouter from './boardComments.js';
import notesRouter from './boardNotes.js';
import adminRouter from './boardAdmin.js';
import notificationsRouter from './boardNotifications.js';

const router = Router();

/**
 * Same x-forwarded-for / req.ip / socket.remoteAddress precedence used by
 * `boardAdmin.ts`, `boardFiles.ts` and `audit.ts`. Co-located until a shared
 * `lib/requestIp.ts` is introduced.
 */
function extractIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

const StageEnum = z.enum(['stopped', 'upcoming', 'preparation', 'execution', 'closing', 'done', 'archived']);

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
      // Phase 24-R03: cards are keyed by Project, so the assignmentId/side
      // filters from R02 are replaced with a single projectId filter.
      projectId: z.string().optional(),
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
 * Phase 24-R03: direct card creation and bulk sync endpoints are gone.
 * Cards are now created automatically by projectService.upsertByKey when an
 * assignment links to a Project (see assignmentService.linkProjectsForAssignment).
 * If a sync-style operation is needed in the future, run linkProjects across
 * all assignments rather than creating bare BoardCards.
 */


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
 * - ADMIN: full access (any field, any stage including archived).
 * - PM: full access EXCEPT setting stage='archived'. Archiving is ADMIN-only
 *   (Phase 11): PM may view/open archived cards but must not archive them,
 *   including by dragging a card into the Archived column. NON-NEGOTIABLE —
 *   the admin-archive route stays requireRole('ADMIN') and this stage guard
 *   blocks the drag-to-archive path for PM (and NORMAL).
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

    // Phase 11 (NON-NEGOTIABLE): archiving is ADMIN-only. Block PM and NORMAL
    // from setting stage='archived' — this is the single source of truth for the
    // archive-by-stage (drag-to-archive) guard and closes the PM drag hole. PM
    // may still PATCH cards to any non-archived stage.
    if (data.stage === 'archived' && role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only ADMIN can archive cards' });
    }

    if (!isManager) {
      // Phase 03: any authenticated user may check/uncheck checklist items on
      // ANY project's card. A request that touches ONLY `checklist` skips the
      // ownership check entirely; any other field (stage, notes, stageLockedBy)
      // — alone OR combined with checklist — still requires ownership so the
      // existing PM/ADMIN-only stage-lock and ADMIN-only archive guards stay
      // untouched (a mixed checklist+other-field body is rejected wholesale and
      // never partially applied). The `sentFields.length > 0` guard keeps an
      // empty body on the ownership-gated path (no new hole).
      const sentFields = Object.keys(data);
      const checklistOnly =
        sentFields.length > 0 && sentFields.every((f) => f === 'checklist');

      if (!checklistOnly) {
        const existing = await boardService.getCard(id);
        if (!existing) {
          return res.status(404).json({ error: 'Card not found' });
        }
        // Phase 24-R03: card.assignments is now a list (one Project can have
        // multiple Assignments). User has ownership if their userId matches any
        // assigned team member.
        const ownerUserIds = new Set(
          existing.assignments
            .map((a) => a.teamMember?.userId)
            .filter((u): u is string => !!u),
        );
        if (!ownerUserIds.has(req.session.userId ?? '')) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        // The stage='archived' guard now lives above (ADMIN-only, Phase 11) and
        // already rejected NORMAL here, so no per-branch archive check is needed.
        if (data.stageLockedBy !== undefined) {
          return res.status(403).json({ error: 'Only PM or ADMIN can change stage lock' });
        }
      }
      // checklistOnly === true: any authenticated user proceeds. A missing card
      // still 404s downstream via boardService.updateCard's Prisma P2025 catch,
      // so no separate existence check is needed on this path.
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

    // Pin the card to whoever moved it: any stage change without an explicit
    // stageLockedBy (i.e. a drag) sets the lock to the user's id, so autoMoveCards
    // never overrides the manual placement. Use the resetAutoMove endpoint to
    // hand control back to the auto-mover.
    if (data.stage !== undefined && data.stageLockedBy === undefined) {
      updateData.stageLockedBy = req.session.userId ?? 'manual';
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
 * Hard-delete a board card (= the linked project's Planner card).
 *
 * Phase 01-01: opened from ADMIN to PM (`requireRole('PM')` — PM and ADMIN
 * pass via the NORMAL<PM<ADMIN hierarchy; NORMAL still gets 403). Server is
 * authoritative; the client affordance is advisory.
 *
 * The card is pre-fetched so the delete can be written to the audit trail with
 * the project name. If the card does not exist we 404 BEFORE deleting so the
 * audit log never records a phantom delete.
 *
 * Phase 01 (UAT R02): the card delete now CASCADES to the schedule. It deletes
 * EVERY Assignment row linked to the card's Project (primary + split, all
 * pentesters) via assignmentService.deleteAssignment, which reuses the
 * lock-check and the last-assignment orphan-guard; deleting the project's last
 * assignment removes the orphaned Project and cascades the BoardCard away. A
 * zero-assignment card falls back to boardService.deleteCard. The delete is
 * all-or-nothing: if ANY linked assignment is locked we reject with 409 and
 * delete NOTHING (no Assignment, no Project, no BoardCard). Both the board and
 * the schedule caches are invalidated on success.
 */
router.delete('/cards/:id', requireRole('PM'), mutationRateLimiter, async (req, res) => {
  try {
    const id = req.params.id as string;

    // Pre-fetch to capture projectName for the audit entry and to 404 before
    // any destructive write if the card is already gone.
    const existing = await boardService.getCard(id);
    if (!existing) {
      return res.status(404).json({ error: 'Card not found' });
    }
    const projectName = existing.project?.name ?? null;

    // Collect the distinct linked assignment ids. A split half can surface once
    // per project view, so de-dup via a Set.
    const assignmentIds = [
      ...new Set(existing.assignments.map((a) => a.assignmentId)),
    ];

    // PRE-CHECK LOCKS (all-or-nothing): the shaped assignment objects do not
    // expose isLocked, so fetch the lock state cheaply. If ANY linked
    // assignment is locked, reject with 409 BEFORE the first destructive write.
    if (assignmentIds.length > 0) {
      const lockStates = await prisma.assignment.findMany({
        where: { id: { in: assignmentIds } },
        select: { id: true, isLocked: true },
      });
      if (lockStates.some((a) => a.isLocked)) {
        return res.status(409).json({
          error: 'Cannot delete a locked assignment. Unlock it first.',
        });
      }
    }

    // Delete every linked assignment. assignmentService.deleteAssignment reuses
    // the lock-check + orphan-guard; deleting the project's last assignment
    // removes the orphaned Project and cascades the BoardCard away.
    for (const assignmentId of assignmentIds) {
      await assignmentService.deleteAssignment(assignmentId);
    }

    // Fall back for a zero-assignment card (no linked assignments means the
    // orphan-guard never ran, so the card still exists).
    const stillExists = await boardService.getCard(id);
    if (stillExists) {
      await boardService.deleteCard(id);
    }

    await logAuditEvent({
      userId: req.session.userId ?? null,
      action: 'board.card.delete',
      ipAddress: extractIp(req),
      details: { cardId: id, projectName, userId: req.session.userId ?? null },
    });

    res.json({ success: true });
    emitBoardInvalidate('cards');
    emitScheduleInvalidate('assignments');
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Card not found' });
    }
    if (error instanceof Error && error.message.includes('locked')) {
      return res.status(409).json({ error: error.message });
    }
    console.error('[board routes] Error deleting card:', error);
    res.status(500).json({ error: 'Failed to delete card' });
  }
});

export default router;
