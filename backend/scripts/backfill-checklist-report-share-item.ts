/**
 * Backfill: append the "Report is on client's share" checklist item to every
 * existing BoardCard that does not already have it.
 *
 * Idempotent — safe to re-run. Skips any card whose checklist already contains
 * an item with this exact label (case-sensitive, whitespace-sensitive exact
 * match). A malformed / empty / non-array checklist JSON is treated as `[]`
 * (the item is added at order 0) rather than crashing the run.
 *
 * The core transform (`backfillChecklist`) and its idempotency key
 * (`NEW_ITEM_LABEL`) are PURE and live in `src/services/boardService.ts` so they
 * can be unit-tested without a database or this script's `main()` side effects
 * (the repo tsconfig `rootDir` is `src`, so a `src/**` test cannot import a file
 * under `scripts/`). They are re-exported here so this script remains the public
 * home of the backfill transform. `main()` only runs when this file is the
 * process entrypoint (see the guard at the bottom), so importing the module
 * elsewhere does NOT execute the DB loop.
 *
 * Run with:  npx tsx backend/scripts/backfill-checklist-report-share-item.ts
 *
 * NOT wired into package.json — this is a one-off operational script, matching
 * the repo convention (backend/prisma/backfill-zones.ts,
 * backend/scripts/dryrun-project-dedupe.ts).
 */
import { pathToFileURL } from 'node:url';
import { prisma } from '../src/db/prisma.js';
import { backfillChecklist, NEW_ITEM_LABEL } from '../src/services/boardService.js';

export { backfillChecklist, NEW_ITEM_LABEL };
export type { ChecklistItem } from '../src/services/boardService.js';

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

// Only run the DB loop when this file is invoked directly (not when imported).
// Compare the resolved module URL to the CLI entrypoint path.
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
