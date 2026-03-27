import { prisma } from '@/db/prisma.js';
import { upsertProjectColor } from '@/services/scheduleService.js';

/**
 * Parse JSON-stringified tag fields back to arrays for API responses.
 * SQLite stores tags as JSON strings; this ensures consumers get real arrays.
 */
function parseTagFields<T extends { tags?: string | unknown; splitTags?: string | unknown }>(
  assignment: T
): T & { tags: string[]; splitTags: string[] } {
  return {
    ...assignment,
    tags: typeof assignment.tags === 'string' ? JSON.parse(assignment.tags) : assignment.tags ?? [],
    splitTags: typeof assignment.splitTags === 'string' ? JSON.parse(assignment.splitTags) : assignment.splitTags ?? [],
  };
}

/** Predefined valid tag values for assignment categorization. */
export const VALID_TAGS = [
  'Web', 'Mobile', 'API', 'Cloud', 'Docker', 'Externa', 'Interna', 'Red Team',
  'Phishing', 'OSINT', 'Esoterico', 'Fisico', 'Ransomware/Malware', 'Chatbot', 'Cert', 'Outro',
] as const;

/**
 * Validate that all tags are from the predefined set.
 * Returns the validated array or throws on invalid tags.
 */
function validateTags(tags: string[]): string[] {
  const invalid = tags.filter((t) => !(VALID_TAGS as readonly string[]).includes(t));
  if (invalid.length > 0) {
    throw new Error(`Invalid tags: ${invalid.join(', ')}. Valid tags: ${VALID_TAGS.join(', ')}`);
  }
  return tags;
}

/**
 * Get the date range for a year/quarter filter.
 */
/**
 * Get the date range for fetching assignments.
 * Extends start back to the Monday of the week containing the period start,
 * so assignments on boundary weeks (e.g., Dec 29 for a Jan 1 year start) are included.
 */
function getDateRange(year: number, quarter?: number): { start: Date; end: Date } {
  let start: Date;
  let end: Date;

  if (quarter) {
    const startMonth = (quarter - 1) * 3;
    start = new Date(year, startMonth, 1);
    end = new Date(year, startMonth + 3, 1);
  } else {
    start = new Date(year, 0, 1);
    end = new Date(year + 1, 0, 1);
  }

  // Extend start back to the Monday of the week containing the start date
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);

  return { start, end };
}

/**
 * List assignments filtered by year and optional quarter, with team member info.
 */
export async function listAssignments(params: {
  year: number;
  quarter?: number;
  teamMemberId?: string;
}) {
  const { start, end } = getDateRange(params.year, params.quarter);

  const assignments = await prisma.assignment.findMany({
    where: {
      weekStart: { gte: start, lt: end },
      ...(params.teamMemberId ? { teamMemberId: params.teamMemberId } : {}),
    },
    orderBy: [{ weekStart: 'asc' }, { teamMemberId: 'asc' }],
    include: {
      teamMember: {
        include: {
          user: {
            select: { username: true, displayName: true },
          },
        },
      },
      client: true,
      splitClient: true,
    },
  });
  return assignments.map(parseTagFields);
}

/**
 * Create or update an assignment by (teamMemberId, weekStart).
 * Uses a transaction to find-then-update/create, preventing data loss
 * when the project name changes on an existing slot.
 * Also upserts project colors for autocomplete.
 */
