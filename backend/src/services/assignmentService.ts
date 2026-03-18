import { prisma } from '@/db/prisma.js';
import { upsertProjectColor } from '@/services/scheduleService.js';

/**
 * Get the date range for a year/quarter filter.
 */
function getDateRange(year: number, quarter?: number): { start: Date; end: Date } {
  if (quarter) {
    const startMonth = (quarter - 1) * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 1);
    return { start, end };
  }
  return {
    start: new Date(year, 0, 1),
    end: new Date(year + 1, 0, 1),
  };
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

  return prisma.assignment.findMany({
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
    },
  });
}

/**
 * Create or update an assignment by unique key (teamMemberId, weekStart, projectName).
 * Also upserts the project color for autocomplete.
 */
export async function upsertAssignment(data: {
  teamMemberId: string;
  projectName: string;
  projectColor: string;
  status: string;
  weekStart: Date;
  splitProjectName?: string | null;
  splitProjectColor?: string | null;
  createdBy?: string | null;
}) {
  await upsertProjectColor(data.projectName, data.projectColor);

  if (data.splitProjectName && data.splitProjectColor) {
    await upsertProjectColor(data.splitProjectName, data.splitProjectColor);
  }

  return prisma.assignment.upsert({
    where: {
      teamMemberId_weekStart_projectName: {
        teamMemberId: data.teamMemberId,
        weekStart: data.weekStart,
        projectName: data.projectName,
      },
    },
    update: {
      projectColor: data.projectColor,
      status: data.status,
      splitProjectName: data.splitProjectName ?? null,
      splitProjectColor: data.splitProjectColor ?? null,
      createdBy: data.createdBy ?? null,
    },
    create: {
      teamMemberId: data.teamMemberId,
      projectName: data.projectName,
      projectColor: data.projectColor,
      status: data.status,
      weekStart: data.weekStart,
      splitProjectName: data.splitProjectName ?? null,
      splitProjectColor: data.splitProjectColor ?? null,
      createdBy: data.createdBy ?? null,
    },
  });
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
    createdBy?: string | null;
  }
) {
  const existing = await prisma.assignment.findUniqueOrThrow({ where: { id } });

  if (existing.isLocked && data.isLocked !== false) {
    throw new Error('Cannot update a locked assignment. Unlock it first.');
  }

  return prisma.assignment.update({
    where: { id },
    data,
  });
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
    // Re-create with swapped positions
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
        createdBy: a.createdBy,
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
        createdBy: b.createdBy,
      },
    }),
  ]);
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
