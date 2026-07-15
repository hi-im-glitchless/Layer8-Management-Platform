# Template AI Engine (Layer8) — Milestone Context

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