export async function upsertAssignment(data: {
  teamMemberId: string;
  projectName: string;
  projectColor: string;
  status: string;
  weekStart: Date;
  splitProjectName?: string | null;
  splitProjectColor?: string | null;
  splitProjectStatus?: string | null;
  splitClientId?: string | null;
  splitTags?: string[];
  createdBy?: string | null;
  clientId?: string | null;
  tags?: string[];
}) {
  if (data.projectName) {
    await upsertProjectColor(data.projectName, data.projectColor);
  }

  if (data.splitProjectName && data.splitProjectColor) {
    await upsertProjectColor(data.splitProjectName, data.splitProjectColor);
  }

  // Validate tags if provided
  const validatedTags = data.tags ? validateTags(data.tags) : undefined;
  const validatedSplitTags = data.splitTags ? validateTags(data.splitTags) : undefined;

  // Validate clientId exists if provided
  if (data.clientId) {
    const client = await prisma.client.findUnique({ where: { id: data.clientId } });
    if (!client) {
      throw new Error(`Client with id "${data.clientId}" not found`);
    }
  }

  // Validate splitClientId exists if provided
  if (data.splitClientId) {
    const client = await prisma.client.findUnique({ where: { id: data.splitClientId } });
    if (!client) {
      throw new Error(`Client with id "${data.splitClientId}" not found`);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.assignment.findUnique({
      where: {
        teamMemberId_weekStart: {
          teamMemberId: data.teamMemberId,
          weekStart: data.weekStart,
        },
      },
    });

    const clientAndTagData = {
      ...(data.clientId !== undefined ? { clientId: data.clientId } : {}),
      ...(validatedTags !== undefined ? { tags: JSON.stringify(validatedTags) } : {}),
      ...(data.splitClientId !== undefined ? { splitClientId: data.splitClientId } : {}),
      ...(validatedSplitTags !== undefined ? { splitTags: JSON.stringify(validatedSplitTags) } : {}),
    };

    if (existing) {
      return tx.assignment.update({
        where: { id: existing.id },
        data: {
          projectName: data.projectName,
          projectColor: data.projectColor,
          status: data.status,
          splitProjectName: data.splitProjectName ?? null,
          splitProjectColor: data.splitProjectColor ?? null,
          splitProjectStatus: data.splitProjectStatus ?? null,
          createdBy: data.createdBy ?? null,
          ...clientAndTagData,
        },
      });
    }

    return tx.assignment.create({
      data: {
        teamMemberId: data.teamMemberId,
        projectName: data.projectName,
        projectColor: data.projectColor,
        status: data.status,
        weekStart: data.weekStart,
        splitProjectName: data.splitProjectName ?? null,
        splitProjectColor: data.splitProjectColor ?? null,
        splitProjectStatus: data.splitProjectStatus ?? null,
        splitClientId: data.splitClientId ?? null,
        splitTags: validatedSplitTags ? JSON.stringify(validatedSplitTags) : '[]',
        createdBy: data.createdBy ?? null,
        clientId: data.clientId ?? null,
        tags: validatedTags ? JSON.stringify(validatedTags) : '[]',
      },
    });
  });
  return parseTagFields(result);
}

/**
 * Update an assignment by ID. Rejects updates to locked assignments
 * unless explicitly unlocking.
 */
export async function updateAssignment(
  id: string,
  data: {
    projectName?: string;
    projectColor?: string;
    status?: string;
    isLocked?: boolean;
    splitProjectName?: string | null;
    splitProjectColor?: string | null;
    splitProjectStatus?: string | null;
    splitClientId?: string | null;
    splitTags?: string[];
    createdBy?: string | null;
    clientId?: string | null;
    tags?: string[];
    teamMemberId?: string;
    weekStart?: Date;
  }
) {
  const existing = await prisma.assignment.findUniqueOrThrow({ where: { id } });

  if (existing.isLocked && data.isLocked !== false) {
    throw new Error('Cannot update a locked assignment. Unlock it first.');
  }

  // Validate tags if provided
  if (data.tags) {
    validateTags(data.tags);
  }
  if (data.splitTags) {
    validateTags(data.splitTags);
  }

  // Validate clientId exists if provided (and not null — null means unlink)
  if (data.clientId) {
    const client = await prisma.client.findUnique({ where: { id: data.clientId } });
    if (!client) {
      throw new Error(`Client with id "${data.clientId}" not found`);
    }
  }

  // Validate splitClientId exists if provided
  if (data.splitClientId) {
    const client = await prisma.client.findUnique({ where: { id: data.splitClientId } });
    if (!client) {
      throw new Error(`Client with id "${data.splitClientId}" not found`);
    }
  }

  // Build update payload, converting tags arrays to JSON strings
  const { tags, splitTags, ...rest } = data;
  const updateData: Record<string, unknown> = { ...rest };
  if (tags !== undefined) {
    updateData.tags = JSON.stringify(tags);
  }
  if (splitTags !== undefined) {
    updateData.splitTags = JSON.stringify(splitTags);
  }

  const result = await prisma.assignment.update({
    where: { id },
    data: updateData,
  });
  return parseTagFields(result);
}

