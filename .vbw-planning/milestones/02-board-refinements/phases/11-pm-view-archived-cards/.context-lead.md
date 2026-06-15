## Phase 11 Context (Compiled)

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
| 4 — Board Card Pentester Avatars | board cards show pentester avatars (reuse schedule logic) | Board UX, Schedule parity |
| 5 — Board Bug Fixes | schedule→board status sync, card modal ✕/pin overlap | Schedule↔board sync, Board UX |
| 6 — Auth Rate Limiter Dev Override | MFA enrollment 429 in dev | Auth/MFA reliability, Dev experience |
| 7 — Planner Card Avatars: Initials & Account Colour | planner-only two-initial monogram on account-derived colour | Board UX, Schedule isolation |
| 8 — Planner Avatar Name Precedence | planner-only: prefer user.displayName over TeamMember alias so full-name initials show ("Rui Marques" → "RM") | Board UX, Schedule isolation |
| 9 — Planner Orphaned Card on Last-Pentester Schedule Delete | deleting the last pentester's assignment in Schedule full-deletes the project/card (cascade); board cache invalidated; multi-pentester projects untouched | Schedule↔board sync, Board data integrity, Data safety |
| 10 — Planner Card Client Name: Bold & Client Colour | planner card preview renders client name bold + in the client's colour (`Client.color`, already in payload); frontend-only | Board UX, Schedule isolation |
| 11 — PM Role Can View & Open Archived Cards | PM users can see/open archived cards (Show-Archived toggle gated to PM+); archive stays ADMIN-only incl. closing the PM drag-to-archived PATCH hole | Access control, Board UX, RBAC |

> **Scope evolution:** This milestone grew past its original three "Board Refinements"
> phases. Phases 4–6 added board avatars, two board bug fixes, and an auth rate-limiter
> dev override; Phase 7 (added 2026-06-11) refines the planner avatars introduced in
> Phase 4; Phase 8 (added 2026-06-11) fixes a production data-precedence bug surfaced
> by Phase 7 (the TeamMember alias shadowed the full account name, so avatars showed a
> single initial); Phase 9 (added 2026-06-12) fixes a schedule→board data-integrity bug
> where deleting the last pentester's assignment orphaned the project card in the Planner
> (shipped behaviour, per UAT: full-delete the project/card when zero assignments remain,
> invalidate the board cache, never touch a card still shared by other pentesters). Phases
> 10 & 11 (added 2026-06-15) are a fresh two-part request: Phase 10 styles the planner card
> client name (bold + client colour, frontend-only), and Phase 11 grants the PM role read/
> open access to archived cards while keeping archiving ADMIN-only (including closing a
> PM drag-to-archived PATCH hole). The original Scope Boundary / Decomposition narrative
> above describes only phases 1–3 and is retained for history.

## Key Decisions

- **Archive keeps a lightweight confirm.** Archive permanently deletes files, so
  Phase 2 drops only the typed-name gate, not the confirmation step itself
  (Archive/Cancel remains). To be confirmed in discussion.
- **"Stopped" is a manual stage.** Auto-move must not override a card the user
  manually placed in "Stopped". Exact column position in the stage order to be
  confirmed in discussion.
- **NON-NEGOTIABLE schedule isolation** continues for all board work: no writes
  to Assignment/TeamMember/Absence/Holiday (carried from the Project Board milestone).
- **Phase 7 — planner avatars diverge from Schedule.** Confirmed with user: (a) the
  change is **planner/board-only** — the Schedule view (photos/letters) stays exactly
  as-is and the shared `avatar.tsx` primitive must not change; (b) the background colour
  is **deterministically derived** by hashing the stable `teamMemberId` to a fixed
  white-text-readable palette (no DB schema change, no admin UI); (c) the monogram is
  **first initial + last initial** (uppercase; single initial for mononyms), parsed from
  the single `displayName` string. Board avatars drop the uploaded-photo branch entirely.

## Deferred Ideas

