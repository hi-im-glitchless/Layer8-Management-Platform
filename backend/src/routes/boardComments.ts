import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireAuth } from '../middleware/auth.js';
import { requireCardAccess } from '../middleware/boardAuth.js';
import { readRateLimiter, mutationRateLimiter } from '../middleware/rateLimit.js';
import * as boardService from '../services/boardService.js';
import {
  editComment,
  softDeleteComment,
  CommentEditError,
} from '../services/boardCommentService.js';
import { createNotificationsForMentions } from '../services/boardNotificationService.js';
import { emitBoardInvalidate } from '../services/socketService.js';

/**
 * Sub-router for board card comment routes. Mounted from `board.ts` at
 * `/cards/:cardId/comments` with `mergeParams: true`. Wave-2 plan 23-04
 * upgrades the handlers to: (a) accept and persist @mentions as
 * `BoardNotification` rows, (b) enforce a 10-minute author-only edit window
 * via PATCH, and (c) soft-delete instead of hard-delete with a `[deleted]`
 * placeholder rendered by clients.
 *
 * SCHEDULE-ISOLATION INVARIANT: this router MUST NOT read or write
 * Assignment / TeamMember / Absence / Holiday tables. Reads via
 * `requireCardAccess` (the auth middleware) are permitted; this file itself
 * only touches BoardComment + BoardNotification (write side) and User
 * (read-only validation inside the notification service).
 */
const router = Router({ mergeParams: true });

/**
 * Comment list response shape. Matches the DB row except `body` is replaced
 * with `null` when `isDeleted` so soft-deleted comments still show their
 * placeholder + author + timestamps but no original text.
 */
type CommentListItem = {
  id: string;
  authorId: string | null;
  authorName: string | null;
  body: string | null;
  isDeleted: boolean;
  editedAt: Date | null;
  createdAt: Date;
};

/**
 * GET /cards/:id/comments
 * List comments for a card (chronological, includes soft-deleted with
 * `body:null` so clients render the `[deleted]` placeholder while
 * preserving authorId/authorName/createdAt).
 */
router.get('/', requireAuth, requireCardAccess, readRateLimiter, async (req, res) => {
  try {
    const id = (req.params.cardId ?? req.params.id) as string;
    const card = await boardService.getCard(id);
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    const comments: CommentListItem[] = card.comments.map((c) => ({
      id: c.id,
      authorId: c.authorId ?? null,
      authorName: c.author?.displayName ?? null,
      body: c.isDeleted ? null : c.body,
      isDeleted: c.isDeleted,
      editedAt: c.editedAt ?? null,
      createdAt: c.createdAt,
    }));
    res.json({ comments });
  } catch (error) {
    console.error('[board routes] Error listing comments:', error);
    res.status(500).json({ error: 'Failed to list comments' });
  }
});

/**
 * POST /cards/:id/comments
 * Add a comment. Accepts optional `mentions: string[]` of User IDs;
 * each valid (existing, non-self) mention persists a `BoardNotification` row
 * and emits `board:invalidate` for the `notifications` resource so connected
 * clients re-fetch the unread badge.
 */
router.post('/', requireAuth, requireCardAccess, mutationRateLimiter, async (req, res) => {
  try {
    const schema = z.object({
      body: z.string().min(1).max(5000),
      mentions: z.array(z.string().cuid()).max(50).default([]),
    });
    const data = schema.parse(req.body);
    const cardId = (req.params.cardId ?? req.params.id) as string;
    const authorUserId = req.session.userId!;

    const comment = await boardService.addComment(cardId, authorUserId, data.body);

    let notificationsCreated = 0;
    if (data.mentions.length > 0) {
      notificationsCreated = await createNotificationsForMentions({
        cardId,
        authorUserId,
        mentionedUserIds: data.mentions,
      });
    }

    res.status(201).json({ comment });
    emitBoardInvalidate('comments');
    if (notificationsCreated > 0) {
      emitBoardInvalidate('notifications');
    }
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
 * PATCH /cards/:cardId/comments/:commentId
 * Author-only edit within the 10-minute window. Returns:
 *  - 404 NOT_FOUND when the comment id is unknown
 *  - 403 NOT_AUTHOR when the caller did not write the comment
 *  - 403 WINDOW_EXPIRED when more than EDIT_WINDOW_MS has elapsed
 *  - 410 ALREADY_DELETED when the comment has been soft-deleted
 *  - 200 with the updated row on success
 */
router.patch(
  '/:commentId',
  requireAuth,
  requireCardAccess,
  mutationRateLimiter,
  async (req, res) => {
    try {
      const schema = z.object({ body: z.string().min(1).max(5000) });
      const { body } = schema.parse(req.body);
      const commentId = req.params.commentId as string;
      const userId = req.session.userId!;
      const updated = await editComment(commentId, userId, body);
      res.json({ comment: updated });
      emitBoardInvalidate('comments');
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.issues[0].message });
      }
      if (error instanceof CommentEditError) {
        const status =
          error.code === 'NOT_FOUND'
            ? 404
            : error.code === 'ALREADY_DELETED'
              ? 410
              : 403; // NOT_AUTHOR | WINDOW_EXPIRED
        return res.status(status).json({ error: error.code });
      }
      console.error('[board routes] Error editing comment:', error);
      res.status(500).json({ error: 'Failed to edit comment' });
    }
  },
);

/**
 * DELETE /cards/:cardId/comments/:commentId
 * Soft-delete: sets `isDeleted=true, deletedAt=now()`. Author may delete
 * own comments anytime (no edit-window restriction); ADMIN/PM may delete
 * any. The row is preserved so the GET list can render the placeholder.
 */
router.delete(
  '/:commentId',
  requireAuth,
  requireCardAccess,
  mutationRateLimiter,
  async (req, res) => {
    try {
      const commentId = req.params.commentId as string;
      const comment = await boardService.getComment(commentId);
      if (!comment) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      const userRole = req.session.role ?? '';
      const isPMOrAbove = userRole === 'PM' || userRole === 'ADMIN';
      const isAuthor = comment.authorId === req.session.userId;
      if (!isPMOrAbove && !isAuthor) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      await softDeleteComment(commentId);
      res.json({ success: true });
      emitBoardInvalidate('comments');
    } catch (error) {
      console.error('[board routes] Error deleting comment:', error);
      res.status(500).json({ error: 'Failed to delete comment' });
    }
  },
);

export default router;
