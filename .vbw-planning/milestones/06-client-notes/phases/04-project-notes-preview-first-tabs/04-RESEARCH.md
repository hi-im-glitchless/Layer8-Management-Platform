---
phase: 04
kind: phase-research
grounded_in: direct code inspection (orchestrator read NotesEditor.tsx + both consumers)
---

# Phase 04 Research — Project-Notes Preview-First Tabs

## Change requested

The **project notes** editor on planner cards currently shows tabs as **Edit → Preview** and opens on **Edit**. The user wants the opposite for project notes only: tabs render **Preview → Edit** and the editor **opens on Preview** (click Edit to modify). The client-notes page editor must be left as-is (Edit-first).

## Where the tabs live (single shared component)

`frontend/src/components/NotesEditor.tsx`:
- **L86:** `const [tab, setTab] = useState<'edit' | 'preview'>('edit')` — initial/default tab is hardcoded to `'edit'`.
- **L100:** on a resolved `onSave`, `setTab('preview')` (switch to Preview after a successful save).
- **L108–L127:** `<Tabs value={tab} …>` with `<TabsList>` triggers in order `Edit` (L110) then `Preview` (L111); `<TabsContent value="edit">` (L113) then `<TabsContent value="preview">` (L121).

## Consumers (only ONE is in scope)

- `frontend/src/features/board/components/CardDetailModal.tsx` — the **project notes** editor on a planner card. **← IN SCOPE (change to Preview-first + Preview-default).**
- `frontend/src/features/schedule/components/ClientNotesModal.tsx` — the **client-notes page** editor. **← OUT OF SCOPE (must stay Edit-first / Edit-default).**

Because both consume the same `NotesEditor`, the behavior must be **prop-driven**, not a blanket change to the component's defaults.

## Not affected

The read-only client-notes section on the planner card (Phase 03) renders via the exported `NotesPreview` and has **no tabs** — it is unrelated to this change.

## Suggested approach (advisory — finalize in planning)

Add an optional prop to `NotesEditor`, e.g. `previewFirst?: boolean` (default `false`, preserving today's behavior):
- When `false` (default, used by `ClientNotesModal`): unchanged — TabsList `Edit, Preview`, initial tab `'edit'`.
- When `true` (passed by `CardDetailModal`): TabsList renders `Preview` trigger before `Edit`, and the initial `useState` tab is `'preview'`.
- The save-on-success `setTab('preview')` (L100) stays as-is under both modes (landing on Preview after save remains sensible).

## Tests to touch / add

- `frontend/src/components/__tests__/NotesEditor.test.tsx` (7 existing cases): the **default (no prop)** cases must still prove Edit-first / Edit-default (regression guard for the client-notes editor). Add case(s) for `previewFirst`: Preview trigger rendered first AND editor opens on the Preview tab.
- `frontend/src/features/board/components/__tests__/CardDetailModal.test.tsx`: the project-notes editor now opens on Preview (Preview-first).

## Constraints

- Keep the hardened `SANITIZE_SCHEMA` and the single `NotesPreview` render path byte-for-byte unchanged.
- No backend changes. Frontend-only.
