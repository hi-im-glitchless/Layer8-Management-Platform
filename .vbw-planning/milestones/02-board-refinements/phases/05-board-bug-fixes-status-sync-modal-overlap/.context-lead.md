## Phase 5 Context (Compiled)

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
Fix two board bugs. (1) A project's status edited on the Schedule does not propagate to the board (planner) — root cause is `projectService.upsertByKey` being create-only (it returns the existing Project without updating its status), compounded by the KanbanCard memo comparator omitting `project.status` and `useUpdateAssignment` not invalidating the board query. (2) In the card detail modal, the close (✕) button and the "manually placed" pin icon overlap in the top-right corner.

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
phase: "05"
title: "Board Bug Fixes — Status Sync & Modal Overlap"
type: research
confidence: high
date: 2026-06-03
---

## Findings

### Bug 1 — Status name not synced from Schedule to Planner (board)

#### Where the board card shows status

`frontend/src/features/board/components/KanbanCard.tsx` line 128–131:
```tsx
{card.project.status && (
  <div className="flex items-center min-w-0">
    <StatusBadge status={card.project.status} />
```

`card.project.status` comes from the `BoardCard` → `Project` relation. The board query key is `['board', 'cards']` (plus optional filter object or a specific id). `boardApi.getCards()` calls `GET /api/board/cards`, which calls `boardService.listCards()`. That service does a `prisma.boardCard.findMany({ include: { project: ... } })` and returns `card.project.status` directly from the `Project` table (`backend/src/services/boardService.ts` lines 91–131). The detail modal uses `useBoardCard(id)` with key `['board', 'cards', id]`, which calls `boardService.getCard(id)` — also reads `Project.status` from the DB.

#### Where status is updated on the schedule

The user edits status via the `AssignmentModal` (`frontend/src/features/schedule/components/AssignmentModal.tsx` lines 169, 408–424). On save, `handleSave()` (line 242) calls `upsertMutation.mutate(result.data)`, which is `useUpsertAssignment()` from schedule hooks. This calls `scheduleApi.upsertAssignment()` → `POST /api/schedule/assignments` → `assignmentService.upsertAssignment()`.

**What `status` the schedule edits:** The schedule edits `Assignment.status` (the field on the `Assignment` row, schema line 193: `status String @default("placeholder")`). This is a per-assignment, per-week field. It is **also** what the board reads — but indirectly through `Project.status`.

#### The data-model chain that should propagate status

`assignmentService.upsertAssignment()` writes `data.status` to `Assignment.status`, then calls `linkProjectsForAssignment(result.id)` (line 260). That function (`backend/src/services/assignmentService.ts` lines 100–149) calls `upsertProjectByKey({ ..., status: a.status })` from `projectService.ts`.

**Critical finding — `upsertByKey` never updates an existing Project's status:**

`backend/src/services/projectService.ts` lines 64–71:
```ts
const existing = await prisma.project.findFirst({
  where: { name, clientId: opts.clientId, tags: tagsJson },
});
if (existing) return existing;   // <-- early return, status change is DROPPED
```

When a Project already exists (i.e., for every status edit on an existing assignment), `upsertByKey` finds the existing row and **returns immediately without updating `Project.status`**. The new status value passed in `opts.status` is silently discarded. Only on the very first creation of a Project is the status written. All subsequent status changes from the schedule never propagate to `Project.status`, and therefore never appear on the board card.

#### Cache invalidation audit

`useUpsertAssignment()` in `frontend/src/features/schedule/hooks.ts` lines 122–135:
```ts
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments'] })
  // Phase 24-R02: ...
  queryClient.invalidateQueries({ queryKey: ['board', 'cards'] })
},
```
`useUpsertAssignment` DOES invalidate `['board', 'cards']`. So the board WILL refetch after a schedule upsert. However, since `Project.status` in the DB was never updated (see above), the refetch returns the stale status. This means the cache invalidation is working correctly — the problem is upstream of it.

