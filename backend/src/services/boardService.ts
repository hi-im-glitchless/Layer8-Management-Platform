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
 * List board cards with optional filters.
 */
export async function listCards(filters: { stage?: string; assignmentId?: string }) {
  const where: Record<string, unknown> = {};
  if (filters.stage) where.stage = filters.stage;
  if (filters.assignmentId) where.assignmentId = filters.assignmentId;

  const cards = await prisma.boardCard.findMany({
    where,
    include: { assignment: true },
    orderBy: { createdAt: 'desc' },
  });
  return cards.map(parseChecklist);
}

/**
 * Get a single board card by ID with comments, files, and assignment.
 */
export async function getCard(id: string) {
  const card = await prisma.boardCard.findUnique({
    where: { id },
    include: {
      assignment: true,
      comments: {
        include: { author: true },
        orderBy: { createdAt: 'asc' },
      },
      files: true,
    },
  });
  if (!card) return null;
  return parseChecklist(card);
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
