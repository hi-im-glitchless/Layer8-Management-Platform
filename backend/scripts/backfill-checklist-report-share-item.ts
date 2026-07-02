/**
 * Backfill: append the "Report is on client's share" checklist item to every
 * existing BoardCard that does not already have it.
 *
 * Idempotent — safe to re-run. Skips any card whose checklist already contains
 * an item with this exact label (case-sensitive, whitespace-sensitive exact
 * match). A malformed / empty / non-array checklist JSON is treated as `[]`
 * (the item is added at order 0) rather than crashing the run.
 *
 * The core transform (`backfillChecklist`) is a PURE function exported so it can
 * be unit-tested without a database or the `main()` side effects; `main()` only
 * runs when this file is the process entrypoint (see the guard at the bottom),
 * so importing the module from a test does NOT execute the DB loop.
 *
 * Run with:  npx tsx backend/scripts/backfill-checklist-report-share-item.ts
 *
 * NOT wired into package.json — this is a one-off operational script, matching
 * the repo convention (backend/prisma/backfill-zones.ts,
 * backend/scripts/dryrun-project-dedupe.ts).
 */
import { pathToFileURL } from 'node:url';
import { prisma } from '../src/db/prisma.js';

export const NEW_ITEM_LABEL = "Report is on client's share";

export interface ChecklistItem {
  label: string;
  checked: boolean;
  order: number;
}

/**
 * Pure transform for a single card's stored checklist JSON.
 *
 * - Parses `rawChecklistJson`; if the parse throws or the result is not an
 *   array, the checklist is treated as `[]`.
 * - If an item with `label === NEW_ITEM_LABEL` already exists, returns the
 *   parsed items unchanged with `changed: false` (idempotent, exact-label
 *   match).
 * - Otherwise appends the new item at `max(order) + 1` (or `0` for an empty
 *   list) and returns `changed: true`.
 */
export function backfillChecklist(rawChecklistJson: string): {
  checklist: ChecklistItem[];
  changed: boolean;
} {
  let items: ChecklistItem[];
  try {
    const parsed = JSON.parse(rawChecklistJson) as unknown;
    items = Array.isArray(parsed) ? (parsed as ChecklistItem[]) : [];
  } catch {
    // Malformed JSON-in-TEXT — treat as empty rather than crash the run.
    items = [];
  }

  if (items.some((i) => i.label === NEW_ITEM_LABEL)) {
    return { checklist: items, changed: false };
  }

  const nextOrder = items.length
    ? Math.max(...items.map((i) => i.order)) + 1
    : 0;
  const next = [
    ...items,
    { label: NEW_ITEM_LABEL, checked: false, order: nextOrder },
  ];
  return { checklist: next, changed: true };
}

async function main(): Promise<void> {
  const cards = await prisma.boardCard.findMany({
    select: { id: true, checklist: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const card of cards) {
    const { checklist, changed } = backfillChecklist(card.checklist);
    if (!changed) {
      skipped++;
      continue;
    }
    await prisma.boardCard.update({
      where: { id: card.id },
      data: { checklist: JSON.stringify(checklist) },
    });
    updated++;
    const order = checklist[checklist.length - 1]?.order;
    console.log(`[backfill] card ${card.id}: added "${NEW_ITEM_LABEL}" at order ${order}`);
  }

  console.log(`[backfill] Done. Updated ${updated}, skipped ${skipped} (already had it).`);
}

// Only run the DB loop when this file is invoked directly (not when imported by
// a test). Compare the resolved module URL to the CLI entrypoint path.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((err) => {
      console.error('[backfill] Fatal error:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
