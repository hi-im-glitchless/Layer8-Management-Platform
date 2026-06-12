/**
 * Last-assignment orphan guard regression — Phase 09.
 *
 * deleteAssignment() must move a project's BoardCard to the existing 'stopped'
 * stage ONLY when the deleted assignment was the LAST one referencing that
 * project (count over BOTH projectId and splitProjectId === 0). It must never
 * delete a Project/BoardCard/row, and a project still referenced by another
 * assignment must be left COMPLETELY untouched (MULTI-PENTESTER SAFETY,
 * NON-NEGOTIABLE). Backlog/null-projectId deletes are a guard no-op.
 *
 * This suite proves those invariants directly:
 *  (a) ZERO -> STOPPED: a project with exactly one assignment; delete it ->
 *      its card.stage becomes 'stopped'.
 *  (b) MULTI-PENTESTER SAFETY: a project referenced by two assignments; delete
 *      one -> the card stage is UNCHANGED and the Project + card still exist.
 *  (c) SPLIT-CELL INDEPENDENCE: a split row carrying projectId=A and
 *      splitProjectId=B, where A is otherwise unreferenced but B is also held
 *      by a second assignment; delete the split row -> A's card -> 'stopped',
 *      B's card UNCHANGED.
 *  (d) BACKLOG / NULL no-op: an assignment with null project halves; delete it
 *      -> resolves without throwing and no card is moved to 'stopped'.
 *  (e) NON-FATAL: a delete whose project has NO BoardCard still succeeds (the
 *      board step is best-effort).
 *
 * Schedule isolation (NON-NEGOTIABLE, milestone-wide): this suite seeds only
 * the board read-fixtures + assignments it needs (Client, Project, BoardCard,
 * TeamMember, Assignment) and the subject under test (deleteAssignment) writes
 * ONLY BoardCard.stage — it never mutates TeamMember/Absence/Holiday. All
 * assertions are scoped to seeded ids so the suite is parallel-safe.
 *
 * Tests run against the dev DB per the project's vitest.config.ts. Cleanup runs
 * in afterEach (each delete wrapped in .catch and scoped to seeded ids) so a
 * mid-test failure leaves no orphan rows behind.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { prisma } from '../../db/prisma.js';
import { deleteAssignment } from '../assignmentService.js';

function uniqueSuffix(): string {
  return `del-orphan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The backend runs against a single SQLite file (one writer at a time). When
 * this suite runs concurrently with other write-heavy suites, SQLite can
 * transiently bounce a write with a busy / "Operation has timed out" error.
 * That is an environmental DB-locking limit, NOT a logic defect — the seeded
 * ids keep assertions scoped. Retry with short jittered backoff, matching
 * withDbRetry in boardAutoMove.stopped.test.ts.
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

/** Monday (UTC, 00:00) of the week containing `date`. */
function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Track every seeded id so teardown can scope deletes precisely.
interface SeedBag {
  clientIds: string[];
  teamMemberIds: string[];
  projectIds: string[];
  cardIds: string[];
  assignmentIds: string[];
}

function newBag(): SeedBag {
  return { clientIds: [], teamMemberIds: [], projectIds: [], cardIds: [], assignmentIds: [] };
}

async function teardown(bag: SeedBag) {
  // FK-safe order: assignments + cards before projects/clients/TMs.
  await prisma.assignment
    .deleteMany({ where: { id: { in: bag.assignmentIds } } })
    .catch(() => undefined);
  await prisma.boardCard
    .deleteMany({ where: { id: { in: bag.cardIds } } })
    .catch(() => undefined);
  await prisma.project
    .deleteMany({ where: { id: { in: bag.projectIds } } })
    .catch(() => undefined);
  await prisma.teamMember
    .deleteMany({ where: { id: { in: bag.teamMemberIds } } })
    .catch(() => undefined);
  await prisma.client
    .deleteMany({ where: { id: { in: bag.clientIds } } })
    .catch(() => undefined);
}

