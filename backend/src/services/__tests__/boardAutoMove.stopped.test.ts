/**
 * Auto-move regression — Phase 01 (Board Refinements).
 *
 * Adds the new always-visible 'Stopped' board stage. autoMoveCards() must
 * NEVER move a card that sits in 'stopped': the date-based auto-mover excludes
 * it via the where clause (`stage: { notIn: ['archived', 'stopped'] }`), so a
 * Stopped card stays Stopped regardless of its linked assignment weeks.
 *
 * This suite proves that invariant directly:
 *  - A Stopped card whose earliest assignment week == next Monday (which would
 *    otherwise qualify it to auto-move to 'preparation') is left untouched.
 *  - A control card (non-stopped, identical qualifying week) DOES move to
 *    'preparation' — so the test would catch a regression that disabled the
 *    Stopped exclusion (i.e. it is non-vacuous).
 *
 * Schedule isolation (NON-NEGOTIABLE, carried from the Project Board
 * milestone): this test only seeds the board read-fixtures the query needs
 * (Client, Project, Assignment, BoardCard) and never asserts on or mutates
 * TeamMember / Absence / Holiday. Assignments are written only as the minimal
 * weekStart fixtures that drive autoMoveCards; nothing here weakens isolation.
 *
 * Tests run against the dev DB per the project's vitest.config.ts. Cleanup
 * runs in afterEach (each delete wrapped in .catch and scoped to seeded ids)
 * so a mid-test failure leaves no orphan rows behind.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../db/prisma.js';
import { autoMoveCards } from '../boardService.js';

interface SeedIds {
  clientId: string;
  teamMemberId: string;
  stoppedProjectId: string;
  stoppedCardId: string;
  controlProjectId: string;
  controlCardId: string;
  stoppedAssignmentId: string;
  controlAssignmentId: string;
}

function uniqueSuffix(): string {
  return `automove-stopped-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The backend runs against a single SQLite file (one writer at a time).
 * autoMoveCards() and the seed creates issue real writes; when this suite runs
 * concurrently with other write-heavy suites (e.g. scheduleIsolation.phase23/24
 * in parallel vitest workers), SQLite can transiently bounce a write with a
 * busy / "Operation has timed out" error. That is an environmental DB-locking
 * limit, NOT a logic defect — the seeded ids keep the assertions correctly
 * scoped. Retrying with a short jittered backoff lets the lock clear, matching
 * upsertAssignmentWithRetry in the scheduleIsolation suites. (See STATE.md
 * KNOWN-ISSUE entries for the same single-writer concurrency limit.)
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

/**
 * Monday (UTC, 00:00) of the week containing `date`. Mirrors the private
 * getMondayISO helper in boardService so the seeded weekStart lands exactly on
 * the boundary the auto-mover treats as 'preparation' (== next Monday).
 */
