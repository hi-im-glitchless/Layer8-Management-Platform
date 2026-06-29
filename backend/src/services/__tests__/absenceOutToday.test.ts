/**
 * getAbsencesOnDate — "out today" service coverage (Phase 01).
 *
 * getAbsencesOnDate(targetDate?) returns the flat, name-resolved list of team
 * members who have an Absence on a given UTC date (defaults to today, UTC).
 * This suite proves the locked design decisions directly at the service layer
 * (no HTTP):
 *  - Date window: a full UTC day (gte dayStart, lt nextDay). An absence on the
 *    queried date is returned; the same member's absence on an adjacent date is
 *    NOT returned (boundary + "absent yesterday, not today").
 *  - Empty day: a date with no seeded absences yields [] (no throw).
 *  - Multi-absence day: several active members absent on one date all appear.
 *  - Active-only: an absence on an 'archived' TeamMember is excluded.
 *  - Backlog inclusion: a backlog member (userId null) is included, name from
 *    TeamMember.displayName.
 *  - Name resolution: user.displayName > user.username > teamMember.displayName.
 *  - Reason passthrough: a 'Doctor' reason surfaces; a null reason stays null.
 *
 * Isolation (shared dev.db): every row is seeded with a unique suffix, all
 * assertions are scoped to the seeded teamMemberIds, and seeded rows are torn
 * down in afterEach (absences -> team members -> users), so the suite is
 * parallel-safe and leaves nothing behind. withDbRetry absorbs transient
 * SQLite busy/locked errors, matching the sibling service tests.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { prisma } from '../../db/prisma.js';
import { getAbsencesOnDate } from '../absenceService.js';

function uniqueSuffix(): string {
  return `out-today-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** UTC-midnight Date for a "YYYY-MM-DD" string. */
function utcDay(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Today's UTC date as "YYYY-MM-DD". */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The backend runs against a single SQLite file (one writer at a time). When
 * this suite runs concurrently with other write-heavy suites, SQLite can
 * transiently bounce a write with a busy / "Operation has timed out" error.
 * That is an environmental DB-locking limit, NOT a logic defect — the seeded
 * ids keep assertions scoped. Retry with short jittered backoff, matching
 * withDbRetry in deleteAssignmentOrphan.delete.test.ts.
 */
async function withDbRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isLockTimeout =
        /timed out|database is locked|SQLITE_BUSY|Transaction (?:already closed|api error)/i.test(msg);
      if (!isLockTimeout) throw err;
      lastErr = err;
      await new Promise((r) => setTimeout(r, 50 * (i + 1) + Math.floor(Math.random() * 50)));
    }
  }
  throw lastErr;
}

interface SeedBag {
  userIds: string[];
  teamMemberIds: string[];
  absenceIds: string[];
}

function newBag(): SeedBag {
  return { userIds: [], teamMemberIds: [], absenceIds: [] };
}

async function teardown(bag: SeedBag) {
  // FK-safe order: absences -> team members -> users.
  await prisma.absence
    .deleteMany({ where: { id: { in: bag.absenceIds } } })
    .catch(() => undefined);
  await prisma.teamMember
    .deleteMany({ where: { id: { in: bag.teamMemberIds } } })
    .catch(() => undefined);
  await prisma.user
    .deleteMany({ where: { id: { in: bag.userIds } } })
    .catch(() => undefined);
}

async function seedUser(
  bag: SeedBag,
  suffix: string,
  label: string,
  displayName: string | null,
) {
  const user = await withDbRetry(() =>
    prisma.user.create({
      data: {
        username: `out-today-${label}-${suffix}`,
        passwordHash: 'x',
        displayName,
      },
    }),
  );
  bag.userIds.push(user.id);
  return user;
}

async function seedTeamMember(
  bag: SeedBag,
  data: {
    userId?: string | null;
    status?: string;
    isBacklog?: boolean;
    displayName?: string | null;
  },
) {
  const tm = await withDbRetry(() =>
    prisma.teamMember.create({
      data: {
        userId: data.userId ?? null,
        status: data.status ?? 'active',
        isBacklog: data.isBacklog ?? false,
        displayName: data.displayName ?? null,
      },
    }),
  );
  bag.teamMemberIds.push(tm.id);
  return tm;
}

async function seedAbsence(
  bag: SeedBag,
  data: { teamMemberId: string; date: Date; type: string; reason?: string | null },
) {
  const absence = await withDbRetry(() =>
    prisma.absence.create({
      data: {
        teamMemberId: data.teamMemberId,
        date: data.date,
        type: data.type,
        reason: data.reason ?? null,
      },
    }),
  );
  bag.absenceIds.push(absence.id);
  return absence;
}

