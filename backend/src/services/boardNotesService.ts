/**
 * boardNotesService — last-write-wins update of the per-card notes blob.
 *
 * SCHEDULE-ISOLATION INVARIANT: this module MUST NOT read or write
 * Assignment / TeamMember / Absence / Holiday tables. The board feature has
 * a non-negotiable no-write boundary against the schedule domain (see
 * 23-CONTEXT.md "Data Safety — Schedule Protection"). Only `BoardCard` is
 * touched here, and only for its `notes` / `notesUpdatedAt` / `notesUpdatedBy`
 * columns.
 */
import { prisma } from '@/db/prisma.js';

/**
 * Last-write-wins update of a card's notes blob. Sets `notesUpdatedAt` to
 * `now()` and `notesUpdatedBy` to the editing user's id. Returns a thin
 * card snapshot suitable for echoing back to the client.
 */
export async function updateNotes(cardId: string, notes: string, editorUserId: string) {
  return prisma.boardCard.update({
    where: { id: cardId },
    data: {
      notes,
      notesUpdatedAt: new Date(),
      notesUpdatedBy: editorUserId,
    },
    select: {
      id: true,
      notes: true,
      notesUpdatedAt: true,
      notesUpdatedBy: true,
    },
  });
}