function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function seedDataset(): Promise<SeedIds> {
  const suffix = uniqueSuffix();

  // earliest assignment week == next Monday → would normally move to 'preparation'.
  const nextMonday = mondayOf(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  const client = await withDbRetry(() =>
    prisma.client.create({
      data: { name: `AutoMoveStopped Client ${suffix}`, color: '#abcdef' },
    }),
  );
  const teamMember = await withDbRetry(() =>
    prisma.teamMember.create({
      data: { displayName: `AutoMoveStopped TM ${suffix}`, status: 'active' },
    }),
  );

  // ── Stopped card: must NOT move. ──
  const stoppedProject = await withDbRetry(() =>
    prisma.project.create({
      data: { name: `AutoMoveStopped Project ${suffix}`, clientId: client.id, color: '#abcdef' },
    }),
  );
  const stoppedCard = await withDbRetry(() =>
    prisma.boardCard.create({
      data: { projectId: stoppedProject.id, stage: 'stopped', stageLockedBy: null },
    }),
  );
  const stoppedAssignment = await withDbRetry(() =>
    prisma.assignment.create({
      data: {
        teamMemberId: teamMember.id,
        projectName: stoppedProject.name,
        projectColor: '#abcdef',
        status: 'confirmed',
        weekStart: nextMonday,
        clientId: client.id,
        projectId: stoppedProject.id,
      },
    }),
  );

  // ── Control card: identical qualifying week, NOT stopped → must move to 'preparation'. ──
  const controlProject = await withDbRetry(() =>
    prisma.project.create({
      data: { name: `AutoMoveControl Project ${suffix}`, clientId: client.id, color: '#abcdef' },
    }),
  );
  const controlCard = await withDbRetry(() =>
    prisma.boardCard.create({
      data: { projectId: controlProject.id, stage: 'upcoming', stageLockedBy: null },
    }),
  );
  // The Assignment unique key is (teamMemberId, weekStart); the control shares
  // the same qualifying week as the stopped one, so it needs its own TeamMember.
  const controlTeamMember = await withDbRetry(() =>
    prisma.teamMember.create({
      data: { displayName: `AutoMoveControl TM ${suffix}`, status: 'active' },
    }),
  );
  const controlAssignment = await withDbRetry(() =>
    prisma.assignment.create({
      data: {
        teamMemberId: controlTeamMember.id,
        projectName: controlProject.name,
        projectColor: '#abcdef',
        status: 'confirmed',
        weekStart: nextMonday,
        clientId: client.id,
        projectId: controlProject.id,
      },
    }),
  );

  // controlTeamMember is cleaned up via its displayName suffix in teardown.
  void controlTeamMember;

  return {
    clientId: client.id,
    teamMemberId: teamMember.id,
    stoppedProjectId: stoppedProject.id,
    stoppedCardId: stoppedCard.id,
    controlProjectId: controlProject.id,
    controlCardId: controlCard.id,
    stoppedAssignmentId: stoppedAssignment.id,
    controlAssignmentId: controlAssignment.id,
  };
}

async function teardownDataset(ids: SeedIds | null, suffix: string | null) {
  if (!ids) return;
  // FK-safe order: Assignments and BoardCards before the Projects/Clients/TMs
  // they reference. Each delete scoped to seeded ids and wrapped in .catch so a
  // partial seed never aborts the rest of cleanup.
  await prisma.assignment
    .deleteMany({ where: { id: { in: [ids.stoppedAssignmentId, ids.controlAssignmentId] } } })
    .catch(() => undefined);
  await prisma.boardCard
    .deleteMany({ where: { id: { in: [ids.stoppedCardId, ids.controlCardId] } } })
    .catch(() => undefined);
  await prisma.project
    .deleteMany({ where: { id: { in: [ids.stoppedProjectId, ids.controlProjectId] } } })
    .catch(() => undefined);
  // Both seeded TeamMembers carry the run suffix in their displayName.
  if (suffix) {
    await prisma.teamMember
      .deleteMany({ where: { displayName: { contains: suffix } } })
      .catch(() => undefined);
  } else {
    await prisma.teamMember.deleteMany({ where: { id: ids.teamMemberId } }).catch(() => undefined);
  }
  await prisma.client.deleteMany({ where: { id: ids.clientId } }).catch(() => undefined);
}

describe('autoMoveCards — Stopped exclusion', () => {
  let ids: SeedIds | null = null;
  let suffix: string | null = null;

  beforeEach(async () => {
    ids = await seedDataset();
    // Recover the suffix from a seeded project name for TeamMember cleanup.
    const proj = await prisma.project.findUnique({ where: { id: ids.stoppedProjectId } });
    suffix = proj ? proj.name.replace('AutoMoveStopped Project ', '') : null;
  });

  afterEach(async () => {
    await teardownDataset(ids, suffix);
    ids = null;
    suffix = null;
  });

  it('does NOT move a card with stage="stopped" even when its week qualifies for auto-move', async () => {
    await withDbRetry(() => autoMoveCards());

    const stopped = await prisma.boardCard.findUnique({ where: { id: ids!.stoppedCardId } });
    expect(stopped?.stage).toBe('stopped');
    // The exclusion is by stage value, so the lock must be untouched too.
    expect(stopped?.stageLockedBy).toBeNull();
  });

  it('DOES move a qualifying non-stopped control card to "preparation" (proves the test is non-vacuous)', async () => {
    await withDbRetry(() => autoMoveCards());

    const control = await prisma.boardCard.findUnique({ where: { id: ids!.controlCardId } });
    expect(control?.stage).toBe('preparation');
  });
});
