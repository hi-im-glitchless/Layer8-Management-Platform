/**
 * Orphan-cleanup failure surfacing — UAT R01 (b3 fix).
 *
 * The last-assignment orphan guard in deleteAssignment() is best-effort and
 * non-fatal: a DB error while deleting the orphaned Project must NOT roll back
 * the schedule delete. Historically that error was swallowed silently, so the
 * user was told the delete fully succeeded while the Project/BoardCard survived
 * (research b3). deleteAssignment now returns { deleted, orphanCleanupFailed }
 * so the route -> hook can surface a warning toast.
 *
 * This suite proves the two ends of that contract:
 *  (HAPPY) zero-count last-assignment delete -> orphanCleanupFailed === false,
 *          and the Project + its cascaded BoardCard are gone (zero->deleted
 *          invariant unchanged).
 *  (FAILURE) the orphan project.delete throws -> orphanCleanupFailed === true,
 *          but the Assignment row is STILL deleted (non-fatal) and the BoardCard
 *          SURVIVES (the swallowed failure left it behind).
 *
 * The failure is forced WITHOUT changing production code by replacing
 * prisma.project.delete with a one-shot throwing mock and restoring the original
 * afterwards. (Prisma 7's model delegate exposes .delete via a lazy proxy whose
 * own-property descriptor has value=undefined, so vi.spyOn cannot capture it;
 * a direct writable-property swap is the reliable injection point here.)
 *
 * Schedule isolation (NON-NEGOTIABLE, milestone-wide): this suite seeds only the
 * board read-fixtures + assignments it needs and the subject under test writes
 * ONLY board-domain rows. All assertions are scoped to seeded ids so the suite
 * is parallel-safe. Tests run against the dev DB per the project's
 * vitest.config.ts; cleanup runs in afterEach scoped to seeded ids.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../db/prisma.js';
import { deleteAssignment } from '../assignmentService.js';

function uniqueSuffix(): string {
  return `del-orphan-fail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * SQLite has one writer at a time; concurrent suites can transiently bounce a
 * write with a busy / "Operation has timed out" error. That is an environmental
 * DB-locking limit, NOT a logic defect. Retry with short jittered backoff,
 * mirroring withDbRetry in deleteAssignmentOrphan.delete.test.ts.
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
  // FK-safe order: assignments + board leaf rows before cards/projects/clients/TMs.
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
    prisma.client.create({ data: { name: `DelOrphanFail Client ${suffix}`, color: '#abcdef' } }),
  );
  bag.clientIds.push(client.id);
  return client;
}

async function seedTeamMember(bag: SeedBag, suffix: string, label: string) {
  const tm = await withDbRetry(() =>
    prisma.teamMember.create({
      data: { displayName: `DelOrphanFail TM ${label} ${suffix}`, status: 'active' },
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
      data: { name: `DelOrphanFail Project ${label} ${suffix}`, clientId, color: '#abcdef' },
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
  data: { teamMemberId: string; clientId: string; weekStart: Date; projectName: string; projectId: string },
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
        projectId: data.projectId,
        splitProjectId: null,
      },
    }),
  );
  bag.assignmentIds.push(assignment.id);
  return assignment;
}

describe('deleteAssignment — orphan-cleanup failure surfacing (UAT R01 b3)', () => {
  let bag = newBag();

  afterEach(async () => {
    vi.restoreAllMocks();
    await teardown(bag);
    bag = newBag();
  });

  it('HAPPY PATH: a zero-count last-assignment delete reports orphanCleanupFailed === false and cascades the project + card away', async () => {
    const suffix = uniqueSuffix();
    const client = await seedClient(bag, suffix);
    const tm = await seedTeamMember(bag, suffix, 'happy');
    const { project, card } = await seedProjectWithCard(bag, client.id, suffix, 'happy', 'upcoming');
    const a = await seedAssignment(bag, {
      teamMemberId: tm.id,
      clientId: client.id,
      weekStart: mondayOf(new Date()),
      projectName: project.name,
      projectId: project.id,
    });

    const result = await withDbRetry(() => deleteAssignment(a.id));

    expect(result.orphanCleanupFailed).toBe(false);
    expect(result.deleted.id).toBe(a.id);
    // zero -> deleted invariant unchanged.
    expect(await prisma.assignment.findUnique({ where: { id: a.id } })).toBeNull();
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
    expect(await prisma.boardCard.findUnique({ where: { id: card.id } })).toBeNull();
  });

  it('FAILURE PATH: when the orphan project.delete throws, orphanCleanupFailed === true, the assignment is still deleted, and the card survives', async () => {
    const suffix = uniqueSuffix();
    const client = await seedClient(bag, suffix);
    const tm = await seedTeamMember(bag, suffix, 'fail');
    const { project, card } = await seedProjectWithCard(bag, client.id, suffix, 'fail', 'execution');
    const a = await seedAssignment(bag, {
      teamMemberId: tm.id,
      clientId: client.id,
      weekStart: mondayOf(new Date()),
      projectName: project.name,
      projectId: project.id,
    });

    // Force the best-effort orphan delete to throw (simulating a DB write
    // failure during cleanup) WITHOUT touching production code. Swap the
    // delegate's writable .delete with a one-shot throwing mock; restore it
    // immediately after so teardown's real deletes still work.
    const projectDelegate = prisma.project as unknown as {
      delete: (...args: unknown[]) => Promise<unknown>;
    };
    const originalDelete = projectDelegate.delete.bind(prisma.project);
    const deleteMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('simulated orphan project.delete failure'));
    projectDelegate.delete = deleteMock as typeof projectDelegate.delete;

    let result: Awaited<ReturnType<typeof deleteAssignment>>;
    try {
      result = await withDbRetry(() => deleteAssignment(a.id));
    } finally {
      projectDelegate.delete = originalDelete as typeof projectDelegate.delete;
    }

    // The swallowed failure is now surfaced.
    expect(result.orphanCleanupFailed).toBe(true);
    expect(deleteMock).toHaveBeenCalledTimes(1);
    // Non-fatal: the Assignment row is still gone.
    expect(await prisma.assignment.findUnique({ where: { id: a.id } })).toBeNull();
    // The orphaned Project + its BoardCard survived because cleanup failed.
    expect(await prisma.project.findUnique({ where: { id: project.id } })).not.toBeNull();
    const survivingCard = await prisma.boardCard.findUnique({ where: { id: card.id } });
    expect(survivingCard).not.toBeNull();
    expect(survivingCard?.stage).toBe('execution');
  });
});
