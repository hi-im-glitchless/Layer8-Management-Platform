---
phase: "03"
title: "Board checklist open access + default 'Report is on client's share' item"
type: research
confidence: high
date: 2026-07-02
---

# Research — Board Checklist Open Access & Default Report-Share Item

## Change 1 — Checklist Access

### Current authz logic (exact)

File: `backend/src/routes/board.ts`

- Zod body schema (lines 122-127):
  ```ts
  const schema = z.object({
    stage: StageEnum.optional(),
    notes: z.string().optional(),
    checklist: z.array(ChecklistItemSchema).optional(),
    stageLockedBy: z.string().nullable().optional(),
  });
  ```
  `ChecklistItemSchema` (lines 35-39): `{ label: z.string(), checked: z.boolean(), order: z.number() }`.
  Because every field is `.optional()` and the body arrives as JSON, `Object.keys(data)` after `schema.parse(req.body)` reflects **exactly** the fields the client actually sent (zod does not backfill absent optional keys with an `undefined` own-property).

- Handler `router.patch('/cards/:id', requireAuth, mutationRateLimiter, ...)` (line 120):
  1. `role = req.session.role`; `isManager = role === 'PM' || role === 'ADMIN'` (lines 130-131).
  2. **Archive guard (NON-NEGOTIABLE, Phase 11)** — line 137: `if (data.stage === 'archived' && role !== 'ADMIN') return 403 'Only ADMIN can archive cards'`. Runs unconditionally, before the manager/ownership branch. **Must stay exactly as-is.**
  3. **Ownership branch** — `if (!isManager)` (lines 141-162):
     - Fetches `existing = await boardService.getCard(id)` (404 if missing).
     - Builds `ownerUserIds` from `existing.assignments[].teamMember.userId` (Phase 24-R03 shape — one Project can have several Assignments/pentesters).
     - `if (!ownerUserIds.has(req.session.userId ?? '')) return 403 'Forbidden'` — **this is the line that blocks unassigned NORMAL users from ANY field**, including `checklist`.
     - `if (data.stageLockedBy !== undefined) return 403 'Only PM or ADMIN can change stage lock'` — **must stay restricted to PM/ADMIN.**
  4. Builds `updateData` (lines 164-183), sets `archivedAt` on `stage==='archived'`, and auto-pins `stageLockedBy` to the acting user when a bare `stage` move is sent without an explicit `stageLockedBy` (drag-to-move semantics) — unaffected by this change since it only fires when `data.stage !== undefined`.
  5. `boardService.updateCard(id, updateData)` → `res.json({ card })` → `emitBoardInvalidate('cards')` (line 187).

**Which fields are gated today:** ALL four optional fields (`stage`, `notes`, `checklist`, `stageLockedBy`) are gated by the same single ownership check for NORMAL users — there is no per-field branching today. `stage='archived'` is additionally ADMIN-only regardless of manager status. `stageLockedBy` is additionally PM/ADMIN-only even for owning NORMAL users.

### Recommended branch logic

Goal: a NORMAL non-owner sending a body that contains **only** `checklist` should skip the ownership 403; any other field present (alone or combined with `checklist`) keeps today's ownership-gated behavior untouched. The archive guard (step 2 above) is unconditional and already unaffected.

```ts
if (!isManager) {
  // Phase 03: any authenticated user may check/uncheck checklist items on
  // ANY project's card. Requests that touch ONLY `checklist` skip the
  // ownership check entirely; any other field (stage, notes, stageLockedBy)
  // — alone or combined with checklist — still requires ownership so the
  // existing PM/ADMIN-only and archive-only guards are untouched.
  const sentFields = Object.keys(data);
  const checklistOnly = sentFields.length > 0 && sentFields.every((f) => f === 'checklist');

  if (!checklistOnly) {
    const existing = await boardService.getCard(id);
    if (!existing) {
      return res.status(404).json({ error: 'Card not found' });
    }
    const ownerUserIds = new Set(
      existing.assignments
        .map((a) => a.teamMember?.userId)
        .filter((u): u is string => !!u),
    );
    if (!ownerUserIds.has(req.session.userId ?? '')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (data.stageLockedBy !== undefined) {
      return res.status(403).json({ error: 'Only PM or ADMIN can change stage lock' });
    }
  }
  // checklistOnly === true: any authenticated user proceeds. A missing card
  // still 404s downstream via boardService.updateCard's Prisma P2025 → the
  // existing catch block (line 192-194) already converts that to 404, so no
  // separate existence check is needed on this path.
}
```

