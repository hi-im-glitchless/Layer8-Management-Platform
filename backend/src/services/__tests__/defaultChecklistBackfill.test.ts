/**
 * DEFAULT_CHECKLIST default-item + backfill transform — Phase 03-01.
 *
 * Two independent concerns, both introduced in Phase 03:
 *
 *  (A) DEFAULT_CHECKLIST now ends with the "Report is on client's share" item
 *      (order 6). This suite pins the full default array so a future accidental
 *      edit (reorder/rename/remove) trips a test, and proves the item flows
 *      through projectService.upsertByKey into every freshly-created BoardCard.
 *
 *  (B) The backfill core is a PURE function (`backfillChecklist`) that lives in
 *      boardService (re-exported by the backfill script) so it is unit-testable
 *      without a DB or the script's `main()` side effects — no `scripts/*` import
 *      is needed (and the repo tsconfig `rootDir=src` forbids one). This suite
 *      covers idempotency (exact-label match), max(order)+1 ordering, and
 *      malformed/empty/non-array JSON → treated as [].
 *
 * Schedule isolation (NON-NEGOTIABLE): the DB-touching test seeds ONLY a Client
 * and a Project (via upsertByKey, which also auto-creates the BoardCard). It
 * never reads, asserts on, or mutates TeamMember / Assignment / Absence /
 * Holiday. The pure-function tests touch no DB at all.
 *
 * Tests run against the dev DB per vitest.config.ts; cleanup runs in afterEach
 * (FK-safe: BoardCard → Project → Client, each scoped + .catch) so a mid-test
 * failure leaves no orphan rows. Seed/teardown writes use a jittered
 * withDbRetry to absorb SQLite single-writer busy/timeout under parallel
 * workers.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { prisma } from '../../db/prisma.js';
import {
  DEFAULT_CHECKLIST,
  backfillChecklist,
  NEW_ITEM_LABEL,
  type ChecklistItem,
} from '../boardService.js';
import { upsertByKey } from '../projectService.js';

function uniqueSuffix(): string {
  return `default-checklist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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

// ── (A) DEFAULT_CHECKLIST contents ────────────────────────────────

describe('DEFAULT_CHECKLIST — default Report-share item (Phase 03-01)', () => {
  it('has 7 entries ending with the Report-share item at order 6', () => {
    expect(DEFAULT_CHECKLIST).toHaveLength(7);
    expect(DEFAULT_CHECKLIST[DEFAULT_CHECKLIST.length - 1]).toEqual({
      label: "Report is on client's share",
      checked: false,
      order: 6,
    });
  });

  it('keeps the first six entries (Kickoff..Delivery, order 0-5) unchanged', () => {
    expect(DEFAULT_CHECKLIST.slice(0, 6)).toEqual([
      { label: 'Kickoff', checked: false, order: 0 },
      { label: 'Requirements', checked: false, order: 1 },
      { label: 'Pentest', checked: false, order: 2 },
      { label: 'Report', checked: false, order: 3 },
      { label: 'Review', checked: false, order: 4 },
      { label: 'Delivery', checked: false, order: 5 },
    ]);
  });
});

// ── (A) upsertByKey propagation ───────────────────────────────────

describe('upsertByKey — new cards include the Report-share default item', () => {
  let clientId: string | null = null;
  let projectId: string | null = null;
  let suffix: string;

  beforeEach(async () => {
    suffix = uniqueSuffix();
    const client = await withDbRetry(() =>
      prisma.client.create({
        data: { name: `DefaultChecklist Client ${suffix}`, color: '#123456' },
      }),
    );
    clientId = client.id;
  });

  afterEach(async () => {
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

  it('creates a BoardCard whose checklist ends with the Report-share item at order 6', async () => {
    const name = `DefaultChecklist Project ${suffix}`;
    const created = await withDbRetry(() =>
      upsertByKey({
        name,
        clientId: clientId!,
        tags: ['web'],
        color: '#aabbcc',
        status: 'placeholder',
      }),
    );
    projectId = created.id;

    const card = await prisma.boardCard.findUnique({ where: { projectId: created.id } });
    expect(card).not.toBeNull();
    const checklist = JSON.parse(card!.checklist) as ChecklistItem[];
    expect(checklist).toHaveLength(7);
    expect(checklist[checklist.length - 1]).toEqual({
      label: "Report is on client's share",
      checked: false,
      order: 6,
    });
  });
});

// ── (B) backfillChecklist pure transform ──────────────────────────

describe('backfillChecklist — pure transform (Phase 03-01)', () => {
  it('appends the item at max(order)+1 when it is missing', () => {
    const input = JSON.stringify([
      { label: 'Kickoff', checked: true, order: 0 },
      { label: 'Delivery', checked: false, order: 5 },
    ]);
    const { checklist, changed } = backfillChecklist(input);
    expect(changed).toBe(true);
    expect(checklist).toHaveLength(3);
    expect(checklist[checklist.length - 1]).toEqual({
      label: NEW_ITEM_LABEL,
      checked: false,
      order: 6,
    });
  });

  it('is idempotent — leaves a checklist that already has the item unchanged', () => {
    const existing = [
      { label: 'Kickoff', checked: false, order: 0 },
      { label: NEW_ITEM_LABEL, checked: true, order: 6 },
    ];
    const { checklist, changed } = backfillChecklist(JSON.stringify(existing));
    expect(changed).toBe(false);
    expect(checklist).toEqual(existing); // preserves checked state + ordering
  });

  it('does not double-append across repeated runs (idempotent chain)', () => {
    const input = JSON.stringify([{ label: 'Kickoff', checked: false, order: 0 }]);
    const first = backfillChecklist(input);
    expect(first.changed).toBe(true);
    const second = backfillChecklist(JSON.stringify(first.checklist));
    expect(second.changed).toBe(false);
    expect(second.checklist).toHaveLength(2);
    expect(
      second.checklist.filter((i) => i.label === NEW_ITEM_LABEL),
    ).toHaveLength(1);
  });

  it('treats an empty string as [] and adds the item at order 0', () => {
    const { checklist, changed } = backfillChecklist('');
    expect(changed).toBe(true);
    expect(checklist).toEqual([{ label: NEW_ITEM_LABEL, checked: false, order: 0 }]);
  });

  it('treats malformed JSON as [] and adds the item at order 0', () => {
    const { checklist, changed } = backfillChecklist('{oops');
    expect(changed).toBe(true);
    expect(checklist).toEqual([{ label: NEW_ITEM_LABEL, checked: false, order: 0 }]);
  });

  it('treats a non-array JSON value as [] and adds the item at order 0', () => {
    for (const raw of ['5', '"str"', '{"a":1}', 'null']) {
      const { checklist, changed } = backfillChecklist(raw);
      expect(changed).toBe(true);
      expect(checklist).toEqual([{ label: NEW_ITEM_LABEL, checked: false, order: 0 }]);
    }
  });
});
