/**
 * Schedule-isolation regression — Phase 24.
 *
 * Phase 24-R03 makes Project a first-class entity: a BoardCard is keyed by
 * Project (BoardCard.projectId @unique), not by Assignment. When a
 * Planner-eligible assignment is saved, assignmentService.upsertAssignment
 * runs linkProjectsForAssignment, which calls projectService.upsertByKey to
 * auto-create the Project AND its single BoardCard.
 *
 * This suite proves that the auto-create-board-card-on-assignment flow does
 * NOT mutate the surrounding schedule tables beyond the Assignment row it is
 * meant to write. Concretely: after the upsert, TeamMember / Absence /
 * Holiday must remain byte-identical, and the freshly-written Assignment must
 * have its projectId populated (so the assertion is meaningful, not vacuous).
 *
 * Isolation: like the Phase 23 suite, snapshotScheduleTables reads ONLY this
 * test's own seeded rows (filtered by seeded ids). The scoped helper is
 * copied into this file rather than imported so the two suites run
 * independently and never read each other's rows — the exact cross-suite
 * contamination that previously caused spurious failures when both suites ran
 * concurrently in a single vitest invocation.
 *
 * Tests run against the dev DB per the project's vitest.config.ts; cleanup
 * runs in afterEach (each delete wrapped in .catch) so a mid-test failure
 * leaves no rows behind — including the auto-created Project / BoardCard.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../db/prisma.js';
import { upsertAssignment } from '../assignmentService.js';

interface SeedIds {
  userId: string;
  teamMemberId: string;
  clientId: string;
  absenceId: string;
  holidayId: string;
  weekStart: Date;
  projectName: string;
}

function uniqueSuffix(): string {
  return `iso24-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Snapshot the non-Assignment schedule tables, scoped to ONLY the rows this
 * test seeded. The Assignment row is intentionally excluded from the
 * byte-equality model because the operation under test (upsertAssignment) is
 * expected to write it; we assert the Assignment's projectId separately.
 *
 * Every read carries a `where` clause referencing the seeded ids so a
 * concurrently-running suite (e.g. scheduleIsolation.phase23) can never
 * contribute rows to this snapshot.
 */
async function snapshotScheduleTables(ids: SeedIds) {
  const [teamMembers, absences, holidays] = await Promise.all([
    prisma.teamMember.findMany({ where: { id: ids.teamMemberId }, orderBy: { id: 'asc' } }),
    prisma.absence.findMany({ where: { id: ids.absenceId }, orderBy: { id: 'asc' } }),
    prisma.holiday.findMany({ where: { id: ids.holidayId }, orderBy: { id: 'asc' } }),
  ]);
  return {
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
      displayName: 'Isolation24 Test Admin',
    },
  });
  const teamMember = await prisma.teamMember.create({
    data: {
      userId: user.id,
      displayName: 'Isolation24 Test TM',
      status: 'active',
    },
  });
  // isPlannerEligible requires a clientId, so the Client is mandatory for the
  // auto-create-board-card-on-assignment path to fire.
  const client = await prisma.client.create({
    data: {
      name: `Iso24 Client ${suffix}`,
      color: '#abcdef',
    },
  });
  const holiday = await prisma.holiday.create({
    data: {
      name: `Iso24 Holiday ${suffix}`,
      month: 12,
      day: 30,
      isRecurring: false,
    },
  });
  const absence = await prisma.absence.create({
    data: {
      teamMemberId: teamMember.id,
      date: new Date('2099-02-06T00:00:00.000Z'),
      type: 'vacation',
    },
  });
  // Note: the Project and BoardCard are deliberately NOT pre-created — the
  // service must materialise them.
  return {
    userId: user.id,
    teamMemberId: teamMember.id,
    clientId: client.id,
    absenceId: absence.id,
    holidayId: holiday.id,
    weekStart: new Date('2099-02-02T00:00:00.000Z'),
    projectName: `Iso24 Project ${suffix}`,
  };
}

