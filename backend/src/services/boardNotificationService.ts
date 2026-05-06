/**
 * boardNotificationService — write-side helpers for `BoardNotification`.
 *
 * SCHEDULE-ISOLATION INVARIANT: this module MUST NOT read or write
 * Assignment / TeamMember / Absence / Holiday tables. The board feature has
 * a non-negotiable no-write boundary against the schedule domain (see
 * 23-CONTEXT.md "Data Safety — Schedule Protection"). Only `BoardNotification`
 * is written here, with read-only validation against the `User` table.
 */
import { prisma } from '@/db/prisma.js';

/**
 * Persist `BoardNotification` rows for each mentioned user. Unknown user IDs
 * are silently dropped (per 23-CONTEXT.md: a comment with bad mentions still
 * posts), as are self-mentions (no point notifying yourself). Returns the
 * count of rows actually created.
 */
export async function createNotificationsForMentions(opts: {
  cardId: string;
  authorUserId: string | null;
  mentionedUserIds: string[];
  type?: 'mention' | 'comment';
}): Promise<number> {
  const { cardId, authorUserId, mentionedUserIds, type = 'mention' } = opts;
  if (mentionedUserIds.length === 0) return 0;

  const candidates = mentionedUserIds.filter((id) => id !== authorUserId);
  if (candidates.length === 0) return 0;

  const valid = await prisma.user.findMany({
    where: { id: { in: candidates } },
    select: { id: true },
  });
  if (valid.length === 0) return 0;

  const result = await prisma.boardNotification.createMany({
    data: valid.map((u) => ({ userId: u.id, cardId, type })),
  });
  return result.count;
}