`useUpdateAssignment()` in `frontend/src/features/schedule/hooks.ts` lines 137–148:
```ts
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments'] })
  // NO board invalidation here
},
```
`useUpdateAssignment` does NOT invalidate `['board', 'cards']`. However, `AssignmentModal.handleSave()` always uses `upsertMutation` (i.e., `useUpsertAssignment`), not `useUpdateAssignment`. The modal path is unambiguous: it always calls upsert. `useUpdateAssignment` is a separate hook used for other operations. This is a secondary gap, not the primary cause.

#### Summary of the data-flow gap

```
Schedule modal save (status → "confirmed")
  → Assignment.status = "confirmed"  [written ✓]
  → linkProjectsForAssignment()
    → upsertProjectByKey({ status: "confirmed" })
      → project findFirst → existing found → return existing  [status write SKIPPED]
  → Project.status unchanged in DB
  → board refetch (via ['board','cards'] invalidation)
  → boardCard.project.status still shows old value
```

#### Additional defect — KanbanCard memo comparator

`frontend/src/features/board/components/KanbanCard.tsx` lines 172–182, the custom `memo` comparator checks:
- `card.id`, `card.stage`, `card.checklist`, `card.stageLockedBy`
- `card.project.name`
- `card.assignments` (avatar URLs)
- `isDragOverlay`, `onCardClick`

It does **not** check `card.project.status`. This means that even if `Project.status` were correctly updated in the DB and the board cache were invalidated, the `KanbanCard` component would not re-render because the memo comparator treats the old and new props as equal. This is an independent secondary bug layered on top of the primary DB write gap.

---

### Bug 2 — Card modal close (X) button and "manually placed" pin icon overlap

#### The close button

`frontend/src/components/ui/dialog.tsx` lines 44–48 (inside `DialogContent`):
```tsx
<DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ...">
  <X className="h-4 w-4" />
```
The shadcn `DialogContent` primitive hard-codes the ✕ close button at `absolute right-4 top-4`. This is appended as the last child inside `DialogPrimitive.Content`, after `{children}`.

#### The pin icon

`frontend/src/features/board/components/CardDetailModal.tsx` lines 486–506 (inside `DialogHeader > DialogTitle`):
```tsx
<DialogTitle className="flex items-center gap-2">
  <span className="flex-1">
    {project.name || '(No project)'}
  </span>
  {isManuallyPlaced && onResetAutoMove && (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => onResetAutoMove(card.id)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <Pin className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      ...
    </Tooltip>
  )}
</DialogTitle>
```

`DialogTitle` uses `DialogPrimitive.Title`, styled with `text-lg font-semibold leading-none tracking-tight` (`dialog.tsx` lines 83–94). `DialogHeader` is a flex-column div with `space-y-1.5` (`dialog.tsx` lines 54–65). The modal's `DialogContent` has `p-6` padding, so `DialogHeader` sits at `top-6` from the content edge.

The shadcn `DialogContent` uses `grid gap-4` layout for its children (the `grid` class in `dialog.tsx` line 39). The close ✕ button is positioned `absolute right-4 top-4` — that is 16px from the right edge and 16px from the top of the `DialogPrimitive.Content` box.

`DialogHeader` (which contains the title + pin) is the first grid child inside the content with `p-6` padding applied to the content box. So `DialogHeader` begins at `top-6` (24px) inset from content. The pin button sits at the right end of the `DialogTitle` flex row, which is itself inside `DialogHeader`. The pin icon renders somewhere around `top-6, right-8` (24px top + title height positioning, ~32px from right because of the title flex row).

