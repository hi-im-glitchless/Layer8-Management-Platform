import { prisma } from '@/db/prisma.js';
import { parseTags } from './projectService.js';

export interface ChecklistItem {
  label: string;
  checked: boolean;
  order: number;
}

export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { label: 'Kickoff', checked: false, order: 0 },
  { label: 'Requirements', checked: false, order: 1 },
  { label: 'Pentest', checked: false, order: 2 },
  { label: 'Report', checked: false, order: 3 },
  { label: 'Review', checked: false, order: 4 },
  { label: 'Delivery', checked: false, order: 5 },
  { label: "Report is on client's share", checked: false, order: 6 },
];

/**
 * Phase 03-01: label of the standard "Report is on client's share" checklist
 * item. Defined here (not only inside DEFAULT_CHECKLIST) so the one-off backfill
 * script and its unit test can share the exact-label idempotency key.
 */
export const NEW_ITEM_LABEL = "Report is on client's share";

/**
 * Pure transform for the Phase 03-01 checklist backfill (append the
 * "Report is on client's share" item to an existing card's checklist).
 *
 * Lives in the service layer — not inside the `backend/scripts/*` one-off —
 * because the repo's tsconfig `rootDir` is `src`, so a `src/**` test may not
 * import a file under `scripts/` (TS6059). The backfill script imports and
 * re-exports this function and drives it over every BoardCard in its `main()`;
 * the unit test imports it directly (no DB, no `main()` side effects).
 *
 * - Parses `rawChecklistJson`; if the parse throws or the result is not an
 *   array, the checklist is treated as `[]`.
 * - If an item with `label === NEW_ITEM_LABEL` already exists, returns the
 *   parsed items unchanged with `changed: false` (idempotent, exact-label
 *   match, case- and whitespace-sensitive).
 * - Otherwise appends the item at `max(order) + 1` (or `0` for an empty list)
 *   and returns `changed: true`.
 */
export function backfillChecklist(rawChecklistJson: string): {
  checklist: ChecklistItem[];
  changed: boolean;
} {
  let items: ChecklistItem[];
  try {
    const parsed = JSON.parse(rawChecklistJson) as unknown;
    items = Array.isArray(parsed) ? (parsed as ChecklistItem[]) : [];
  } catch {
    // Malformed JSON-in-TEXT — treat as empty rather than crash the run.
    items = [];
  }

  if (items.some((i) => i.label === NEW_ITEM_LABEL)) {
    return { checklist: items, changed: false };
  }

  const nextOrder = items.length
    ? Math.max(...items.map((i) => i.order)) + 1
    : 0;
  const next = [
    ...items,
    { label: NEW_ITEM_LABEL, checked: false, order: nextOrder },
  ];
  return { checklist: next, changed: true };
}

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
 * Phase 24-R03: shape an Assignment row into "the half that links to this
 * Project". Used when assembling the pentester list for a Planner card.
 */
function shapeAssignmentForCard(
  a: {
    id: string;
    teamMemberId: string;
    weekStart: Date;
    projectId: string | null;
    splitProjectId: string | null;
    teamMember: {
      userId: string | null;
      displayName: string | null;
      user: { displayName: string | null; username: string; avatarUrl: string | null } | null;
    } | null;
  },
  projectId: string,
): {
  assignmentId: string;
  teamMemberId: string;
  weekStart: Date;
  side: 'primary' | 'secondary';
  teamMember: {
    userId: string | null;
    displayName: string | null;
    user: { displayName: string | null; username: string; avatarUrl: string | null } | null;
  } | null;
} {
  const side: 'primary' | 'secondary' = a.projectId === projectId ? 'primary' : 'secondary';
  return {
    assignmentId: a.id,
    teamMemberId: a.teamMemberId,
    weekStart: a.weekStart,
    side,
    teamMember: a.teamMember,
  };
}

const ASSIGNMENT_TEAM_MEMBER_SELECT = {
  select: {
    userId: true,
    displayName: true,
    user: { select: { displayName: true, username: true, avatarUrl: true } },
  },
} as const;

/**
 * List board cards (one per Project) with their project metadata and the
 * full set of pentester assignments that reference each Project.
 */
