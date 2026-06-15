/**
 * Route-level regression — PM cannot archive a card via PATCH stage.
 *
 * Phase 11 closes the drag-to-archive hole in PATCH /cards/:id. Archiving is
 * ADMIN-only; PM may view/open archived cards (Show Archived toggle widened to
 * PM) but must not be able to archive one, including by dragging it into the
 * Archived column (which issues a PATCH with { stage: 'archived' }).
 *
 * Contract asserted here:
 *   1. PM session: PATCH /cards/:id { stage: 'archived' } → 403; the card is
 *      NOT archived (stage unchanged, archivedAt still null in the DB).
 *   2. ADMIN session: PATCH /cards/:id { stage: 'archived' } → 200; the card
 *      is archived (stage='archived', archivedAt set).
 *   3. PM session: PATCH /cards/:id { stage: 'in_progress'-equivalent } → 200;
 *      a non-archived stage move still succeeds for PM.
 *
 * The real `board.ts` router is mounted exactly as the app mounts it, behind a
 * session-injecting middleware standing in for the session/CSRF stack. The
 * injected role is read from an `x-test-role` header so a single app can act as
 * PM, ADMIN, or NORMAL per request (mirroring boardAdminArchive's
 * session-injecting middleware, generalised across roles).
 *
 * SCHEDULE-ISOLATION: this test seeds ONLY User / Project / BoardCard rows. It
 * never reads-as-write or mutates Assignment / TeamMember / Absence / Holiday,
 * so it cannot weaken the schedule no-write boundary. The BoardCard links
 * directly to Project (Phase 24-R03), so no Assignment fixture is required —
 * and PM is `isManager`, so the route never needs an ownership/assignment row.
 *
 * Tests run against the dev DB per vitest.config.ts; cleanup runs in a
 * try/finally so a failure mid-test does not leave seed rows behind. Seed /
 * teardown writes are wrapped in a local `withDbRetry` backoff (mirroring
 * boardAdminArchive's `withDbRetry`) to absorb SQLite single-writer
 * "database is locked" / "timed out" under concurrent workers.
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../db/prisma.js';
import boardRouter from '../board.js';

interface SeedIds {
  userId: string;
  projectId: string;
  cardId: string;
}

function uniqueSuffix(): string {
  return `patcharch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Single SQLite writer: retry transient busy/timeout writes with a short
 * jittered backoff so this suite can share a vitest invocation with other
 * write-heavy suites. Mirrors boardAdminArchive's `withDbRetry`.
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
 * Build a minimal Express app that mounts the real board router at root, with a
 * session-injecting middleware standing in for the session/CSRF stack. The
 * injected role is taken from the `x-test-role` header (default ADMIN) so the
 * same app can act as PM, ADMIN, or NORMAL per request; the userId is fixed to
 * the seeded user so requireAuth passes.
 */
function buildApp(userId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = (req.headers['x-test-role'] as string | undefined) ?? 'ADMIN';
    (req as unknown as { session: Record<string, unknown> }).session = {
      userId,
      role,
      totpVerified: true,
    };
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
  const user = await withDbRetry(() =>
    prisma.user.create({
      data: {
        username: `patcharch-pm-${suffix}`,
        passwordHash: 'not-a-real-hash',
        role: 'PM',
        displayName: 'PATCH Archive Guard Test PM',
      },
    }),
  );
  const project = await withDbRetry(() =>
    prisma.project.create({
      data: {
        name: `PATCH Arch Project ${suffix}`,
        clientId: null,
        tags: '["Externa"]',
        color: '#abcdef',
        status: 'placeholder',
      },
    }),
  );
  const card = await withDbRetry(() =>
    prisma.boardCard.create({
      data: {
        projectId: project.id,
        stage: 'preparation',
        checklist: '[]',
        notes: 'patch archive guard test notes',
      },
    }),
  );
  return { userId: user.id, projectId: project.id, cardId: card.id };
}

async function teardownDataset(ids: SeedIds | null) {
  if (!ids) return;
  // Order: BoardFile → BoardComment → BoardCard → Project → User. Each wrapped
  // so a partial state does not abort cleanup of the rest. Audit rows are
  // intentionally NOT deleted — the hash chain is append-only.
  await withDbRetry(() =>
    prisma.boardFile.deleteMany({ where: { cardId: ids.cardId } }),
  ).catch(() => undefined);
  await withDbRetry(() =>
    prisma.boardComment.deleteMany({ where: { cardId: ids.cardId } }),
  ).catch(() => undefined);
  await withDbRetry(() =>
    prisma.boardCard.deleteMany({ where: { id: ids.cardId } }),
  ).catch(() => undefined);
  await withDbRetry(() =>
    prisma.project.deleteMany({ where: { id: ids.projectId } }),
  ).catch(() => undefined);
  await withDbRetry(() =>
    prisma.user.deleteMany({ where: { id: ids.userId } }),
  ).catch(() => undefined);
}

describe('PATCH /cards/:id archive-stage guard (Phase 11, ADMIN-only archive)', () => {
  let ids: SeedIds | null = null;
  let server: Server | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    ids = await seedDataset();
    const started = await startServer(buildApp(ids.userId));
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

  it('rejects PM PATCH stage=archived with 403 and leaves the card unarchived', async () => {
    const res = await fetch(`${baseUrl}/cards/${ids!.cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-role': 'PM' },
      body: JSON.stringify({ stage: 'archived' }),
    });

    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Only ADMIN can archive cards');

    // Card must be untouched: stage unchanged, archivedAt still null.
    const card = await prisma.boardCard.findUnique({ where: { id: ids!.cardId } });
    expect(card?.stage).toBe('preparation');
    expect(card?.archivedAt).toBeNull();
  });

  it('allows ADMIN PATCH stage=archived with 200 and sets archivedAt', async () => {
    const res = await fetch(`${baseUrl}/cards/${ids!.cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-role': 'ADMIN' },
      body: JSON.stringify({ stage: 'archived' }),
    });

    expect(res.status).toBe(200);

    const card = await prisma.boardCard.findUnique({ where: { id: ids!.cardId } });
    expect(card?.stage).toBe('archived');
    expect(card?.archivedAt).not.toBeNull();
  });

  it('allows PM PATCH to a non-archived stage with 200', async () => {
    const res = await fetch(`${baseUrl}/cards/${ids!.cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-test-role': 'PM' },
      body: JSON.stringify({ stage: 'execution' }),
    });

    expect(res.status).toBe(200);

    const card = await prisma.boardCard.findUnique({ where: { id: ids!.cardId } });
    expect(card?.stage).toBe('execution');
    expect(card?.archivedAt).toBeNull();
  });
});
