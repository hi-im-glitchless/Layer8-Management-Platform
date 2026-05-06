/**
 * boardCommentService — edit-window enforcement and soft-delete for BoardComment.
 *
 * SCHEDULE-ISOLATION INVARIANT: this module MUST NOT read or write
 * Assignment / TeamMember / Absence / Holiday tables. The board feature has
 * a non-negotiable no-write boundary against the schedule domain (see
 * 23-CONTEXT.md "Data Safety — Schedule Protection"). Only `BoardComment`
 * is touched here.
 */
import { prisma } from '@/db/prisma.js';

/** Authors may edit their own comments within 10 minutes of createdAt (CONTEXT.md). */
export const EDIT_WINDOW_MS = 10 * 60 * 1000;

export type CommentEditErrorCode =
  | 'NOT_FOUND'
  | 'NOT_AUTHOR'
  | 'WINDOW_EXPIRED'
  | 'ALREADY_DELETED';

export class CommentEditError extends Error {
  constructor(public readonly code: CommentEditErrorCode) {
    super(code);
    this.name = 'CommentEditError';
  }
}

/**
 * Edit a comment body. Throws `CommentEditError` on policy violations:
 *  - NOT_FOUND       — comment does not exist
 *  - ALREADY_DELETED — comment is soft-deleted
 *  - NOT_AUTHOR      — caller is not the author
 *  - WINDOW_EXPIRED  — more than EDIT_WINDOW_MS elapsed since createdAt
 *
 * Returns the updated comment with its author relation.
 */
export async function editComment(commentId: string, userId: string, body: string) {
  const c = await prisma.boardComment.findUnique({ where: { id: commentId } });
  if (!c) throw new CommentEditError('NOT_FOUND');
  if (c.isDeleted) throw new CommentEditError('ALREADY_DELETED');
  if (c.authorId !== userId) throw new CommentEditError('NOT_AUTHOR');
  if (Date.now() - c.createdAt.getTime() > EDIT_WINDOW_MS) {
    throw new CommentEditError('WINDOW_EXPIRED');
  }
  return prisma.boardComment.update({
    where: { id: commentId },
    data: { body, editedAt: new Date() },
    include: { author: true },
  });
}

/**
 * Soft-delete a comment. Caller must already be authorised (ADMIN or author).
 * Idempotent: re-deleting a soft-deleted comment is a no-op-style update.
 */
export async function softDeleteComment(commentId: string) {
  return prisma.boardComment.update({
    where: { id: commentId },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}