Notes for the planner:
- `sentFields.length > 0` guard preserves current behavior for an **empty** body from a non-owner (falls through to the ownership check exactly as today — no new hole).
- A body of `{ checklist: [...], notes: '...' }` from a non-owner is **not** `checklistOnly` and correctly falls back to the ownership-gated path — this is a deliberate, conservative choice: the task only asked to open `checklist`, not `notes`. Flagged as an explicit decision below (Open Questions).
- `{ checklist: [...], stage: 'execution' }` and `{ checklist: [...], stageLockedBy: 'x' }` from a non-owner also correctly fall back to ownership/PM-ADMIN gating — satisfies the requirement's example exactly.
- The archive guard at line 137 and the PM-drag-to-archive block are **completely unmodified** by this change — they run before this branch and don't depend on it.
- No change needed to `boardService.updateCard` (`backend/src/services/boardService.ts:177-200`) — it already accepts a partial `checklist`-only `updateData` object.

### Frontend gating

Searched `frontend/src/features/board/` for RBAC/assignment gating around the checklist:

- `frontend/src/features/board/components/CardDetailModal.tsx` lines 588-628 render the checklist and wire the toggle button (`onClick` → `updateCard.mutate({ id: card.id, data: { checklist: next } })`, line 604-609). **There is no role or assignment check anywhere in this block** — no `canEditChecklist`, no `hasRole()`, no `assignments.some(...)` guard. The only gated affordances in this file are `canDelete = role === 'ADMIN' || role === 'PM'` (line 486) and `canArchive = role === 'ADMIN' && !card.archivedAt'` (line 487), used solely for the Delete/Archive footer buttons — checklist is untouched by either.
- `frontend/src/features/board/components/KanbanCard.tsx` only renders a read-only `checkedCount/totalCount` badge (lines 122-123, 183-218); no interaction, no gating.
- `frontend/src/features/board/components/BoardFilters.tsx:98` has the only `hasRole('PM')` gate in the board feature slice, and it's for a filter control, unrelated to checklist.
- `GET /api/board/cards` and `GET /api/board/cards/:id` are `requireAuth`-only (board.ts lines 60, 93 — "all authenticated users" per their own doc-comments), so any authenticated user can already open `CardDetailModal` for any card and see/click the checklist.

