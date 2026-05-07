import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { readRateLimiter } from '../middleware/rateLimit.js';

/**
 * Sub-router for board member lookups used by the comment-mention autocomplete.
 * Mounted from `index.ts` at `/api/board/members`.
 *
 * Authenticated-only (any role). Returns a slim user list — no role,
 * no totpEnabled, no timestamps, no email — to keep blast radius minimal
 * and avoid duplicating the admin-gated `/api/users` payload shape.
 *
 * SCHEDULE-ISOLATION INVARIANT: this router MUST NOT read or write
 * Assignment / TeamMember / Absence / Holiday tables. It only reads User.
 */
const router = Router();

/**
 * GET /api/board/members
 * Returns active users (id, username, displayName) for @mention autocomplete.
 */
router.get('/', requireAuth, readRateLimiter, async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        username: true,
        displayName: true,
      },
      orderBy: { username: 'asc' },
    });

    res.json({ users });
  } catch (error) {
    console.error('[boardMembers routes] Error listing members:', error);
    res.status(500).json({ error: 'Failed to list members' });
  }
});

export default router;