describe('getAbsencesOnDate — out-today service', () => {
  let bag = newBag();

  afterEach(async () => {
    await teardown(bag);
    bag = newBag();
  });

  it('today-default: getAbsencesOnDate() (no arg) returns a member absent today (UTC)', async () => {
    const suffix = uniqueSuffix();
    const user = await seedUser(bag, suffix, 'today', 'Today Person');
    const tm = await seedTeamMember(bag, { userId: user.id });
    await seedAbsence(bag, { teamMemberId: tm.id, date: utcDay(todayIso()), type: 'vacation' });

    const result = await getAbsencesOnDate();
    const mine = result.filter((r) => r.teamMemberId === tm.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].displayName).toBe('Today Person');
    expect(mine[0].type).toBe('vacation');
  });

  it('explicit-date boundary: returned on its date, absent on the adjacent date', async () => {
    const suffix = uniqueSuffix();
    const user = await seedUser(bag, suffix, 'boundary', 'Boundary Person');
    const tm = await seedTeamMember(bag, { userId: user.id });
    await seedAbsence(bag, { teamMemberId: tm.id, date: utcDay('2026-01-01'), type: 'sick' });

    const onDay = await getAbsencesOnDate(utcDay('2026-01-01'));
    expect(onDay.filter((r) => r.teamMemberId === tm.id)).toHaveLength(1);

    const nextDay = await getAbsencesOnDate(utcDay('2026-01-02'));
    expect(nextDay.filter((r) => r.teamMemberId === tm.id)).toHaveLength(0);
  });

  it("absent yesterday is not returned when querying today", async () => {
    const suffix = uniqueSuffix();
    const user = await seedUser(bag, suffix, 'yest', 'Yesterday Person');
    const tm = await seedTeamMember(bag, { userId: user.id });
    const todayStart = utcDay(todayIso());
    const yesterday = new Date(todayStart.getTime() - 86400000);
    await seedAbsence(bag, { teamMemberId: tm.id, date: yesterday, type: 'sick' });

    const result = await getAbsencesOnDate(); // today
    expect(result.filter((r) => r.teamMemberId === tm.id)).toHaveLength(0);
  });

  it('empty day: a date with no seeded absences returns [] for the seeded ids (no throw)', async () => {
    const suffix = uniqueSuffix();
    const user = await seedUser(bag, suffix, 'empty', 'Empty Person');
    const tm = await seedTeamMember(bag, { userId: user.id });
    // No absence seeded for this member on the far-future query date.
    const result = await getAbsencesOnDate(utcDay('2099-12-31'));
    expect(Array.isArray(result)).toBe(true);
    expect(result.filter((r) => r.teamMemberId === tm.id)).toHaveLength(0);
  });

  it('multi-absence day: three active members absent on one date all appear', async () => {
    const suffix = uniqueSuffix();
    const date = utcDay('2026-02-10');
    const tmIds: string[] = [];
    for (const label of ['m1', 'm2', 'm3']) {
      const user = await seedUser(bag, suffix, label, `Multi ${label}`);
      const tm = await seedTeamMember(bag, { userId: user.id });
      await seedAbsence(bag, { teamMemberId: tm.id, date, type: 'holiday' });
      tmIds.push(tm.id);
    }

    const result = await getAbsencesOnDate(date);
    const mine = result.filter((r) => tmIds.includes(r.teamMemberId));
    expect(mine).toHaveLength(3);
  });

  it('active-only: an absence on an archived TeamMember is excluded', async () => {
    const suffix = uniqueSuffix();
    const date = utcDay('2026-03-15');
    const user = await seedUser(bag, suffix, 'arch', 'Archived Person');
    const tm = await seedTeamMember(bag, { userId: user.id, status: 'archived' });
    await seedAbsence(bag, { teamMemberId: tm.id, date, type: 'vacation' });

    const result = await getAbsencesOnDate(date);
    expect(result.filter((r) => r.teamMemberId === tm.id)).toHaveLength(0);
  });

  it('backlog member included: userId null, name from TeamMember.displayName', async () => {
    const suffix = uniqueSuffix();
    const date = utcDay('2026-04-20');
    const tm = await seedTeamMember(bag, {
      userId: null,
      isBacklog: true,
      displayName: `Futuro ${suffix}`,
    });
    await seedAbsence(bag, { teamMemberId: tm.id, date, type: 'other' });

    const result = await getAbsencesOnDate(date);
    const mine = result.filter((r) => r.teamMemberId === tm.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].displayName).toBe(`Futuro ${suffix}`);
  });

  it('name fallback: null user.displayName falls back to user.username; otherwise uses displayName', async () => {
    const suffix = uniqueSuffix();
    const date = utcDay('2026-05-05');

    const noDisplay = await seedUser(bag, suffix, 'fallback', null);
    const tmFallback = await seedTeamMember(bag, { userId: noDisplay.id });
    await seedAbsence(bag, { teamMemberId: tmFallback.id, date, type: 'sick' });

    const withDisplay = await seedUser(bag, suffix, 'named', 'Named Person');
    const tmNamed = await seedTeamMember(bag, { userId: withDisplay.id });
    await seedAbsence(bag, { teamMemberId: tmNamed.id, date, type: 'sick' });

    const result = await getAbsencesOnDate(date);
    const fallbackEntry = result.find((r) => r.teamMemberId === tmFallback.id);
    const namedEntry = result.find((r) => r.teamMemberId === tmNamed.id);
    expect(fallbackEntry?.displayName).toBe(`out-today-fallback-${suffix}`);
    expect(namedEntry?.displayName).toBe('Named Person');
  });

  it('reason passthrough: a non-null reason surfaces; a null reason stays null', async () => {
    const suffix = uniqueSuffix();
    const date = utcDay('2026-06-06');

    const u1 = await seedUser(bag, suffix, 'reason', 'Reason Person');
    const tmReason = await seedTeamMember(bag, { userId: u1.id });
    await seedAbsence(bag, { teamMemberId: tmReason.id, date, type: 'sick', reason: 'Doctor' });

    const u2 = await seedUser(bag, suffix, 'noreason', 'No Reason Person');
    const tmNoReason = await seedTeamMember(bag, { userId: u2.id });
    await seedAbsence(bag, { teamMemberId: tmNoReason.id, date, type: 'sick', reason: null });

    const result = await getAbsencesOnDate(date);
    expect(result.find((r) => r.teamMemberId === tmReason.id)?.reason).toBe('Doctor');
    expect(result.find((r) => r.teamMemberId === tmNoReason.id)?.reason).toBeNull();
  });
});
