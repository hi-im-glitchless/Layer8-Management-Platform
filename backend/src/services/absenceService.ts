import { prisma } from '@/db/prisma.js';

/**
 * A single "out today" entry: a flat, name-resolved absence row suitable for
 * direct rendering by the dashboard widget (no client-side resolution needed).
 */
export interface AbsenceOutEntry {
  teamMemberId: string;
  displayName: string;
  type: string;
  reason: string | null;
}

/**
 * Return all team members who are absent on the given date.
 *
 * - Defaults to today (UTC) when no targetDate is passed.
 * - Uses a full-UTC-day window (gte dayStart, lt nextDay) so any stored
 *   time-of-day matches the queried calendar day.
 * - Excludes non-active team members (only teamMember.status === 'active').
 * - Includes backlog members (userId null) — displayName falls back to the
 *   TeamMember.displayName; the widget decides how to render them.
 *
 * displayName resolution order:
 *   user.displayName > user.username > teamMember.displayName > 'Unknown'.
 */
export async function getAbsencesOnDate(
  targetDate?: Date
): Promise<AbsenceOutEntry[]> {
  // Normalise to UTC midnight so the day window matches stored values exactly.
  const d = targetDate ?? new Date();
  const iso = d.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const dayStart = new Date(`${iso}T00:00:00.000Z`);
  const nextDay = new Date(dayStart.getTime() + 86400000);

  const absences = await prisma.absence.findMany({
    where: {
      date: { gte: dayStart, lt: nextDay },
      teamMember: { status: 'active' },
    },
    orderBy: [{ teamMemberId: 'asc' }],
    include: {
      teamMember: {
        include: {
          user: { select: { username: true, displayName: true } },
        },
      },
    },
  });

  return absences.map((a) => ({
    teamMemberId: a.teamMemberId,
    displayName:
      a.teamMember.user?.displayName ??
      a.teamMember.user?.username ??
      a.teamMember.displayName ??
      'Unknown',
    type: a.type,
    reason: a.reason,
  }));
}

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
  let created = 0;

  for (const entry of entries) {
    const existing = await prisma.absence.findUnique({
      where: {
        teamMemberId_date: {
          teamMemberId: entry.teamMemberId,
          date: entry.date,
        },
      },
    });

    if (!existing) {
      await prisma.absence.create({
        data: {
          teamMemberId: entry.teamMemberId,
          date: entry.date,
          type: entry.type,
          reason: entry.reason ?? null,
        },
      });
      created++;
    }
  }

  return { created };
}
