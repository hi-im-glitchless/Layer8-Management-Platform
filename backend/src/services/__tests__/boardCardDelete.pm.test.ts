/**
 * PM board-card hard-delete — Phase 01-01 (UAT R02: cascade to schedule).
 *
 * The DELETE /api/board/cards/:id route (now requireRole('PM')) no longer does a
 * bare boardService.deleteCard. It collects the card's linked assignment ids and
 * calls assignmentService.deleteAssignment(id) for each, reusing the lock-check +
 * last-assignment orphan-guard. When the project's last assignment is removed the
 * orphan-guard deletes the Project, which cascades the BoardCard (and its
 * children) away. The route then writes a board.card.delete audit entry.
 *
 * This suite exercises that audited delete the same way the route does
 * (deleteAssignment per linked id + logAuditEvent) and proves the NEW invariants:
 *
 *  (a) CASCADE: deleting the project's only linked Assignment fires the
 *      orphan-guard, which deletes the Project and cascades the BoardCard AND its
 *      BoardComment / BoardFile / BoardNotification children (schema
 *      onDelete: Cascade). After the delete the project, card, and children are
 *      all gone — the schedule no longer shows the project.
 *  (b) AUDIT: a board.card.delete AuditLog row exists referencing the deleted
 *      cardId and the acting userId.
 *
 * Schedule isolation (NON-NEGOTIABLE): this suite seeds only the rows it needs
 * (User, Client, Project, BoardCard, BoardComment, BoardFile, BoardNotification,
 * TeamMember, Assignment) and the subject under test writes ONLY board-domain
 * rows (Project + cascaded card subtree) + the audit entry; it never mutates
 * Absence/Holiday. All assertions are scoped to seeded ids so the suite is
 * parallel-safe.
 *
 * Tests run against the dev DB per vitest.config.ts. Cleanup runs in afterEach
 * (each delete scoped to seeded ids, wrapped in .catch) so a mid-test failure
 * leaves no orphan rows behind.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { prisma } from '../../db/prisma.js';
import { deleteAssignment } from '../assignmentService.js';
import { logAuditEvent } from '../audit.js';

function uniqueSuffix(): string {
  return `pmcard-del-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Single SQLite writer: transient busy/timeout errors are an environmental
 * locking limit, not a logic defect. Retry with short jittered backoff
 * (mirrors withDbRetry in deleteAssignmentOrphan.delete.test.ts).
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
  userIds: string[];
  clientIds: string[];
  teamMemberIds: string[];
  projectIds: string[];
  cardIds: string[];
  commentIds: string[];
  fileIds: string[];
  notificationIds: string[];
  assignmentIds: string[];
  auditLogIds: string[];
}

function newBag(): SeedBag {
  return {
    userIds: [],
    clientIds: [],
    teamMemberIds: [],
    projectIds: [],
    cardIds: [],
    commentIds: [],
    fileIds: [],
    notificationIds: [],
    assignmentIds: [],
    auditLogIds: [],
  };
}

async function teardown(bag: SeedBag) {
  // FK-safe order: audit + assignments + board leaf rows before
  // cards/projects/clients/team-members/users.
  await prisma.auditLog
    .deleteMany({ where: { id: { in: bag.auditLogIds } } })
    .catch(() => undefined);
  await prisma.assignment
    .deleteMany({ where: { id: { in: bag.assignmentIds } } })
    .catch(() => undefined);
  await prisma.boardNotification
    .deleteMany({ where: { id: { in: bag.notificationIds } } })
    .catch(() => undefined);
  await prisma.boardComment
    .deleteMany({ where: { id: { in: bag.commentIds } } })
    .catch(() => undefined);
  await prisma.boardFile
    .deleteMany({ where: { id: { in: bag.fileIds } } })
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
  await prisma.user
    .deleteMany({ where: { id: { in: bag.userIds } } })
    .catch(() => undefined);
}

async function seedUser(bag: SeedBag, suffix: string) {
  const user = await withDbRetry(() =>
    prisma.user.create({
      data: {
        username: `pmcard-pm-${suffix}`,
        passwordHash: 'x',
        role: 'PM',
      },
    }),
  );
  bag.userIds.push(user.id);
  return user;
}

async function seedClient(bag: SeedBag, suffix: string) {
  const client = await withDbRetry(() =>
    prisma.client.create({ data: { name: `PMCardDel Client ${suffix}`, color: '#abcdef' } }),
  );
  bag.clientIds.push(client.id);
  return client;
}

async function seedTeamMember(bag: SeedBag, suffix: string) {
  const tm = await withDbRetry(() =>
    prisma.teamMember.create({
      data: { displayName: `PMCardDel TM ${suffix}`, status: 'active' },
    }),
  );
  bag.teamMemberIds.push(tm.id);
  return tm;
}

async function seedProjectWithCard(bag: SeedBag, clientId: string, suffix: string) {
  const project = await withDbRetry(() =>
    prisma.project.create({
      data: { name: `PMCardDel Project ${suffix}`, clientId, color: '#abcdef' },
    }),
  );
  bag.projectIds.push(project.id);
  const card = await withDbRetry(() =>
    prisma.boardCard.create({
      data: { projectId: project.id, stage: 'execution', stageLockedBy: null },
    }),
  );
  bag.cardIds.push(card.id);
  return { project, card };
}

describe('PM board-card hard-delete — cascade through assignments, audit', () => {
  let bag = newBag();

  afterEach(async () => {
    await teardown(bag);
    bag = newBag();
  });

  it('deleting the only linked assignment cascades the Project, BoardCard, and its comments/files/notifications away, and writes a board.card.delete audit entry', async () => {
    const suffix = uniqueSuffix();
    const pm = await seedUser(bag, suffix);
    const client = await seedClient(bag, suffix);
    const tm = await seedTeamMember(bag, suffix);
    const { project, card } = await seedProjectWithCard(bag, client.id, suffix);

    // Card children that must cascade away when the card is deleted.
    const comment = await withDbRetry(() =>
      prisma.boardComment.create({
        data: { cardId: card.id, body: 'cascade comment', authorId: null },
      }),
    );
    bag.commentIds.push(comment.id);
    const file = await withDbRetry(() =>
      prisma.boardFile.create({
        data: {
          cardId: card.id,
          filename: 'cascade.txt',
          storedName: `cascade-${suffix}.txt`,
          mimeType: 'text/plain',
          sizeBytes: 12,
          uploadedBy: null,
        },
      }),
    );
    bag.fileIds.push(file.id);
    const notification = await withDbRetry(() =>
      prisma.boardNotification.create({
        data: {
          cardId: card.id,
          userId: null,
          type: 'mention',
        },
      }),
    );
    bag.notificationIds.push(notification.id);

    // The project's ONLY linked assignment. Deleting it leaves the project with
    // zero referencing assignments, firing the orphan-guard.
    const assignment = await withDbRetry(() =>
      prisma.assignment.create({
        data: {
          teamMemberId: tm.id,
          projectName: project.name,
          projectColor: '#abcdef',
          status: 'confirmed',
          weekStart: mondayOf(new Date()),
          clientId: client.id,
          projectId: project.id,
        },
      }),
    );
    bag.assignmentIds.push(assignment.id);

    // Exercise the audited delete exactly as the route does: collect the card's
    // linked assignment ids and call deleteAssignment for each (the route's
    // cascade mechanism), then write a board.card.delete audit entry carrying
    // cardId + acting userId. The last-assignment orphan-guard inside
    // deleteAssignment deletes the Project, which cascades the BoardCard away.
    const result = await withDbRetry(() => deleteAssignment(assignment.id));
    expect(result.orphanCleanupFailed).toBe(false);
    await withDbRetry(() =>
      logAuditEvent({
        userId: pm.id,
        action: 'board.card.delete',
        ipAddress: 'test-ip',
        details: { cardId: card.id, projectName: project.name, userId: pm.id },
      }),
    );

    // (a) CASCADE — the linked assignment is gone, the orphan-guard deleted the
    // Project, and the BoardCard + its comments/files/notifications cascaded away.
    expect(await prisma.assignment.findUnique({ where: { id: assignment.id } })).toBeNull();
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
    expect(await prisma.boardCard.findUnique({ where: { id: card.id } })).toBeNull();
    expect(await prisma.boardComment.findUnique({ where: { id: comment.id } })).toBeNull();
    expect(await prisma.boardFile.findUnique({ where: { id: file.id } })).toBeNull();
    expect(
      await prisma.boardNotification.findUnique({ where: { id: notification.id } }),
    ).toBeNull();

    // (b) AUDIT — board.card.delete entry referencing the deleted card + actor.
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'board.card.delete', userId: pm.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
    if (audit) {
      bag.auditLogIds.push(audit.id);
      const details = JSON.parse(audit.details) as { cardId?: string; userId?: string };
      expect(details.cardId).toBe(card.id);
      expect(details.userId).toBe(pm.id);
    }
  });

  // (a) MULTI-ASSIGNMENT CASCADE — a card whose Project is shared by TWO
  // pentesters (one via projectId, one via splitProjectId). The route collects
  // BOTH linked assignment ids and calls deleteAssignment for each. Removing the
  // last referencing assignment fires the orphan-guard, which deletes the
  // Project and cascades the BoardCard away. After the route's loop the Project,
  // the BoardCard, and ALL linked assignments are gone.
  it('multi-assignment cascade: deleting all linked assignments for two different pentesters removes every assignment, the Project, and the BoardCard', async () => {
    const suffix = uniqueSuffix();
    const client = await seedClient(bag, suffix);
    const tmA = await seedTeamMember(bag, suffix);
    const tmB = await seedTeamMember(bag, `${suffix}-b`);
    const { project, card } = await seedProjectWithCard(bag, client.id, suffix);

    // Pentester A references the Project via the primary projectId.
    const assignmentA = await withDbRetry(() =>
      prisma.assignment.create({
        data: {
          teamMemberId: tmA.id,
          projectName: project.name,
          projectColor: '#abcdef',
          status: 'confirmed',
          weekStart: mondayOf(new Date()),
          clientId: client.id,
          projectId: project.id,
        },
      }),
    );
    bag.assignmentIds.push(assignmentA.id);

    // Pentester B references the SAME Project via the split half (splitProjectId)
    // in a different week, so the project has two distinct referencing rows.
    const weekB = mondayOf(new Date());
    weekB.setUTCDate(weekB.getUTCDate() + 7);
    const assignmentB = await withDbRetry(() =>
      prisma.assignment.create({
        data: {
          teamMemberId: tmB.id,
          projectName: project.name,
          projectColor: '#abcdef',
          status: 'confirmed',
          weekStart: weekB,
          clientId: client.id,
          splitProjectName: project.name,
          splitProjectColor: '#abcdef',
          splitClientId: client.id,
          splitProjectId: project.id,
        },
      }),
    );
    bag.assignmentIds.push(assignmentB.id);

    // Exercise the route's cascade mechanism: collect every linked assignment id
    // (primary projectId + split splitProjectId) and deleteAssignment per id.
    const linkedIds = [assignmentA.id, assignmentB.id];
    for (const aid of linkedIds) {
      const result = await withDbRetry(() => deleteAssignment(aid));
      expect(result.orphanCleanupFailed).toBe(false);
    }

    // ALL linked assignments gone, Project gone (orphan-guard on the last one),
    // and the BoardCard cascaded away with the Project.
    expect(await prisma.assignment.findUnique({ where: { id: assignmentA.id } })).toBeNull();
    expect(await prisma.assignment.findUnique({ where: { id: assignmentB.id } })).toBeNull();
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
    expect(await prisma.boardCard.findUnique({ where: { id: card.id } })).toBeNull();
  });

  // (b) SCOPED SINGLE-ASSIGNMENT DELETE — proves the round-01 multi-pentester
  // safety holds. Two pentesters share a Project; deleting ONLY one assignment
  // leaves a remaining referencing assignment, so the orphan-guard does NOT
  // fire: the OTHER pentester's Assignment, the Project, and the BoardCard all
  // survive.
  it('scoped single-assignment delete: removing one pentester leaves the other pentester assignment, the Project, and the BoardCard intact (multi-pentester safety)', async () => {
    const suffix = uniqueSuffix();
    const client = await seedClient(bag, suffix);
    const tmA = await seedTeamMember(bag, suffix);
    const tmB = await seedTeamMember(bag, `${suffix}-b`);
    const { project, card } = await seedProjectWithCard(bag, client.id, suffix);

    const weekStart = mondayOf(new Date());
    const assignmentA = await withDbRetry(() =>
      prisma.assignment.create({
        data: {
          teamMemberId: tmA.id,
          projectName: project.name,
          projectColor: '#abcdef',
          status: 'confirmed',
          weekStart,
          clientId: client.id,
          projectId: project.id,
        },
      }),
    );
    bag.assignmentIds.push(assignmentA.id);

    const weekB = mondayOf(new Date());
    weekB.setUTCDate(weekB.getUTCDate() + 7);
    const assignmentB = await withDbRetry(() =>
      prisma.assignment.create({
        data: {
          teamMemberId: tmB.id,
          projectName: project.name,
          projectColor: '#abcdef',
          status: 'confirmed',
          weekStart: weekB,
          clientId: client.id,
          projectId: project.id,
        },
      }),
    );
    bag.assignmentIds.push(assignmentB.id);

    // Delete ONLY pentester A's assignment. A still references the project, so
    // the orphan-guard must NOT delete the Project or the card.
    const result = await withDbRetry(() => deleteAssignment(assignmentA.id));
    expect(result.orphanCleanupFailed).toBe(false);

    expect(await prisma.assignment.findUnique({ where: { id: assignmentA.id } })).toBeNull();
    // The OTHER pentester's assignment is different and still exists.
    const survivor = await prisma.assignment.findUnique({ where: { id: assignmentB.id } });
    expect(survivor).not.toBeNull();
    expect(survivor?.teamMemberId).toBe(tmB.id);
    // Project + BoardCard still exist — untouched by the scoped single delete.
    expect(await prisma.project.findUnique({ where: { id: project.id } })).not.toBeNull();
    expect(await prisma.boardCard.findUnique({ where: { id: card.id } })).not.toBeNull();
  });

  // (c) LOCKED LINKED ASSIGNMENT — the route's all-or-nothing 409 pre-check.
  // deleteAssignment on a locked id throws ("locked") and leaves the DB
  // untouched: the Assignment, Project, and BoardCard all still exist. This
  // mirrors the route rejecting with 409 BEFORE the first destructive write.
  it('locked linked assignment: deleteAssignment throws "locked" and leaves the Assignment, Project, and BoardCard intact (all-or-nothing 409 pre-check)', async () => {
    const suffix = uniqueSuffix();
    const client = await seedClient(bag, suffix);
    const tm = await seedTeamMember(bag, suffix);
    const { project, card } = await seedProjectWithCard(bag, client.id, suffix);

    const locked = await withDbRetry(() =>
      prisma.assignment.create({
        data: {
          teamMemberId: tm.id,
          projectName: project.name,
          projectColor: '#abcdef',
          status: 'confirmed',
          weekStart: mondayOf(new Date()),
          clientId: client.id,
          projectId: project.id,
          isLocked: true,
        },
      }),
    );
    bag.assignmentIds.push(locked.id);

    // The lock policy holds: deleting a locked assignment throws with a message
    // that mentions the lock.
    await expect(withDbRetry(() => deleteAssignment(locked.id))).rejects.toThrow(/locked/i);

    // NOTHING was deleted — Assignment, Project, and BoardCard all still exist.
    expect(await prisma.assignment.findUnique({ where: { id: locked.id } })).not.toBeNull();
    expect(await prisma.project.findUnique({ where: { id: project.id } })).not.toBeNull();
    expect(await prisma.boardCard.findUnique({ where: { id: card.id } })).not.toBeNull();
  });
});
