/**
 * Rename-in-place regression — Phase 01 (Schedule-to-Planner Project Sync).
 *
 * The defect pinned here: projectService.upsertByKey resolves a Project purely
 * by the dedupe triple (name, clientId, sortedTagsJson). Editing any of those
 * three fields on an ALREADY-LINKED schedule assignment therefore missed the
 * lookup and minted a *second* Project + BoardCard, orphaning the original card
 * along with every bit of state the Planner had accumulated on it — stage,
 * checklist, notes, stageLockedBy, comments and files.
 *
 * Plan 01-01 fixed this with projectService.resolveLinkedProject: once an
 * assignment half carries a Project FK, that id — not the triple — is
 * authoritative. The row is renamed in place BY ID (or re-pointed when the new
 * triple collides with a different existing Project), so the single BoardCard
 * follows the rename instead of being left behind.
 *
 * Every test drives the real assignmentService.upsertAssignment /
 * updateAssignment entrypoints, so the whole linkProjectsForAssignment chain is
 * under test — not just the resolver in isolation.
 *
 * Isolation (NON-NEGOTIABLE, carried from the three existing service suites):
 * every seeded Client.name / User.username / Project name carries a
 * uniqueSuffix() so parallel vitest workers can never collide on those unique
 * constraints, and every DB call goes through a jittered withDbRetry that
 * absorbs SQLite's single-writer SQLITE_BUSY / "database is locked" /
 * "Operation has timed out" bounces. The retry helper is COPIED into this file
 * rather than imported — the existing suites deliberately duplicate it so no
 * suite ever reads another suite's rows.
 *
 * Tests run against the dev DB per vitest.config.ts. afterEach cleans up in
 * FK-safe order (Assignment -> BoardCard -> Project -> ProjectColor ->
 * TeamMember -> User -> Client), each delete .catch(() => undefined)-wrapped so
 * a mid-test failure never leaves cleanup half-done. This suite writes
 * Project / Assignment / BoardCard only; it never reads, asserts on or mutates
 * Absence or Holiday.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../db/prisma.js';
import { updateAssignment, upsertAssignment } from '../assignmentService.js';

function uniqueSuffix(): string {
  return `rename-inplace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The backend runs against a single SQLite file (one writer at a time), and
 * upsertAssignment opens an interactive Prisma $transaction that holds a write
 * lock. When this suite runs alongside another write-heavy suite in a parallel
 * vitest worker, SQLite can transiently bounce the write with a busy /
 * "Operation has timed out" error — an environmental DB-locking limit, NOT a
 * logic defect. Retry with a short jittered backoff so the workers desynchronise
 * and the lock clears (mirrors withDbRetry in projectUpsertStatus /
 * defaultChecklistBackfill and upsertAssignmentWithRetry in
 * scheduleIsolation.phase24).
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

interface Seed {
  suffix: string;
  userAId: string;
  userBId: string;
  teamMemberAId: string;
  teamMemberBId: string;
  clientAId: string;
  clientBId: string;
}

/** A far-future Monday, so seeded rows can never collide with real schedule data. */
const WEEK_ONE = new Date('2099-03-02T00:00:00.000Z');

let seed: Seed | null = null;

async function seedDataset(): Promise<Seed> {
  const suffix = uniqueSuffix();

  const userA = await withDbRetry(() =>
    prisma.user.create({
      data: {
        username: `rename-a-${suffix}`,
        passwordHash: 'not-a-real-hash',
        role: 'ADMIN',
        displayName: 'RenameInPlace Admin A',
      },
    }),
  );
  const userB = await withDbRetry(() =>
    prisma.user.create({
      data: {
        username: `rename-b-${suffix}`,
        passwordHash: 'not-a-real-hash',
        role: 'ADMIN',
        displayName: 'RenameInPlace Admin B',
      },
    }),
  );
  const teamMemberA = await withDbRetry(() =>
    prisma.teamMember.create({
      data: { userId: userA.id, displayName: 'RenameInPlace TM A', status: 'active' },
    }),
  );
  const teamMemberB = await withDbRetry(() =>
    prisma.teamMember.create({
      data: { userId: userB.id, displayName: 'RenameInPlace TM B', status: 'active' },
    }),
  );
  // isPlannerEligible requires a clientId, so Clients are mandatory for any of
  // these paths to fire at all. Two of them, because the client-change and
  // collision cases need a second identity to move to.
  const clientA = await withDbRetry(() =>
    prisma.client.create({ data: { name: `RenameInPlace Client A ${suffix}`, color: '#112233' } }),
  );
  const clientB = await withDbRetry(() =>
    prisma.client.create({ data: { name: `RenameInPlace Client B ${suffix}`, color: '#445566' } }),
  );

  return {
    suffix,
    userAId: userA.id,
    userBId: userB.id,
    teamMemberAId: teamMemberA.id,
    teamMemberBId: teamMemberB.id,
    clientAId: clientA.id,
    clientBId: clientB.id,
  };
}

