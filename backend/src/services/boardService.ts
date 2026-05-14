import { prisma } from '@/db/prisma.js';

interface ChecklistItem {
  label: string;
  checked: boolean;
  order: number;
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { label: 'Kickoff', checked: false, order: 0 },
  { label: 'Requirements', checked: false, order: 1 },
  { label: 'Pentest', checked: false, order: 2 },
  { label: 'Report', checked: false, order: 3 },
  { label: 'Review', checked: false, order: 4 },
  { label: 'Delivery', checked: false, order: 5 },
];

/**
 * Parse JSON-stringified checklist back to array for API responses.
 * SQLite stores checklist as JSON string; this ensures consumers get a real array.
 */
function parseChecklist<T extends { checklist: string | unknown }>(
  card: T
): T & { checklist: ChecklistItem[] } {
  return {
    ...card,
    checklist:
      typeof card.checklist === 'string'
        ? (JSON.parse(card.checklist) as ChecklistItem[])
        : (card.checklist as ChecklistItem[]) ?? [],
  };
}

/** Serialise checklist items to JSON string for storage. */
function serialiseChecklist(items: ChecklistItem[]): string {
  return JSON.stringify(items);
}

/**
 * Phase 24-R02: server-side resolution of which Assignment fields back this
 * card. A BoardCard.side === 'secondary' card reads its project name / color
 * / status / tags from the assignment's split* columns; primary reads from
 * the primary columns. The returned shape is the same as the legacy single-
 * card view, so existing FE code paths reading card.assignment.projectName
 * keep working without changes.
 */
function resolveCardSide<
  T extends {
    side: string;
    assignment: Record<string, unknown> | null;
  }
>(card: T): T {
  if (!card.assignment) return card;
  if (card.side !== 'secondary') return card;
  const a = card.assignment as Record<string, unknown> & {
    projectName?: string;
    projectColor?: string;
    status?: string;
    tags?: unknown;
    splitProjectName?: string | null;
    splitProjectColor?: string | null;
    splitProjectStatus?: string | null;
    splitClientId?: string | null;
    splitTags?: unknown;
  };
  return {
    ...card,
    assignment: {
      ...a,
      projectName: a.splitProjectName ?? '',
      projectColor: a.splitProjectColor ?? a.projectColor,
      status: a.splitProjectStatus ?? a.status,
      clientId: a.splitClientId ?? null,
      tags: a.splitTags ?? '[]',
    },
  };
}

/**
 * List board cards with optional filters.
 */