/**
 * Delete an assignment by ID. Rejects deletion of locked assignments.
 */
export async function deleteAssignment(id: string) {
  const existing = await prisma.assignment.findUniqueOrThrow({ where: { id } });

  if (existing.isLocked) {
    throw new Error('Cannot delete a locked assignment. Unlock it first.');
  }

  return prisma.assignment.delete({ where: { id } });
}

/**
 * Swap the teamMemberId and weekStart between two assignments (for drag-and-drop).
 */
export async function swapAssignments(idA: string, idB: string) {
  const [a, b] = await Promise.all([
    prisma.assignment.findUniqueOrThrow({ where: { id: idA } }),
    prisma.assignment.findUniqueOrThrow({ where: { id: idB } }),
  ]);

  // Use a transaction with a temporary value to avoid unique constraint violations
  await prisma.$transaction([
    // Temporarily clear A's unique key fields
    prisma.assignment.delete({ where: { id: idA } }),
    prisma.assignment.delete({ where: { id: idB } }),
    // Re-create with swapped positions (project data including clientId/tags stays with content)
    prisma.assignment.create({
      data: {
        id: idA,
        teamMemberId: b.teamMemberId,
        weekStart: b.weekStart,
        projectName: a.projectName,
        projectColor: a.projectColor,
        status: a.status,
        isLocked: a.isLocked,
        splitProjectName: a.splitProjectName,
        splitProjectColor: a.splitProjectColor,
        splitProjectStatus: a.splitProjectStatus,
        splitClientId: a.splitClientId,
        splitTags: a.splitTags,
        createdBy: a.createdBy,
        clientId: a.clientId,
        tags: a.tags,
      },
    }),
    prisma.assignment.create({
      data: {
        id: idB,
        teamMemberId: a.teamMemberId,
        weekStart: a.weekStart,
        projectName: b.projectName,
        projectColor: b.projectColor,
        status: b.status,
        isLocked: b.isLocked,
        splitProjectName: b.splitProjectName,
        splitProjectColor: b.splitProjectColor,
        splitProjectStatus: b.splitProjectStatus,
        splitClientId: b.splitClientId,
        splitTags: b.splitTags,
        createdBy: b.createdBy,
        clientId: b.clientId,
        tags: b.tags,
      },
    }),
  ]);
}

/**
 * Add a single backlog ("No Man's Landing") row.
 */
export async function addBacklogMember() {
  const existing = await prisma.teamMember.findMany({
    where: { isBacklog: true, status: 'active' },
    orderBy: { displayOrder: 'asc' },
  });

  const maxOrder = await prisma.teamMember.aggregate({
    _max: { displayOrder: true },
  });
  const baseOrder = (maxOrder._max.displayOrder ?? -1) + 1000;

  const existingNumbers = existing.map((m) => {
    const match = m.displayName?.match(/Futuro (\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  });
  const nextNum = Math.max(0, ...existingNumbers) + 1;

  return prisma.teamMember.create({
    data: {
      isBacklog: true,
      displayName: `Futuro ${nextNum}`,
      displayOrder: baseOrder + existing.length,
      status: 'active',
    },
  });
}

/**
 * Toggle the isLocked boolean on an assignment.
 */
export async function toggleLock(id: string) {
  const existing = await prisma.assignment.findUniqueOrThrow({ where: { id } });

  return prisma.assignment.update({
    where: { id },
    data: { isLocked: !existing.isLocked },
  });
}
