---
phase: "01"
title: Planner Client-First Name Order
type: research
confidence: high
date: 2026-08-31
---

# Phase 01 Research: Planner Client-First Name Order

## 1. The optional-client fallback

**What the data actually guarantees:**

- `Project.clientId` is `String?` (nullable) and `Project.client` is an optional relation with `onDelete: SetNull` (`backend/prisma/schema.prisma:309,317`). A card's `project.client` can genuinely be `null` — this is not a theoretical edge case.
- The clientless state is reachable two ways:
  1. **At creation time it should not normally happen.** `projectService.isPlannerEligible()` (`backend/src/services/projectService.ts:38-43`) requires `!!opts.clientId` (plus name and ≥1 tag) before an Assignment gets promoted to a Planner Project/BoardCard. So freshly auto-created Planner cards should always start with a client.
  2. **After creation, deleting the Client row nulls it out.** `clientService.deleteClient()` (`backend/src/services/clientService.ts:76-78`, comment at :72-74) does `prisma.client.delete()`, and the `onDelete: SetNull` FK relation sets every linked `Project.clientId` to `null`. This is reachable through a real UI flow: `ClientManager.tsx:223` (`frontend/src/features/schedule/components/ClientManager.tsx`) wires a delete-client confirmation dialog to `useDeleteClient()` → `scheduleApi.deleteClient` → `DELETE` route in `backend/src/routes/schedule.ts:654`. Any card whose project pointed at a deleted client becomes clientless going forward.
- Frequency: not quantifiable from static code (no telemetry), but it is a normal, supported admin action, not a corrupt/unreachable state — the fallback must be correct, not just defensive.
- The board payload confirms this shape: `PROJECT_CLIENT_SELECT`/`include: { client: {...} }` in `backend/src/services/boardService.ts:170-172,210-212` — Prisma returns `null` for an optional relation with no match, matching the frontend type `client?: {...} | null` in `frontend/src/features/board/types.ts:35-42`.
- `project.name`, by contrast, is a required scalar (`String`, not nullable) at the schema level (`schema.prisma:308`), yet the existing UI code still defensively falls back with `project.name || '(No project)'` in three places: `KanbanCard.tsx:160`, `CardDetailModal.tsx:507`, `DeleteCardDialog.tsx:725`. That is the codebase's established idiom for "render a safe fallback for a headline text field" — an inline `||` chain, not a separate placeholder component or conditional block.

**Concrete rendering options for the headline slot (client-first, never blank):**

- **Option A — chained OR fallback (most consistent with existing convention):** `card.project.client?.name || card.project.name || '(No project)'` as the headline text, mirroring the exact `x || 'text'` idiom already used for `project.name || '(No project)'` three times in this codebase. The second line then only needs to render the project name when the client name was actually used as the headline (i.e. guard the second row on `card.project.client?.name` truthiness, same guard the code already uses today at `KanbanCard.tsx:170`) — otherwise the project name would render twice (once as headline fallback, once as the "second line").
- **Option B — pick one of two fully separate JSX branches** (`client present` vs `client absent`) duplicating markup for headline/subline. Works but duplicates the row markup and pin-wrapper structure twice, more code to keep in sync — less consistent with the terse inline-fallback style used elsewhere.
- **Option C — introduce a literal placeholder for a missing client** (e.g. `'(No client)'`) shown as headline with project name always as the second line. This does not match the recorded Success Criteria ("no client still shows the project name as the visible headline") and invents a new placeholder string not requested by the roadmap — rejected.

Option A is what the Roadmap's success criteria describes and is the only one consistent with the codebase's existing `|| '(No project)'` fallback idiom.

## 2. The pin icon