The ✕ close button at `absolute right-4 top-4` (16px from top, 16px from right) and the pin button at ~`top-6, right-8` (within the normal flow of the title row at ~`top-6`) are close enough in the top-right corner to overlap visually. The ✕ button is absolutely positioned on top of everything at `top-4 right-4`, while the pin icon (in normal flow) ends up at approximately the same coordinates — both are h-4 w-4 icons with ~16px from the right edge. The ✕ is at `top-4` (16px) and the title row with the pin is at roughly `top-6` (24px) to `top-8` (32px) depending on line height, putting them within ~8–16px of each other in both axes. Given that each element is ~16–20px tall, the overlap is real.

#### Color accent bar interaction

`CardDetailModal.tsx` lines 482–485:
```tsx
<div
  className="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
  style={{ backgroundColor: project.color }}
/>
```
This h-1 bar at `top-0` is above the ✕ button (which is at `top-4`), so it does not cause overlap — but it does push the effective top of content down visually, making the ✕ button overlap with the pin icon even more noticeable.

---

## Bug 1 Verdict

**This is a data-model write gap**, not a cache-invalidation bug.

The schedule modal's upsert path writes `Assignment.status` but the subsequent `linkProjectsForAssignment → upsertProjectByKey` call never updates `Project.status` because `upsertByKey` returns early on existing projects (`projectService.ts` line 70–71: `if (existing) return existing`). The board reads `Project.status`; the schedule effectively only writes `Assignment.status`. After first project creation the two values are permanently decoupled unless the assignment is re-created from scratch.

There are **two defects that must both be fixed**:

**Primary fix (backend):** `upsertByKey` in `backend/src/services/projectService.ts` must update `Project.status` (and `Project.color`) when the project already exists and the incoming values differ — rather than returning the stale row immediately. The correct pattern is an upsert (findFirst → update-if-exists; or a Prisma `upsert` using the identity triple). Specifically, change the `if (existing) return existing` early return to an `update({ data: { status, color } })` when either value changed. This is a backend-only change.

**Secondary fix (frontend):** The `KanbanCard` custom memo comparator (`KanbanCard.tsx` lines 172–182) must add `prev.card.project.status === next.card.project.status` to prevent stale renders even when the board cache correctly receives updated data.

Neither fix touches schedule tables from the board — `projectService.upsertByKey` is called from `assignmentService` (schedule domain); the board remains read-only against the `Project` table. The SCHEDULE-ISOLATION INVARIANT is not violated.

Cache invalidation for the primary path (`useUpsertAssignment` → `invalidateQueries(['board','cards'])`) is already wired. Once the DB write is fixed, the existing invalidation will propagate the correct value. However, `useUpdateAssignment` (a separate code path) also does NOT invalidate `['board', 'cards']` — this is an independent secondary gap that should also be addressed.

---

## Bug 2 Verdict

**This is a CSS positioning conflict** — both the shadcn `DialogPrimitive.Close` button (hardcoded `absolute right-4 top-4` in `dialog.tsx` line 45) and the pin icon button (rendered in the normal flow of `DialogTitle` at the far right of a `flex items-center gap-2` row) end up occupying the same top-right corner of the modal.

**Smallest correct fix:** Add `pr-8` (or `pr-10` for breathing room) to the `DialogTitle`'s class in `CardDetailModal.tsx` line 487, so the flex row's right end clears the ✕ button:

```tsx
<DialogTitle className="flex items-center gap-2 pr-8">
```

This pushes the pin icon 32px away from the right edge, safely below the ✕ button at `right-4` (16px). The alternative — moving the pin below the title — is also viable but changes the visual hierarchy more. Adding `pr-8` to `DialogTitle` is the least invasive option and is consistent with how other shadcn-based dialogs handle content near the absolute close button. No backend changes needed.

---

## Relevant Patterns