- Schedule→board live-refresh when an assignment is created (carried follow-up).
- SQLite single-writer concurrency hardening at the product level (carried follow-up).


### Goal
Let users with the **PM** role see and open archived cards in the planner, while still being unable to **archive** cards. Research (`11-RESEARCH.md`) confirms every backend read endpoint already permits PM (board list, card detail, card files/download are `requireAuth` only and `listCards` returns all stages); the only gate hiding archived cards from PMs is the frontend **"Show Archived" toggle** in `BoardFilters.tsx` (rendered only for `hasRole('ADMIN')`) combined with the `Board.tsx` archived filter. The destructive admin-archive route (`POST /cards/:id/admin/archive`) stays `requireRole('ADMIN')` and the archive button stays ADMIN-only. **Critical hole to close:** the `PATCH /cards/:id` stage handler currently lets PM set `stage='archived'` (drag-to-archived-column), which would let a PM archive-by-dragging — since the user requires PMs cannot archive, this path must also be blocked for PM.

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
phase: "11"
title: "PM Role — View Archived Cards (Read-Only)"
type: research
confidence: high
date: 2026-06-15
---

## Summary

Users with the `PM` role currently **cannot see or open archived cards** — the
"Show Archived" toggle in `BoardFilters.tsx` is gated to `ADMIN` only, so the
archived column never appears for PMs. No backend gate explicitly blocks PMs
from archived cards (the list and detail endpoints accept all authenticated
users); the restriction is purely frontend.

The archive **write** action is correctly locked to `ADMIN` at the backend route
level (`requireRole('ADMIN')` in `boardAdmin.ts`) and is hidden in the frontend
via `canArchive = role === 'ADMIN' && !card.archivedAt`. That guard must remain
unchanged.

The minimal fix is **one frontend change only**: widen the `hasRole('ADMIN')`
check that gates the "Show Archived" toggle to `hasRole('PM')` (which, given the
`PM < ADMIN` hierarchy, gives access to both PM and ADMIN). No backend changes
are required — every backend read endpoint that would be hit when a PM views
archived cards already permits PM.

---

## Roles model

**Schema** (`backend/prisma/schema.prisma` lines 12–16):
```
enum Role {
  NORMAL
  PM
  ADMIN
}
```
Exact token strings: `NORMAL`, `PM`, `ADMIN`.

**Backend hierarchy** (`backend/src/middleware/auth.ts` lines 55–59):
```typescript
const ROLE_HIERARCHY: Record<string, number> = {
  NORMAL: 1,
  PM: 2,
  ADMIN: 3,
};
```
`requireRole('PM')` passes PM and ADMIN. `requireRole('ADMIN')` passes ADMIN only.

**Frontend hierarchy** (`frontend/src/lib/rbac.ts` lines 4–7):
```typescript
export const ROLE_HIERARCHY: Record<Role, number> = {
  NORMAL: 1,
  PM: 2,
  ADMIN: 3,
};
```
`hasRole(role, 'PM')` returns true for PM and ADMIN. `hasRole(role, 'ADMIN')`
returns true for ADMIN only.

`useAuth().hasRole(minimumRole)` (`frontend/src/features/auth/hooks.ts` line 30)
delegates to `lib/rbac.ts hasRole` with the user's server-returned role.

---

## Current gating — read path

### Who can list cards (`GET /api/board/cards`)

`backend/src/routes/board.ts` line 43:
```typescript
router.get('/cards', requireAuth, readRateLimiter, async (req, res) => {
```
Guard: `requireAuth` only. Any authenticated user (NORMAL, PM, ADMIN) can call
this endpoint. The `listCards` service function in
`backend/src/services/boardService.ts` (lines 91–131) accepts an optional
`stage` filter but applies it uniformly — there is **no role check inside
`listCards`** itself. If `stage` is not supplied, **all stages including
`'archived'` are returned** by the Prisma query.

