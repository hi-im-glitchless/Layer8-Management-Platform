import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma.js';

/**
 * Shape of the snapshot attached to `req.boardCard` by `requireCardAccess`.
 * Downstream handlers can read this to avoid a duplicate `prisma.boardCard.findUnique`
 * round-trip.
 */
export interface BoardCardContext {
  id: string;
  projectId: string;
  stage: string;
}

/**
 * Authorization middleware for board card sub-resources (files, comments, notes,
 * archive, notifications).
 *
 * Authorization rule (Phase 24-R03 — Project-based):
 *   - ADMIN: pass through immediately.
 *   - PM: pass through. Org-scoping is not yet implemented in the codebase.
 *     TODO: tighten when org-scoping lands.
 *   - NORMAL: must be a pentester assigned to ANY Assignment row whose
 *     primary or secondary project matches the card's project.
 *
 * Resolves the card id from `req.params.cardId ?? req.params.id`.
 *
 * NON-NEGOTIABLE: This middleware MUST NOT write to `Assignment`, `TeamMember`,
 * `Absence`, or `Holiday`. Reads are permitted.
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
      include: {
        project: {
          include: {
            primaryAssignments: { include: { teamMember: { select: { userId: true } } } },
            splitAssignments: { include: { teamMember: { select: { userId: true } } } },
          },
        },
      },
    });

    if (!card) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }

    const context: BoardCardContext = {
      id: card.id,
      projectId: card.projectId,
      stage: card.stage,
    };
    req.boardCard = context;

    if (role === 'ADMIN' || role === 'PM') {
      // TODO: tighten PM when org-scoping lands.
      next();
      return;
    }

    // NORMAL user: must be assigned to this project via any linked assignment.
    const assignedUserIds = new Set<string>();
    for (const a of card.project.primaryAssignments) {
      if (a.teamMember?.userId) assignedUserIds.add(a.teamMember.userId);
    }
    for (const a of card.project.splitAssignments) {
      if (a.teamMember?.userId) assignedUserIds.add(a.teamMember.userId);
    }

    if (assignedUserIds.has(userId)) {
      next();
      return;
    }

    res.status(403).json({ error: 'Forbidden' });
  } catch (error) {
    console.error('[boardAuth] requireCardAccess error:', error);
    res.status(500).json({ error: 'Failed to verify card access' });
  }
}

/**
 * Lighter read guard for board card sub-resources (Phase 3 — file LIST + DOWNLOAD).
 *
 * Authorization rule:
 *   - Any AUTHENTICATED user passes. There is NO ADMIN/PM/NORMAL branch and NO
 *     assignment lookup — card reachability is already open to every
 *     authenticated user (GET /cards and GET /cards/:id are requireAuth-only),
 *     so a member who can view a card may read/download any file attached to it.
 *
 * Confirms the card exists (404 otherwise) and attaches the same
 * `req.boardCard` snapshot shape as `requireCardAccess` so the express.d.ts
 * contract stays consistent for downstream handlers.
 *
 * Resolves the card id from `req.params.cardId ?? req.params.id`.
 *
 * NON-NEGOTIABLE: This middleware MUST NOT write to `Assignment`, `TeamMember`,
 * `Absence`, or `Holiday`. Reads are permitted.
 * Unlike `requireCardAccess`, this guard intentionally reads ONLY `BoardCard`
 * (no `project.primaryAssignments` / `splitAssignments` include) — zero reads
 * of Assignment / TeamMember. That is a tightening of the schedule-isolation
 * invariant, not a relaxation.
 */
export async function requireCardExists(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const cardId = (req.params.cardId ?? req.params.id) as string | undefined;
  const userId = req.session?.userId;

  if (!userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (!cardId) {
    res.status(400).json({ error: 'Missing card id' });
    return;
  }

  try {
    // No-include lookup: reads ONLY BoardCard. Deliberately does NOT read
    // project/primaryAssignments/splitAssignments (the Assignment/TeamMember
    // read we are avoiding for schedule isolation).
    const card = await prisma.boardCard.findUnique({ where: { id: cardId } });

    if (!card) {
      res.status(404).json({ error: 'Card not found' });
      return;
    }

    const context: BoardCardContext = {
      id: card.id,
      projectId: card.projectId,
      stage: card.stage,
    };
    req.boardCard = context;

    // Any authenticated user passes — no role branch, no assignment check.
    next();
  } catch (error) {
    console.error('[boardAuth] requireCardExists error:', error);
    res.status(500).json({ error: 'Failed to verify card access' });
  }
}
