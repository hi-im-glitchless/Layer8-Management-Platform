/**
 * upsertByKey status/color sync — Phase 05-01 (Board Bug Fixes).
 *
 * Regression for Bug 1: a status edited on the Schedule did not propagate to
 * the Planner board because projectService.upsertByKey was create-only — it
 * returned the existing Project row without writing the new status/color. The
 * fix makes upsertByKey update Project.status/color when an existing project is
 * found and the incoming values differ (last-writer-wins), keeping the dedupe
 * triple {name, clientId, tags} and the first-creation BoardCard behavior
 * intact.
 *
 * This suite proves the sync-on-found behavior directly:
 *  - First call CREATEs a Project with status A (and its BoardCard).
 *  - Second call with the SAME dedupe triple but status B + a new color UPDATEs
 *    the same row (id stable, no duplicate) to status B / new color.
 *  - A third call with unchanged status/color returns the same row unchanged.
 *
 * Schedule isolation (NON-NEGOTIABLE, carried from the Project Board
 * milestone): this test seeds ONLY a Client and Projects (via upsertByKey).
 * It never reads, asserts on, or mutates TeamMember / Absence / Holiday —
 * upsertByKey is the schedule/assignment-domain entrypoint and only writes
 * Project (plus the auto-created BoardCard). Nothing here weakens isolation.
 *
 * Tests run against the dev DB per the project's vitest.config.ts. Cleanup runs
 * in afterEach (each delete wrapped in .catch and scoped to seeded ids) so a
 * mid-test failure leaves no orphan rows behind. Run in isolation to respect
 * the documented single-writer SQLite caveat (see STATE.md KNOWN-ISSUE).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../db/prisma.js';
import { upsertByKey } from '../projectService.js';

function uniqueSuffix(): string {
  return `upsert-status-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The backend runs against a single SQLite file (one writer at a time). When
 * this suite runs concurrently with other write-heavy suites, SQLite can
 * transiently bounce a write with a busy / "Operation has timed out" error —
 * an environmental DB-locking limit, NOT a logic defect. Retry with a short
 * jittered backoff to let the lock clear (mirrors withDbRetry in the
 * boardAutoMove.stopped / scheduleIsolation suites).
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

describe('upsertByKey — status/color sync on existing project', () => {
  let clientId: string | null = null;
  let projectId: string | null = null;
  let suffix: string;

  beforeEach(async () => {
    suffix = uniqueSuffix();
    const client = await withDbRetry(() =>
      prisma.client.create({
        data: { name: `UpsertStatus Client ${suffix}`, color: '#112233' },
      }),
    );
    clientId = client.id;
  });

  afterEach(async () => {
    // FK-safe order: the auto-created BoardCard references the Project, so
    // delete cards first, then the Project, then the Client. Scoped to seeded
    // ids; each delete wrapped in .catch so a partial seed never aborts cleanup.
    if (projectId) {
      await prisma.boardCard.deleteMany({ where: { projectId } }).catch(() => undefined);
      await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => undefined);
    }
    if (clientId) {
      await prisma.client.deleteMany({ where: { id: clientId } }).catch(() => undefined);
    }
    clientId = null;
    projectId = null;
  });

  it('updates status and color on an existing project (same dedupe triple) without creating a duplicate', async () => {
    const name = `UpsertStatus Project ${suffix}`;
    const tags = ['web', 'external'];

    // (1) First call CREATEs the Project with status A.
    const created = await withDbRetry(() =>
      upsertByKey({ name, clientId: clientId!, tags, color: '#aaaaaa', status: 'placeholder' }),
    );
    projectId = created.id;
    expect(created.status).toBe('placeholder');
    expect(created.color).toBe('#aaaaaa');

    // (2) Second call with the SAME dedupe triple but status B + new color
    //     UPDATEs the same row in place.
    const updated = await withDbRetry(() =>
      upsertByKey({ name, clientId: clientId!, tags, color: '#bbbbbb', status: 'confirmed' }),
    );
    expect(updated.id).toBe(created.id); // same row — no duplicate
    expect(updated.status).toBe('confirmed');
    expect(updated.color).toBe('#bbbbbb');

    // Persisted value reflects the update.
    const persisted = await prisma.project.findUnique({ where: { id: created.id } });
    expect(persisted?.status).toBe('confirmed');
    expect(persisted?.color).toBe('#bbbbbb');

    // No duplicate Project row was created for this identity triple.
    const tagsJson = JSON.stringify([...tags].sort());
    const matches = await prisma.project.findMany({
      where: { name, clientId: clientId!, tags: tagsJson },
    });
    expect(matches).toHaveLength(1);
  });

  it('returns the same row unchanged when status/color match (no drift)', async () => {
    const name = `UpsertStatus NoDrift ${suffix}`;
    const tags = ['internal'];

    const created = await withDbRetry(() =>
      upsertByKey({ name, clientId: clientId!, tags, color: '#cccccc', status: 'needs-reqs' }),
    );
    projectId = created.id;

    // Same triple AND same status/color — no-op path, same row returned.
    const again = await withDbRetry(() =>
      upsertByKey({ name, clientId: clientId!, tags, color: '#cccccc', status: 'needs-reqs' }),
    );
    expect(again.id).toBe(created.id);
    expect(again.status).toBe('needs-reqs');
    expect(again.color).toBe('#cccccc');
    expect(again.updatedAt.getTime()).toBe(created.updatedAt.getTime()); // no extra write

    const tagsJson = JSON.stringify([...tags].sort());
    const matches = await prisma.project.findMany({
      where: { name, clientId: clientId!, tags: tagsJson },
    });
    expect(matches).toHaveLength(1);
  });
});
