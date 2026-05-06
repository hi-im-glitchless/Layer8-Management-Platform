import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { readRateLimiter, mutationRateLimiter } from '../middleware/rateLimit.js';
import * as boardService from '../services/boardService.js';
import { emitBoardInvalidate } from '../services/socketService.js';

/**
 * Sub-router for board card comment routes. Mounted from `board.ts` at
 * `/cards/:cardId/comments` with `mergeParams: true`. Plan 23-01 is a
 * mechanical split — the handlers below are bytewise-equivalent to the
 * originals in `board.ts`, only the parameter resolution falls back between
 * `cardId` (sub-router) and `id` (legacy direct mount) so behaviour is
 * preserved either way. No HTTP behaviour change in this plan.
 */
const router = Router({ mergeParams: true });

/**
 * GET /cards/:id/comments
 * List comments for a card (all authenticated users)
 */
router.get('/', requireAuth, readRateLimiter, async (req, res) => {
  try {
    const id = (req.params.cardId ?? req.params.id) as string;
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
router.post('/', requireAuth, mutationRateLimiter, async (req, res) => {
  try {
    const schema = z.object({ body: z.string().min(1) });
    const data = schema.parse(req.body);
    const id = (req.params.cardId ?? req.params.id) as string;
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
router.delete('/:commentId', requireAuth, mutationRateLimiter, async (req, res) => {
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

export default router;
