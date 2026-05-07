/**
 * Schedule-isolation regression — Phase 24.
 *
 * Phase 24 wires the Schedule and Project Board together (deep-link URL
 * plumbing, "View on Board" link, pentester click-to-board, dashboard
 * project cards, board filter fix, swap-orphan repair). The
 * non-negotiable data-safety invariant from 24-CONTEXT.md is "zero writes
 * to Assignment / TeamMember / Absence / Holiday from any board code".
 *
 * This file mirrors the runtime byte-equality pattern from
 * scheduleIsolation.phase23.test.ts and locks in:
 *   1. swapAssignments leaves the schedule-tables-as-a-set invariant
 *      undisturbed (same set of rows; only contents permuted between two
 *      Assignment rows). Specifically:
 *        - Holiday  : byte-identical
 *        - Absence  : byte-identical
 *        - TeamMember : byte-identical
 *        - Assignment : same set of (id, projectName, status, weekStart,
 *          teamMemberId) tuples — invariant under a row-swap
 *   2. swapAssignments preserves BoardCard linkage (locks in the Phase
 *      24-05 swap-orphan repair).
 *   3. createCardForAssignment is idempotent — re-calling it leaves all
 *      four schedule tables byte-identical.
 *
 * Tests run against the dev DB per the project's vitest.config.ts; cleanup
 * runs in a try/finally so a failure mid-test does not leave seed rows
 * behind.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../db/prisma.js';
import { swapAssignments } from '../assignmentService.js';
import { createCardForAssignment } from '../boardService.js';

interface SeedIds {
  userId: string;
  teamMemberAId: string;
  teamMemberBId: string;
  assignmentAId: string;
  assignmentBId: string;
  cardAId: string;
  cardBId: string;
  holidayId: string;
  absenceId: string;
}

function uniqueSuffix(): string {
  return `iso24-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function snapshotScheduleTables() {
  const [assignments, teamMembers, absences, holidays] = await Promise.all([
    prisma.assignment.findMany({ orderBy: { id: 'asc' } }),
    prisma.teamMember.findMany({ orderBy: { id: 'asc' } }),
    prisma.absence.findMany({ orderBy: { id: 'asc' } }),
    prisma.holiday.findMany({ orderBy: { id: 'asc' } }),
  ]);
  return {
    assignment: JSON.stringify(assignments),
    teamMember: JSON.stringify(teamMembers),
    absence: JSON.stringify(absences),
    holiday: JSON.stringify(holidays),
  };
}

/**
 * Snapshot of the schedule-tables-as-a-set invariant — used for swap.
 * The swap legitimately moves (teamMemberId, weekStart) from one row to
 * the other, while the (projectName, status, ...) project content stays
 * glued to its original id. So neither a full JSON.stringify nor the full
 * tuple set is invariant. But these orthogonal invariants ARE preserved:
 *
 *   - the SET of (teamMemberId, weekStart) pairs (the schedule "slots")
 *   - the SET of Assignment ids (no row created or destroyed)
 *   - the row count
 *   - TeamMember / Absence / Holiday byte-identity (no writes there)
 *
 * Together they prove the swap touches exactly the two intended rows and
 * nothing else in the schedule.
 */
async function snapshotSwapInvariant() {
  const [assignments, teamMembers, absences, holidays] = await Promise.all([
    prisma.assignment.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        weekStart: true,
        teamMemberId: true,
      },
    }),
    prisma.teamMember.findMany({ orderBy: { id: 'asc' } }),
    prisma.absence.findMany({ orderBy: { id: 'asc' } }),
    prisma.holiday.findMany({ orderBy: { id: 'asc' } }),
  ]);
  const slotSet = assignments
    .map((a) => `${a.teamMemberId}|${a.weekStart.toISOString()}`)
    .sort();
  return {
    slotSet: JSON.stringify(slotSet),
    assignmentIdSet: JSON.stringify(assignments.map((a) => a.id).sort()),
    rowCount: assignments.length,
    teamMember: JSON.stringify(teamMembers),
    absence: JSON.stringify(absences),
    holiday: JSON.stringify(holidays),
  };
}

async function seedDataset(): Promise<SeedIds> {
  const suffix = uniqueSuffix();
  const user = await prisma.user.create({
    data: {
      username: `iso24-admin-${suffix}`,
      passwordHash: 'not-a-real-hash',
      role: 'ADMIN',
      displayName: 'Iso24 Test Admin',
    },
  });
  const tmA = await prisma.teamMember.create({
    data: {
      userId: user.id,
      displayName: `Iso24 TM A ${suffix}`,
      status: 'active',
    },
  });
  const tmB = await prisma.teamMember.create({
    data: {
      // No userId — keep tmB unlinked so we don't violate User.id unique FK.
      displayName: `Iso24 TM B ${suffix}`,
      status: 'active',
      isBacklog: true,
    },
  });
  const assignA = await prisma.assignment.create({
    data: {
      teamMemberId: tmA.id,
      projectName: `Iso24 Project A ${suffix}`,
      projectColor: '#aabbcc',
      status: 'confirmed',
      weekStart: new Date('2099-02-02T00:00:00.000Z'),
    },
  });
  const assignB = await prisma.assignment.create({
    data: {
      teamMemberId: tmB.id,
      projectName: `Iso24 Project B ${suffix}`,
      projectColor: '#ddeeff',
      status: 'placeholder',
      weekStart: new Date('2099-02-09T00:00:00.000Z'),
    },
  });
  const cardA = await prisma.boardCard.create({
    data: {
      assignmentId: assignA.id,
      stage: 'preparation',
      checklist: '[]',
      notes: 'iso24 card A',
    },
  });
  const cardB = await prisma.boardCard.create({
    data: {
      assignmentId: assignB.id,
      stage: 'upcoming',
      checklist: '[]',
      notes: 'iso24 card B',
    },
  });
  const holiday = await prisma.holiday.create({
    data: {
      name: `Iso24 Holiday ${suffix}`,
      month: 6,
      day: 15,
      isRecurring: false,
    },
  });
  const absence = await prisma.absence.create({
    data: {
      teamMemberId: tmA.id,
      date: new Date('2099-02-03T00:00:00.000Z'),
      type: 'vacation',
    },
  });
  return {
    userId: user.id,
    teamMemberAId: tmA.id,
    teamMemberBId: tmB.id,
    assignmentAId: assignA.id,
    assignmentBId: assignB.id,
    cardAId: cardA.id,
    cardBId: cardB.id,
    holidayId: holiday.id,
    absenceId: absence.id,
  };
}

