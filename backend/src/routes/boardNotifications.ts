import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { readRateLimiter, mutationRateLimiter } from '../middleware/rateLimit.js';
import { prisma } from '../db/prisma.js';
import { emitBoardInvalidate } from '../services/socketService.js';

/**
 * Sub-router for board notification routes. Mounted from `board.ts` at
 * `/notifications`. Wave-2 plan 23-05 wires the two read endpoints:
 *   - `GET /unread-count`  — per-user count of unread BoardNotification rows
 *   - `POST /mark-read`    — flip isRead for one card's notifications
 *
 * SCHEDULE-ISOLATION INVARIANT: this router MUST NOT read or write
 * Assignment / TeamMember / Absence / Holiday tables. Only `BoardNotification`
 * is touched here.
 */
const router = Router();

/**
 * GET /notifications/unread-count
 * Returns `{count}` of unread notifications for the authenticated user.
 * Per-user only — no admin-aggregate view per CONTEXT.md.
 */
router.get('/unread-count', requireAuth, readRateLimiter, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const count = await prisma.boardNotification.count({
      where: { userId, isRead: false },
    });
    res.json({ count });
  } catch (error) {
    console.error('[board routes] Error counting unread notifications:', error);
    res.status(500).json({ error: 'Failed to count unread notifications' });
  }
});

/**
 * POST /notifications/mark-read
 * Body: `{cardId: string}`. Marks every unread notification for this user
 * on this card as read. Idempotent — re-running on an already-read set is
 * a no-op. Emits `board:invalidate` for `notifications` so the user's
 * other tabs re-fetch the unread count.
 */
router.post('/mark-read', requireAuth, mutationRateLimiter, async (req, res) => {
  try {
    const { cardId } = z.object({ cardId: z.string().cuid() }).parse(req.body);
    const userId = req.session.userId!;
    await prisma.boardNotification.updateMany({
      where: { userId, cardId, isRead: false },
      data: { isRead: true },
    });
    res.json({ success: true });
    emitBoardInvalidate('notifications');
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('[board routes] Error marking notifications read:', error);
    res.status(500).json({ error: 'Failed to mark notifications read' });
  }
});

export default router;
