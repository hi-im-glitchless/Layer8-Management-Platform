import { prisma } from '@/db/prisma.js';

/**
 * List absences filtered by date range and optional team member.
 */
export async function listAbsences(params: {
  teamMemberId?: string;
  dateStart: Date;
  dateEnd: Date;
}) {
  return prisma.absence.findMany({
    where: {
      date: { gte: params.dateStart, lte: params.dateEnd },
      ...(params.teamMemberId ? { teamMemberId: params.teamMemberId } : {}),
    },
    orderBy: [{ date: 'asc' }, { teamMemberId: 'asc' }],
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
 * Toggle an absence: create if it doesn't exist, delete if it does.
 * Returns the created absence or null if deleted.
 */
export async function toggleAbsence(
  teamMemberId: string,
  date: Date,
  type: string
) {
  const existing = await prisma.absence.findUnique({
    where: {
      teamMemberId_date: { teamMemberId, date },
    },
  });

  if (existing) {
    await prisma.absence.delete({ where: { id: existing.id } });
    return null;
  }

  return prisma.absence.create({
    data: { teamMemberId, date, type },
  });
}

/**
 * Bulk create absence records, skipping duplicates.
 */
export async function bulkCreateAbsences(
  entries: Array<{ teamMemberId: string; date: Date; type: string; reason?: string }>
) {
  const result = await prisma.absence.createMany({
    data: entries.map((e) => ({
      teamMemberId: e.teamMemberId,
      date: e.date,
      type: e.type,
      reason: e.reason ?? null,
    })),
    skipDuplicates: true,
  });

  return { created: result.count };
}