**Frontend suppression of archived cards:**
`frontend/src/routes/Board.tsx` lines 163–165:
```typescript
if (!showArchived) {
  result = result.filter((card) => card.stage !== 'archived')
}
```
Archived cards are stripped on the client side unless `showArchived === true`.

`showArchived` is controlled by a `Switch` in `BoardFilters.tsx` (lines 97–109):
```tsx
{/* Show Archived toggle — ADMIN only */}
{hasRole('ADMIN') && (
  <div className="flex items-center gap-1.5">
    <Switch
      id="show-archived"
      checked={showArchived}
      onCheckedChange={setShowArchived}
    />
    <label …>Show Archived</label>
  </div>
)}
```
**This is the only gate.** For PM (`hasRole('ADMIN')` is false), the toggle is
never rendered, `showArchived` stays `false`, and archived cards are filtered
out before the column render. The backend already returns them in the payload.

### Who can open a card (`GET /api/board/cards/:id`)

`backend/src/routes/board.ts` line 76:
```typescript
router.get('/cards/:id', requireAuth, readRateLimiter, async (req, res) => {
```
Guard: `requireAuth` only. No role restriction — any authenticated user can
fetch a card by ID, including archived cards. The `getCard` service
(`boardService.ts` lines 134–170) fetches by `{ id }` with no stage filter.

Frontend: a card detail modal is opened via `?card=<id>` URL param or a click
on a `KanbanCard`. If a PM could navigate to a card URL directly (e.g. by
guessing or copying a link), the backend would serve the card. But today the PM
has no UI path to trigger the modal for an archived card because archived cards
are never rendered in columns.

### Who can list files on an archived card (`GET /api/board/cards/:cardId/files`)

`backend/src/routes/boardFiles.ts` line 160:
```typescript
router.get('/', requireAuth, requireCardExists, readRateLimiter, async (req, res) => {
```
`requireCardExists` (`backend/src/middleware/boardAuth.ts` lines 124–166) checks
only that the card exists — **no role branch, no stage check**. Any authenticated
user who can view a card can list its files.

### Who can download a file (`GET /api/board/cards/:cardId/files/:fileId/download`)

`backend/src/routes/boardFiles.ts` line 310:
```typescript
router.get('/:fileId/download', requireAuth, requireCardExists, readRateLimiter, …)
```
Same `requireCardExists` guard — any authenticated user. Since archived cards
have had their `BoardFile` rows hard-deleted and on-disk bytes removed by the
archive service (see `boardArchiveService.ts` and the audit comment in
`boardAdmin.ts`), the file list for an archived card will be empty in practice.
The `listFiles` query will return no rows; the download endpoint would 404 for
any attempt. No read access concern here.

### `requireCardAccess` usage (write/upload paths)

`requireCardAccess` (`boardAuth.ts` lines 31–99) is used on mutating endpoints
(file upload `POST`, comments, notes). Its PM branch is:
```typescript
if (role === 'ADMIN' || role === 'PM') {
  // TODO: tighten PM when org-scoping lands.
  next();
  return;
}
```
PM already passes `requireCardAccess` on existing mutating endpoints. This is
not relevant to the read-only change being proposed but is noted for completeness.

---

## Current gating — archive (write) path

### Backend — archive endpoint

`backend/src/routes/boardAdmin.ts` lines 46–49:
```typescript
router.post(
  '/archive',
  requireAuth,
  requireRole('ADMIN'),
  …
```
**ADMIN-only**. PM is explicitly excluded. This must not change.

The archive service hard-deletes `BoardFile` records and on-disk bytes, sets
`stage='archived'` and `archivedAt=now()`. This destructive action is correctly
restricted.

### Backend — other write guards that must stay unchanged

