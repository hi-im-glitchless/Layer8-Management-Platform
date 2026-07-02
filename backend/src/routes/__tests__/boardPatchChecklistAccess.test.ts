/**
 * Route-level access matrix — PATCH /cards/:id checklist open access (Phase 03).
 *
 * Phase 03 opens checklist check/edit to EVERY authenticated user: a PATCH body
 * that touches ONLY `checklist` skips the assignment-ownership 403. Any other
 * field (stage, notes, stageLockedBy) — alone OR combined with checklist — keeps
 * today's ownership / PM-ADMIN / archive gating unchanged, and a mixed body is
 * rejected wholesale (never partially applied).
 *
 * Contract asserted here (8-case matrix):
 *   1. unassigned NORMAL PATCH { checklist }            → 200, persisted in DB
 *   2. unassigned NORMAL PATCH { stage: 'execution' }   → 403 (ownership guard)
 *   3. unassigned NORMAL PATCH { stageLockedBy: 'x' }   → 403
 *   4. unassigned NORMAL PATCH { checklist, stage }     → 403 AND the stored
 *      checklist is UNCHANGED (mixed body rejected wholesale, not partial)
 *   5. unassigned NORMAL PATCH { stage: 'archived' }    → 403 'Only ADMIN can
 *      archive cards' (Phase 11 guard regression)
 *   6. assigned NORMAL PATCH { checklist }              → 200 (happy path)
 *   7. PM and ADMIN PATCH { checklist }                 → 200 (regression)
 *   8. schedule isolation: seeded Assignment / TeamMember rows untouched
 *
 * The real `board.ts` router is mounted exactly as the app mounts it, behind a
 * session-injecting middleware that reads the desired identity from an
 * `x-test-user` header so one app can serve every session shape (assigned
 * NORMAL, unassigned NORMAL, PM, ADMIN). All injected sessions are
 * TOTP-verified so `requireAuth` passes; authorization is then decided by the
 * route guards.
 *
 * SCHEDULE-ISOLATION: the assigned-user fixture seeds a single TeamMember +
 * Assignment as a READ fixture for the ownership check; a before/after snapshot
 * of those exact rows (case 8) asserts the suite does not mutate them, so the
 * schedule no-write boundary is preserved. Mirrors boardFiles.test.ts pattern
 * (h) and boardPatchArchiveGuard.test.ts harness.
 *
 * Tests run against the dev DB per vitest.config.ts; cleanup runs in afterEach
 * (try/finally-style, each delete scoped + .catch) so a mid-test failure leaves
 * no seed rows. Seed/teardown writes use a jittered withDbRetry to absorb
 * SQLite single-writer busy/timeout under parallel workers.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../db/prisma.js';
import boardRouter from '../board.js';

interface ChecklistItem {
  label: string;
  checked: boolean;
  order: number;
}

interface SeedIds {
  assignedUserId: string;
  unassignedUserId: string;
  pmUserId: string;
  adminUserId: string;
  teamMemberId: string;
  assignmentId: string;
  projectId: string;
  cardId: string;
}

const BASELINE_CHECKLIST: ChecklistItem[] = [
  { label: 'Kickoff', checked: false, order: 0 },
  { label: 'Report', checked: false, order: 1 },
];

const EDITED_CHECKLIST: ChecklistItem[] = [
  { label: 'Kickoff', checked: true, order: 0 },
  { label: 'Report', checked: false, order: 1 },
];

function uniqueSuffix(): string {
  return `patchchk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function withDbRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
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

function buildApp(sessions: Record<string, { userId: string; role: string }>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const key = (req.headers['x-test-user'] as string) ?? '';
    const picked = sessions[key];
    (req as unknown as { session: Record<string, unknown> }).session = picked
      ? { userId: picked.userId, role: picked.role, totpVerified: true }
      : { totpVerified: true };
    next();
  });
  app.use('/', boardRouter);
  return app;
}

async function startServer(app: express.Express): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function seedDataset(): Promise<SeedIds> {
  const suffix = uniqueSuffix();

  const assignedUser = await withDbRetry(() =>
    prisma.user.create({
      data: {
        username: `patchchk-assigned-${suffix}`,
        passwordHash: 'not-a-real-hash',
        role: 'NORMAL',
        displayName: 'PatchChecklist Assigned User',
      },
    }),
  );
  const unassignedUser = await withDbRetry(() =>
    prisma.user.create({
      data: {
        username: `patchchk-unassigned-${suffix}`,
        passwordHash: 'not-a-real-hash',
        role: 'NORMAL',
        displayName: 'PatchChecklist Unassigned User',
      },
    }),
  );
  const pmUser = await withDbRetry(() =>
    prisma.user.create({
      data: {
        username: `patchchk-pm-${suffix}`,
        passwordHash: 'not-a-real-hash',
        role: 'PM',
        displayName: 'PatchChecklist PM User',
      },
    }),
  );
  const adminUser = await withDbRetry(() =>
    prisma.user.create({
      data: {
        username: `patchchk-admin-${suffix}`,
        passwordHash: 'not-a-real-hash',
        role: 'ADMIN',
        displayName: 'PatchChecklist Admin User',
      },
    }),
  );

  const project = await withDbRetry(() =>
    prisma.project.create({
      data: {
        name: `PatchChecklist Project ${suffix}`,
        clientId: null,
        tags: '["Externa"]',
        color: '#abcdef',
        status: 'placeholder',
      },
    }),
  );

  // Assigned-user read fixture: TeamMember(A) + Assignment → project. This is
  // the ONLY Assignment/TeamMember write in the suite; it exists solely so the
  // ownership check can READ it (case 6 + case 8 isolation guard).
  const teamMember = await withDbRetry(() =>
    prisma.teamMember.create({
      data: {
        userId: assignedUser.id,
        displayName: 'PatchChecklist Assigned TeamMember',
        status: 'active',
      },
    }),
  );
  const assignment = await withDbRetry(() =>
    prisma.assignment.create({
      data: {
        teamMemberId: teamMember.id,
        projectName: project.name,
        projectColor: project.color,
        status: 'placeholder',
        weekStart: new Date('2026-06-01T00:00:00.000Z'),
        projectId: project.id,
      },
    }),
  );

  const card = await withDbRetry(() =>
    prisma.boardCard.create({
      data: {
        projectId: project.id,
        stage: 'preparation',
        checklist: JSON.stringify(BASELINE_CHECKLIST),
        notes: 'patch checklist access test',
      },
    }),
  );

  return {
    assignedUserId: assignedUser.id,
    unassignedUserId: unassignedUser.id,
    pmUserId: pmUser.id,
    adminUserId: adminUser.id,
    teamMemberId: teamMember.id,
    assignmentId: assignment.id,
    projectId: project.id,
    cardId: card.id,
  };
}

async function teardownDataset(ids: SeedIds | null) {
  if (!ids) return;
  // Reverse FK order: BoardCard → Assignment → TeamMember → Project → User.
  // Each wrapped + .catch so a partial seed does not abort the rest. Audit rows
  // are intentionally NOT deleted (append-only hash chain).
  await withDbRetry(() =>
    prisma.boardCard.deleteMany({ where: { id: ids.cardId } }),
  ).catch(() => undefined);
  await withDbRetry(() =>
    prisma.assignment.deleteMany({ where: { id: ids.assignmentId } }),
  ).catch(() => undefined);
  await withDbRetry(() =>
    prisma.teamMember.deleteMany({ where: { id: ids.teamMemberId } }),
  ).catch(() => undefined);
  await withDbRetry(() =>
    prisma.project.deleteMany({ where: { id: ids.projectId } }),
  ).catch(() => undefined);
  await withDbRetry(() =>
    prisma.user.deleteMany({
      where: {
        id: { in: [ids.assignedUserId, ids.unassignedUserId, ids.pmUserId, ids.adminUserId] },
      },
    }),
  ).catch(() => undefined);
}

async function storedChecklist(cardId: string): Promise<ChecklistItem[]> {
  const card = await prisma.boardCard.findUnique({ where: { id: cardId } });
  return JSON.parse(card!.checklist) as ChecklistItem[];
}

describe('PATCH /cards/:id checklist open access (Phase 03)', () => {
  let ids: SeedIds | null = null;
  let server: Server | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    ids = await seedDataset();
    const sessions = {
      assigned: { userId: ids.assignedUserId, role: 'NORMAL' },
      unassigned: { userId: ids.unassignedUserId, role: 'NORMAL' },
      pm: { userId: ids.pmUserId, role: 'PM' },
      admin: { userId: ids.adminUserId, role: 'ADMIN' },
    };
    const started = await startServer(buildApp(sessions));
    server = started.server;
    baseUrl = started.baseUrl;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      if (!server) return resolve();
      server.close(() => resolve());
    });
    server = null;
    await teardownDataset(ids);
    ids = null;
  });

  // (1) unassigned NORMAL checklist-only → 200 + persisted
  it('(1) lets an unassigned NORMAL user PATCH checklist-only → 200 and persists it', async () => {
    const res = await fetch(`${baseUrl}/cards/${ids!.cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'unassigned' },
      body: JSON.stringify({ checklist: EDITED_CHECKLIST }),
    });
    expect(res.status).toBe(200);
    expect(await storedChecklist(ids!.cardId)).toEqual(EDITED_CHECKLIST);
  });

  // (2) unassigned NORMAL stage → 403
  it('(2) still blocks an unassigned NORMAL user from PATCH stage → 403', async () => {
    const res = await fetch(`${baseUrl}/cards/${ids!.cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'unassigned' },
      body: JSON.stringify({ stage: 'execution' }),
    });
    expect(res.status).toBe(403);
    const card = await prisma.boardCard.findUnique({ where: { id: ids!.cardId } });
    expect(card?.stage).toBe('preparation'); // unchanged
  });

  // (3) unassigned NORMAL stageLockedBy → 403
  it('(3) still blocks an unassigned NORMAL user from PATCH stageLockedBy → 403', async () => {
    const res = await fetch(`${baseUrl}/cards/${ids!.cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'unassigned' },
      body: JSON.stringify({ stageLockedBy: 'x' }),
    });
    expect(res.status).toBe(403);
  });

  // (4) mixed checklist+stage → 403 AND checklist unchanged (wholesale reject)
  it('(4) rejects a mixed checklist+stage body → 403 and leaves the stored checklist unchanged', async () => {
    const res = await fetch(`${baseUrl}/cards/${ids!.cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'unassigned' },
      body: JSON.stringify({ checklist: EDITED_CHECKLIST, stage: 'execution' }),
    });
    expect(res.status).toBe(403);
    // The mixed body must NOT partially apply the checklist.
    expect(await storedChecklist(ids!.cardId)).toEqual(BASELINE_CHECKLIST);
    const card = await prisma.boardCard.findUnique({ where: { id: ids!.cardId } });
    expect(card?.stage).toBe('preparation'); // stage also untouched
  });

  // (5) unassigned NORMAL stage=archived → 403 'Only ADMIN can archive cards'
  it('(5) still blocks an unassigned NORMAL user from archiving via stage → 403 (Phase 11 guard)', async () => {
    const res = await fetch(`${baseUrl}/cards/${ids!.cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'unassigned' },
      body: JSON.stringify({ stage: 'archived' }),
    });
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Only ADMIN can archive cards');
    const card = await prisma.boardCard.findUnique({ where: { id: ids!.cardId } });
    expect(card?.stage).toBe('preparation');
    expect(card?.archivedAt).toBeNull();
  });

  // (6) assigned NORMAL checklist → 200 (happy path unaffected)
  it('(6) keeps the assigned NORMAL checklist happy path intact → 200', async () => {
    const res = await fetch(`${baseUrl}/cards/${ids!.cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'assigned' },
      body: JSON.stringify({ checklist: EDITED_CHECKLIST }),
    });
    expect(res.status).toBe(200);
    expect(await storedChecklist(ids!.cardId)).toEqual(EDITED_CHECKLIST);
  });

  // (7) PM and ADMIN checklist → 200 (regression)
  it('(7) keeps PM and ADMIN checklist edits working → 200/200', async () => {
    const pmRes = await fetch(`${baseUrl}/cards/${ids!.cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'pm' },
      body: JSON.stringify({ checklist: EDITED_CHECKLIST }),
    });
    expect(pmRes.status).toBe(200);

    const adminRes = await fetch(`${baseUrl}/cards/${ids!.cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'admin' },
      body: JSON.stringify({ checklist: BASELINE_CHECKLIST }),
    });
    expect(adminRes.status).toBe(200);
    expect(await storedChecklist(ids!.cardId)).toEqual(BASELINE_CHECKLIST);
  });

  // (8) schedule isolation: the seeded Assignment / TeamMember rows are not
  // mutated by any exercised PATCH path.
  it('(8) does not mutate the seeded Assignment / TeamMember rows', async () => {
    const tmBefore = await prisma.teamMember.findUnique({ where: { id: ids!.teamMemberId } });
    const asgBefore = await prisma.assignment.findUnique({ where: { id: ids!.assignmentId } });

    // Exercise the opened checklist-only path (the Phase-3 behaviour change).
    await fetch(`${baseUrl}/cards/${ids!.cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-user': 'unassigned' },
      body: JSON.stringify({ checklist: EDITED_CHECKLIST }),
    });

    const tmAfter = await prisma.teamMember.findUnique({ where: { id: ids!.teamMemberId } });
    const asgAfter = await prisma.assignment.findUnique({ where: { id: ids!.assignmentId } });

    expect(tmAfter).toEqual(tmBefore);
    expect(asgAfter).toEqual(asgBefore);
  });
});