- Today: `<Pin>` (`lucide-react`) is rendered inside Row 1's `<div className="flex items-start justify-between gap-1">` (`KanbanCard.tsx:158-165`), sharing that flex row with the project-name `<p>`. Condition: `card.stageLockedBy && card.stageLockedBy !== 'auto'` (`:162`).
- What has to move: the entire `flex items-start justify-between gap-1` wrapper (and the `<Pin>` inside it) must wrap whatever paragraph is now visually first — i.e. the headline slot from Item 1 (client name, or the project-name fallback when clientless) — not a hardcoded "client name" element. The pin's condition (`stageLockedBy`) is completely independent of client presence, so it is unaffected by which text is showing; it just needs to stay attached to "row 1" structurally.
- Clientless interaction: none beyond the above — since Item 1's Option A makes the headline slot always non-empty (client name or project-name fallback), the pin's `justify-between` row always has a real headline `<p>` to sit beside; there is no case where the pin would end up alone with an empty sibling.
- Modal equivalent: `CardDetailModal.tsx:505-524` — the pin/tooltip button already lives inside `DialogTitle`'s `flex items-center gap-2` row alongside the `<span className="flex-1">{project.name || '(No project)'}</span>` title text (`:506-508`). Same principle: that span's content becomes the client-first headline fallback; the pin markup at `:509-523` doesn't need to move relative to it, only the text inside the span changes.

## 3. The memo comparator

`KanbanCard.tsx:223-241` (the second argument to `memo`) currently compares, field by field:

1. `prev.card.id === next.card.id`
2. `prev.card.stage === next.card.stage`
3. `prev.card.checklist === next.card.checklist`
4. `prev.card.stageLockedBy === next.card.stageLockedBy`
5. `prev.card.project.name === next.card.project.name`
6. `prev.card.project.status === next.card.project.status`
7. `prev.card.project.color === next.card.project.color`
8. `prev.card.project.client?.name === next.card.project.client?.name`
9. `prev.card.assignments.map((a) => a.teamMemberId).join() === next.card.assignments.map(...).join()`
10. `prev.isDragOverlay === next.isDragOverlay`
11. `prev.onCardClick === next.onCardClick`