async function teardownDataset(ids: SeedIds | null) {
  if (!ids) return;
  // FK-safe order. The Assignment and any auto-created Project/BoardCard must
  // be cleared before the rows they depend on. BoardCard cascades from
  // Project (onDelete: Cascade), but we delete it explicitly first for
  // clarity and to be robust if the cascade is ever relaxed. Each delete is
  // wrapped in .catch so a partial seed does not abort cleanup of the rest.

  // Find the Assignment we created (keyed by teamMemberId + weekStart) so we
  // can discover the auto-created Project via its projectId.
  const assignment = await prisma.assignment
    .findUnique({
      where: {
        teamMemberId_weekStart: {
          teamMemberId: ids.teamMemberId,
          weekStart: ids.weekStart,
        },
      },
    })
    .catch(() => null);

  const projectId = assignment?.projectId ?? null;

  if (assignment) {
    await prisma.assignment.deleteMany({ where: { id: assignment.id } }).catch(() => undefined);
  }
  if (projectId) {
    await prisma.boardCard.deleteMany({ where: { projectId } }).catch(() => undefined);
    await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => undefined);
  }
  await prisma.absence.deleteMany({ where: { id: ids.absenceId } }).catch(() => undefined);
  await prisma.holiday.deleteMany({ where: { id: ids.holidayId } }).catch(() => undefined);
  await prisma.teamMember.deleteMany({ where: { id: ids.teamMemberId } }).catch(() => undefined);
  await prisma.client.deleteMany({ where: { id: ids.clientId } }).catch(() => undefined);
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

  it('auto-create-board-card-on-assignment leaves TeamMember / Absence / Holiday byte-identical', async () => {
    const before = await snapshotScheduleTables(ids!);

    // Phase 24 schedule-integration operation: a Planner-eligible assignment
    // (name + clientId + >=1 tag) drives linkProjectsForAssignment ->
    // upsertByKey, which auto-creates the Project and its BoardCard.
    const result = await upsertAssignment({
      teamMemberId: ids!.teamMemberId,
      projectName: ids!.projectName,
      projectColor: '#abcdef',
      status: 'confirmed',
      weekStart: ids!.weekStart,
      clientId: ids!.clientId,
      tags: ['Externa'],
    });

    const after = await snapshotScheduleTables(ids!);

    // The surrounding schedule tables must be untouched by the board-card
    // materialisation — only the Assignment row itself may change.
    expect(after).toEqual(before);

    // Non-vacuous: the auto-create path must have linked a Project and
    // created exactly one BoardCard for it.
    const written = await prisma.assignment.findUnique({ where: { id: result.id } });
    expect(written?.projectId).toBeTruthy();
    const card = await prisma.boardCard.findUnique({ where: { projectId: written!.projectId! } });
    expect(card).not.toBeNull();
  });

  it('idempotent re-save (the no-op "swap" of identical key fields) leaves TeamMember / Absence / Holiday byte-identical', async () => {
    // First save materialises the Project + BoardCard.
    const first = await upsertAssignment({
      teamMemberId: ids!.teamMemberId,
      projectName: ids!.projectName,
      projectColor: '#abcdef',
      status: 'confirmed',
      weekStart: ids!.weekStart,
      clientId: ids!.clientId,
      tags: ['Externa'],
    });
    // upsertAssignment returns the row captured before linkProjectsForAssignment
    // runs its separate update, so projectId on the return value is stale.
    // Re-read from the DB to get the linked projectId.
    const firstRow = await prisma.assignment.findUnique({ where: { id: first.id } });
    const firstProjectId = firstRow?.projectId ?? null;
    expect(firstProjectId).toBeTruthy();

    const before = await snapshotScheduleTables(ids!);

    // Re-save with identical Planner-eligibility key fields. This is the
    // schedule-side equivalent of a swap that does not change the dedupe
    // triple: it must re-link to the SAME Project (idempotent) and must not
    // disturb the surrounding schedule tables.
    const second = await upsertAssignment({
      teamMemberId: ids!.teamMemberId,
      projectName: ids!.projectName,
      projectColor: '#abcdef',
      status: 'confirmed',
      weekStart: ids!.weekStart,
      clientId: ids!.clientId,
      tags: ['Externa'],
    });

    const after = await snapshotScheduleTables(ids!);
    expect(after).toEqual(before);

    // Idempotency: same Project, exactly one BoardCard, no duplicates.
    const secondRow = await prisma.assignment.findUnique({ where: { id: second.id } });
    expect(secondRow?.projectId).toEqual(firstProjectId);
    const cards = await prisma.boardCard.findMany({ where: { projectId: firstProjectId! } });
    expect(cards).toHaveLength(1);
  });
});
