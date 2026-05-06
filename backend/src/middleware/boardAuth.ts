import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma.js';

/**
 * Shape of the snapshot attached to `req.boardCard` by `requireCardAccess`.
 * Downstream handlers can read this to avoid a duplicate `prisma.boardCard.findUnique`
 * round-trip. Wave-2 plans may extend `backend/src/types/express.d.ts` to make this
 * a properly typed property; for now downstream readers cast via
 * `(req as Request & { boardCard?: BoardCardContext })`.
 */
export interface BoardCardContext {
  id: string;
  assignmentId: string | null;
  stage: string;
}

/**
 * Authorization middleware for board card sub-resources (files, comments, notes,
 * archive, notifications).
 *
 * Authorization rule (from 23-CONTEXT.md and 23-RESEARCH.md §2):
 *   - ADMIN: pass through immediately, even if the card is missing it returns 404
 *     so admins do not get a different error shape than other roles.
 *   - PM: pass through. Org-scoping is not yet implemented in the codebase so
 *     "PM of the project's org" degrades gracefully to "any PM".
 *     TODO: tighten when org-scoping lands.
 *   - NORMAL: must be the pentester assigned to the card via the linked
 *     Assignment → TeamMember → User chain.
 *
 * Resolves the card id from `req.params.cardId ?? req.params.id` so it works
 * mounted under either `/cards/:cardId/...` (sub-router with mergeParams) or
 * `/cards/:id` (direct mount).
 *
 * On success attaches `req.boardCard` (a `BoardCardContext`) so downstream
 * handlers may use it directly.
 *
 * Status codes: 401 when not authenticated (consistent with `requireAuth`),
 * 404 when the card does not exist (regardless of role), 403 when the
 * authenticated user is neither admin/PM nor the assigned pentester.
 *
 * NON-NEGOTIABLE: This middleware MUST NOT write to `Assignment`, `TeamMember`,
 * `Absence`, or `Holiday` — those tables are the schedule domain and the board
 * feature has a no-write boundary against them (see 23-CONTEXT.md "Data Safety").
 * Reads (via `include: { assignment: { include: { teamMember: true } } }`) are
 * permitted and required for the assignment check.
 */
export async function requireCardAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const cardId = (req.params.cardId ?? req.params.id) as string | undefined;
  const userId = req.session?.userId;
  const role = req.session?.role ?? '';

  if (!userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (!cardId) {
    res.status(400).json({ error: 'Missing card id' });
    return;
  }

  try {
    const card = await prisma.boardCard.findUnique({
      where: { id: cardId },
      include: { assignment: { include: { teamMember: true } } },
    });

    if (!card) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }

    const context: BoardCardContext = {
      id: card.id,
      assignmentId: card.assignmentId,
      stage: card.stage,
    };
    (req as Request & { boardCard?: BoardCardContext }).boardCard = context;

    if (role === 'ADMIN') {
      next();
      return;
    }

    if (role === 'PM') {
      // TODO: tighten when org-scoping lands — restrict to PMs of the org
      // that owns the card's project.
      next();
      return;
    }

    // NORMAL user: must be the assigned pentester
    const assignedUserId = card.assignment?.teamMember?.userId ?? null;
    if (assignedUserId && assignedUserId === userId) {
      next();
      return;
    }

    res.status(403).json({ error: 'Forbidden' });
  } catch (error) {
    console.error('[boardAuth] requireCardAccess error:', error);
    res.status(500).json({ error: 'Failed to verify card access' });
  }
}