async function seedClient(bag: SeedBag, suffix: string) {
  const client = await withDbRetry(() =>
    prisma.client.create({ data: { name: `DelOrphan Client ${suffix}`, color: '#abcdef' } }),
  );
  bag.clientIds.push(client.id);
  return client;
}

async function seedTeamMember(bag: SeedBag, suffix: string, label: string) {
  const tm = await withDbRetry(() =>
    prisma.teamMember.create({
      data: { displayName: `DelOrphan TM ${label} ${suffix}`, status: 'active' },
    }),
  );
  bag.teamMemberIds.push(tm.id);
  return tm;
}

async function seedProjectWithCard(
  bag: SeedBag,
  clientId: string,
  suffix: string,
  label: string,
  stage: string,
) {
  const project = await withDbRetry(() =>
    prisma.project.create({
      data: { name: `DelOrphan Project ${label} ${suffix}`, clientId, color: '#abcdef' },
    }),
  );
  bag.projectIds.push(project.id);
  const card = await withDbRetry(() =>
    prisma.boardCard.create({
      data: { projectId: project.id, stage, stageLockedBy: null },
    }),
  );
  bag.cardIds.push(card.id);
  return { project, card };
}

async function seedAssignment(
  bag: SeedBag,
  data: {
    teamMemberId: string;
    clientId: string;
    weekStart: Date;
    projectName: string;
    projectId?: string | null;
    splitProjectId?: string | null;
  },
) {
  const assignment = await withDbRetry(() =>
    prisma.assignment.create({
      data: {
        teamMemberId: data.teamMemberId,
        projectName: data.projectName,
        projectColor: '#abcdef',
        status: 'confirmed',
        weekStart: data.weekStart,
        clientId: data.clientId,
        projectId: data.projectId ?? null,
        splitProjectId: data.splitProjectId ?? null,
      },
    }),
  );
  bag.assignmentIds.push(assignment.id);
  return assignment;
}

