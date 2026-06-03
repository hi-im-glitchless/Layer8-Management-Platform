/**
 * Route-level regression — Phase 3 broadened board-file read policy.
 *
 * Proves the policy decided in Phase 3 (File Download Permission Fix): the file
 * LIST and DOWNLOAD routes are gated by `requireCardExists` (any authenticated
 * user who can view the card), while every mutation stays on `requireCardAccess`
 * (assigned NORMAL / PM / ADMIN). Exercises the real `filesRouter` end-to-end:
 *
 *   (a) non-assigned NORMAL lists files          → 200, body.files is an array
 *   (b) non-assigned NORMAL downloads a file      → 200 (binary body)
 *   (c) non-assigned NORMAL uploads               → 403 (upload keeps requireCardAccess)
 *   (d) non-assigned NORMAL deletes               → 403 (delete keeps requireCardAccess)
 *   (e) cross-card fileId on download             → 404 (no leakage across cards)
 *   (f) quarantined file download                 → 410
 *   (g) assigned NORMAL lists + downloads         → 200/200 (regression guard)
 *
 * The router is mounted exactly as `board.ts` mounts it
 * (`/cards/:cardId/files`, Router({ mergeParams: true })) behind a
 * session-injecting middleware that reads the desired identity from an
 * `x-test-user` header so a single app can serve every session shape. The
 * read-route rate limiter is skipped under NODE_ENV=test.
 *
 * SCHEDULE-ISOLATION: the exercised routes (list / download / upload-403 /
 * delete-403) never write Assignment / TeamMember / Absence / Holiday. The
 * assigned-user fixture seeds a single TeamMember + Assignment as a READ
 * fixture for `requireCardAccess`; a before/after snapshot of those exact rows
 * asserts the suite does not mutate them, so the schedule no-write boundary is
 * preserved.
 *
 * Tests run against the dev DB per vitest.config.ts; cleanup runs in a
 * try/finally (afterEach) so a mid-test failure does not leave seed rows or
 * on-disk bytes behind. Seed / teardown writes use a local `withDbRetry`
 * backoff (copied, mirroring scheduleIsolation's `upsertAssignmentWithRetry`)
 * to absorb SQLite single-writer "database is locked" / "timed out" under
 * concurrent vitest workers.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../db/prisma.js';
import filesRouter from '../boardFiles.js';

interface SeedIds {
  assignedUserId: string;
  unassignedUserId: string;
  teamMemberId: string;
  assignmentId: string;
  projectId: string;
  otherProjectId: string;
  cardId: string;
  otherCardId: string;
  fileId: string;
  fileStoredName: string;
  quarantinedFileId: string;
  quarantinedStoredName: string;
  otherFileId: string;
  otherStoredName: string;
}

function uniqueSuffix(): string {
  return `bfiles-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The backend runs against a single SQLite file (one writer at a time); when
 * this suite runs concurrently with another write-heavy suite in a parallel
 * vitest worker, SQLite can transiently bounce a write with a busy / "timed
 * out" error. Retrying with a short jittered backoff lets the lock clear so the
 * suites can share a vitest invocation without serialising them. Copied (not
 * imported) to keep the suite self-contained — mirrors
 * scheduleIsolation.phase24's `upsertAssignmentWithRetry`.
 */
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

/**
 * Build a minimal Express app that mounts the real files router at the same
 * path `board.ts` uses. A session-injecting middleware stands in for the
 * session/CSRF stack; it reads the desired identity from the `x-test-user`
 * header so one app can serve every session shape (assigned NORMAL,
 * non-assigned NORMAL). All injected sessions are TOTP-verified so
 * `requireAuth` passes; authorization is then decided by the route guards.
 */
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
  app.use('/cards/:cardId/files', filesRouter);
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

function uploadDir(cardId: string): string {
  return path.join(process.cwd(), 'uploads', 'board', cardId);
}

function writeBytes(cardId: string, storedName: string, bytes: string): void {
  const dir = uploadDir(cardId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, storedName), bytes);
}

