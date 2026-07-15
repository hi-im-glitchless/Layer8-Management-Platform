## Phase 04 Context (Compiled)

### Milestone Scope Context

Gathered: 2026-07-10
Calibration: builder

## Scope Boundary

Add a "Client Notes" feature. A new `Client Notes` tab under the `Tools` sidebar group, accessible only to Admins and Project Managers, listing all clients. Clicking a client opens a modal showing the client's info and its notes, which can be edited and previewed exactly as project notes are in the planner today. Those client notes then appear on planner cards, above the existing project notes, showing the notes of the client that the card's project belongs to. On the card, client notes are read-only for everyone.

## Decomposition Decisions

### Phase Count & Grouping

Four phases. Phases 1–3 deliver the Client Notes feature; Phase 4 is a follow-on UX refinement added after Phases 1–3 shipped and passed UAT (2026-07-15) — it flips the project-notes editor on the planner card to open Preview-first, and is scoped to that surface only.

Three phases, split along the two natural seams in the request.

The first seam is persistence versus presentation. Client notes do not exist in the schema at all — `model Client` (schema.prisma:274) has only `id`, `name`, `color`, timestamps, and relations. Both user-facing surfaces (the Tools page and the planner card) depend on the same new column, so the migration plus API is its own phase and must land first. They do not necessarily share a read path: Phase 2 uses the new endpoint, while Phase 3 most likely widens the existing `Project.client` select in `boardService.ts`.

The second seam is the two consumers, which are genuinely independent once the data exists. The Tools page is a new route with write access; the planner card is an existing component gaining a read-only section. They touch disjoint files and can be planned, built, and verified separately.

### Phase Ordering

Phase 1 must come first: both Phase 2 and Phase 3 read `Client.notes`, which does not exist until the migration runs. Phases 2 and 3 both depend on Phase 1 and on nothing else, so they could in principle run in either order.

They are sequenced 2 → 3 because Phase 2 establishes the shared `NotesEditor` arrangement. `NotesEditor` currently lives inside the board feature (`frontend/src/features/board/components/NotesEditor.tsx`) and is used only by `CardDetailModal`. Phase 2 needs the same editor from a non-board route, forcing a decision about where the component lives. Doing that before Phase 3 touches `CardDetailModal` avoids two phases editing the same component's location and imports.

### Scope Coverage

Covers: the `Client.notes` column with attribution, a PM/Admin-gated write endpoint with audit-log entry, an all-roles read path, the Tools tab and client-list page, the per-client modal with edit/preview, and the read-only client-notes section on the planner card detail modal.

Excludes: any change to the Kanban tile (`KanbanCard`) — the tile stays visually identical; note history or revisions (only latest text plus last-editor attribution); per-client permissions (access is role-based, not per-client); rich-text beyond the markdown subset the existing hardened `rehype-sanitize` schema already permits; and notes on any entity other than `Client`.

## Requirement Mapping

`REQUIREMENTS.md` uses validated checkbox bullets rather than `REQ-NN` identifiers, so phases map to requirement areas by name.

| Phase | Requirement areas |
|-------|-------------------|
| 01 — Client Notes: Data Model + API | Scheduling/planner (Client entity); Compliance-grade audit log; Authentication/RBAC |
| 02 — Client Notes Tool Page | UI/UX; Authentication/RBAC; Scheduling/planner (Client entity) |
| 03 — Read-Only Client Notes on the Planner Card | UI/UX; Scheduling/planner (Project ↔ Client relation) |
| 04 — Project-Notes Preview-First Tabs | UI/UX |

## Key Decisions

- Client notes reuse the `BoardCard` notes pattern verbatim (`notes` / `notesUpdatedAt` / `notesUpdatedBy`) rather than introducing a separate notes table, keeping one shape for "an entity with markdown notes". (Corrected 2026-07-10: the notes fields live on `BoardCard`, schema.prisma:315 — not on `Project`.)
- Write access is gated by the existing `requireRole('PM')` middleware, since the role enum is ordered `NORMAL < PM < ADMIN` — one gate covers "Admins and PMs".
- The read path is deliberately open to all authenticated roles. This is required by the decision to show client notes to everyone on the card, and was confirmed explicitly because it makes client-level commentary visible to every user.
- Exactly one markdown notes editor exists after Phase 2. `NotesEditor` and its hardened `rehype-sanitize` schema are shared, not duplicated.
- Client-note edits are both attributed and audited. Note this makes it the app's first audited notes-write — the existing `BoardCard` notes path is not audited — so the precedent to follow is `boardAdmin.ts`'s role-gated `board.card.archive` handler.

## Deferred Ideas

None raised during scoping.


### Goal
Flip the tab order and default view of the **project notes** editor on the planner card detail modal (`frontend/src/features/board/components/CardDetailModal.tsx`) so it renders **Preview → Edit** and opens on **Preview** (click Edit to modify). The Edit/Preview tabs live in the single shared `frontend/src/components/NotesEditor.tsx` (tab state hardcoded to `'edit'` at L86; TabsList `Edit` L110 then `Preview` L111; save-on-success `setTab('preview')` at L100), which is **also** used by the client-notes page editor (`frontend/src/features/schedule/components/ClientNotesModal.tsx`). Because the component is shared, the change must be **prop-driven** (e.g. an optional `previewFirst` prop, default off) so only the project-notes usage flips; the client-notes page editor stays **Edit-first / Edit-default**. Save-on-success continues to land on Preview. Frontend-only, no backend changes. The Phase-03 read-only client-notes section (the tab-less `NotesPreview`) is unaffected.

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
| Entities with markdown notes reuse one shape: `notes` + `notesUpdatedAt` + `notesUpdatedBy` | 2026-07-10 | Matches existing `BoardCard` notes (schema.prisma:315); avoids a separate notes table per entity |
| A single shared `NotesEditor` (hardened `rehype-sanitize` schema) serves all notes surfaces | 2026-07-10 | Prevents divergent markdown sanitization rules across features |
| Role gating uses `requireRole('PM')` for "PM and Admin" | 2026-07-10 | Role enum is ordered `NORMAL < PM < ADMIN`, so one gate covers both |
| Client notes are readable by all authenticated roles | 2026-07-10 | Required to render them read-only on planner cards for every user; accepted exposure |

### Research Findings
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