**Verification: re-ordering the JSX does not change what needs comparing.** Both `card.project.name` (#5) and `card.project.client?.name` (#8) are already independently compared. The planned change only swaps which of these two already-compared values renders in which visual row/style — it does not read any new field (no `clientId` read for display, no new nested field) and does not stop reading either existing field. So the comparator's field coverage is already complete for the reordered JSX; **no comparator changes are required.** This holds explicitly stated, not just implied.

## 4. The test surface

### `frontend/src/features/board/components/__tests__/KanbanCard.test.tsx`

Helper: `clientNameEl(name)` at `:102-104` is just `screen.getByText(name)` — a thin, position-agnostic text lookup. It will keep working verbatim after the reorder (it doesn't assert DOM position itself); only the *assertions the tests build on top of it* are order/styling-sensitive (see below). The comment at `:97-101` calling it the "Row-2 client-name" is stale after the change but non-functional.

| Test | Lines | Classification | Why |
|---|---|---|---|
| `describe('KanbanCard pentester avatars')` (a) | 107-129 | (d) incidental | No project/client name assertions. |
| (b) | 131-141 | (d) incidental | Same. |
| (b1) | 143-159 | (d) incidental | Same. |
| (b1b) | 161-173 | (d) incidental | Same. |
| (b1c) | 175-184 | (d) incidental | Same. |
| (b2) | 186-198 | (d) incidental | Same. |
| (b3) | 200-211 | (d) incidental | Same. |
| (b4) | 213-232 | (d) incidental | Same. |
| (c) | 234-244 | (d) incidental | Same. |
| (d) "renders no avatar group..." | 246-253 | (d) incidental | Asserts `screen.getByText('Acme Corp')` is present (`:252`) but not its position/class — passes unchanged since the client name still renders as text, just relocated. |
| (e) | 255-269 | (d) incidental | No name assertions. |
| `describe('KanbanCard client name styling')` (1) "renders the client name bold with no inline colour" | 278-298 | **(a)+(b)+(c)** | Asserts `el.className` **contains `'font-bold'`** (`:294`) — today's Row-2 client-name class is `text-sm font-bold`. After the swap the client name becomes the **headline** with `text-lg font-semibold`, so `font-bold` will no longer be on the client-name element — **this assertion breaks** and must be rewritten against the new class (`font-semibold`) or re-pointed at whichever element now carries `font-bold` (the project name, once it moves to the secondary line). Also asserts `el.style.color === ''` (`:297`) — this is the no-inline-colour guard from `KanbanCard.tsx:167-169` and **must be preserved**, just re-anchored to wherever the client name now renders. |
| (2) "ignores a pale client colour..." | 300-319 | **(a)+(b)+(c)** | Same `font-bold` (`:317`) and `el.style.color === ''` (`:318`) assertions on the client name — same break/preserve requirement as (1). |
| (3) "renders the name safely when colour is missing/empty" | 321-340 | **(a)+(b)+(c)** | Same pattern (`:338`, `:339`). |
| `describe('KanbanCard memo re-render on project change')` | 348-370 | (d) incidental | Asserts StatusBadge text ("Confirmed"/"Placeholder"), unrelated to name order. |
| `describe('KanbanCard is unaffected by client.notes (Phase 03-01)')` "renders identical DOM whether or not client.notes is present" | 380-419 | (d) incidental, **not order-sensitive** | This is a *self-relative* comparison — it renders the (post-change) component twice with/without `client.notes` and asserts the two renders' HTML are byte-identical to **each other**. It does not compare against a fixed pre-change snapshot, so it stays valid regardless of which row order the component uses; it will keep passing as long as `client.notes` still never affects the rendered markup. |

**Summary:** exactly 3 tests break and require updating — the three in `describe('KanbanCard client name styling')` (lines 278-298, 300-319, 321-340) — all because they assert `font-bold` on the client-name element, which moves to `font-semibold` under this milestone's "emphasis follows position" decision. All three also carry the `el.style.color === ''` no-inline-colour guard, which is a **must-preserve** regression guard for the `KanbanCard.tsx:167-169` legibility decision — the rewritten tests must keep asserting `style.color === ''` on the client name (now the headline), not drop it.

### `frontend/src/features/board/components/__tests__/CardDetailModal.test.tsx`

None of the 5 existing tests assert on `DialogTitle` content or order at all — `'Acme Pentest'` (the project name in `makeCard()`, `:94`) is never referenced in any `expect()` in this file.

| Test | Lines | Classification |
|---|---|---|
| (a) "renders client notes above the project notes..." | 120-141 | (d) incidental — asserts Client-Notes-section-vs-Notes-heading DOM order (unrelated to the modal title), and `screen.getByText('Project note body')` / client notes text. Unaffected. |
| (b) "renders no client-notes section when the project has no client" | 143-151 | (d) incidental — asserts absence of a "client notes" heading; unrelated to title. |
| (c) "renders no client-notes section when client notes are empty" | 153-158 | (d) incidental |
| (d) "exposes no edit affordance..." | 160-179 | (d) incidental |
| (e) "opens the project-notes editor Preview-first..." | 181-206 | (d) incidental — scoped to the separate project-Notes editor section, not the title. |

**None of the 5 tests break.** This is a coverage gap, not a false-negative risk: after the change, nothing in this file will catch a regression in the modal header's client-first order — worth flagging to the planner as a place to *add* assertions rather than just "update existing ones."

## 5. Other consumers

Searched `e2e/tests/`, `ui-seed/`, and the three named files from the roadmap.

- **`e2e/tests/board.spec.ts`** (full file, 29 lines) — the only Planner e2e spec. Both tests check `heading('Planner')`, stage-column labels ("Upcoming", "Next Week", etc.), and the My/All Projects filter toggle buttons. Neither test reads a card's project/client name text or DOM structure — **not order-sensitive, unaffected.** (`deferred.spec.ts` scaffolds card-level interactions like drag-drop/modal/comments but per the comment at `board.spec.ts:4-6` those are separate and were not found to assert name order either — no `KanbanCard`/name-order references found via search across `e2e/tests/`.)
- **`ui-seed/`** — no file references `KanbanCard`, board/planner card text order, or `font-semibold`/`font-bold` class strings. `seed_assignments.py:74` has a `select_client()` helper for filling the client dropdown in a form, unrelated to Planner card rendering. **Unaffected.**
- **`frontend/src/features/schedule/components/AssignmentCell.tsx`** — confirmed already client-first: `${assignment.client.name} - ${assignment.projectName}` at `:254`, `:437`, `:482` (roadmap cited 253-254/436-437/481-482; actual content lines are 253-255, 436-438, 481-483 for the full ternary — same logic, off-by-one in the roadmap's line pointer but the code and behavior match the claim). **Confirmed out of scope, no change needed.**
- **`frontend/src/features/schedule/utils/exportHtml.ts`** — `getAssignmentLabel()` at `:192-201` builds `${clientName} - ${projectName}` when a client exists (`:196-199`), falling back to `projectName` alone. Used at `:210` and `:229`. **Confirmed already client-first, out of scope.**
- **`frontend/src/features/dashboard/components/ProjectCard.tsx`** — headline is `project.projectName` (`:51`), client name is a muted subline `project.clientName` (`:57-58`) — **confirmed project-first, and confirmed this is the Dashboard route, not the Planner** (different feature directory, different data shape — `DashboardProject`, not `BoardCard`). Explicitly out of scope per `CONTEXT.md`'s deferred-ideas note; this research found nothing that would force it into scope.

All three of the roadmap's "already correct / out of scope" claims are verified accurate by direct inspection, not assumed.

## 6. Test/verify commands

- **Frontend has no `test` script** in `frontend/package.json:6-11` (only `dev`, `build`, `lint`, `preview`). Per `.vbw-planning/codebase/TESTING.md:12`, the actual invocation is direct: `npx vitest run` from `frontend/`, config at `frontend/vitest.config.ts` (jsdom env, globals, `setupFiles: src/test-setup.ts`, `include: ['src/**/*.test.{ts,tsx}']`).
  - To target just the two affected files: `cd frontend && npx vitest run src/features/board/components/__tests__/KanbanCard.test.tsx src/features/board/components/__tests__/CardDetailModal.test.tsx`
  - Full frontend suite: `cd frontend && npx vitest run`
- **Typecheck:** `frontend/package.json:8` — `build` is `tsc -b && vite build`; for a typecheck-only pass without a full Vite build, `cd frontend && npx tsc -b` is the direct equivalent (the `-b` project-reference build is what CI/local convention here treats as "typecheck").
- **Lint:** `frontend/package.json:9` — `npm run lint` → `eslint .`, run from `frontend/`.

**Known caveats from `TESTING.md` / `CONCERNS.md`:**
- `TESTING.md:20` describes frontend coverage as "sparse — `MappingOverlayCard.test.tsx`... Most UI is untested," which is **stale relative to what this research found**: `KanbanCard.test.tsx` (420 lines) and `CardDetailModal.test.tsx` (207 lines) are both substantial and currently exist and pass. Treat `TESTING.md`'s frontend-coverage summary as out of date rather than authoritative — this is a documentation-drift risk `CONCERNS.md:29` already generally warns about ("VBW bookkeeping lags code").
- `CONCERNS.md:30` (DEVN-05) — a pre-existing, accepted, non-blocking ESLint issue (`react-refresh/only-export-components`) on `KanbanCard.tsx`. Per `.claude` memory it was originally tied to a `findCardById` export that is no longer present in the current file (the file has changed materially since Phase 22) — its current location wasn't re-confirmed here since it's out of scope, but if `npm run lint` in QA surfaces any pre-existing `KanbanCard.tsx` finding, do not treat it as a regression introduced by this phase's change; it is already accepted per `CONCERNS.md:30`/`TESTING.md:32`.
- No known-flaky test markers found for these two files or the Planner e2e spec.

## Live Validation Evidence

Not applicable — no external/live data validation was performed for this research task, per the task instructions (local UI change, no external API surface). All findings above are static code/config inspection (`Read`/`Bash grep`, read-only), not runtime validation.