async function seedDataset(): Promise<SeedIds> {
  const suffix = uniqueSuffix();

  // ── Users: A (assigned NORMAL), B (non-assigned NORMAL) ──────────
  const assignedUser = await withDbRetry(() =>
    prisma.user.create({
      data: {
        username: `bfiles-assigned-${suffix}`,
        passwordHash: 'not-a-real-hash',
        role: 'NORMAL',
        displayName: 'BoardFiles Assigned User',
      },
    }),
  );
  const unassignedUser = await withDbRetry(() =>
    prisma.user.create({
      data: {
        username: `bfiles-unassigned-${suffix}`,
        passwordHash: 'not-a-real-hash',
        role: 'NORMAL',
        displayName: 'BoardFiles Unassigned User',
      },
    }),
  );

  // ── Projects: one for the primary card, one for the cross-card case ──
  const project = await withDbRetry(() =>
    prisma.project.create({
      data: {
        name: `BoardFiles Project ${suffix}`,
        clientId: null,
        tags: '["Externa"]',
        color: '#abcdef',
        status: 'placeholder',
      },
    }),
  );
  const otherProject = await withDbRetry(() =>
    prisma.project.create({
      data: {
        name: `BoardFiles Other Project ${suffix}`,
        clientId: null,
        tags: '["Externa"]',
        color: '#fedcba',
        status: 'placeholder',
      },
    }),
  );

  // ── Assigned-user read fixture: TeamMember(A) + Assignment → project.
  //    This is the ONLY Assignment/TeamMember write in the suite and exists
  //    solely so requireCardAccess can READ it for the regression guard. ──
  const teamMember = await withDbRetry(() =>
    prisma.teamMember.create({
      data: {
        userId: assignedUser.id,
        displayName: 'BoardFiles Assigned TeamMember',
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

  // ── Cards (one per project; BoardCard.projectId is @unique) ──────
  const card = await withDbRetry(() =>
    prisma.boardCard.create({
      data: {
        projectId: project.id,
        stage: 'preparation',
        checklist: '[]',
        notes: 'boardfiles route test',
      },
    }),
  );
  const otherCard = await withDbRetry(() =>
    prisma.boardCard.create({
      data: {
        projectId: otherProject.id,
        stage: 'preparation',
        checklist: '[]',
        notes: 'boardfiles route test (other card)',
      },
    }),
  );

  // ── Files: clean file + quarantined file on the primary card, plus a
  //    file on the other card for the cross-card 404 case. Real bytes on
  //    disk for the download paths (handler calls fs.existsSync). ──
  const fileStoredName = `${suffix}-clean.bin`;
  writeBytes(card.id, fileStoredName, 'boardfiles clean bytes');
  const file = await withDbRetry(() =>
    prisma.boardFile.create({
      data: {
        cardId: card.id,
        filename: 'clean.bin',
        storedName: fileStoredName,
        mimeType: 'application/octet-stream',
        sizeBytes: 22,
        uploadedBy: assignedUser.id,
        isQuarantined: false,
        scanStatus: 'clean',
      },
    }),
  );

  const quarantinedStoredName = `${suffix}-quarantined.bin`;
  writeBytes(card.id, quarantinedStoredName, 'boardfiles quarantined bytes');
  const quarantinedFile = await withDbRetry(() =>
    prisma.boardFile.create({
      data: {
        cardId: card.id,
        filename: 'quarantined.bin',
        storedName: quarantinedStoredName,
        mimeType: 'application/octet-stream',
        sizeBytes: 27,
        uploadedBy: assignedUser.id,
        isQuarantined: true,
        scanStatus: 'infected',
      },
    }),
  );

  const otherStoredName = `${suffix}-other.bin`;
  writeBytes(otherCard.id, otherStoredName, 'boardfiles other-card bytes');
  const otherFile = await withDbRetry(() =>
    prisma.boardFile.create({
      data: {
        cardId: otherCard.id,
        filename: 'other.bin',
        storedName: otherStoredName,
        mimeType: 'application/octet-stream',
        sizeBytes: 26,
        uploadedBy: assignedUser.id,
        isQuarantined: false,
        scanStatus: 'clean',
      },
    }),
  );

  return {
    assignedUserId: assignedUser.id,
    unassignedUserId: unassignedUser.id,
    teamMemberId: teamMember.id,
    assignmentId: assignment.id,
    projectId: project.id,
    otherProjectId: otherProject.id,
    cardId: card.id,
    otherCardId: otherCard.id,
    fileId: file.id,
    fileStoredName,
    quarantinedFileId: quarantinedFile.id,
    quarantinedStoredName,
    otherFileId: otherFile.id,
    otherStoredName,
  };
}

async function teardownDataset(ids: SeedIds | null) {
  if (!ids) return;
  // Reverse order: BoardFile → BoardCard → Assignment → TeamMember → Project →
  // User. Each wrapped + .catch so a partial seed does not abort the rest.
  // Audit rows are intentionally NOT deleted (append-only hash chain).
  await withDbRetry(() =>
    prisma.boardFile.deleteMany({ where: { cardId: { in: [ids.cardId, ids.otherCardId] } } }),
  ).catch(() => undefined);
  await withDbRetry(() =>
    prisma.boardCard.deleteMany({ where: { id: { in: [ids.cardId, ids.otherCardId] } } }),
  ).catch(() => undefined);
  await withDbRetry(() =>
    prisma.assignment.deleteMany({ where: { id: ids.assignmentId } }),
  ).catch(() => undefined);
  await withDbRetry(() =>
    prisma.teamMember.deleteMany({ where: { id: ids.teamMemberId } }),
  ).catch(() => undefined);
  await withDbRetry(() =>
    prisma.project.deleteMany({ where: { id: { in: [ids.projectId, ids.otherProjectId] } } }),
  ).catch(() => undefined);
  await withDbRetry(() =>
    prisma.user.deleteMany({ where: { id: { in: [ids.assignedUserId, ids.unassignedUserId] } } }),
  ).catch(() => undefined);
  for (const cardId of [ids.cardId, ids.otherCardId]) {
    try {
      const dir = uploadDir(cardId);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

describe('boardFiles routes — Phase 3 broadened read policy', () => {
  let ids: SeedIds | null = null;
  let server: Server | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    ids = await seedDataset();
    const sessions = {
      assigned: { userId: ids.assignedUserId, role: 'NORMAL' },
      unassigned: { userId: ids.unassignedUserId, role: 'NORMAL' },
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

  // (a) non-assigned NORMAL CAN list files → 200
  it('(a) lets a non-assigned NORMAL user list files → 200', async () => {
    const res = await fetch(`${baseUrl}/cards/${ids!.cardId}/files`, {
      headers: { 'x-test-user': 'unassigned' },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { files: unknown[] };
    expect(Array.isArray(json.files)).toBe(true);
    // The non-ADMIN quarantined filter still applies: only the clean file shows.
    expect(json.files).toHaveLength(1);
    expect((json.files[0] as { id: string }).id).toBe(ids!.fileId);
  });

  // (b) non-assigned NORMAL CAN download a file → 200
  it('(b) lets a non-assigned NORMAL user download a file → 200', async () => {
    const res = await fetch(
      `${baseUrl}/cards/${ids!.cardId}/files/${ids!.fileId}/download`,
      { headers: { 'x-test-user': 'unassigned' } },
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe('boardfiles clean bytes');
  });

  // (c) upload still 403 for non-assigned NORMAL (keeps requireCardAccess)
  it('(c) still blocks a non-assigned NORMAL user from uploading → 403', async () => {
    const res = await fetch(`${baseUrl}/cards/${ids!.cardId}/files`, {
      method: 'POST',
      headers: { 'x-test-user': 'unassigned' },
    });
    expect(res.status).toBe(403);
  });

  // (d) delete still 403 for non-assigned NORMAL (keeps requireCardAccess)
  it('(d) still blocks a non-assigned NORMAL user from deleting → 403', async () => {
    const res = await fetch(
      `${baseUrl}/cards/${ids!.cardId}/files/${ids!.fileId}`,
      { method: 'DELETE', headers: { 'x-test-user': 'unassigned' } },
    );
    expect(res.status).toBe(403);
    // The clean file row must survive a blocked delete.
    const stillThere = await prisma.boardFile.findUnique({ where: { id: ids!.fileId } });
    expect(stillThere).not.toBeNull();
  });

  // (e) cross-card fileId on download → 404 (no cross-card leakage)
  it('(e) returns 404 when downloading a fileId that belongs to another card', async () => {
    const res = await fetch(
      `${baseUrl}/cards/${ids!.cardId}/files/${ids!.otherFileId}/download`,
      { headers: { 'x-test-user': 'unassigned' } },
    );
    expect(res.status).toBe(404);
  });

  // (f) quarantined file download → 410
  it('(f) returns 410 when downloading a quarantined file', async () => {
    const res = await fetch(
      `${baseUrl}/cards/${ids!.cardId}/files/${ids!.quarantinedFileId}/download`,
      { headers: { 'x-test-user': 'unassigned' } },
    );
    expect(res.status).toBe(410);
  });

  // (g) assigned NORMAL still lists + downloads → 200/200 (regression guard)
  it('(g) keeps the assigned NORMAL happy path intact → 200 list + 200 download', async () => {
    const listRes = await fetch(`${baseUrl}/cards/${ids!.cardId}/files`, {
      headers: { 'x-test-user': 'assigned' },
    });
    expect(listRes.status).toBe(200);

    const dlRes = await fetch(
      `${baseUrl}/cards/${ids!.cardId}/files/${ids!.fileId}/download`,
      { headers: { 'x-test-user': 'assigned' } },
    );
    expect(dlRes.status).toBe(200);
  });

  // (h) schedule isolation: the seeded Assignment / TeamMember read fixture is
  // not mutated by any exercised route.
  it('(h) does not mutate the seeded Assignment / TeamMember rows', async () => {
    const tmBefore = await prisma.teamMember.findUnique({ where: { id: ids!.teamMemberId } });
    const asgBefore = await prisma.assignment.findUnique({ where: { id: ids!.assignmentId } });

    // Exercise the broadened read routes (the only Phase-3 behaviour change).
    await fetch(`${baseUrl}/cards/${ids!.cardId}/files`, {
      headers: { 'x-test-user': 'unassigned' },
    });
    await fetch(`${baseUrl}/cards/${ids!.cardId}/files/${ids!.fileId}/download`, {
      headers: { 'x-test-user': 'unassigned' },
    });

    const tmAfter = await prisma.teamMember.findUnique({ where: { id: ids!.teamMemberId } });
    const asgAfter = await prisma.assignment.findUnique({ where: { id: ids!.assignmentId } });

    expect(tmAfter).toEqual(tmBefore);
    expect(asgAfter).toEqual(asgBefore);
  });
});