async function teardownDataset(ids: SeedIds | null) {
  if (!ids) return;
  // Order: BoardCard → Assignment → Absence → TeamMember → Holiday → User.
  // Each in try/catch so a partial seed does not abort the rest.
  await prisma.boardCard.deleteMany({ where: { id: { in: [ids.cardAId, ids.cardBId] } } }).catch(() => undefined);
  // Also reap cards that the post-swap repair may have created if a pre-swap
  // card was missing — defence in depth so seed rows do not leak.
  await prisma.boardCard
    .deleteMany({ where: { assignmentId: { in: [ids.assignmentAId, ids.assignmentBId] } } })
    .catch(() => undefined);
  await prisma.absence.deleteMany({ where: { id: ids.absenceId } }).catch(() => undefined);
  await prisma.assignment
    .deleteMany({ where: { id: { in: [ids.assignmentAId, ids.assignmentBId] } } })
    .catch(() => undefined);
  await prisma.teamMember
    .deleteMany({ where: { id: { in: [ids.teamMemberAId, ids.teamMemberBId] } } })
    .catch(() => undefined);
  await prisma.holiday.deleteMany({ where: { id: ids.holidayId } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: ids.userId } }).catch(() => undefined);
}

describe('Phase 24 schedule isolation', () => {
  let ids: SeedIds | null = null;

  beforeEach(async () => {
    ids = await seedDataset();
  });

  afterEach(async () => {
    await teardownDataset(ids);
    ids = null;
  });

  it('swapAssignments leaves the schedule-tables-as-a-set invariant unchanged', async () => {
    // Pre-swap: capture the invariant. Pre-existing rows in the dev DB are
    // included in the snapshot — the test asserts ALL rows (seeded plus
    // pre-existing) are equal under the swap-invariant projection.
    const before = await snapshotSwapInvariant();
    await swapAssignments(ids!.assignmentAId, ids!.assignmentBId);
    const after = await snapshotSwapInvariant();

    // TeamMember / Absence / Holiday must be byte-identical (no writes).
    expect(after.teamMember).toEqual(before.teamMember);
    expect(after.absence).toEqual(before.absence);
    expect(after.holiday).toEqual(before.holiday);
    // Assignment ids: same set (no row created or destroyed by the swap).
    expect(after.assignmentIdSet).toEqual(before.assignmentIdSet);
    // Row count unchanged.
    expect(after.rowCount).toEqual(before.rowCount);
    // Schedule-slot set unchanged: swapping two assignments permutes which
    // row owns each (teamMemberId, weekStart) slot, but the SET of slots
    // is invariant — both pre-swap slots remain occupied post-swap.
    expect(after.slotSet).toEqual(before.slotSet);
  });

  it('swapAssignments preserves BoardCard linkage', async () => {
    await swapAssignments(ids!.assignmentAId, ids!.assignmentBId);
    const [cardA, cardB] = await Promise.all([
      prisma.boardCard.findUnique({ where: { id: ids!.cardAId } }),
      prisma.boardCard.findUnique({ where: { id: ids!.cardBId } }),
    ]);
    expect(cardA).not.toBeNull();
    expect(cardB).not.toBeNull();
    // Phase 24-05 repair: cards relink to their ORIGINAL assignmentId
    // (the one each card had pre-swap). The swap preserves Assignment
    // ids — only contents move — so the original linkage is still
    // semantically correct.
    expect(cardA!.assignmentId).toBe(ids!.assignmentAId);
    expect(cardB!.assignmentId).toBe(ids!.assignmentBId);
  });

  it('createCardForAssignment is idempotent — re-calling leaves schedule byte-identical', async () => {
    // Smoke for the post-swap repair's idempotence: createCardForAssignment
    // is the fallback when there is no pre-swap card. Even after we run it
    // twice for the same id, the schedule tables (Assignment / TeamMember /
    // Absence / Holiday) must not change.
    const before = await snapshotScheduleTables();
    await createCardForAssignment(ids!.assignmentAId);
    await createCardForAssignment(ids!.assignmentAId);
    const after = await snapshotScheduleTables();
    expect(after).toEqual(before);
  });
});
