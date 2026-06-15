## Phase 01 Context

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

### Conventions
- [null] Backend files use camelCase, frontend components use PascalCase, Python uses snake_case
- [null] Use @/ import alias for src directory in both backend and frontend
- [null] Feature modules follow features/{domain}/api.ts + hooks.ts pattern
- [null] Routes delegate to service layer; no business logic in route handlers
- [null] Zod validation at all boundaries (env config, route input, form schemas)
- [null] TanStack Query for all server state management; no manual fetch calls
- [null] Pydantic models for all FastAPI request/response schemas
- [null] Commit format: {type}({scope}): {description}

### Codebase Map Available
Codebase mapping exists in `.vbw-planning/codebase/`. Key files:
- `ARCHITECTURE.md`
- `CONCERNS.md`
- `PATTERNS.md`
- `DEPENDENCIES.md`
- `STRUCTURE.md`
- `CONVENTIONS.md`
- `TESTING.md`
- `STACK.md`

Read CONVENTIONS.md, PATTERNS.md, STRUCTURE.md, and DEPENDENCIES.md first to bootstrap codebase understanding.

### Changed Files (Delta)
- `.vbw-planning/.notification-log.jsonl`
- `.vbw-planning/.session-log.jsonl`
- `.vbw-planning/STATE.md`

### Code Slices

#### `.vbw-planning/.notification-log.jsonl` (3048 lines, first 30 shown)
```
{
  "timestamp": "2026-02-12T18:21:21Z",
  "type": "permission_prompt",
  "title": "",
  "message": "Claude Code needs your attention"
}
{
  "timestamp": "2026-02-12T18:29:54Z",
  "type": "permission_prompt",
  "title": "",
  "message": "Claude Code needs your attention"
}
{
  "timestamp": "2026-02-12T18:43:36Z",
  "type": "idle_prompt",
  "title": "",
  "message": "Claude is waiting for your input"
}
{
  "timestamp": "2026-02-12T18:46:56Z",
  "type": "idle_prompt",
  "title": "",
  "message": "Claude is waiting for your input"
}
{
  "timestamp": "2026-02-12T20:10:27Z",
  "type": "idle_prompt",
  "title": "",
  "message": "Claude is waiting for your input"
}
```

#### `.vbw-planning/.session-log.jsonl` (10395 lines, first 30 shown)
```
{
  "timestamp": "2026-02-12T18:24:29Z",
  "duration_ms": 0,
  "cost_usd": 0,
  "tokens_in": 0,
  "tokens_out": 0,
  "model": "unknown",
  "branch": "master"
}
{
  "timestamp": "2026-02-12T18:24:29Z",
  "type": "cost_summary",
  "costs": {
    "other": 587
  }
}
{
  "timestamp": "2026-02-12T18:24:36Z",
  "duration_ms": 0,
  "cost_usd": 0,
  "tokens_in": 0,
  "tokens_out": 0,
  "model": "unknown",
  "branch": "master"
}
{
  "timestamp": "2026-02-12T18:24:36Z",
  "type": "cost_summary",
  "costs": {
    "other": 9
```

