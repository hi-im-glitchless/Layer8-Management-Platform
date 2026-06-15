## Phase 01 Context (Compiled)

### Milestone Scope Context

Gathered: 2026-06-03
Calibration: builder

## Scope Boundary

**Board Refinements** — a set of post-ship tweaks and fixes to the Project Board
("Planner") shipped in the previous milestone. Four user-requested changes:
1. Archive a card without typing the project name (drop the type-to-confirm gate).
2. Add a new board column/stage: "Stopped".
3. Fix: any user with access to a card can download any file on it (not only files they uploaded).
4. Auto-scroll the board horizontally while dragging a card near the edge.

## Decomposition Decisions

### Phase Count & Grouping
Three phases. The two board-UI changes (Stopped column #2 + horizontal drag
auto-scroll #4) are grouped into Phase 1 because they share the same surface —
the Kanban board's stage list and drag context (`Board.tsx`, `KanbanColumn`,
stage types, and the backend stage enum/validation) — so doing them together
avoids file conflicts and lets them share one QA/UAT pass. The archive change (#1)
and the file-download fix (#3) are independent concerns touching disjoint files
(ArchiveCardDialog/admin-archive route vs. the file-download route/service), so
each is its own phase for clean, independent verification.

### Phase Ordering
1. **Stopped column + drag auto-scroll** — largest (spans frontend stage model +
   backend stage enum); do the structural board change first.
2. **Archive without typed confirmation** — small, self-contained frontend+backend.
3. **File download permission fix** — small backend access-control fix.
No hard dependencies between phases; ordered by size/risk (biggest first).

### Scope Coverage
**Covers:** the four changes above. **Excludes:** the carried follow-ups from the
prior milestone (schedule→board live-refresh on assignment create; SQLite
single-writer concurrency) — not requested in this batch. The empty-projectName
archive edge case is naturally resolved by Phase 2.

## Requirement Mapping

| Phase | Change(s) | Area |
|-------|-----------|------|
| 1 — Stopped Column & Drag Auto-Scroll | #2 Stopped column, #4 horizontal drag auto-scroll | Board stages, drag-and-drop UX |
| 2 — Archive Without Typed Confirmation | #1 archive without project name | Board archive UX, access control |
| 3 — File Download Permission Fix | #3 download any card file | Board files, access control |

## Key Decisions

- **Archive keeps a lightweight confirm.** Archive permanently deletes files, so
  Phase 2 drops only the typed-name gate, not the confirmation step itself
  (Archive/Cancel remains). To be confirmed in discussion.
- **"Stopped" is a manual stage.** Auto-move must not override a card the user
  manually placed in "Stopped". Exact column position in the stage order to be
  confirmed in discussion.
- **NON-NEGOTIABLE schedule isolation** continues for all board work: no writes
  to Assignment/TeamMember/Absence/Holiday (carried from the Project Board milestone).

## Deferred Ideas

- Schedule→board live-refresh when an assignment is created (carried follow-up).
- SQLite single-writer concurrency hardening at the product level (carried follow-up).


### Goal
Add a new 'Stopped' stage/column to the Kanban board, and make the board auto-scroll horizontally while a card is dragged near the left/right edge so off-screen columns are reachable. Grouped because both touch the board's stage list and drag surface (Board.tsx, KanbanColumn, stage types + backend stage enum/validation).

### Success Criteria
Not available

### Requirements (Not available)
No matching requirements found

(34 other requirements exist for other phases -- not shown)

### Active Decisions
| Decision | Date | Rationale |
|----------|------|-----------|
| CLIProxyAPI as primary LLM provider (OpenAI SDK format) | | |
| Anthropic API as fallback (only if CLIProxy unavailable) | | |
| Per-feature model config: Sonnet 4.5 for templates, Opus 4.6 for reports | | |
| Manual retry only (no auto-retry to avoid burning credits) | | |
| Full sanitized prompts stored in audit log for GDPR compliance | | |
| python-docx in sanitization service for DOCX operations | | |
| Gotenberg Docker container for PDF generation (dev + prod) | | |
| Ghostwriter always reachable (no offline fallback) | | |
| react-pdf for PDF preview, strict upload validation | | |
| docxtpl for Jinja2 template rendering (native GW template syntax support) | | |

### Research Findings
---
phase: 1
title: "Board: Stopped Column & Horizontal Drag Auto-Scroll"
type: research
confidence: high
date: 2026-06-03
---

## Findings

### 1. Frontend Stage Model — `frontend/src/features/board/types.ts`

#### `BoardStage` union (line 9)
```ts
export type BoardStage = 'upcoming' | 'preparation' | 'execution' | 'closing' | 'done' | 'archived'
```
Current members: 6. `'stopped'` must be added. Because `BoardCard.stage: BoardStage`, any card whose DB row has `stage='stopped'` will fail the TypeScript type assignment until `'stopped'` is in the union.

#### `BOARD_STAGES` array (line 111)
```ts
export const BOARD_STAGES = ['upcoming', 'preparation', 'execution', 'closing', 'done'] as const
```
This is the display-order array (`archived` is intentionally excluded — it is appended conditionally by `visibleStages` in `Board.tsx`). `'stopped'` must be front-inserted here:
```ts
// target state
export const BOARD_STAGES = ['stopped', 'upcoming', 'preparation', 'execution', 'closing', 'done'] as const
```
`BOARD_STAGES` is iterated in two places:
- `Board.tsx:279` — loading skeleton renders a column per entry in `BOARD_STAGES`.
- `Board.tsx:292` — live board renders `visibleStages` (which is `BOARD_STAGES` extended with `'archived'` when toggled). Adding `'stopped'` to `BOARD_STAGES` automatically adds the Stopped column to both the skeleton and the live render.

#### `STAGE_LABELS` map (lines 113–120)
```ts
export const STAGE_LABELS: Record<BoardStage, string> = {
  upcoming: 'Upcoming',
  preparation: 'Next Week',
  execution: 'Execution',
  closing: 'Closing',
  done: 'Done',
  archived: 'Archived',
}
```
`STAGE_LABELS` is typed `Record<BoardStage, string>` — TypeScript will produce a compile error once `'stopped'` is in `BoardStage` but missing from this map. Add: `stopped: 'Stopped'`.

#### `groupCardsByStage` initializer (lines 123–131)
```ts
export function groupCardsByStage(cards: BoardCard[]): Record<BoardStage, BoardCard[]> {
  const grouped: Record<BoardStage, BoardCard[]> = {
    upcoming: [],
    preparation: [],
    execution: [],
    closing: [],
    done: [],
    archived: [],
  }
```
`grouped` is typed `Record<BoardStage, BoardCard[]>` — TypeScript will error if `'stopped'` is in `BoardStage` but not in the initializer. Add `stopped: []` to the object. The `for (const card of cards) { grouped[card.stage]?.push(card) }` loop at line 134 already uses optional chaining, so it silently drops any card with an unknown stage — that's fine but after adding `'stopped'` to the initializer it will bucket correctly.

#### Other stage enumerations in the frontend

`BoardFilters.tsx` — no stage enumeration. The filter UI has My/All, client dropdown, pentester dropdown, and show-archived toggle. No per-stage filtering UI. No change needed here.

`KanbanColumn.tsx` — no stage enumeration. It receives `stage: BoardStage` and `label: string` as props and renders them. No change needed.

`KanbanCard.tsx` — no stage enumeration. Reads `card.stage` only for `data: { cardId, sourceStage }` on the draggable. No change needed.

`Board.tsx:176–181` — `visibleStages` is computed from `BOARD_STAGES` + optional `'archived'`. No direct stage list here.

`Board.tsx:127` — `data.stage === 'archived'` check at line 127 in the PATCH route's non-manager guard (this is the backend, not the frontend). No frontend hardcoded stage string to add.

`hooks.ts` / `api.ts` — `useMoveCard` casts the stage string to `BoardStage`; no hardcoded stage list.

**Summary of frontend changes (all in `types.ts`):**
| Location | Change |
|---|---|
| `types.ts:9` `BoardStage` | add `'stopped'` to the union |
| `types.ts:111` `BOARD_STAGES` | front-insert `'stopped'` |
| `types.ts:113` `STAGE_LABELS` | add `stopped: 'Stopped'` |
| `types.ts:124` `groupCardsByStage` initializer | add `stopped: []` |


### 2. Backend Stage Validation — `backend/src/routes/board.ts`

#### `StageEnum` (line 16)
```ts
const StageEnum = z.enum(['upcoming', 'preparation', 'execution', 'closing', 'done', 'archived']);
```
This single constant is reused in two places within the same file:
- `GET /cards` query filter (`stage: StageEnum.optional()`) — line 46.
- `PATCH /cards/:id` body schema (`stage: StageEnum.optional()`) — line 101.

Add `'stopped'` to the tuple:
```ts
const StageEnum = z.enum(['upcoming', 'preparation', 'execution', 'closing', 'done', 'archived', 'stopped']);
```

The `PATCH` handler also has a hardcoded `data.stage === 'archived'` check at line 127 (non-manager guard: "Only PM or ADMIN can archive cards"). `'stopped'` does NOT need similar protection — any user may drag a card to Stopped (same as dragging to Upcoming). No additional conditional needed.

**No other backend stage enumeration was found.** The service layer (`boardService.ts`) uses plain `string` types for `stage` in all function signatures and passes values straight to Prisma — no server-side enum list there.


### 3. Auto-Move Logic — `backend/src/services/boardService.ts`

#### `autoMoveCards()` function (lines 224–281)

The Prisma query that selects eligible cards (lines 225–241):
```ts
const cards = await prisma.boardCard.findMany({
  where: {
    stage: { not: 'archived' },
    OR: [
      { stageLockedBy: null },
      { stageLockedBy: 'auto' },
    ],
  },
  ...
});
```

Current exclusion mechanism: the query already excludes `'archived'` cards via `stage: { not: 'archived' }`. Manual drags are excluded via `stageLockedBy` not being null/auto — when a user drags a card, `board.ts:152–153` sets `stageLockedBy = req.session.userId` (not null and not `'auto'`), so those cards are skipped.

**Where to add the `'stopped'` exclusion:** The `where.stage` filter needs to exclude both `'archived'` and `'stopped'`. The cleanest change mirrors the existing archived exclusion by switching from `{ not: 'archived' }` to a `notIn`:
```ts
stage: { notIn: ['archived', 'stopped'] },
```
This is at line 228. It is a one-line change in the `where` clause.

Note: The `stageLockedBy` mechanism would also protect Stopped cards once a user drags a card there (drag sets `stageLockedBy` to the userId). However, the explicit `stage notIn ['archived', 'stopped']` exclusion is required as the primary guard because:
1. It protects Stopped cards even if `stageLockedBy` was reset to null (e.g., via the Reset Auto-Move UI).
2. It mirrors exactly how `'archived'` is handled — by stage value, not lock state.
3. It is semantically precise: the auto-mover should never reason about a Stopped card at all.

The `targetStage` logic (lines 263–269) only sets `'upcoming'` or `'preparation'` — it never sets `'stopped'`, so there is no risk of auto-mover moving a card *to* Stopped.

#### `getMondayISO` helper (lines 202–209) — no change needed.

#### `updateCard` in `boardService.ts` (lines 177–200) — no change needed. It accepts `stage?: string` and writes it directly to Prisma. No validation here (all validation is at the route layer).


### 4. Prisma Schema — `backend/prisma/schema.prisma`

#### `BoardCard.stage` field (lines 321–322)
```prisma
/// Valid values: upcoming | preparation | execution | closing | done | archived
stage          String    @default("upcoming")
```
This is a plain `String` with a documentation comment listing valid values. There is NO Prisma `enum` type — confirmed. Adding `'stopped'` requires only a comment update, not a migration.

Target comment: `/// Valid values: stopped | upcoming | preparation | execution | closing | done | archived`

The `@@index([stage])` at line 341 requires no change — it indexes the String column and will index `'stopped'` values automatically.

**No DB migration is required.** Existing rows with any `stage` value continue to work; new rows with `stage='stopped'` are valid immediately.


### 5. Drag Context & Auto-Scroll — `frontend/src/routes/Board.tsx`

#### Scroll container (line 270)
```tsx
<div className="-mx-6 px-6 overflow-x-auto">
  <DndContext ...>
    <div className="flex gap-4 min-w-max pb-4">
```
The `overflow-x-auto` container is the direct parent of `DndContext`. @dnd-kit's auto-scroller traverses up from the dragged element's DOM node to find scrollable ancestors (`overflow-x`, `overflow-y`, or `overflow` set to `auto` or `scroll`). The `overflow-x-auto` div at line 270 will be detected as a scrollable ancestor, which is exactly the element that must scroll.

The inner `div.flex.gap-4.min-w-max` (line 277) has `min-w-max` which makes it wider than its parent whenever 7 columns are visible, enabling horizontal scroll. This is already working for normal scroll; auto-scroll while dragging will use the same container.

#### `DndContext` configuration (lines 271–276)
```tsx
<DndContext
  sensors={sensors}
  collisionDetection={closestCorners}
  onDragStart={handleDragStart}
  onDragEnd={handleDragEnd}
>
```
**`autoScroll` prop is not present.** @dnd-kit's `DndContext` defaults `autoScroll` to `true` when the prop is omitted — so auto-scroll is technically enabled, but it applies to both axes with default thresholds. The bug is that without `overflow-x-auto` triggering correctly, horizontal scroll may not activate during drag if the browser's scroll detection differs from @dnd-kit's expectation, OR the y-axis auto-scroll may interfere. The fix is to explicitly configure `autoScroll` to constrain it to x-only.

#### Sensors (lines 92–96)
```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  useSensor(KeyboardSensor),
)
```
`PointerSensor` and `TouchSensor` do not set `autoScrollEnabled = false`, so they will not suppress auto-scroll at the sensor level.

#### @dnd-kit version
`frontend/package.json` line 4: `"@dnd-kit/core": "^6.3.1"`. The installed version is in the `^6.3.x` range.

#### @dnd-kit `autoScroll` option shape (confirmed from source)

The `AutoScrollOptions` interface (from `useAutoScroller.ts` in the @dnd-kit/core source):
```ts
interface Options {
  acceleration?: number;          // scroll speed multiplier
  activator?: AutoScrollActivator; // Pointer | DraggableRect
  canScroll?: (element: Element) => boolean; // skip a specific scrollable ancestor
  enabled?: boolean;              // master on/off
  interval?: number;              // ms between scroll ticks
  layoutShiftCompensation?: boolean | { x: boolean; y: boolean };
  order?: TraversalOrder;         // traversal direction
  threshold?: { x: number; y: number }; // fraction of container dimension (0–1)
}
```

`DndContext` accepts `autoScroll?: boolean | AutoScrollOptions`.

**How to restrict to x-axis only:** Set `threshold: { x: 0.2, y: 0 }`. The `getScrollDirectionAndSpeed` utility is called per-axis — when `threshold.y = 0` the vertical zone is zero-height, so the y-axis scroll condition is never satisfied. The default threshold is `{ x: 0.2, y: 0.2 }` (20% of container width/height from the edge). Setting `y: 0` eliminates vertical auto-scroll; `x: 0.2` keeps the 20%-from-edge horizontal trigger.

**Proposed DndContext change (minimal, single prop addition):**
```tsx
<DndContext
  sensors={sensors}
  collisionDetection={closestCorners}
  autoScroll={{ threshold: { x: 0.2, y: 0 } }}
  onDragStart={handleDragStart}
  onDragEnd={handleDragEnd}
>
```

This is a one-prop addition. The `overflow-x-auto` container at line 270 is already the correct scrollable ancestor — no ref wiring or `useRef` needed. Normal (non-drag) horizontal scroll via mouse/trackpad is unaffected because `autoScroll` only activates during an active drag session.

**No change to `KanbanColumn.tsx`** — the droppable `setNodeRef` target is the inner column body div, which has `overflow-y-auto` per card list. That container will also be discovered by the auto-scroller; the `threshold: { y: 0 }` constraint ensures it cannot scroll vertically either, which is correct.


### 6. Tests

#### Backend tests

`backend/src/services/__tests__/scheduleIsolation.phase23.test.ts` — tests board mutations (notes, comments, archive) leave schedule tables untouched. Does **not** test stage enumeration or auto-move.

`backend/src/services/__tests__/scheduleIsolation.phase24.test.ts` — tests auto-create-board-card-on-assignment leaves TeamMember/Absence/Holiday byte-identical. Does **not** test auto-move or stage enumeration.

No dedicated `boardService` unit test exists for `autoMoveCards()`. The auto-move logic is only tested indirectly through the POST `/cards/auto-move` route. **The plan must add a unit test for `autoMoveCards()` that verifies Stopped cards are not moved**, mirroring how the phase23 isolation suite verifies other invariants.

No dedicated backend route test exists for `StageEnum` validation. **The plan should add a route test asserting that `PATCH /cards/:id` with `stage: 'stopped'` succeeds (200) and with an invalid stage (e.g., `stage: 'nonexistent'`) returns 400.**

#### Frontend tests

`frontend/src/features/adapter/components/__tests__/MappingOverlayCard.test.tsx` — unrelated to board. This is the only frontend test file found.

No board-specific frontend tests exist. The plan does not need to add frontend unit tests to meet the phase's success criteria, but the `groupCardsByStage` function could be tested cheaply if desired.

#### E2E / Selenium

`e2e/` directory exists (from git status) but was not scanned (out of scope for this research). The UAT Selenium replay preference from memory applies: a Selenium replay script should be generated for UAT checkpoint actions.


## Relevant Patterns

- **Stage exclusion pattern** (`autoMoveCards` where clause): The existing `stage: { not: 'archived' }` at `boardService.ts:228` is the model. Extend to `stage: { notIn: ['archived', 'stopped'] }` — same idiom, one more value.
- **`stageLockedBy` auto-move bypass**: Any drag (PATCH with `stage` but no `stageLockedBy`) sets `stageLockedBy = userId` (board.ts:152–153), preventing auto-move override. This means once a user manually drags a card into Stopped, the card is also locked — double protection. The stage exclusion is still required as the primary guard (in case lock is reset).
- **`archived` column handling** (`Board.tsx:176–181`): `archived` is not in `BOARD_STAGES` and is appended to `visibleStages` only when `showArchived === true`. `stopped` does NOT follow this pattern — it is a normal always-visible column, so it belongs in `BOARD_STAGES` directly.
- **`Record<BoardStage, ...>` exhaustiveness**: Both `STAGE_LABELS` and the `groupCardsByStage` initializer are typed as `Record<BoardStage, ...>`. TypeScript enforces exhaustiveness — adding `'stopped'` to `BoardStage` without updating both will be a compile error, which the Lead will see immediately.


## Risks

- **`threshold: { y: 0 }` zero-height zone**: Confirmed from `getScrollDirectionAndSpeed` source that setting `y: 0` means the vertical trigger zone is zero pixels, suppressing vertical auto-scroll. This is the intended mechanism. Risk: low — it is the documented threshold behavior, and default `x: 0.2` is well-tested.
- **Scroll container detection**: @dnd-kit traverses up the DOM to find elements with scrollable overflow. The `overflow-x-auto` div at `Board.tsx:270` qualifies. However, `KanbanColumn`'s card-list div has `overflow-y-auto` (implicitly, from `flex-1 overflow-y-auto` pattern in the column body) — the auto-scroller may also detect that. The `y: 0` threshold eliminates any vertical scroll attempt on those inner containers. Risk: low.
- **`BOARD_STAGES` skeleton loop** (`Board.tsx:279`): During loading, the skeleton renders `BOARD_STAGES.map(...)`. Adding `'stopped'` to the front adds a 7th skeleton column, which is correct behavior. Risk: none.
- **`filteredCards` archived filter** (`Board.tsx:163`): `result = result.filter((card) => card.stage !== 'archived')` — this correctly passes `stopped` cards through. No change needed. Risk: none.
- **No DB migration side-effect**: Confirmed plain `String` field. Existing `dev.db` rows are unaffected; `stage='stopped'` can be written immediately after code deploy. Risk: none.
- **`useMoveCard` optimistic update** (`hooks.ts:84–96`): Casts `stage` to `BoardStage` using a type assertion. Once `'stopped'` is in `BoardStage`, moving a card to Stopped will be optimistically reflected in the cache. No additional logic needed.


## Recommendations

1. **All four frontend changes are in one file** (`types.ts` lines 9, 111, 113–120, 124–131). Make them atomically in that file to avoid a TS compile error mid-edit.
2. **Backend change spans two files**: `board.ts:16` (StageEnum) and `boardService.ts:228` (where clause). Both are single-line changes.
3. **Prisma schema**: one-line comment update at `schema.prisma:321`. No `prisma migrate` run needed.
4. **Auto-scroll**: one prop addition to `DndContext` at `Board.tsx:271`. Use `autoScroll={{ threshold: { x: 0.2, y: 0 } }}` — no sensor changes, no ref plumbing.
5. **Add a `boardService` unit test** for `autoMoveCards()` asserting that a card with `stage='stopped'` and `stageLockedBy=null` is NOT moved. Place alongside the phase23/24 isolation tests at `backend/src/services/__tests__/`.
6. **Add a backend route validation test** (or extend an existing test file) asserting `stage: 'stopped'` is accepted by `StageEnum` and `stage: 'invalid'` returns 400.

### Change-site summary table

| File | Location | Change |
|------|----------|--------|
| `frontend/src/features/board/types.ts` | line 9 | add `'stopped'` to `BoardStage` union |
| `frontend/src/features/board/types.ts` | line 111 | front-insert `'stopped'` into `BOARD_STAGES` |
| `frontend/src/features/board/types.ts` | line 113 | add `stopped: 'Stopped'` to `STAGE_LABELS` |
| `frontend/src/features/board/types.ts` | line 124 | add `stopped: []` to `groupCardsByStage` initializer |
| `frontend/src/routes/Board.tsx` | line 271 | add `autoScroll={{ threshold: { x: 0.2, y: 0 } }}` to `DndContext` |
| `backend/src/routes/board.ts` | line 16 | add `'stopped'` to `StageEnum` z.enum tuple |
| `backend/src/services/boardService.ts` | line 228 | change `stage: { not: 'archived' }` to `stage: { notIn: ['archived', 'stopped'] }` |
| `backend/prisma/schema.prisma` | line 321 | update valid-values comment to include `stopped` (first) |
