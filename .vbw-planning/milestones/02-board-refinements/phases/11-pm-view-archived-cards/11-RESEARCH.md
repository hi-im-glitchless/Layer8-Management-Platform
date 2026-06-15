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