#### `.vbw-planning/STATE.md` (44 lines)
```
# State

**Project:** Template AI Engine (Layer8)
**Milestone:** Board Refinements

## Current Phase
Phase: 1 of 3 (Board Stopped Column Horizontal Drag Auto Scroll)
Plans: 0/1
Progress: 0%
Status: Planned (not yet executed)

## Phase Status
- **Phase 1 (Board Stopped Column Horizontal Drag Auto Scroll):** Planned
- **Phase 2 (Archive Without Typed Project Name Confirmation):** Pending
- **Phase 3 (File Download Permission Fix):** Pending

## Key Decisions
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

## Todos
- [SIDE-FINDING] ArchiveCardDialog has empty-projectName UX edge case — when a card has no linked schedule assignment, the typed-confirmation target is empty string and the user has no visible name to type. Recommend disabling Archive when no project, or using a literal "DELETE" sentinel. (Surfaced in Phase 23 UAT R01, P05-T2; not blocking — typical cards have project names. See remediation/uat/round-01/R01-UAT.md.)
- [KNOWN-ISSUE] scheduleIsolation.phase23.test.ts (6/6) (backend/src/services/__tests__/scheduleIsolation.phase23.test.ts): better-sqlite3 NODE_MODULE_VERSION mismatch when run with Node v22.22.2 (comp... — accepted as process-exception for this phase (phase 23, seen 1x) (see remediation/qa/round-02/R02-SUMMARY.md) (added 2026-05-07) (ref:013d20be)
- [KNOWN-ISSUE] scheduleIsolation.phase23 (concurrent run) (backend/src/services/__tests__/scheduleIsolation.phase23.test.ts): 4/6 tests fail when run concurrently with scheduleIsolation.phase24.test.ts d... (phase 24, seen 1x) (see 24-VERIFICATION.md) (added 2026-05-07) (ref:115b175a)
- [KNOWN-ISSUE] scheduleIsolation.phase23 (concurrent run) (backend/src/services/__tests__/scheduleIsolation.phase23.test.ts): 4/6 tests fail when run concurrently with scheduleIsolation.phase24.test.ts d... — accepted as process-exception for this phase (phase 24, seen 2x) (see remediation/qa/round-01/R01-SUMMARY.md) (added 2026-06-03) (ref:b990eb11)
- [UAT-DEVIATION] R01: None — documentation-only plan-amendment; no product code touched. (phase 22, see remediation/qa/round-01/R01-SUMMARY.md) (added 2026-05-29) (ref:572f43e0)
- [UAT-DEVIATION] R01: None — documentation-only plan-amendment; `git diff` of `frontend/` and `backend/` is empty. (phase 22, see remediation/qa/round-01/R01-SUMMARY.md) (added 2026-05-30) (ref:8b751374)
- [KNOWN-ISSUE] scheduleIsolation.phase23 (concurrent run) (backend/src/services/__tests__/scheduleIsolation.phase23.test.ts): 4/6 tests fail when run concurrently with scheduleIsolation.phase24.test.ts d... (phase 24, seen 1x) (see 24-VERIFICATION.md) (added 2026-06-03) (ref:77b1f849)

## Blockers
None

## Activity Log
- 2026-06-03: Created Board Refinements milestone (3 phases)
```

### Active Plan
---
phase: 1
plan: "01-01"
title: Stopped Column & Horizontal Drag Auto-Scroll
type: execute
wave: 1
depends_on: []
cross_phase_deps: []
autonomous: true
effort_override: balanced
skills_used: []
files_modified:
  - frontend/src/features/board/types.ts
  - frontend/src/routes/Board.tsx
  - backend/src/routes/board.ts
  - backend/src/services/boardService.ts
  - backend/prisma/schema.prisma
  - backend/src/services/__tests__/boardAutoMove.stopped.test.ts
forbidden_commands:
  - prisma migrate
  - prisma db push
  - prisma migrate dev
  - prisma migrate reset
must_haves:
  truths:
    - "'stopped' is a member of BoardStage and the FIRST entry of BOARD_STAGES (display order: stopped, upcoming, preparation, execution, closing, done)."
    - "Stopped is an always-visible normal column (in BOARD_STAGES), NOT toggle-gated like archived."
    - "Backend StageEnum accepts 'stopped'; PATCH /cards/:id with stage='stopped' validates; an invalid stage returns 400."
    - "autoMoveCards() never moves a card with stage='stopped' (excluded by where clause), and never moves a card TO 'stopped'."
    - "DndContext horizontal-only auto-scroll: threshold {x:0.2,y:0}; vertical auto-scroll suppressed; normal (non-drag) horizontal scroll unaffected."
    - "NO Prisma migration is created or run; schema.prisma change is the valid-values comment only."
    - "Schedule isolation preserved: no reads-as-writes or writes to Assignment/TeamMember/Absence/Holiday from any board code touched here."
  artifacts:
    - path: "frontend/src/features/board/types.ts"
      provides: "Stopped stage in the frontend stage model"
      contains: "'stopped'"
    - path: "backend/src/routes/board.ts"
      provides: "Stopped accepted by stage validation"
      contains: "stopped"
    - path: "backend/src/services/boardService.ts"
      provides: "Auto-move excludes Stopped (and archived) cards"
      contains: "notIn: ['archived', 'stopped']"
    - path: "frontend/src/routes/Board.tsx"
      provides: "Horizontal-only drag auto-scroll on DndContext"
      contains: "threshold: { x: 0.2, y: 0 }"
    - path: "backend/prisma/schema.prisma"
      provides: "Updated stage valid-values doc comment (no migration)"
      contains: "stopped"
    - path: "backend/src/services/__tests__/boardAutoMove.stopped.test.ts"
      provides: "Regression test that autoMoveCards skips Stopped cards"
      contains: "autoMoveCards"
  key_links:
    - from: "frontend/src/features/board/types.ts BoardStage"
      to: "backend/src/routes/board.ts StageEnum"
      via: "both enumerate the same 7 stage values including 'stopped'"
    - from: "backend/src/services/boardService.ts autoMoveCards where clause"
      to: "backend/src/services/__tests__/boardAutoMove.stopped.test.ts"
      via: "test asserts the 'stopped' exclusion holds"
