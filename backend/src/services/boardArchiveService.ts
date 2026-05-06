/**
 * boardArchiveService — typed-confirmation card archive flow.
 *
 * SCHEDULE-ISOLATION INVARIANT (DO NOT REMOVE):
 *   This module MUST NOT call `prisma.assignment.*`, `prisma.teamMember.*`,
 *   `prisma.absence.*`, or `prisma.holiday.*` for any operation other than
 *   the read-only `BoardCard.assignment` join below (which fetches only the
 *   linked Assignment's `projectName`). Any future edit must preserve this
 *   invariant; reviewers should reject changes that introduce schedule-domain
 *   writes here. The board archive flow has a non-negotiable no-write
 *   boundary against the schedule domain (see 23-CONTEXT.md "Data Safety —
 *   Schedule Protection").
 */
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@/db/prisma.js';

export type ArchiveErrorCode = 'NOT_FOUND' | 'PROJECT_NAME_MISMATCH' | 'NO_ASSIGNMENT';

export class ArchiveError extends Error {
  constructor(public readonly code: ArchiveErrorCode) {
    super(code);
    this.name = 'ArchiveError';
  }
}

export interface ArchiveAuditDetails {
  cardId: string;
  projectName: string;
  fileCount: number;
  totalBytes: number;
  adminId: string;
}

/**
 * Archive a board card. Validates the typed-confirmation project name, hard-
 * deletes attached files (DB rows + on-disk bytes), and marks the card
 * archived (`stage='archived'`, `archivedAt=now()`). Comments + notes +
 * checklist are preserved per CONTEXT.md "metadata retention".
 *
 * The linked Assignment is read-only here — only `projectName` is fetched
 * for confirmation, never written.
 *
 * Throws `ArchiveError` on policy violations:
 *   - NOT_FOUND               — card does not exist
 *   - NO_ASSIGNMENT           — card has no linked Assignment (cannot confirm)
 *   - PROJECT_NAME_MISMATCH   — typed name does not exactly match
 *
 * Returns the audit-detail payload for the route layer to log.
 */
export async function archiveCard(
  cardId: string,
  confirmProjectName: string,
  adminUserId: string,
): Promise<ArchiveAuditDetails> {
  const card = await prisma.boardCard.findUnique({
    where: { id: cardId },
    include: {
      assignment: { select: { projectName: true } }, // READ-ONLY — invariant
      files: { select: { id: true, storedName: true, sizeBytes: true } },
    },
  });
  if (!card) throw new ArchiveError('NOT_FOUND');
  if (!card.assignment) throw new ArchiveError('NO_ASSIGNMENT');
  if (card.assignment.projectName !== confirmProjectName) {
    throw new ArchiveError('PROJECT_NAME_MISMATCH');
  }

  const fileCount = card.files.length;
  const totalBytes = card.files.reduce((sum, f) => sum + f.sizeBytes, 0);

  // Disk unlink first (best-effort: ENOENT must not block the archive).
  for (const f of card.files) {
    const onDisk = path.join(process.cwd(), 'uploads', 'board', cardId, f.storedName);
    try {
      fs.unlinkSync(onDisk);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.error('[boardArchive] failed to unlink file:', onDisk, err);
      }
    }
  }

  // Atomic DB cleanup: delete BoardFile rows + flip card to archived.
  // Comments, notes, checklist, BoardNotification rows are intentionally preserved.
  await prisma.$transaction([
    prisma.boardFile.deleteMany({ where: { cardId } }),
    prisma.boardCard.update({
      where: { id: cardId },
      data: { archivedAt: new Date(), stage: 'archived' },
    }),
  ]);

  return {
    cardId,
    projectName: card.assignment.projectName,
    fileCount,
    totalBytes,
    adminId: adminUserId,
  };
}
