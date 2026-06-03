/**
 * Route-level regression — confirmation-free admin card archive.
 *
 * Covers the HTTP contract the service-level scheduleIsolation.phase23 test
 * does not exercise:
 *   1. POST /cards/:cardId/admin/archive with an EMPTY body + a valid ADMIN
 *      session → 200; the card is archived (BoardFile rows + on-disk bytes
 *      hard-deleted, stage='archived').
 *   2. POST .../admin/archive for a non-existent cardId → 404 with
 *      { error: 'NOT_FOUND' }.
 *
 * The router is mounted exactly as `board.ts` mounts it
 * (`/cards/:cardId/admin`) behind `requireAuth` + `requireRole('ADMIN')` +
 * `mutationRateLimiter` (the limiter is skipped under NODE_ENV=test). A
 * session-injecting middleware supplies the authenticated ADMIN identity that
 * `session`/CSRF middleware would normally populate.
 *
 * SCHEDULE-ISOLATION: this test seeds ONLY User / Project / BoardCard /
 * BoardFile rows. It never reads-as-write or mutates Assignment / TeamMember /
 * Absence / Holiday, so it cannot weaken the schedule no-write boundary. The
 * BoardCard links directly to Project (Phase 24-R03), so no Assignment fixture
 * is required.
 *
 * Tests run against the dev DB per vitest.config.ts; cleanup runs in a
 * try/finally so a failure mid-test does not leave seed rows behind. Seed /
 * teardown writes are wrapped in a local `withDbRetry` backoff (mirroring
 * scheduleIsolation's `upsertAssignmentWithRetry`) to absorb SQLite
 * single-writer "database is locked" / "timed out" under concurrent workers.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../db/prisma.js';
import adminRouter from '../boardAdmin.js';

interface SeedIds {
  userId: string;
  projectId: string;
  cardId: string;
  fileId: string;
  storedName: string;
}

function uniqueSuffix(): string {
  return `arch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The backend runs against a single SQLite file (one writer at a time); when
 * this suite runs concurrently with another write-heavy suite in a parallel
 * vitest worker, SQLite can transiently bounce a write with a busy / "timed
 * out" error. Retrying with a short jittered backoff lets the lock clear so
 * the suites can share a vitest invocation without serialising them. Mirrors
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
 * Build a minimal Express app that mounts the real board-admin router at the
 * same path `board.ts` uses, with a session-injecting middleware standing in
 * for the session/CSRF stack. The injected session marks the request as an
 * authenticated, TOTP-verified ADMIN so `requireAuth` + `requireRole('ADMIN')`
 * pass.
 */
function buildApp(adminUserId: string) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Stand-in for express-session — supply the fields the auth middleware reads.
    (req as unknown as { session: Record<string, unknown> }).session = {
      userId: adminUserId,
      role: 'ADMIN',
      totpVerified: true,
    };
    next();
  });
  app.use('/cards/:cardId/admin', adminRouter);
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
        username: `arch-admin-${suffix}`,
        passwordHash: 'not-a-real-hash',
        role: 'ADMIN',
        displayName: 'Archive Route Test Admin',
      },
    }),
  );
  const project = await withDbRetry(() =>
    prisma.project.create({
      data: {
        name: `Arch Project ${suffix}`,
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
        notes: 'route test notes',
      },
    }),
  );
  const storedName = `${suffix}.bin`;
  const cardUploadDir = path.join(process.cwd(), 'uploads', 'board', card.id);
  fs.mkdirSync(cardUploadDir, { recursive: true });
  fs.writeFileSync(path.join(cardUploadDir, storedName), 'archive route test bytes');
  const file = await withDbRetry(() =>
    prisma.boardFile.create({
      data: {
        cardId: card.id,
        filename: 'arch.bin',
        storedName,
        mimeType: 'application/octet-stream',
        sizeBytes: 24,
        uploadedBy: user.id,
      },
    }),
  );
  return {
    userId: user.id,
    projectId: project.id,
    cardId: card.id,
    fileId: file.id,
    storedName,
  };
}

async function teardownDataset(ids: SeedIds | null) {
  if (!ids) return;
  // Order: BoardFile → BoardComment → BoardCard → Project → User. Each wrapped
  // so a partial seed (e.g. archive already deleted BoardFile) does not abort
  // cleanup of the rest. Audit rows are intentionally NOT deleted — the hash
  // chain is append-only.
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
  try {
    const cardDir = path.join(process.cwd(), 'uploads', 'board', ids.cardId);
    if (fs.existsSync(cardDir)) {
      fs.rmSync(cardDir, { recursive: true, force: true });
    }
  } catch {
    // best-effort cleanup
  }
}

describe('POST /cards/:cardId/admin/archive (confirmation-free)', () => {
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

  it('archives the card with an empty body and a valid ADMIN session → 200', async () => {
    const onDisk = path.join(process.cwd(), 'uploads', 'board', ids!.cardId, ids!.storedName);
    expect(fs.existsSync(onDisk)).toBe(true);

    const res = await fetch(`${baseUrl}/cards/${ids!.cardId}/admin/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; cardId: string };
    expect(json.success).toBe(true);
    expect(json.cardId).toBe(ids!.cardId);

    // Card flipped to archived; BoardFile rows + on-disk bytes hard-deleted.
    const card = await prisma.boardCard.findUnique({ where: { id: ids!.cardId } });
    expect(card?.stage).toBe('archived');
    expect(card?.archivedAt).not.toBeNull();
    const remainingFiles = await prisma.boardFile.findMany({ where: { cardId: ids!.cardId } });
    expect(remainingFiles).toHaveLength(0);
    expect(fs.existsSync(onDisk)).toBe(false);
  });

  it('returns 404 { error: "NOT_FOUND" } for a non-existent card', async () => {
    const res = await fetch(`${baseUrl}/cards/does-not-exist-${uniqueSuffix()}/admin/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('NOT_FOUND');
  });
});
