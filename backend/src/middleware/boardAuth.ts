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