| Endpoint | Guard | Must not widen to PM |
|---|---|---|
| `POST /cards/:cardId/admin/archive` | `requireRole('ADMIN')` | Yes — archive write |
| `DELETE /cards/:id` | `requireRole('ADMIN')` | Yes — card delete |
| `DELETE /cards/:cardId/files/:fileId` | `requireCardAccess` + explicit `role !== 'ADMIN' && role !== 'PM'` check | PM already has file delete; no change needed |
| `PATCH /cards/:id` (stage='archived') | Inline check `if (data.stage === 'archived') return 403 if !isManager` | PM is already `isManager`; but PM setting `stage='archived'` would only set the DB flag, not run the archive service — irrelevant to this feature, leave as-is |

### Frontend — archive button

`frontend/src/features/board/components/CardDetailModal.tsx` line 484:
```typescript
const canArchive = role === 'ADMIN' && !card.archivedAt
```
PM never sees the "Archive card" button. This check must not change.

`ArchiveCardDialog` (`ArchiveCardDialog.tsx`) and `useArchiveCard` hook are
only rendered when `canArchive` is true; PM is already excluded by the above.

---

## Recommended approach

### The single required change

**File:** `frontend/src/features/board/components/BoardFilters.tsx`
**Line:** 98 (inside the `{/* Show Archived toggle — ADMIN only */}` block)

Change:
```tsx
{hasRole('ADMIN') && (
```
To:
```tsx
{hasRole('PM') && (
```

Because `hasRole` uses the `>=` hierarchy comparison, `hasRole('PM')` returns
true for both PM (`level 2`) and ADMIN (`level 3`). ADMIN continues to see the
toggle. PM gains it. NORMAL does not.

This is the only code change needed. All backend read paths already permit PM.

### Why no backend change is needed

| Read endpoint | Current guard | PM status |
|---|---|---|
| `GET /api/board/cards` (all stages) | `requireAuth` | PM passes |
| `GET /api/board/cards/:id` | `requireAuth` | PM passes |
| `GET /api/board/cards/:cardId/files` | `requireAuth` + `requireCardExists` | PM passes |
| `GET /cards/:cardId/files/:fileId/download` | `requireAuth` + `requireCardExists` | PM passes |

The payload for `GET /api/board/cards` (no stage filter) already contains
archived cards — the backend returns them. The frontend was filtering them out.
Widening the toggle to PM simply stops that client-side suppression.

### Controls that must stay unchanged

- `backend/src/routes/boardAdmin.ts` line 48: `requireRole('ADMIN')` on archive POST.
- `backend/src/routes/board.ts` line 192: `requireRole('ADMIN')` on card DELETE.
- `frontend/src/features/board/components/CardDetailModal.tsx` line 484:
  `const canArchive = role === 'ADMIN' && !card.archivedAt` — the Archive button
  must remain ADMIN-only.
- `frontend/src/features/board/components/CardDetailModal.tsx` line 483:
  `const canDelete = role === 'ADMIN' || role === 'PM'` — PM can already delete
  cards via the UI (this is existing behaviour, not changed).

---

## Files to change / not change

### CHANGE (1 file, 1 line)

| File | Line | Change |
|---|---|---|
| `frontend/src/features/board/components/BoardFilters.tsx` | 98 | `hasRole('ADMIN')` → `hasRole('PM')` |

### DO NOT CHANGE

| File | Reason |
|---|---|
| `backend/src/routes/boardAdmin.ts` | Archive route guard `requireRole('ADMIN')` must stay |
| `backend/src/routes/board.ts` | All read guards already permit PM; DELETE guard must stay ADMIN |
| `backend/src/routes/boardFiles.ts` | File list/download guards already permit PM |
| `backend/src/middleware/boardAuth.ts` | `requireCardAccess` already passes PM; `requireCardExists` already passes all authenticated users |
| `backend/src/services/boardService.ts` | No role filtering in service layer — correct as-is |
| `frontend/src/features/board/components/CardDetailModal.tsx` | `canArchive` check must remain `role === 'ADMIN'`; `canDelete` is already PM|ADMIN |
| `frontend/src/features/board/components/ArchiveCardDialog.tsx` | Rendered only when `canArchive`; no change needed |
| `frontend/src/routes/Board.tsx` | `showArchived` filter logic is role-agnostic; the toggle visibility is the only gate |