**Conclusion: no frontend changes are required for Change 1.** The UI is already fully open; only the backend 403 was blocking unassigned NORMAL users. Once the backend branch above ships, the existing UI becomes usable end-to-end with zero frontend edits. (Worth a quick manual check post-implementation that `useUpdateCard`'s existing `onError: handleMutationError` toast, `frontend/src/features/board/hooks.ts:57`, still fires correctly for the genuinely-still-blocked cases like stage changes by non-owners — no code change expected there either.)

### Socket.IO broadcast coverage

- `backend/src/routes/board.ts:187` calls `emitBoardInvalidate('cards')` **unconditionally on every successful PATCH**, including checklist-only updates — this line is outside any role/ownership branch.
- `backend/src/services/socketService.ts:17-19`: `emitBoardInvalidate` does `_io?.emit('board:invalidate', { resource })` — a **global broadcast**, no room/user scoping. Every connected socket receives it.
- `frontend/src/features/board/useBoardSync.ts:21-26` listens for `board:invalidate` and calls `queryClient.invalidateQueries({ queryKey: ['board', resource] })` for any connected client, regardless of role or assignment.

**Conclusion: realtime propagation already fully covers this change. No changes needed to `socketService.ts`, `useBoardSync.ts`, or the emit call site.**

### Existing tests to extend

- `backend/src/routes/__tests__/boardPatchArchiveGuard.test.ts` — covers only the PM/ADMIN archive-stage guard (PM 403 on `stage=archived`, ADMIN 200, PM 200 on non-archived stage). It does **not** exercise NORMAL role or ownership at all. Good template for harness reuse: builds a real Express app mounting the actual `board.ts` router with a session-injecting middleware keyed off an `x-test-role` header (see `buildApp`, lines 82-96), plus a `withDbRetry` SQLite-lock-retry wrapper and try/finally seed/teardown.
- `backend/src/routes/__tests__/boardFiles.test.ts` — closer template for the ownership dimension: seeds **two NORMAL users**, "assigned" (via a real `TeamMember` + `Assignment` linked to the card's project) and "unassigned" (comment header lines 7-25, seed code ~139-200, session-injection ~340-346). It also carries a schedule-isolation regression test (`(h)` around line 442) asserting the seeded `Assignment`/`TeamMember` rows are never mutated by the suite — reuse that pattern for any new checklist-access test file since board fixtures now touch `Assignment`/`TeamMember`.
- No dedicated test file exists yet for card-PATCH ownership on NORMAL users (`checklist`, `notes`, `stage` as a non-owner) — this is a coverage gap the plan should close. Recommend a new file, e.g. `backend/src/routes/__tests__/boardPatchChecklistAccess.test.ts`, combining both templates:
  1. Seed: assigned NORMAL (via `TeamMember`+`Assignment`, mirroring `boardFiles.test.ts`), unassigned NORMAL, PM, ADMIN, and a card.
  2. `PATCH /cards/:id { checklist: [...] }` as **unassigned NORMAL** → expect 200, checklist persisted.
  3. `PATCH /cards/:id { stage: 'execution' }` as **unassigned NORMAL** → expect 403 (existing behavior, regression guard).
  4. `PATCH /cards/:id { stageLockedBy: 'x' }` as **unassigned NORMAL** → expect 403.
  5. `PATCH /cards/:id { checklist: [...], stage: 'execution' }` as **unassigned NORMAL** → expect 403, and assert the card's `checklist` in the DB is **unchanged** (the mixed request must be rejected wholesale, not partially applied).
  6. `PATCH /cards/:id { stage: 'archived' }` as unassigned NORMAL → still 403 'Only ADMIN can archive cards' (regression guard for the Phase 11 guard, unaffected by this change).
  7. Regression: assigned NORMAL, PM, ADMIN can still PATCH `checklist` (200) — happy-path unaffected.
  8. Schedule-isolation guard (per `boardFiles.test.ts` pattern (h)): assert the seeded `Assignment`/`TeamMember` rows are untouched after the suite runs.

## Change 2 — Default "Report on client's share" Item

### Where checklist is first populated

- `backend/src/services/boardService.ts:10-17` — `DEFAULT_CHECKLIST` constant:
  ```ts
  export const DEFAULT_CHECKLIST: ChecklistItem[] = [
    { label: 'Kickoff', checked: false, order: 0 },
    { label: 'Requirements', checked: false, order: 1 },
    { label: 'Pentest', checked: false, order: 2 },
    { label: 'Report', checked: false, order: 3 },
    { label: 'Review', checked: false, order: 4 },
    { label: 'Delivery', checked: false, order: 5 },
  ];
  ```
- `backend/src/services/projectService.ts:1-2,88-104` — `upsertByKey()` is the **only** production code path that creates a `BoardCard`. On a genuinely new Project (no existing row matching the `(name, clientId, sortedTags)` dedupe triple), it does:
  ```ts
  return prisma.project.create({
    data: {
      ...
      boardCard: {
        create: {
          stage: 'upcoming',
          checklist: JSON.stringify(DEFAULT_CHECKLIST),   // line 98
          notes: '',
        },
      },
    },
  });
  ```
  `upsertByKey` is called from `assignmentService.linkProjectsForAssignment` (per the `board.ts:80-86` comment) whenever an assignment links to a Project — this is the single "new card" creation trigger. Cards are never created bare/empty; they always start with `DEFAULT_CHECKLIST`, never `[]`.
- All other `prisma.boardCard.create(...)` call sites are **test fixtures only** (`scheduleIsolation.phase23.test.ts:109`, `deleteAssignmentOrphanFailure.test.ts:136`, `boardAutoMove.stopped.test.ts:112,137`, `boardCardDelete.pm.test.ts:178`, `boardFiles.test.ts:212,222`, `boardAdminArchive.test.ts:133`, `boardPatchArchiveGuard.test.ts:131`) — none of these are production paths and don't need to be touched for the default-item change, though any test asserting the exact shape/length of `DEFAULT_CHECKLIST` (none currently do) would need re-checking after the edit.
- Prisma schema: `backend/prisma/schema.prisma:315-341` — `BoardCard.checklist String @default("[]")` (DB-level default is just an empty-array string; the *real* default population happens in application code via `DEFAULT_CHECKLIST`, not the DB column default — the column default only matters for the rare raw-insert path, which doesn't exist in this codebase).

### Checklist item shape (confirmed)

From `ChecklistItemSchema` (`backend/src/routes/board.ts:35-39`) and the `boardService.ts:4-8` `ChecklistItem` interface (both identical) and the frontend mirror (`frontend/src/features/board/types.ts:3-7`):
```ts
{ label: string; checked: boolean; order: number }
```
New default item: `{ label: "Report is on client's share", checked: false, order: 6 }` (appended after the existing `order: 5` "Delivery" item — see ordering discussion below). The apostrophe in the label needs no special escaping — `JSON.stringify`/zod `z.string()` handle it natively; this is unrelated to the YAML-quote-escaping concern noted elsewhere in this project's memory (that applies to YAML frontmatter, not JSON-in-TEXT columns or TS string literals).

### Recommended implementation — DEFAULT part (new cards)

Single-line change to `backend/src/services/boardService.ts`:
```ts
export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { label: 'Kickoff', checked: false, order: 0 },
  { label: 'Requirements', checked: false, order: 1 },
  { label: 'Pentest', checked: false, order: 2 },
  { label: 'Report', checked: false, order: 3 },
  { label: 'Review', checked: false, order: 4 },
  { label: 'Delivery', checked: false, order: 5 },
  { label: "Report is on client's share", checked: false, order: 6 },
];
```
Because `projectService.upsertByKey` (line 98) serializes this constant verbatim into every newly-created `BoardCard.checklist`, this one edit is sufficient for the "default on new cards" half — no other file needs to change for that half.

### Recommended implementation — BACKFILL part (existing cards)

Model on `backend/prisma/backfill-zones.ts` (read-modify-write loop over all rows, one-by-one `console.log`-annotated updates, `main().catch(...).finally(prisma.$disconnect())` — no npm script wiring; run manually via `npx tsx`) and `backend/scripts/dryrun-project-dedupe.ts` (doc-comment stating exact run command and safety guarantees).

Proposed new file: `backend/scripts/backfill-checklist-report-share-item.ts` (co-located with the other one-off `backend/scripts/*.ts`, since this touches `BoardCard` not a Prisma-migration-adjacent concern like `backfill-zones.ts` does for `TemplateMapping`).

```ts
/**
 * Backfill: append the "Report is on client's share" checklist item to every
 * existing BoardCard that doesn't already have it.
 *
 * Idempotent — safe to re-run. Skips any card whose checklist already
 * contains an item with this exact label (case-sensitive exact match).
 *
 * Run with: npx tsx backend/scripts/backfill-checklist-report-share-item.ts
 */
import { prisma } from '../src/db/prisma.js';

const NEW_ITEM_LABEL = "Report is on client's share";

interface ChecklistItem {
  label: string;
  checked: boolean;
  order: number;
}

async function main(): Promise<void> {
  const cards = await prisma.boardCard.findMany({
    select: { id: true, checklist: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const card of cards) {
    let items: ChecklistItem[];
    try {
      items = JSON.parse(card.checklist) as ChecklistItem[];
      if (!Array.isArray(items)) items = [];
    } catch {
      // Malformed JSON-in-TEXT — treat as empty rather than crash the run.
      items = [];
    }

    if (items.some((i) => i.label === NEW_ITEM_LABEL)) {
      skipped++;
      continue;
    }

    const nextOrder = items.length
      ? Math.max(...items.map((i) => i.order)) + 1
      : 0;
    items.push({ label: NEW_ITEM_LABEL, checked: false, order: nextOrder });

    await prisma.boardCard.update({
      where: { id: card.id },
      data: { checklist: JSON.stringify(items) },
    });
    updated++;
    console.log(`[backfill] card ${card.id}: added "${NEW_ITEM_LABEL}" at order ${nextOrder}`);
  }

  console.log(`[backfill] Done. Updated ${updated}, skipped ${skipped} (already had it).`);
}

main()
  .catch((err) => {
    console.error('[backfill] Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Why not a startup routine: `backend/src/index.ts`'s `startServer()` (lines 121-200+) has no precedent for running a data backfill on boot — all one-off migrations in this repo (`backfill-zones.ts`, `dryrun-project-dedupe.ts`) are manual, explicitly-invoked scripts. Running this at every boot would re-scan every `BoardCard` on every restart (harmless given the idempotency guard, but wasteful and inconsistent with repo convention) and would need extra care under multi-instance deploys. Recommend the manual-script approach; the plan should note it as a one-time operational step to run once after the code change ships (e.g. documented in the phase's task list or DEPLOYMENT-GUIDE.md, not automated).

### Idempotency + ordering

- **Idempotency guard:** exact-label match against `NEW_ITEM_LABEL` (`items.some((i) => i.label === NEW_ITEM_LABEL)`) before appending — re-running the script is a no-op for already-backfilled cards. This also protects against the (unlikely) race of a card created by `upsertByKey` *after* the DEFAULT_CHECKLIST edit ships but *before* the backfill runs — such a card already has the item from creation, so the backfill correctly skips it.
- **Ordering:** compute `nextOrder = Math.max(...existing orders) + 1` per card rather than hardcoding `6`, since a card's checklist may have been user-edited (items reordered, deleted, or added via other means) and no longer matches `DEFAULT_CHECKLIST` verbatim by the time the backfill runs. This keeps the new item strictly after every existing item on that specific card regardless of drift from the default set.
- **New-card path** does not need the same defensive `Math.max` logic — `DEFAULT_CHECKLIST` is a static literal appended once in source, so `order: 6` is correct and stable there (as long as no earlier entries in the same array are added/removed later without renumbering — flag this as a "keep in sync" note for future edits to `DEFAULT_CHECKLIST`).
- **Sort-order rendering:** `CardDetailModal.tsx:599` (`card.checklist.sort((a, b) => a.order - b.order)`) already sorts by `order` at render time, so the appended item naturally renders last regardless of insertion order in the JSON array.

### Tests to add/extend

- No existing test asserts `DEFAULT_CHECKLIST`'s exact contents or length. Add/extend a test (new or in an existing `projectService`/`boardService` test file — none currently exist under `backend/src/services/__tests__/` for these two services specifically, which is itself a gap per `TESTING.md`'s "Gaps/risks" note) asserting:
  1. `projectService.upsertByKey(...)` on a brand-new dedupe key creates a `BoardCard` whose parsed `checklist` includes `{ label: "Report is on client's share", checked: false, order: 6 }` as the last entry.
  2. The full `DEFAULT_CHECKLIST` array shape/order is as expected (guards against accidental future edits silently changing default items).
- For the backfill script (new, no existing coverage — `backend/scripts/*.ts` one-offs have no test files in this repo currently, consistent with `dryrun-project-dedupe.ts`/`backfill-zones.ts` having none either), consider either:
  - A lightweight Vitest that imports and calls the script's exported `main()`-equivalent logic against seeded `BoardCard` rows (assert: card with existing item is skipped/unchanged; card without it gets the item appended at `max(order)+1`; re-running twice is idempotent), or
  - If the plan prefers to match repo convention (no tests for one-off scripts), document manual verification steps instead and flag it as `⚠ REQUIRES MANUAL VALIDATION` for Dev/Debugger post-backfill (e.g., spot-check a handful of `BoardCard.checklist` rows via Prisma Studio or a read-only query before/after running the script).

## Recommended Approach

Concrete file list and what changes in each:

1. **`backend/src/routes/board.ts`** (Change 1) — inside `router.patch('/cards/:id', ...)`, replace the `if (!isManager) { ... }` block (lines 141-162) with the `checklistOnly`-aware version shown above. No other route in this file changes. The archive guard (line 137) and the `emitBoardInvalidate('cards')` call (line 187) are untouched.
2. **`backend/src/services/boardService.ts`** (Change 2) — append one entry to `DEFAULT_CHECKLIST` (lines 10-17): `{ label: "Report is on client's share", checked: false, order: 6 }`.
3. **`backend/scripts/backfill-checklist-report-share-item.ts`** (Change 2, new file) — one-off idempotent backfill script per the template above, run manually once via `npx tsx backend/scripts/backfill-checklist-report-share-item.ts` after deploy.
4. **`backend/src/routes/__tests__/boardPatchChecklistAccess.test.ts`** (Change 1, new file) — new test suite per the 8-case list above, modeled on `boardPatchArchiveGuard.test.ts` (harness) + `boardFiles.test.ts` (assigned/unassigned NORMAL seeding + schedule-isolation guard).
5. **A `boardService`/`projectService` test** (Change 2, new or extended file under `backend/src/services/__tests__/`) — asserts `DEFAULT_CHECKLIST` contents and that `upsertByKey` propagates the new item into freshly-created cards.
6. **No frontend changes required.** `frontend/src/features/board/components/CardDetailModal.tsx` already renders and lets any authenticated user click any checklist item with no role/assignment gate; `frontend/src/features/board/types.ts`'s `ChecklistItem` shape already matches; Socket.IO sync (`useBoardSync.ts`) already invalidates for every connected client on any `board:invalidate('cards')` emit.
7. **No schema/migration change required.** `BoardCard.checklist` is already a free-form JSON-in-TEXT column (`schema.prisma:323`); adding an item is a data-shape change, not a schema change.

## Open Questions / Decisions

1. **Should `notes` also be opened to non-owners, or only `checklist`?** The task explicitly scopes this to checklist; the recommended branch logic keeps `notes` ownership-gated (a body with both `checklist` and `notes` from a non-owner falls back to the ownership check and 403s). Confirm this is the intended scope before implementation — if `notes` should also open up, the `checklistOnly` predicate would need to become `['checklist', 'notes'].includes(f)` instead, but nothing in the phase framing asked for that.
2. **Position of the new default item.** Recommended: append at the end (`order: 6`, after "Delivery"). An alternative would be inserting it adjacent to "Report" (`order: 3.5`-style renumber) since it's semantically report-related, but that requires renumbering every subsequent default item and complicates the backfill's `Math.max`-based ordering for cards that already deviate from the default set. Recommend keeping the simpler append-at-end approach unless the user has a strong opinion on visual position.
3. **Where the backfill script lives and how it's invoked.** Recommended `backend/scripts/backfill-checklist-report-share-item.ts`, manual `npx tsx` invocation, no npm script entry — matches `dryrun-project-dedupe.ts` exactly. If the team wants it wired into `package.json` (e.g. `"backfill:checklist-report-share": "tsx scripts/backfill-checklist-report-share-item.ts"`), that's a small addition but not currently the repo's convention for one-off backfills (`backfill-zones.ts` isn't wired either).
4. **Test coverage for the backfill script itself.** Repo convention is to leave one-off scripts untested (neither `backfill-zones.ts` nor `dryrun-project-dedupe.ts` has a test file). The plan should explicitly decide whether Change 2's backfill gets a Vitest or just documented manual verification — flagged above as `⚠ REQUIRES MANUAL VALIDATION` if the latter is chosen.
5. **Exact-label idempotency match is case- and whitespace-sensitive.** If a future edit changes the label text (e.g. punctuation), the backfill's `items.some((i) => i.label === NEW_ITEM_LABEL)` guard would no longer recognize already-backfilled cards as done and would append a near-duplicate. Not a concern for this phase (label is fixed), but worth noting as a fragility if the label ever needs a wording tweak — a future backfill would need its own new idempotency key or a migration/dedupe pass.

## Live Validation Evidence

No live DB/HTTP validation was performed — this phase's research is explicitly static (per task instructions: "This is static research — no live DB/HTTP validation needed"). All findings above are derived from direct reads of `backend/src/routes/board.ts`, `backend/src/services/boardService.ts`, `backend/src/services/projectService.ts`, `backend/prisma/schema.prisma`, `backend/prisma/backfill-zones.ts`, `backend/scripts/dryrun-project-dedupe.ts`, the frontend `features/board/` slice, and the existing test files named above — all read in full or by targeted line range during this research pass.