describe('deleteAssignment — last-assignment orphan -> stopped guard', () => {
  let bag = newBag();

  afterEach(async () => {
    await teardown(bag);
    bag = newBag();
  });

  it('(a) ZERO -> STOPPED: deleting the only assignment for a project moves its card to "stopped"', async () => {
    const suffix = uniqueSuffix();
    const client = await seedClient(bag, suffix);
    const tm = await seedTeamMember(bag, suffix, 'a');
    const { project, card } = await seedProjectWithCard(bag, client.id, suffix, 'a', 'upcoming');
    const a = await seedAssignment(bag, {
      teamMemberId: tm.id,
      clientId: client.id,
      weekStart: mondayOf(new Date()),
      projectName: project.name,
      projectId: project.id,
    });

    await withDbRetry(() => deleteAssignment(a.id));

    const after = await prisma.boardCard.findUnique({ where: { id: card.id } });
    expect(after?.stage).toBe('stopped');
    // The assignment row is gone; the project + card survive.
    expect(await prisma.assignment.findUnique({ where: { id: a.id } })).toBeNull();
    expect(await prisma.project.findUnique({ where: { id: project.id } })).not.toBeNull();
  });

  it('(b) MULTI-PENTESTER SAFETY: a project with another remaining assignment is left untouched', async () => {
    const suffix = uniqueSuffix();
    const client = await seedClient(bag, suffix);
    const tm1 = await seedTeamMember(bag, suffix, 'b1');
    const tm2 = await seedTeamMember(bag, suffix, 'b2');
    const { project, card } = await seedProjectWithCard(bag, client.id, suffix, 'b', 'execution');
    const week = mondayOf(new Date());
    // Two assignments (distinct team members) referencing the SAME project.
    const a1 = await seedAssignment(bag, {
      teamMemberId: tm1.id,
      clientId: client.id,
      weekStart: week,
      projectName: project.name,
      projectId: project.id,
    });
    await seedAssignment(bag, {
      teamMemberId: tm2.id,
      clientId: client.id,
      weekStart: week,
      projectName: project.name,
      projectId: project.id,
    });

    await withDbRetry(() => deleteAssignment(a1.id));

    const after = await prisma.boardCard.findUnique({ where: { id: card.id } });
    // UNCHANGED — still the seeded stage, NOT 'stopped'.
    expect(after?.stage).toBe('execution');
    expect(await prisma.project.findUnique({ where: { id: project.id } })).not.toBeNull();
    expect(after).not.toBeNull();
  });

  it('(c) SPLIT-CELL INDEPENDENCE: A reaches zero -> stopped; B still referenced -> untouched', async () => {
    const suffix = uniqueSuffix();
    const client = await seedClient(bag, suffix);
    const tmSplit = await seedTeamMember(bag, suffix, 'c-split');
    const tmB = await seedTeamMember(bag, suffix, 'c-b');
    const { project: projA, card: cardA } = await seedProjectWithCard(bag, client.id, suffix, 'cA', 'upcoming');
    const { project: projB, card: cardB } = await seedProjectWithCard(bag, client.id, suffix, 'cB', 'execution');
    const week = mondayOf(new Date());

    // Split row: primary=A, split=B. A is otherwise unreferenced; B is also
    // held by a second (distinct-member) assignment.
    const splitRow = await seedAssignment(bag, {
      teamMemberId: tmSplit.id,
      clientId: client.id,
      weekStart: week,
      projectName: projA.name,
      projectId: projA.id,
      splitProjectId: projB.id,
    });
    await seedAssignment(bag, {
      teamMemberId: tmB.id,
      clientId: client.id,
      weekStart: week,
      projectName: projB.name,
      projectId: projB.id,
    });

    await withDbRetry(() => deleteAssignment(splitRow.id));

    const afterA = await prisma.boardCard.findUnique({ where: { id: cardA.id } });
    const afterB = await prisma.boardCard.findUnique({ where: { id: cardB.id } });
    expect(afterA?.stage).toBe('stopped'); // A reached zero
    expect(afterB?.stage).toBe('execution'); // B still referenced — untouched
  });

  it('(d) BACKLOG / NULL no-op: deleting a null-project assignment resolves and stops no card', async () => {
    const suffix = uniqueSuffix();
    const client = await seedClient(bag, suffix);
    const tm = await seedTeamMember(bag, suffix, 'd');
    // Seed an unrelated project+card to assert nothing gets collaterally stopped.
    const { card } = await seedProjectWithCard(bag, client.id, suffix, 'd', 'upcoming');
    const backlog = await seedAssignment(bag, {
      teamMemberId: tm.id,
      clientId: client.id,
      weekStart: mondayOf(new Date()),
      projectName: 'Backlog (no project link)',
      projectId: null,
      splitProjectId: null,
    });

    await expect(withDbRetry(() => deleteAssignment(backlog.id))).resolves.toBeDefined();

    const after = await prisma.boardCard.findUnique({ where: { id: card.id } });
    expect(after?.stage).toBe('upcoming'); // untouched
    expect(await prisma.assignment.findUnique({ where: { id: backlog.id } })).toBeNull();
  });

  it('(e) NON-FATAL: deleting the last assignment of a project with NO BoardCard still succeeds', async () => {
    const suffix = uniqueSuffix();
    const client = await seedClient(bag, suffix);
    const tm = await seedTeamMember(bag, suffix, 'e');
    // Project WITHOUT a BoardCard row.
    const project = await withDbRetry(() =>
      prisma.project.create({
        data: { name: `DelOrphan Project e ${suffix}`, clientId: client.id, color: '#abcdef' },
      }),
    );
    bag.projectIds.push(project.id);
    const a = await seedAssignment(bag, {
      teamMemberId: tm.id,
      clientId: client.id,
      weekStart: mondayOf(new Date()),
      projectName: project.name,
      projectId: project.id,
    });

    await expect(withDbRetry(() => deleteAssignment(a.id))).resolves.toBeDefined();
    expect(await prisma.assignment.findUnique({ where: { id: a.id } })).toBeNull();
  });
});