---

## Edge cases / open questions

### 1. Dedicated archived view vs inline column

The current implementation (and the proposed change) surfaces archived cards as
a dedicated "Archived" column appended to the right of the board when the toggle
is on. This is the same UX that ADMIN sees today. PMs will see the identical
"Archived" column when they toggle it on. No new view is required.

The `showArchived` state starts as `false` for all roles and persists only within
the session. This is appropriate — PMs see the live board by default and opt-in
to the archived view.

### 2. DnD drag-to-archived for PM

With `showArchived = true`, the "Archived" column becomes a `useDroppable`
target (`KanbanColumn` renders for `stage = 'archived'`). A PM dragging a card
to the Archived column would call `PATCH /api/board/cards/:id` with
`{ stage: 'archived' }`. The backend `PATCH` handler (`board.ts` lines 126–129)
explicitly rejects this from NORMAL but allows it for PM/ADMIN:

```typescript
if (data.stage === 'archived') {
  return res.status(403).json({ error: 'Only PM or ADMIN can archive cards' });
}
```

This means **a PM could drag a card to the Archived column** via `PATCH`, setting
`stage='archived'` and `archivedAt=now()`. This does NOT run the archive service
(files are not deleted). However, if the feature requirement is strict read-only
for PM, this is an existing loophole (unrelated to this phase's change) that
should be flagged.

**Recommendation:** Flag this as an out-of-scope concern for this phase. The
task specifies PMs "will still not be able to archive them", so if DnD-to-archived
is considered archiving, the PATCH guard should also block PM for
`stage='archived'`. This would be a separate small fix in `board.ts` line 128.

### 3. PM un-archive / restore

There is no "restore" (un-archive) endpoint or UI control. The only path to
un-archive would be a PM dragging an archived card to another column (which
calls `PATCH` with a non-archived stage). This is currently allowed for PM
(they are `isManager`) and is arguably correct behaviour (PM managing the board).
This is **not affected by this phase's change** and is out of scope.

### 4. Audit events for PM viewing archived cards

Today, file downloads emit `board.file.download` audit events (regardless of
role) via the `requireCardExists` path. Card opens do not emit an audit event
on read. Granting PMs access to the archived toggle does not change this
behaviour — auditing of PM archived-card views is not implemented and is out of
scope for this phase.

### 5. Hide edit/archive controls in CardDetailModal for archived cards

When a PM opens an archived card's detail modal:
- The "Archive card" button (`canArchive`) is `false` because `card.archivedAt`
  is non-null. No issue.
- Checklist checkboxes call `updateCard.mutate` (PATCH). This is allowed for PM
  on any card including archived ones (no stage guard in the PATCH handler for
  checklist updates). Whether PMs should be able to tick checklist items on
  archived cards is a UX question but not a security concern.
- Notes editor (`NotesEditor`) allows edits for any user who can access the modal.
  PMs editing notes on an archived card is borderline — flag as a follow-up UX
  question if the user wants strict read-only.
- `canDelete = role === 'ADMIN' || role === 'PM'` — PM sees the delete option
  on archived cards if any delete affordance is present. `DELETE /cards/:id` is
  `requireRole('ADMIN')` at the backend, so the delete button (if present and
  clicked) would return 403. No security issue, but any PM-visible delete button
  in the modal should be checked — the current modal has no explicit delete
  button visible to the user (delete is a separate action not in `CardDetailModal`).

### 6. Backend already returns archived cards in the payload

Because `GET /api/board/cards` (no `stage` filter) returns all stages, the
archived cards are already in the React Query cache for PM users. The frontend
filter `card.stage !== 'archived'` is the only thing stripping them. This means:
- No additional network request is needed when PM turns on the toggle.
- The PM's `useBoardCards()` query will already have the archived cards in
  `data.cards`; turning `showArchived` on just removes the client-side filter.