async function teardownDataset(ids: Seed | null) {
  if (!ids) return;
  const teamMemberIds = [ids.teamMemberAId, ids.teamMemberBId];
  const clientIds = [ids.clientAId, ids.clientBId];

  // FK-safe order. Assignments reference Projects (onDelete: SetNull) and
  // TeamMembers (Cascade); BoardCard/BoardComment cascade from Project but are
  // deleted explicitly for clarity and to stay robust if a cascade is relaxed.
  // Every delete is .catch-wrapped so a partial seed never aborts the rest.
  await prisma.assignment
    .deleteMany({ where: { teamMemberId: { in: teamMemberIds } } })
    .catch(() => undefined);

  // Every Project this suite can create hangs off one of the two seeded
  // Clients, so this discovers them all — including the ones the service
  // materialised on our behalf.
  const projects = await prisma.project
    .findMany({ where: { clientId: { in: clientIds } }, select: { id: true } })
    .catch(() => [] as { id: string }[]);
  const projectIds = projects.map((p) => p.id);
  if (projectIds.length > 0) {
    await prisma.boardCard.deleteMany({ where: { projectId: { in: projectIds } } }).catch(() => undefined);
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } }).catch(() => undefined);
  }

  // upsertAssignment also stamps the project-name autocomplete table; those
  // rows are keyed by the suffixed project name, so this stays scoped.
  await prisma.projectColor.deleteMany({ where: { name: { contains: ids.suffix } } }).catch(() => undefined);

  await prisma.teamMember.deleteMany({ where: { id: { in: teamMemberIds } } }).catch(() => undefined);
  await prisma.user.deleteMany({ where: { id: { in: [ids.userAId, ids.userBId] } } }).catch(() => undefined);
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } }).catch(() => undefined);
}

/** Re-read the Assignment row — upsertAssignment returns it before linkProjectsForAssignment writes the FK. */
async function readAssignment(id: string) {
  const row = await prisma.assignment.findUnique({ where: { id } });
  expect(row).not.toBeNull();
  return row!;
}

/** Count every Project reachable from this test's seeded Clients. */
function seededProjectCount(ids: Seed) {
  return prisma.project.count({ where: { clientId: { in: [ids.clientAId, ids.clientBId] } } });
}