---
<objective>
Add a new always-visible 'Stopped' board stage (FIRST in display order) and enable
horizontal-only drag auto-scroll. Wire 'stopped' consistently through the frontend
stage model, backend stage validation, and the date-based auto-mover (which must
never touch a Stopped card). The stage column is a plain Prisma String — NO DB
migration. Constrain DndContext autoScroll to the x-axis so dragging near the
board's left/right edge scrolls the existing overflow-x-auto container.
NON-NEGOTIABLE: no writes/reads-as-writes to Assignment/TeamMember/Absence/Holiday.
</objective>
<context>
@.vbw-planning/phases/01-board-stopped-column-horizontal-drag-auto-scroll/01-RESEARCH.md
@.vbw-planning/phases/01-board-stopped-column-horizontal-drag-auto-scroll/01-CONTEXT.md
Research (high confidence) confirms exact change sites with line numbers. Trust it.
@dnd-kit/core ^6.3.x is installed; DndContext accepts autoScroll?: boolean | AutoScrollOptions.
Backend tests: `vitest run` (backend `npm test`), run against the dev DB; mirror the
seed/try-finally cleanup style of scheduleIsolation.phase23/24 tests.
Build/typecheck: frontend `tsc -b && vite build`; backend `tsc`.
</context>
<tasks>
<task type="auto">
  <name>Backend: add 'stopped' to stage validation, auto-move exclusion, schema comment</name>
  <files>
    backend/src/routes/board.ts
    backend/src/services/boardService.ts
    backend/prisma/schema.prisma
  </files>
  <action>
1. board.ts (~line 16): add 'stopped' to the `StageEnum = z.enum([...])` tuple. This
   single constant covers both the GET /cards filter and the PATCH /cards/:id body.
   Do NOT add any 'stopped'-specific permission guard — any user may move a card to
   Stopped (the line 127 `data.stage === 'archived'` manager guard stays as-is).
2. boardService.ts (~line 228, autoMoveCards where clause): change
   `stage: { not: 'archived' }` to `stage: { notIn: ['archived', 'stopped'] }`.
   This is the primary guard so the auto-mover never reasons about a Stopped card,
   independent of stageLockedBy. Do NOT change targetStage logic (it only ever sets
   'upcoming'/'preparation', never 'stopped'). Do NOT touch any Assignment/TeamMember/
   Absence/Holiday access — the include block (primaryAssignments/splitAssignments
   select weekStart) is read-only and unchanged.
3. schema.prisma (~line 321): update the BoardCard.stage doc comment ONLY to:
   `/// Valid values: stopped | upcoming | preparation | execution | closing | done | archived`.
   stage stays `String @default("upcoming")`. Do NOT run prisma migrate / db push —
   no migration is needed for a plain String column.
  </action>
  <verify>
- grep `notIn: ['archived', 'stopped']` in boardService.ts; grep `stopped` in board.ts StageEnum.
- Confirm NO new file under backend/prisma/migrations/ was created (git status clean there).
- backend `npm run build` (tsc) passes; check LSP diagnostics on the two edited .ts files.
- Confirm no Assignment/TeamMember/Absence/Holiday write was added.
  </verify>
  <done>
StageEnum includes 'stopped'; autoMoveCards where clause uses notIn ['archived','stopped'];
schema comment updated with no migration; tsc passes; no schedule-table writes introduced.
  </done>
</task>
<task type="auto">
  <name>Frontend: add 'stopped' to the stage model (types.ts)</name>
  <files>
    frontend/src/features/board/types.ts
  </files>
  <action>
Make all four edits atomically in types.ts to avoid a mid-edit TS compile error
(STAGE_LABELS and groupCardsByStage are Record<BoardStage,...> and enforce exhaustiveness):
1. ~line 9: add 'stopped' to the `BoardStage` union.
2. ~line 111: front-insert 'stopped' so
   `BOARD_STAGES = ['stopped','upcoming','preparation','execution','closing','done'] as const`.
   (Stopped is a normal always-visible column — it belongs in BOARD_STAGES, NOT appended
   conditionally like 'archived'.)
3. ~line 113: add `stopped: 'Stopped'` to `STAGE_LABELS`.
4. ~line 124: add `stopped: []` to the `groupCardsByStage` initializer object.
No changes needed in Board.tsx for the column itself (it renders BOARD_STAGES),
KanbanColumn.tsx, KanbanCard.tsx, BoardFilters.tsx, or hooks.ts — confirmed by research.
  </action>
  <verify>
