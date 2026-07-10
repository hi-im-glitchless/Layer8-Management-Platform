/**
 * boardService.getCard client-notes exposure — Phase 03-01.
 *
 * Phase 03 surfaces each client's notes read-only on the planner card detail
 * modal by WIDENING the existing card->project->client select in
 * boardService (PROJECT_CLIENT_SELECT) rather than calling Phase 01's
 * per-client endpoint. This suite is the positive backend coverage for that
 * widening:
 *
 *  (1) WITH NOTES: a Client with notes='Handle with care', a Project that
 *      references it, and a BoardCard on that project -> getCard(card.id)
 *      returns project.client.notes === 'Handle with care' (plus the
 *      notesUpdatedAt / notesUpdatedBy attribution columns).
 *  (2) NULL CLIENT: a Project with clientId: null and a card ->
 *      getCard(...).project.client === null (Prisma resolves the whole client
 *      relation to null, so the modal's null-guard has something to guard on).
 *
 * Seeded-id scoping (NON-NEGOTIABLE): the suite seeds only the rows it needs
 * (Client, Project, BoardCard) and asserts against those ids only, so it is
 * parallel-safe against the shared dev DB. Cleanup runs in afterEach, FK-safe
 * (cards -> projects -> clients), each delete wrapped in .catch.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { prisma } from '../../db/prisma.js';
import { getCard } from '../boardService.js';

function uniqueSuffix(): string {
  return `card-client-notes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Single SQLite writer: transient busy/timeout errors are an environmental
 * locking limit, not a logic defect. Retry with short jittered backoff
 * (mirrors withDbRetry in boardCardDelete.pm.test.ts).
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

interface SeedBag {
  clientIds: string[];
  projectIds: string[];
  cardIds: string[];
}

function newBag(): SeedBag {
  return { clientIds: [], projectIds: [], cardIds: [] };
}

async function teardown(bag: SeedBag) {
  await prisma.boardCard
    .deleteMany({ where: { id: { in: bag.cardIds } } })
    .catch(() => undefined);
  await prisma.project
    .deleteMany({ where: { id: { in: bag.projectIds } } })
    .catch(() => undefined);
  await prisma.client
    .deleteMany({ where: { id: { in: bag.clientIds } } })
    .catch(() => undefined);
}

describe('boardService.getCard — client notes exposure (Phase 03-01)', () => {
  let bag = newBag();

  afterEach(async () => {
    await teardown(bag);
    bag = newBag();
  });

  it('returns project.client.notes (plus attribution columns) for a client that has notes', async () => {
    const suffix = uniqueSuffix();
    const client = await withDbRetry(() =>
      prisma.client.create({
        data: {
          name: `ClientNotes Client ${suffix}`,
          color: '#abcdef',
          notes: 'Handle with care',
        },
      }),
    );
    bag.clientIds.push(client.id);

    const project = await withDbRetry(() =>
      prisma.project.create({
        data: {
          name: `ClientNotes Project ${suffix}`,
          clientId: client.id,
          color: '#abcdef',
        },
      }),
    );
    bag.projectIds.push(project.id);

    const card = await withDbRetry(() =>
      prisma.boardCard.create({
        data: { projectId: project.id, stage: 'execution', stageLockedBy: null },
      }),
    );
    bag.cardIds.push(card.id);

    const result = await withDbRetry(() => getCard(card.id));
    expect(result).not.toBeNull();
    expect(result?.project.client).not.toBeNull();
    // The widened select reaches the notes column through the modal's data path.
    expect(result?.project.client?.notes).toBe('Handle with care');
    // Attribution columns come along too (unset here -> null defaults).
    expect(result?.project.client?.notesUpdatedAt ?? null).toBeNull();
    expect(result?.project.client?.notesUpdatedBy ?? null).toBeNull();
  });

  it('returns project.client === null for a card whose project has no client', async () => {
    const suffix = uniqueSuffix();
    const project = await withDbRetry(() =>
      prisma.project.create({
        data: {
          name: `ClientNotes NoClient Project ${suffix}`,
          clientId: null,
          color: '#abcdef',
        },
      }),
    );
    bag.projectIds.push(project.id);

    const card = await withDbRetry(() =>
      prisma.boardCard.create({
        data: { projectId: project.id, stage: 'execution', stageLockedBy: null },
      }),
    );
    bag.cardIds.push(card.id);

    const result = await withDbRetry(() => getCard(card.id));
    expect(result).not.toBeNull();
    // No client -> Prisma resolves the whole relation to null; the modal's
    // project.client?.notes?.trim() guard short-circuits on this.
    expect(result?.project.client).toBeNull();
  });
});
