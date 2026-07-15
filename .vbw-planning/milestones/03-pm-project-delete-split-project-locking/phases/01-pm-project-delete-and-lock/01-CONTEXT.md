---
pre_seeded: true
---

# Phase 1: PM Project Delete & Split-Project Locking — Context

Gathered: 2026-06-22
Calibration: architect

## Phase Boundary
Two project-management capability changes for the Planner/Board:
1. Let PM-role users delete a project (board card), with a confirmation alert.
2. Surface the lock control on split (two-project) cells, and add a lock control to the assignment-edit modal.

## Decisions Made

### Delete scope — which "delete a project" surface
- **Decision:** Open the **board card hard-delete** to PM. Today `DELETE /api/board/cards/:id` is `requireRole('ADMIN')` (`backend/src/routes/board.ts:204`, `boardService.deleteCard`). Change it to allow PM (Project ⟷ BoardCard is 1:1, so deleting the card deletes the project).
- **Not** the Planner assignment delete: that path (AssignmentModal footer "Delete" → `deleteAssignment`) is already PM+ and out of scope for the authz change.
- Server remains authoritative: change the route guard to `requireRole('PM')` and gate the client affordance with `hasRole('PM')` (advisory only, per CONCERNS #5).

### Confirmation alert — implementation
- **Decision:** Use the shadcn **`AlertDialog`** pattern (as in `ArchiveCardDialog.tsx` and the split-remove dialogs already in `AssignmentModal.tsx`). Not native `confirm()`.
- The alert confirms intent before the destructive delete; Cancel aborts with no change.

### Split-cell lock — model
- **Decision:** Lock at the **whole-assignment** level (both halves together). Matches the data model — a single `isLocked` boolean on the `Assignment` row; a split cell is one assignment with two projects.
- Add a clickable lock/unlock affordance to the split cell (`SplitCell` in `AssignmentCell.tsx`), mirroring the non-split cell's lock toggle. Today the split cell only renders a static `<Lock>` icon when already locked — no way to lock/unlock.
- Per-half locking was rejected (would need a schema change + backend rework — out of scope).

### Assignment-modal lock — behavior
- **Decision:** Add a lock toggle to the modal (placement: footer, near the Delete button — Claude/planner discretion). The toggle operates on the whole assignment via the existing `toggleLock` / `POST /assignments/:id/lock` (PM+).
- While the assignment is **locked**, disable Save/editable fields so the modal mirrors the backend rule (`assignmentService.updateAssignment` rejects edits to a locked assignment unless `isLocked:false`). Unlocking from the toggle re-enables editing. This prevents confusing "Cannot update a locked assignment" errors.

## Open (Claude's discretion)
- Exact placement/icon of the PM-facing board-card delete affordance (likely the board card detail/modal). Planner to determine from existing board card UI.
- Delete action should be written to the audit trail as a PM action (the app audits user actions via `services/audit.ts`); confirm the existing `deleteCard` path already audits, otherwise add it.

## Deferred Ideas
None.

---

## UAT Remediation Issues

---
phase: 1
plan_count: 2
status: issues_found
started: 2026-06-23
completed: 2026-06-23
total_tests: 4
passed: 0
skipped: 3
issues: 1
---

UAT for Phase 01 — PM Project Delete & Lock. Verify on the running app with demo data seeded (`cd ui-seed && python3 seed_all.py`). A Selenium replay of these checkpoint actions is at `ui-seed/uat_replay_25.py` (`E2E_HEADLESS=0 python3 uat_replay_25.py` to watch). Roles: e2e_pm (PM), e2e_admin (ADMIN), e2e_normal (NORMAL).

## Tests

### P01-T01: PM-gated Delete affordance on a board card

- **Plan:** 01-01 -- PM Board Card Delete + Audit Trail + Confirmation Dialog
- **Scenario:** Log in as PM and open any board card (click a card on /board to open its detail modal). Look at the modal footer. Then repeat as NORMAL, and (optionally) as ADMIN.
- **Expected:** PM sees a destructive "Delete card" button (trash icon) in the card detail modal footer. NORMAL sees no Delete button. ADMIN sees BOTH an Archive button and a Delete button (Archive stays ADMIN-only). The Delete affordance is gated by role on the client; the server is the real authority.
- **Result:** issue
- **Issue:**
  - Description: User deleted the project/card from the planner (schedule) and the corresponding card remained on the Board instead of disappearing — the delete did not propagate to the Board view. Reported while checking the PM delete affordance. Needs clarification/triage in remediation: (a) which surface the delete was performed from (the Board card "Delete card" affordance vs a planner/schedule assignment delete), and (b) the expected cross-view behavior — a Board-card delete should remove the card from the Board (the route still emits a 'cards' invalidate, so the Board should refresh), whereas deleting a single planner assignment is not expected to delete the project's Board card. The observed mismatch (deleted in planner, still on Board) is the defect to investigate.
  - Severity: major

### P01-T02: Delete confirmation dialog — cancel aborts, confirm deletes

- **Plan:** 01-01 -- PM Board Card Delete + Audit Trail + Confirmation Dialog
- **Scenario:** As PM, open a board card and click "Delete card". Read the confirmation dialog, click Cancel, and confirm nothing changed. Then open it again and click the confirm/delete action. (Pick a disposable demo card.)
- **Expected:** A confirmation AlertDialog appears before any deletion, with clear permanent-delete warning text (mentions comments/notes/files are removed, schedule assignments are not affected, cannot be undone) and shows which project/card is being deleted. Cancel closes the dialog with NO change. Confirm permanently removes the card from the board and closes the modal. The linked schedule assignment for that project is still present on /schedule afterward (no schedule data loss).
- **Result:** skip
- **Note:** Blocked by P01-T01 — user reported they cannot pass further checkpoints until the delete/Board-sync issue is fixed.

### P02-T01: Lock control on a split (two-project) schedule cell

- **Plan:** 01-02 -- Split-Cell Lock Toggle + Assignment Modal Lock Control
- **Scenario:** Log in as PM and go to /schedule. Find a split cell (a day/cell holding two projects). Look for the lock/unlock control and click it; compare its look/behavior to the lock control on a normal (non-split) cell.
- **Expected:** The split cell shows a clickable lock/unlock control consistent with the non-split cell: when locked, the lock icon is always visible and clickable; when unlocked, it appears on hover. Clicking it toggles the lock for the whole assignment (the lock state flips) and does NOT open the cell's edit modal (the click is isolated to the lock control). A read-only viewer who cannot edit sees only a static lock icon (no button) when locked.
- **Result:** skip
- **Note:** Blocked by P01-T01 — user paused UAT until the delete/Board-sync issue is fixed.

### P02-T02: Lock toggle and locked-field disabling in the assignment-edit modal

- **Plan:** 01-02 -- Split-Cell Lock Toggle + Assignment Modal Lock Control
- **Scenario:** As PM on /schedule, open an assignment's edit modal. Find the Lock/Unlock toggle (footer, near Delete). Lock the assignment, observe the form, then unlock it.
- **Expected:** The modal shows a Lock/Unlock toggle reflecting the assignment's current lock state. While locked: all editable fields (project/client/colour/status/tags/split), the Save button, and the Delete button are disabled — but the Lock/Unlock toggle itself stays enabled so you can unlock. Unlocking re-enables the fields, Save, and Delete. The toggle's label/icon switches between Lock and Unlock to match state.
- **Result:** skip
- **Note:** Blocked by P01-T01 — user paused UAT until the delete/Board-sync issue is fixed.