- grep `'stopped'` and `stopped:` in types.ts (4 sites).
- frontend `npm run build` (tsc -b && vite build) passes — exhaustiveness compile-checks
  STAGE_LABELS and groupCardsByStage. Check LSP diagnostics on types.ts.
  </verify>
  <done>
BoardStage, BOARD_STAGES (stopped first), STAGE_LABELS, and groupCardsByStage all
include 'stopped'; frontend typecheck/build passes.
  </done>
</task>
<task type="auto">
  <name>Frontend: horizontal-only drag auto-scroll on DndContext</name>
  <files>
    frontend/src/routes/Board.tsx
  </files>
  <action>
On the `<DndContext>` (~line 271, the one with sensors/collisionDetection/onDragStart/
onDragEnd wrapping the `overflow-x-auto` board container), add the prop
`autoScroll={{ threshold: { x: 0.2, y: 0 } }}`. The y:0 zero-height zone suppresses
vertical auto-scroll (including on KanbanColumn's inner overflow-y-auto card lists);
x:0.2 keeps the 20%-from-edge horizontal trigger on the existing overflow-x-auto
ancestor. No ref/useRef wiring, no sensor changes, no KanbanColumn change. Normal
non-drag scroll is unaffected because autoScroll only runs during an active drag.
  </action>
  <verify>
- grep `threshold: { x: 0.2, y: 0 }` in Board.tsx.
- frontend `npm run build` passes; LSP diagnostics clean on Board.tsx.
- Manual/UAT (later): drag a card to the right/left edge → board scrolls horizontally;
  dragging up/down does not auto-scroll; trackpad/mouse horizontal scroll still works.
  </verify>
  <done>
DndContext has autoScroll={{ threshold: { x: 0.2, y: 0 } }}; build passes.
  </done>
</task>
<task type="auto">
  <name>Backend test: auto-mover skips Stopped cards</name>
  <files>
    backend/src/services/__tests__/boardAutoMove.stopped.test.ts
  </files>
  <action>
Add a vitest unit test for autoMoveCards() (no existing dedicated test). Seed against
the dev DB in the seed/try-finally style of scheduleIsolation.phase23/24 tests
(unique-suffix ids, full cleanup in finally). Create a project + a board card with
stage='stopped' and stageLockedBy=null, plus an assignment whose weekStart would
otherwise qualify the card to auto-move (e.g. earliest week == next Monday → would
normally move to 'preparation'). Call autoMoveCards(), then assert the seeded card's
stage is STILL 'stopped' (re-read the row). Cleanup must delete only the rows this
test seeded. Do NOT assert on or mutate Assignment/TeamMember/Absence/Holiday beyond
the minimal read-fixtures the board query needs; this test must not weaken schedule
isolation. Optionally include a control card (non-stopped, qualifying) that DOES move,
to prove the test would catch a regression — keep it scoped to seeded ids.
  </action>
  <verify>
- backend `npm test` runs and the new file passes (`autoMoveCards` skips Stopped).
- Re-run leaves no orphan seed rows (cleanup in finally).
- tsc build passes.
  </verify>
  <done>
boardAutoMove.stopped.test.ts asserts a stage='stopped' card is unmoved by
autoMoveCards(); suite green; no leftover seed rows.
  </done>
</task>
</tasks>
<verification>
1. backend `npm run build` (tsc) and `npm test` pass; new boardAutoMove.stopped.test.ts green.
2. frontend `npm run build` (tsc -b && vite build) passes — exhaustiveness checks satisfied.
3. grep confirms: types.ts has 'stopped' in 4 sites with BOARD_STAGES front-inserted;
   board.ts StageEnum has 'stopped'; boardService.ts where uses notIn ['archived','stopped'];
   Board.tsx DndContext has threshold {x:0.2,y:0}; schema.prisma comment updated.
4. NO new directory/file under backend/prisma/migrations/ — confirm via git status.
5. No write or reads-as-write to Assignment/TeamMember/Absence/Holiday in any edited file.
6. LSP diagnostics clean on all edited .ts/.tsx files.
</verification>
<success_criteria>
- 'Stopped' renders as the first, always-visible board column (Stopped → Upcoming →
  Preparation → Execution → Closing → Done), with cards draggable in and out manually.
- Backend accepts stage='stopped' (PATCH 200) and rejects unknown stages (400).
- Date-based auto-move never moves a Stopped card and never moves a card to Stopped,
  verified by a passing unit test.
- Dragging a card near the board's left/right edge auto-scrolls horizontally only;
  vertical auto-scroll is off; normal horizontal scroll still works.
- No DB migration created/run; schedule isolation preserved.
</success_criteria>
<output>
01-01-SUMMARY.md
</output>

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