export async function listCards(filters: { stage?: string; assignmentId?: string; side?: string }) {
  const where: Record<string, unknown> = {};
  if (filters.stage) where.stage = filters.stage;
  if (filters.assignmentId) where.assignmentId = filters.assignmentId;
  if (filters.side) where.side = filters.side;

  const cards = await prisma.boardCard.findMany({
    where,
    // Phase 24-05: include teamMember.userId so the FE "My Projects" filter
    // can compare against the current user's User.id (TeamMember.id and User.id
    // are different identifiers — see schema.prisma TeamMember.userId).
    // This is a READ-only join expansion — zero schedule writes.
    include: {
      assignment: {
        include: {
          teamMember: {
            select: {
              userId: true,
              displayName: true,
              user: { select: { displayName: true, username: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return cards.map((c) => resolveCardSide(parseChecklist(c)));
}

/**
 * Get a single board card by ID with comments, files, and assignment.
 */
export async function getCard(id: string) {
  const card = await prisma.boardCard.findUnique({
    where: { id },
    include: {
      // Phase 24-05: same include expansion as listCards — surfaces
      // teamMember.userId for the FE filter without leaking other TeamMember
      // fields. READ-only join, no schedule writes.
      assignment: {
        include: {
          teamMember: {
            select: {
              userId: true,
              displayName: true,
              user: { select: { displayName: true, username: true } },
            },
          },
        },
      },
      comments: {
        include: { author: true },
        orderBy: { createdAt: 'asc' },
      },
      files: true,
    },
  });
  if (!card) return null;
  return resolveCardSide(parseChecklist(card));
}

/**
 * Create a new board card.
 */
export async function createCard(data: {
  assignmentId?: string;
  stage?: string;
  checklist?: ChecklistItem[];
  notes?: string;
}) {
  const card = await prisma.boardCard.create({
    data: {
      assignmentId: data.assignmentId ?? null,
      stage: data.stage ?? 'upcoming',
      checklist: serialiseChecklist(data.checklist ?? DEFAULT_CHECKLIST),
      notes: data.notes ?? '',
    },
    include: { assignment: true },
  });
  return parseChecklist(card);
}

/**
 * Update a board card by ID (partial update).
 */
export async function updateCard(
  id: string,
  data: {
    stage?: string;
    notes?: string;
    checklist?: ChecklistItem[];
    stageLockedBy?: string | null;
    archivedAt?: Date | null;
  }
) {
  const updateData: Record<string, unknown> = {};
  if (data.stage !== undefined) updateData.stage = data.stage;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.checklist !== undefined) updateData.checklist = serialiseChecklist(data.checklist);
  if (data.stageLockedBy !== undefined) updateData.stageLockedBy = data.stageLockedBy;
  if (data.archivedAt !== undefined) updateData.archivedAt = data.archivedAt;

  const card = await prisma.boardCard.update({
    where: { id },
    data: updateData,
    include: { assignment: true },
  });
  return parseChecklist(card);
}

/**
 * Auto-move cards based on checklist completion progress.
 * Only moves cards where stageLockedBy is null or 'auto' (respects manual overrides).
 * Returns the count of cards moved.
 */
export async function autoMoveCards(): Promise<number> {
  const cards = await prisma.boardCard.findMany({
    where: {
      stage: { not: 'archived' },
      OR: [
        { stageLockedBy: null },
        { stageLockedBy: 'auto' },
      ],
    },
  });

  let movedCount = 0;

  for (const card of cards) {
    const checklist: ChecklistItem[] =
      typeof card.checklist === 'string'
        ? (JSON.parse(card.checklist) as ChecklistItem[])
        : (card.checklist as ChecklistItem[]) ?? [];

    const total = checklist.length;
    if (total === 0) continue;

    const checked = checklist.filter((item) => item.checked).length;
    const progress = checked / total;

    // Determine target stage based on checklist progress
    let targetStage: string;
    if (progress === 0) {
      targetStage = 'upcoming';
    } else if (progress < 0.25) {
      targetStage = 'preparation';
    } else if (progress < 0.75) {
      targetStage = 'execution';
    } else if (progress < 1) {
      targetStage = 'closing';
    } else {
      targetStage = 'done';
    }

    if (targetStage !== card.stage) {
      await prisma.boardCard.update({
        where: { id: card.id },
        data: { stage: targetStage, stageLockedBy: 'auto' },
      });
      movedCount++;
    }
  }

  return movedCount;
}

/**
 * Phase 24-R02: a split assignment has secondary data when either the split
 * project name has content or a split client is set. Matches FE handleSave
 * logic in AssignmentModal.
 */
function hasSecondaryData(a: {
  splitProjectName: string | null;
  splitClientId: string | null;
}): boolean {
  return !!(a.splitProjectName?.trim()) || !!a.splitClientId;
}

/**
 * Sync board cards from assignments. Creates a primary card for every
 * assignment that lacks one, plus a secondary card for every assignment
 * that has split data but no secondary card yet. Idempotent — safe to
 * call repeatedly.
 */
export async function syncCardsFromAssignments(): Promise<{ created: number }> {
  const assignments = await prisma.assignment.findMany({
    include: { boardCards: true },
  });

  let created = 0;
  for (const assignment of assignments) {
    const hasPrimary = assignment.boardCards.some((c) => c.side === 'primary');
    const hasSecondary = assignment.boardCards.some((c) => c.side === 'secondary');
    const needsSecondary = hasSecondaryData(assignment);

    if (!hasPrimary) {
      await prisma.boardCard.create({
        data: {
          assignmentId: assignment.id,
          side: 'primary',
          stage: 'upcoming',
          checklist: JSON.stringify(DEFAULT_CHECKLIST),
          notes: '',
        },
      });
      created++;
    }

    if (needsSecondary && !hasSecondary) {
      await prisma.boardCard.create({
        data: {
          assignmentId: assignment.id,
          side: 'secondary',
          stage: 'upcoming',
          checklist: JSON.stringify(DEFAULT_CHECKLIST),
          notes: '',
        },
      });
      created++;
    }
  }

  return { created };
}

/**
 * Phase 24-R02: reconcile BoardCards for one assignment to match its split
 * state. Always called after upsertAssignment to keep cards in sync.
 *
 * - Ensures a primary card exists.
 * - Creates a secondary card if the assignment has split data and none exists.
 * - Deletes the secondary card if the assignment no longer has split data,
 *   UNLESS `removedSide === 'primary'` — in that case the secondary card is
 *   promoted to primary (preserving its notes/files/comments) and the old
 *   primary card is deleted instead. This is the "Remove primary half"
 *   user flow from AssignmentModal.
 *
 * For the simpler "Remove secondary half" flow, the caller does not pass
 * removedSide and the default deletion of the now-unbacked secondary card
 * happens automatically.
 */
export async function reconcileCardsForAssignment(
  assignmentId: string,
  removedSide?: 'primary' | 'secondary',
): Promise<void> {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { boardCards: true },
  });
  if (!assignment) return;

  const primary = assignment.boardCards.find((c) => c.side === 'primary');
  const secondary = assignment.boardCards.find((c) => c.side === 'secondary');

  if (removedSide === 'primary') {
    // Old primary's content is gone; the old secondary is the new primary in the row.
    // Drop the old primary card, promote the old secondary card (keeps its notes/files).
    if (primary) {
      await prisma.boardCard.delete({ where: { id: primary.id } });
    }
    if (secondary) {
      await prisma.boardCard.update({
        where: { id: secondary.id },
        data: { side: 'primary' },
      });
    } else {
      await prisma.boardCard.create({
        data: {
          assignmentId,
          side: 'primary',
          stage: 'upcoming',
          checklist: JSON.stringify(DEFAULT_CHECKLIST),
          notes: '',
        },
      });
    }
    return;
  }

  // Default path (incl. removedSide==='secondary' and ordinary upserts):
  // Ensure primary exists. Match secondary state to whether assignment has split data.
  if (!primary) {
    await prisma.boardCard.create({
      data: {
        assignmentId,
        side: 'primary',
        stage: 'upcoming',
        checklist: JSON.stringify(DEFAULT_CHECKLIST),
        notes: '',
      },
    });
  }

  const needsSecondary = hasSecondaryData(assignment);
  if (needsSecondary && !secondary) {
    await prisma.boardCard.create({
      data: {
        assignmentId,
        side: 'secondary',
        stage: 'upcoming',
        checklist: JSON.stringify(DEFAULT_CHECKLIST),
        notes: '',
      },
    });
  } else if (!needsSecondary && secondary) {
    await prisma.boardCard.delete({ where: { id: secondary.id } });
  }
}

/**
 * Back-compat shim for callers that don't need side-aware reconciliation
 * (e.g., the post-swap repair in assignmentService.swapAssignments).
 * Delegates to reconcileCardsForAssignment which is the proper entry point.
 */
export async function createCardForAssignment(assignmentId: string): Promise<void> {
  await reconcileCardsForAssignment(assignmentId);
}

/**
 * Delete a board card by ID.
 */
export async function deleteCard(id: string) {
  return prisma.boardCard.delete({ where: { id } });
}

/**
 * Add a comment to a board card.
 */
export async function addComment(cardId: string, authorId: string, body: string) {
  return prisma.boardComment.create({
    data: { cardId, authorId, body },
    include: { author: true },
  });
}

/**
 * Delete a comment by ID.
 */
export async function deleteComment(commentId: string) {
  return prisma.boardComment.delete({ where: { id: commentId } });
}

/**
 * Get a single comment by ID (for ownership checks).
 */
export async function getComment(commentId: string) {
  return prisma.boardComment.findUnique({ where: { id: commentId } });
}

/**
 * List files for a board card.
 */
export async function listFiles(cardId: string) {
  return prisma.boardFile.findMany({ where: { cardId } });
}

/**
 * Create a file record for a board card.
 */
export async function addFile(data: {
  cardId: string;
  filename: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy?: string;
}) {
  return prisma.boardFile.create({
    data: {
      cardId: data.cardId,
      filename: data.filename,
      storedName: data.storedName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      uploadedBy: data.uploadedBy ?? null,
    },
  });
}

/**
 * Delete a file record by ID. Returns the deleted record (caller handles disk deletion).
 */
export async function deleteFile(fileId: string) {
  return prisma.boardFile.delete({ where: { id: fileId } });
}

/**
 * Get a single file record by ID.
 */
export async function getFile(fileId: string) {
  return prisma.boardFile.findUnique({ where: { id: fileId } });
}
