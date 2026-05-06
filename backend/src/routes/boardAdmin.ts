import { Router, Request } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { mutationRateLimiter } from '../middleware/rateLimit.js';
import {
  archiveCard,
  ArchiveError,
} from '../services/boardArchiveService.js';
import { logAuditEvent } from '../services/audit.js';
import { emitBoardInvalidate } from '../services/socketService.js';

/**
 * Sub-router for board card admin routes. Mounted from `board.ts` at
 * `/cards/:cardId/admin` with `mergeParams: true`. Wave-2 plan 23-05 wires
 * the typed-confirmation archive endpoint here.
 *
 * SCHEDULE-ISOLATION INVARIANT: this router MUST NOT write to
 * Assignment / TeamMember / Absence / Holiday tables. The archive service
 * reads `BoardCard.assignment.projectName` only (read-only join) and never
 * mutates the linked Assignment.
 */
const router = Router({ mergeParams: true });

/**
 * Same x-forwarded-for / req.ip / socket.remoteAddress precedence used by
 * `boardFiles.ts` and `audit.ts`. Co-located until a shared `lib/requestIp.ts`
 * is introduced.
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
 * POST /cards/:cardId/admin/archive
 * ADMIN-only typed-confirmation card archive. Body:
 *   `{confirmProjectName: string}` — must exactly match the linked
 *   Assignment.projectName (case-sensitive).
 *
 * Hard-deletes BoardFile rows + on-disk bytes, sets stage='archived' +
 * archivedAt=now(), preserves comments + notes + checklist. Emits
 * `board.card.archive` audit row with `{cardId, projectName, fileCount,
 * totalBytes, adminId}`.
 */
router.post(
  '/archive',
  requireAuth,
  requireRole('ADMIN'),
  mutationRateLimiter,
  async (req, res) => {
    try {
      const { confirmProjectName } = z
        .object({ confirmProjectName: z.string().min(1) })
        .parse(req.body);
      const cardId = (req.params.cardId ?? req.params.id) as string;
      const adminUserId = req.session.userId!;

      const details = await archiveCard(cardId, confirmProjectName, adminUserId);

      await logAuditEvent({
        userId: adminUserId,
        action: 'board.card.archive',
        ipAddress: extractIp(req),
        details: { ...details },
      });

      res.json({ success: true, ...details });
      emitBoardInvalidate('cards');
      emitBoardInvalidate('files');
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues[0].message });
      }
      if (error instanceof ArchiveError) {
        const status = error.code === 'NOT_FOUND' ? 404 : 400;
        return res.status(status).json({ error: error.code });
      }
      console.error('[board routes] Error archiving card:', error);
      res.status(500).json({ error: 'Failed to archive card' });
    }
  },
);

export default router;
