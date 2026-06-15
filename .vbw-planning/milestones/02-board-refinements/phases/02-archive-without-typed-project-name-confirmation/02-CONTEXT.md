---
phase: 2
title: "Archive Without Typed Project-Name Confirmation"
gathered: 2026-06-03
calibration: builder
---

# Phase 2 — Discussion Context

## Phase Boundary

Change #1: an admin archiving a board card no longer has to type the project
name to confirm. Drop the type-to-confirm gate. Self-contained frontend +
backend change; touches only the archive dialog and the admin archive
route/service. Does NOT touch the schedule domain.

## Decisions Made

### Confirmation UX (after removing the typed input)

- **Keep the Archive/Cancel confirmation dialog.** Remove ONLY the
  "type the project name to confirm" text input and its disabled-until-match
  gating on the Archive button. The dialog itself stays, including the
  "permanently delete N files totaling X" warning and the
  "comments/notes preserved, schedule assignment NOT affected, cannot be undone"
  copy. Rationale: archive hard-deletes files irreversibly — one lightweight
  confirm beat is the right amount of friction. Not one-click; no extra
  "I understand" checkbox.
- The **Archive** button becomes always-enabled (subject only to the in-flight
  `archive.isPending` disable). No `typed`/`matches` state remains.

### Backend gate scope

- **Remove `confirmProjectName` entirely** from the contract:
  - `backend/src/routes/boardAdmin.ts`: drop `confirmProjectName` from the
    `z.object({...})` body schema (the `POST /cards/:cardId/admin/archive`
    endpoint). Body becomes effectively empty.
  - `backend/src/services/boardArchiveService.ts`: drop the `confirmProjectName`
    parameter from `archiveCard()` and the `card.project.name !== confirmProjectName`
    check + the `PROJECT_NAME_MISMATCH` throw. Remove `'PROJECT_NAME_MISMATCH'`
    from the `ArchiveErrorCode` union if it has no other use.
  - Keep `NOT_FOUND`, admin-only authorization, the audit row, and the file
    hard-delete behavior unchanged. The audit `projectName` still derives from
    `card.project.name` (server-read), so the audit log is unaffected.
- Rationale: the frontend will no longer send a typed name; a half-enforced /
  ignored server param would be dead, inconsistent contract surface.

### Empty-projectName edge case (carried side-finding — resolved here)

- The carried `[SIDE-FINDING]` (ArchiveCardDialog had no typeable target when a
  card has no linked project name) is **naturally resolved** by this phase:
  with no typed-confirmation, there is nothing to match against. No separate
  work item; just confirm during UAT that a project-less card archives cleanly.

### Open (Claude's discretion)

- Exact frontend cleanup mechanics (removing `typed`/`matches`/`error`-for-mismatch
  state, the `<Input>`/`<Label>`/help text, the reset `useEffect`) — left to the
  planner/executor. The `useArchiveCard` hook + its `confirmProjectName` arg in
  `frontend/src/features/board/{api,hooks}.ts` must be updated to match the new
  body shape.

## NON-NEGOTIABLE

- **Schedule isolation**: the archive route/service must keep its no-write
  boundary against Assignment / TeamMember / Absence / Holiday. The read-only
  `BoardCard.project` join (name only) is the only project-relation read; the
  SCHEDULE-ISOLATION INVARIANT JSDoc in `boardArchiveService.ts` stays accurate
  (still reads `card.project.name` for the audit, just no longer for matching).

## Deferred Ideas

- None new. (Carried milestone follow-ups — schedule→board live-refresh, SQLite
  single-writer concurrency — remain out of this milestone's scope.)