export async function listCards(filters: { stage?: string; projectId?: string }) {
  const where: Record<string, unknown> = {};
  if (filters.stage) where.stage = filters.stage;
  if (filters.projectId) where.projectId = filters.projectId;

  const cards = await prisma.boardCard.findMany({
    where,
    include: {
      project: {
        include: {
          client: { select: { id: true, name: true, color: true } },
          primaryAssignments: {
            include: { teamMember: ASSIGNMENT_TEAM_MEMBER_SELECT },
          },
          splitAssignments: {
            include: { teamMember: ASSIGNMENT_TEAM_MEMBER_SELECT },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return cards.map((card) => {
    const project = card.project;
    const assignments = [
      ...project.primaryAssignments.map((a) => shapeAssignmentForCard(a, project.id)),
      ...project.splitAssignments.map((a) => shapeAssignmentForCard(a, project.id)),
    ];
    const { primaryAssignments: _p, splitAssignments: _s, ...projectMeta } = project;
    void _p; void _s;
    return {
      ...parseChecklist(card),
      project: {
        ...projectMeta,
        tags: parseTags(projectMeta.tags),
      },
      assignments,
    };
  });
}

/** Get a single board card by id with project + assignments + comments + files. */
export async function getCard(id: string) {
  const card = await prisma.boardCard.findUnique({
    where: { id },
    include: {
      project: {
        include: {
          client: { select: { id: true, name: true, color: true } },
          primaryAssignments: {
            include: { teamMember: ASSIGNMENT_TEAM_MEMBER_SELECT },
          },
          splitAssignments: {
            include: { teamMember: ASSIGNMENT_TEAM_MEMBER_SELECT },
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
  const { primaryAssignments, splitAssignments, ...projectMeta } = card.project;
  const assignments = [
    ...primaryAssignments.map((a) => shapeAssignmentForCard(a, card.project.id)),
    ...splitAssignments.map((a) => shapeAssignmentForCard(a, card.project.id)),
  ];
  return {
    ...parseChecklist(card),
    project: {
      ...projectMeta,
      tags: parseTags(projectMeta.tags),
    },
    assignments,
  };
}

/**
 * Update a board card by ID (partial update). Project metadata is managed
 * via projectService; card fields here are only the Planner-owned ones
 * (stage, notes, checklist, lock, archive).
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
    include: { project: true },
  });
  return parseChecklist(card);
}

/** Monday (UTC, 00:00) of the week containing `date`, as YYYY-MM-DD. */
function getMondayISO(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Auto-move cards based on the earliest linked assignment's weekStart.
 * Behaviour (per team decision):
 *  - earliest assignment week > next Monday → 'upcoming'
 *  - earliest assignment week == next Monday → 'preparation' (label: "Next Week")
 *  - earliest assignment week <= current Monday → not touched (PMs drive the
 *    Execution → Closing → Done flow manually by dragging)
 *  - cards with no linked assignments are not touched
 *
 * Only moves cards where `stageLockedBy` is null or 'auto' so manual drags
 * (which set `stageLockedBy` to the user's id) stick permanently. Use the
 * resetAutoMove endpoint to re-enable auto-management.
 */
export async function autoMoveCards(): Promise<number> {
  const cards = await prisma.boardCard.findMany({
    where: {
      stage: { notIn: ['archived', 'stopped'] },
      OR: [
        { stageLockedBy: null },
        { stageLockedBy: 'auto' },
      ],
    },
    include: {
      project: {
        select: {
          primaryAssignments: { select: { weekStart: true } },
          splitAssignments: { select: { weekStart: true } },
        },
      },
    },
  });

  const today = new Date();
  const currentMondayISO = getMondayISO(today);
  const nextMondayISO = getMondayISO(
    new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000),
  );

  let movedCount = 0;

  for (const card of cards) {
    const weeks: Date[] = [
      ...card.project.primaryAssignments.map((a) => a.weekStart),
      ...card.project.splitAssignments.map((a) => a.weekStart),
    ];
    if (weeks.length === 0) continue;

    const earliestISO = weeks
      .map((w) => new Date(w).toISOString().slice(0, 10))
      .sort()[0];

    let targetStage: string | null = null;
    if (earliestISO > nextMondayISO) {
      targetStage = 'upcoming';
    } else if (earliestISO === nextMondayISO) {
      targetStage = 'preparation';
    }
    // earliestISO <= currentMondayISO → leave alone (manual control)
    void currentMondayISO;

    if (targetStage && targetStage !== card.stage) {
      await prisma.boardCard.update({
        where: { id: card.id },
        data: { stage: targetStage, stageLockedBy: 'auto' },
      });
      movedCount++;
    }
  }

  return movedCount;
}

/** Delete a board card by ID. */
export async function deleteCard(id: string) {
  return prisma.boardCard.delete({ where: { id } });
}

/** Add a comment to a board card. */
export async function addComment(cardId: string, authorId: string, body: string) {
  return prisma.boardComment.create({
    data: { cardId, authorId, body },
    include: { author: true },
  });
}

/** Delete a comment by ID. */
export async function deleteComment(commentId: string) {
  return prisma.boardComment.delete({ where: { id: commentId } });
}

/** Get a single comment by ID (for ownership checks). */
export async function getComment(commentId: string) {
  return prisma.boardComment.findUnique({ where: { id: commentId } });
}

/** List files for a board card. */
export async function listFiles(cardId: string) {
  return prisma.boardFile.findMany({ where: { cardId } });
}

/** Create a file record for a board card. */
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

/** Delete a file record by ID. Returns the deleted record. */
export async function deleteFile(fileId: string) {
  return prisma.boardFile.delete({ where: { id: fileId } });
}

/** Get a single file record by ID. */
export async function getFile(fileId: string) {
  return prisma.boardFile.findUnique({ where: { id: fileId } });
}
