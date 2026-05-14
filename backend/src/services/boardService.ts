import { prisma } from '@/db/prisma.js';
import { parseTags } from './projectService.js';

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
      user: { displayName: string | null; username: string } | null;
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
    user: { displayName: string | null; username: string } | null;
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
    user: { select: { displayName: true, username: true } },
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