- **`upsertByKey` create-only semantics (projectService.ts:64–71):** The function was designed only to find-or-create Projects. It intentionally returns the existing row on find, making it a NOOP on update. This was fine for Phase 24-R03's initial creation flow but was never extended to handle field drift when the schedule edits status/color on an already-existing project.
- **Cross-feature invalidation precedent (schedule/hooks.ts:131):** `useUpsertAssignment` already cross-invalidates `['board','cards']`. Phase 24-R02 comment documents the rationale. `useUpdateAssignment` lacks the same wiring — the Phase 24 annotation explicitly calls it out for upsert only.
- **Custom memo comparator in KanbanCard:** The comparator was added to prevent unnecessary re-renders during drag operations. It checks 8 fields but missed `project.status`, `project.color`, and `project.client.name` — any of these could silently stale the card display even when the query cache is fresh.
- **Dialog primitive close button position (dialog.tsx:45):** The shadcn `DialogContent` always renders the ✕ at `absolute right-4 top-4`. Any UI placed in the top-right of `DialogHeader` / `DialogTitle` must clear this space using right padding on the title.

---

## Risks

- **Bug 1 backend fix — multiple assignments sharing a Project:** When `upsertByKey` is upgraded to update-on-found, a status change from one assignment may update the shared `Project.status` for all assignments linking to the same project (multi-pentester or multi-week engagements). This is the correct semantics — all pentesters on the same project share one board card — but stakeholders should be aware that the "last editor wins" on status. The fix must use `{ status: opts.status }` in the update, not a merge strategy.
- **Bug 1 — `useUpdateAssignment` gap:** If any future code path uses `useUpdateAssignment` to change status (rather than `useUpsertAssignment`), the board cache still won't be invalidated. This should be patched in the same fix cycle.
- **Bug 2 — dialog.tsx is a shared primitive:** Adding `pr-8` to `DialogTitle` in `CardDetailModal.tsx` only affects the board modal. It does not change the shared `dialog.tsx` primitive. Other dialogs with content in the title area (e.g., `AssignmentModal`) have their own title rows and are not affected.
- **KanbanCard memo comparator — other missing fields:** Besides `project.status`, the comparator also omits `project.color` and `project.client?.name`. These are lower-priority but should be noted for a complete correctness pass.

---

## Recommendations

### Bug 1 (Status sync) — Frontend-only? No. Backend required.

**Fix 1A (backend, primary — `backend/src/services/projectService.ts`):** Modify `upsertByKey` to update `status` and `color` on the existing project when found, instead of returning it unchanged. Minimal change:

```ts
if (existing) {
  // Status or color may have drifted — keep Project in sync.
  if (existing.status !== opts.status || existing.color !== opts.color) {
    return prisma.project.update({
      where: { id: existing.id },
      data: { status: opts.status, color: opts.color },
    })
  }
  return existing
}
```

**Fix 1B (frontend, secondary — `frontend/src/features/board/components/KanbanCard.tsx`):** Add `project.status` (and optionally `project.color`) to the memo comparator:

```ts
prev.card.project.status === next.card.project.status &&
prev.card.project.color === next.card.project.color &&
```
Insert after line 177 (`prev.card.project.name === next.card.project.name &&`).

**Fix 1C (frontend, secondary — `frontend/src/features/schedule/hooks.ts`):** Add board invalidation to `useUpdateAssignment.onSuccess` (line 144), mirroring the existing pattern from `useUpsertAssignment`:

```ts
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments'] })
  queryClient.invalidateQueries({ queryKey: ['board', 'cards'] })  // add
},
```

Fix 1A is the root-cause fix and is required. Fixes 1B and 1C are hardening fixes that should be in the same task.

### Bug 2 (Modal overlap) — Frontend-only. No backend changes.

**Fix 2 (`frontend/src/features/board/components/CardDetailModal.tsx` line 487):** Add `pr-8` to `DialogTitle` className:

```tsx
<DialogTitle className="flex items-center gap-2 pr-8">
```

This is a single-line CSS fix. It clears the shadcn ✕ button's 16px right position with 32px of padding on the title row, ensuring the pin icon (rightmost flex child) never overlaps the close button.
