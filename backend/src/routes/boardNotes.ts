import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireCardAccess } from '../middleware/boardAuth.js';
import { mutationRateLimiter } from '../middleware/rateLimit.js';
import { updateNotes } from '../services/boardNotesService.js';
import { emitBoardInvalidate } from '../services/socketService.js';

/**
 * Sub-router for board card notes routes. Mounted from `board.ts` at
 * `/cards/:cardId/notes` with `mergeParams: true`. Wave-2 plan 23-05 wires
 * the single PATCH endpoint that persists the markdown notes blob and the
 * `notesUpdatedAt`/`notesUpdatedBy` last-edit metadata.
 *
 * SCHEDULE-ISOLATION INVARIANT: this router MUST NOT read or write
 * Assignment / TeamMember / Absence / Holiday tables. Reads via
 * `requireCardAccess` are permitted; writes touch only `BoardCard` columns
 * via `boardNotesService.updateNotes`.
 */
const router = Router({ mergeParams: true });

/**
 * PATCH /cards/:cardId/notes
 * Last-write-wins notes update. Body: `{notes: string}` (no max length —
 * notes are long-form by design per CONTEXT.md). Authorization is
 * `requireCardAccess`: ADMIN, any PM, or assigned pentester can edit.
 */
router.patch('/', requireAuth, requireCardAccess, mutationRateLimiter, async (req, res) => {
  try {
    const { notes } = z.object({ notes: z.string() }).parse(req.body);
    const cardId = (req.params.cardId ?? req.params.id) as string;
    const updated = await updateNotes(cardId, notes, req.session.userId!);
    res.json({ card: updated });
    emitBoardInvalidate('cards');
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0].message });
    }
    console.error('[board routes] Error updating notes:', error);
    res.status(500).json({ error: 'Failed to update notes' });
  }
});

export default router;