describe('Phase 01 — rename-in-place for an already-linked Project', () => {
  beforeEach(async () => {
    seed = await seedDataset();
  });

  afterEach(async () => {
    await teardownDataset(seed);
    seed = null;
  });

  it('renames the linked Project in place — same projectId, same BoardCard, no duplicate row', async () => {
    const s = seed!;
    const originalName = `RenameInPlace Orig ${s.suffix}`;
    const renamedName = `RenameInPlace Renamed ${s.suffix}`;

    const created = await withDbRetry(() =>
      upsertAssignment({
        teamMemberId: s.teamMemberAId,
        projectName: originalName,
        projectColor: '#a1b2c3',
        status: 'confirmed',
        weekStart: WEEK_ONE,
        clientId: s.clientAId,
        tags: ['Web'],
      }),
    );

    const linked = await readAssignment(created.id);
    const projectId = linked.projectId;
    expect(projectId).toBeTruthy();
    const cardBefore = await prisma.boardCard.findUnique({ where: { projectId: projectId! } });
    expect(cardBefore).not.toBeNull();

    // The edit under test: only the project NAME moves.
    await withDbRetry(() => updateAssignment(created.id, { projectName: renamedName }));

    const after = await readAssignment(created.id);
    // The whole point: the FK does NOT move to a freshly minted Project.
    expect(after.projectId).toBe(projectId);

    const project = await prisma.project.findUnique({ where: { id: projectId! } });
    expect(project?.name).toBe(renamedName);
    expect(project?.clientId).toBe(s.clientAId);

    // No fork-on-edit: still exactly one Project across both seeded clients.
    expect(await seededProjectCount(s)).toBe(1);

    // ...and the SAME card, not a second one.
    const cards = await prisma.boardCard.findMany({ where: { projectId: projectId! } });
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe(cardBefore!.id);
  });

  it('moves the linked Project to a different client in place — same projectId, same BoardCard', async () => {
    const s = seed!;
    const name = `RenameInPlace ClientMove ${s.suffix}`;

    const created = await withDbRetry(() =>
      upsertAssignment({
        teamMemberId: s.teamMemberAId,
        projectName: name,
        projectColor: '#a1b2c3',
        status: 'confirmed',
        weekStart: WEEK_ONE,
        clientId: s.clientAId,
        tags: ['Web'],
      }),
    );

    const linked = await readAssignment(created.id);
    const projectId = linked.projectId!;
    expect(projectId).toBeTruthy();
    const cardBefore = await prisma.boardCard.findUnique({ where: { projectId } });

    await withDbRetry(() => updateAssignment(created.id, { clientId: s.clientBId }));

    const after = await readAssignment(created.id);
    expect(after.projectId).toBe(projectId);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    expect(project?.clientId).toBe(s.clientBId);
    expect(project?.name).toBe(name);

    expect(await seededProjectCount(s)).toBe(1);
    const cards = await prisma.boardCard.findMany({ where: { projectId } });
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe(cardBefore!.id);
  });

  it('re-tags the linked Project in place, and treats a same-set/different-order re-save as a zero-write no-op', async () => {
    const s = seed!;
    const name = `RenameInPlace Retag ${s.suffix}`;

    const created = await withDbRetry(() =>
      upsertAssignment({
        teamMemberId: s.teamMemberAId,
        projectName: name,
        projectColor: '#a1b2c3',
        status: 'confirmed',
        weekStart: WEEK_ONE,
        clientId: s.clientAId,
        tags: ['Web'],
      }),
    );

    const linked = await readAssignment(created.id);
    const projectId = linked.projectId!;
    expect(projectId).toBeTruthy();
    const cardBefore = await prisma.boardCard.findUnique({ where: { projectId } });

    // Genuine tag change: ['Web'] -> ['Web', 'Externa'].
    await withDbRetry(() => updateAssignment(created.id, { tags: ['Web', 'Externa'] }));

    const after = await readAssignment(created.id);
    expect(after.projectId).toBe(projectId);

    const retagged = await prisma.project.findUnique({ where: { id: projectId } });
    // normaliseTags canonicalises to a sorted JSON array.
    expect(retagged?.tags).toBe(JSON.stringify(['Externa', 'Web']));

    expect(await seededProjectCount(s)).toBe(1);
    const cards = await prisma.boardCard.findMany({ where: { projectId } });
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe(cardBefore!.id);

    // Same SET, different ORDER: normaliseTags sorts, so the resolver must see
    // an unchanged triple and take the zero-write short-circuit.
    await withDbRetry(() => updateAssignment(created.id, { tags: ['Externa', 'Web'] }));

    const reordered = await prisma.project.findUnique({ where: { id: projectId } });
    expect(reordered?.id).toBe(projectId);
    expect(reordered?.tags).toBe(JSON.stringify(['Externa', 'Web']));
    expect(reordered!.updatedAt.getTime()).toBe(retagged!.updatedAt.getTime()); // no extra write
  });

  it('keeps BoardCard stage / checklist / notes / stageLockedBy and its comments byte-identical across a rename', async () => {
    const s = seed!;
    const originalName = `RenameInPlace CardState ${s.suffix}`;
    const renamedName = `RenameInPlace CardState Renamed ${s.suffix}`;

    const created = await withDbRetry(() =>
      upsertAssignment({
        teamMemberId: s.teamMemberAId,
        projectName: originalName,
        projectColor: '#a1b2c3',
        status: 'confirmed',
        weekStart: WEEK_ONE,
        clientId: s.clientAId,
        tags: ['Web'],
      }),
    );

    const linked = await readAssignment(created.id);
    const projectId = linked.projectId!;
    expect(projectId).toBeTruthy();
    const seededCard = await prisma.boardCard.findUnique({ where: { projectId } });
    expect(seededCard).not.toBeNull();
    const cardId = seededCard!.id;

    // Accumulate exactly the Planner-side state the fork-on-edit bug abandoned.
    const workedChecklist = JSON.stringify([
      { label: 'Kickoff', checked: true, order: 0 },
      { label: 'Pentest', checked: true, order: 1 },
      { label: 'Report', checked: false, order: 2 },
    ]);
    const stateBefore = await withDbRetry(() =>
      prisma.boardCard.update({
        where: { id: cardId },
        data: {
          stage: 'execution',
          checklist: workedChecklist,
          notes: 'Scoping call done; creds pending from the client.',
          stageLockedBy: s.userAId,
        },
      }),
    );
    // A comment is the cheap proof that cascaded child rows survive too: they
    // hang off this card id, and nothing may delete or recreate the card.
    await withDbRetry(() =>
      prisma.boardComment.create({
        data: { cardId, authorId: s.userAId, body: 'Kickoff notes captured.' },
      }),
    );

    await withDbRetry(() => updateAssignment(created.id, { projectName: renamedName }));

    const after = await readAssignment(created.id);
    expect(after.projectId).toBe(projectId);
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    expect(project?.name).toBe(renamedName);

    // Re-read by the SAME card id — a forked Project would have produced a new one.
    const cardAfter = await prisma.boardCard.findUnique({ where: { id: cardId } });
    expect(cardAfter).not.toBeNull();
    expect(cardAfter!.projectId).toBe(projectId);
    expect(cardAfter!.stage).toBe(stateBefore.stage);
    expect(cardAfter!.checklist).toBe(stateBefore.checklist);
    expect(cardAfter!.notes).toBe(stateBefore.notes);
    expect(cardAfter!.stageLockedBy).toBe(stateBefore.stageLockedBy);

    expect(await prisma.boardComment.count({ where: { cardId } })).toBe(1);
    // And no second card was minted for the renamed Project.
    expect(await prisma.boardCard.count({ where: { projectId } })).toBe(1);
  });

  it('renames the SPLIT half in place, leaves the primary untouched, and preserves the color/status fallback', async () => {
    const s = seed!;
    const primaryName = `RenameInPlace Split Primary ${s.suffix}`;
    const splitName = `RenameInPlace Split Secondary ${s.suffix}`;
    const splitRenamed = `RenameInPlace Split Renamed ${s.suffix}`;

    const created = await withDbRetry(() =>
      upsertAssignment({
        teamMemberId: s.teamMemberAId,
        projectName: primaryName,
        projectColor: '#a1b2c3',
        status: 'confirmed',
        weekStart: WEEK_ONE,
        clientId: s.clientAId,
        tags: ['Web'],
        splitProjectName: splitName,
        // Left NULL on purpose: the split half must fall back to the primary's
        // color/status (`a.splitProjectColor ?? a.projectColor`,
        // `a.splitProjectStatus ?? a.status`). Research flagged this asymmetry
        // as easy to normalise away, so it is asserted explicitly below.
        splitProjectColor: null,
        splitProjectStatus: null,
        splitClientId: s.clientAId,
        splitTags: ['Interna'],
      }),
    );

    const linked = await readAssignment(created.id);
    const primaryProjectId = linked.projectId!;
    const splitProjectId = linked.splitProjectId!;
    expect(primaryProjectId).toBeTruthy();
    expect(splitProjectId).toBeTruthy();
    expect(splitProjectId).not.toBe(primaryProjectId);

    const primaryBefore = await prisma.project.findUnique({ where: { id: primaryProjectId } });
    const splitBefore = await prisma.project.findUnique({ where: { id: splitProjectId } });
    // The fallback, at first link.
    expect(splitBefore?.color).toBe('#a1b2c3');
    expect(splitBefore?.status).toBe('confirmed');
    const splitCardBefore = await prisma.boardCard.findUnique({ where: { projectId: splitProjectId } });
    expect(splitCardBefore).not.toBeNull();

    // Edit ONLY the split triple — name, client and tags all move.
    await withDbRetry(() =>
      updateAssignment(created.id, {
        splitProjectName: splitRenamed,
        splitClientId: s.clientBId,
        splitTags: ['API'],
      }),
    );

    const after = await readAssignment(created.id);
    expect(after.splitProjectId).toBe(splitProjectId); // renamed in place, not forked
    expect(after.projectId).toBe(primaryProjectId);

    const splitAfter = await prisma.project.findUnique({ where: { id: splitProjectId } });
    expect(splitAfter?.name).toBe(splitRenamed);
    expect(splitAfter?.clientId).toBe(s.clientBId);
    expect(splitAfter?.tags).toBe(JSON.stringify(['API']));
    // The fallback survives the rename: still the PRIMARY's color/status.
    expect(splitAfter?.color).toBe('#a1b2c3');
    expect(splitAfter?.status).toBe('confirmed');

    // The primary half is completely untouched — its no-op short-circuit means
    // zero writes, so updatedAt has not moved.
    const primaryAfter = await prisma.project.findUnique({ where: { id: primaryProjectId } });
    expect(primaryAfter?.name).toBe(primaryName);
    expect(primaryAfter?.clientId).toBe(s.clientAId);
    expect(primaryAfter?.tags).toBe(JSON.stringify(['Web']));
    expect(primaryAfter!.updatedAt.getTime()).toBe(primaryBefore!.updatedAt.getTime());

    // No new Project and no new BoardCard were minted by the split rename.
    expect(await seededProjectCount(s)).toBe(2);
    const splitCards = await prisma.boardCard.findMany({ where: { projectId: splitProjectId } });
    expect(splitCards).toHaveLength(1);
    expect(splitCards[0].id).toBe(splitCardBefore!.id);
    expect(await prisma.boardCard.count({ where: { projectId: primaryProjectId } })).toBe(1);
  });

  it('renames a SHARED Project once for every assignment linked to it, keeping its single BoardCard', async () => {
    const s = seed!;
    const sharedName = `RenameInPlace Shared ${s.suffix}`;
    const sharedRenamed = `RenameInPlace Shared Renamed ${s.suffix}`;
    const sharedFields = {
      projectName: sharedName,
      projectColor: '#a1b2c3',
      status: 'confirmed',
      weekStart: WEEK_ONE,
      clientId: s.clientAId,
      tags: ['Web'],
    };

    // Two pentesters, same week, same eligible triple -> one shared Project.
    const first = await withDbRetry(() =>
      upsertAssignment({ teamMemberId: s.teamMemberAId, ...sharedFields }),
    );
    const second = await withDbRetry(() =>
      upsertAssignment({ teamMemberId: s.teamMemberBId, ...sharedFields }),
    );

    const firstLinked = await readAssignment(first.id);
    const secondLinked = await readAssignment(second.id);
    const sharedProjectId = firstLinked.projectId!;
    expect(sharedProjectId).toBeTruthy();
    expect(secondLinked.projectId).toBe(sharedProjectId);
    expect(await seededProjectCount(s)).toBe(1);
    const cardBefore = await prisma.boardCard.findUnique({ where: { projectId: sharedProjectId } });
    expect(cardBefore).not.toBeNull();

    // Rename through ONE of the two assignments.
    await withDbRetry(() => updateAssignment(first.id, { projectName: sharedRenamed }));

    const firstAfter = await readAssignment(first.id);
    const secondAfter = await readAssignment(second.id);
    // Both still point at the same, unchanged Project id — the rename is shared,
    // not forked, and the untouched assignment was neither re-pointed nor nulled.
    expect(firstAfter.projectId).toBe(sharedProjectId);
    expect(secondAfter.projectId).toBe(sharedProjectId);
    expect(secondAfter.splitProjectId).toBeNull();

    const project = await prisma.project.findUnique({ where: { id: sharedProjectId } });
    expect(project?.name).toBe(sharedRenamed);
    expect(project?.clientId).toBe(s.clientAId);
    expect(project?.tags).toBe(JSON.stringify(['Web']));

    expect(await seededProjectCount(s)).toBe(1);
    const cards = await prisma.boardCard.findMany({ where: { projectId: sharedProjectId } });
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe(cardBefore!.id);
  });
});
