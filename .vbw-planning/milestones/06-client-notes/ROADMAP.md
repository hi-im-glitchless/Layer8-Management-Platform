# Template AI Engine (Layer8) Roadmap

**Goal:** Add "Client Notes" — markdown notes attached to a Client, editable by PMs and Admins through a new Tools tab, and surfaced read-only to all users on the planner card of every project belonging to that client.

**Scope:** 4 phases

## Progress
| Phase | Status | Plans | Tasks | Commits |
|-------|--------|-------|-------|---------|
| 01 | ⚠ UAT Issues |
| 02 | ◐ Needs Verification |
| 03 | ◐ Needs Verification |
| 04 | ◐ Needs Verification |

---

## Phase List
- [x] [Phase 1: Client Notes — Data Model + API](#phase-1-client-notes--data-model--api)
- [x] [Phase 2: Client Notes Tool Page](#phase-2-client-notes-tool-page)
- [x] [Phase 3: Read-Only Client Notes on the Planner Card](#phase-3-read-only-client-notes-on-the-planner-card)
- [x] [Phase 4: Project-Notes Preview-First Tabs](#phase-4-project-notes-preview-first-tabs)

---

## Phase 1: Client Notes — Data Model + API

**Goal:** Persist markdown notes on the `Client` entity and expose read/write endpoints. Mirror the existing `BoardCard` notes pattern exactly: add `notes String @default("")`, `notesUpdatedAt DateTime?`, and `notesUpdatedBy String?` to `model Client` (schema.prisma:274) via a Prisma migration. Add a read endpoint returning a client's notes plus attribution, and a write endpoint gated by `requireRole('PM')` (backend/src/middleware/auth.ts:65), which stamps attribution and writes an entry to the existing tamper-evident audit log. The read path must be reachable by all authenticated roles.

Note: this is the app's **first audited notes-write** — the existing `BoardCard` notes path does not call the audit log, so the closest precedent for the audited+role-gated shape is `boardAdmin.ts`'s `board.card.archive` handler, not the notes service.

**Deps:** None

**Requirements:** Scheduling/planner (Client entity), Compliance-grade audit log, Authentication/RBAC

**Success Criteria:**
- `Client` has `notes`, `notesUpdatedAt`, `notesUpdatedBy`; migration applies cleanly to an existing database and existing clients default to empty notes.
- A `PM` or `ADMIN` can write client notes; a `NORMAL` user receives 403 on the write endpoint.
- Any authenticated user can read a client's notes (needed by Phase 3).
- Every successful write produces one audit-log entry identifying actor, client, and timestamp.
- Writing notes stamps `notesUpdatedAt` and `notesUpdatedBy`.
- The schedule-domain no-write boundary is respected: no writes to Assignment/TeamMember/Absence/Holiday.

## Phase 2: Client Notes Tool Page

**Goal:** A new `Client Notes` entry appears in the `Tools` sidebar group (frontend/src/components/layout/Sidebar.tsx:41) with `minRole: 'PM'`, routing to a new page that lists all clients. Clicking a client opens a modal showing the client's **name and colour** alongside a notes editor with Edit and Preview tabs. Reuse the existing `NotesEditor` (frontend/src/features/board/components/NotesEditor.tsx) — including its hardened `rehype-sanitize` schema — rather than writing a second markdown editor; lift it to `frontend/src/components/` per the `client-combobox.tsx` precedent, generalising its hardcoded `useUpdateNotes()` save into an `onSave` callback prop. Saving calls the Phase 1 write endpoint and surfaces "last edited by X at Y".

Reuse, do not rebuild: `RoleProtectedRoute` (frontend/src/App.tsx:41-62) already guards routes by role — apply it with `minRole="PM"`. `useBoardMembers()` (`GET /api/board/members`, `requireAuth`-only, so PMs may call it) already resolves a raw user id to a display name; `CardDetailModal.tsx:466-482`'s `resolveEditorName` is the precedent.

**Scope note (2026-07-10):** an earlier draft said the modal also shows "its projects". That was an unverified assumption of mine — no frontend code fetches a client's projects, and the user confirmed **name + colour only**. The unused `GET /api/projects/search?clientId=` endpoint remains available if this is ever wanted.

**Deps:** Phase 1 (read/write endpoints and attribution fields)

**Requirements:** UI/UX, Authentication/RBAC, Scheduling/planner (Client entity)

**Success Criteria:**
- `Client Notes` is visible in the Tools group for `PM` and `ADMIN`, and absent for `NORMAL`.
- Direct navigation to the route as a `NORMAL` user is refused (route guard, not just a hidden link).
- The client list renders every client; clicking one opens the modal with that client's name, colour, and current notes.
- The modal's Edit/Preview tabs behave like the board's project notes, and markdown is sanitized identically.
- Saving persists, shows the new attribution, and requires no page reload.
- Exactly one markdown notes editor component exists in the codebase after this phase, and the board's card notes still save correctly through it.
- The modal shows "last edited by {name}" using the existing member-lookup path, not a raw user id.

## Phase 3: Read-Only Client Notes on the Planner Card

**Goal:** In the planner card detail modal (frontend/src/features/board/components/CardDetailModal.tsx:636), render the notes of the client that the card's project belongs to, as a read-only markdown section positioned directly above the existing card `NotesEditor`. Visible to every authenticated role, editable by none — editing happens only in the Phase 2 tool. The Kanban tile itself is unchanged. Handle the empty case (client has no notes) and the null case (`Project.clientId` is nullable) without rendering an empty heading.

Data source: `boardService.ts`'s `listCards` / `getCard` already join `Project.client` with a `select`. The likely correct change is to **widen that existing select** to include `notes`, not to call Phase 1's read endpoint per card. Confirm during Phase 3 planning.

**Deps:** Phase 1 (notes column on Client)

**Requirements:** UI/UX, Scheduling/planner (Project ↔ Client relation)

**Success Criteria:**
- Opening a card whose project has a client with notes shows those notes above the project notes, rendered as sanitized markdown.
- The client-notes section is read-only for every role, including `ADMIN` — no edit affordance is present.
- A card whose project has no client, or whose client has empty notes, renders no client-notes section and no stray heading.
- The project `NotesEditor` continues to work unchanged for users permitted to edit it.
- The Kanban tile (`KanbanCard`) is visually unchanged.

## Phase 4: Project-Notes Preview-First Tabs

**Goal:** Flip the tab order and default view of the **project notes** editor on the planner card detail modal (`frontend/src/features/board/components/CardDetailModal.tsx`) so it renders **Preview → Edit** and opens on **Preview** (click Edit to modify). The Edit/Preview tabs live in the single shared `frontend/src/components/NotesEditor.tsx` (tab state hardcoded to `'edit'` at L86; TabsList `Edit` L110 then `Preview` L111; save-on-success `setTab('preview')` at L100), which is **also** used by the client-notes page editor (`frontend/src/features/schedule/components/ClientNotesModal.tsx`). Because the component is shared, the change must be **prop-driven** (e.g. an optional `previewFirst` prop, default off) so only the project-notes usage flips; the client-notes page editor stays **Edit-first / Edit-default**. Save-on-success continues to land on Preview. Frontend-only, no backend changes. The Phase-03 read-only client-notes section (the tab-less `NotesPreview`) is unaffected.

**Deps:** Phase 2 (shared `NotesEditor` component), Phase 3 (`CardDetailModal` wiring)

**Requirements:** UI/UX

**Success Criteria:**
- On a planner card detail modal, the project notes editor renders the Preview tab first and opens on Preview; Edit remains reachable and fully functional.
- The client-notes page editor (`ClientNotesModal`) is unchanged: still Edit-first and opens on Edit.
- Saving still persists and lands on the Preview tab.
- The hardened `SANITIZE_SCHEMA` and the single `NotesPreview` render path are unchanged; existing `NotesEditor` default-behavior tests still pass (regression guard for the client-notes editor).
- No backend files are modified.
