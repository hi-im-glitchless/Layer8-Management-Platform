---
phase: 2
plan_count: 1
status: complete
started: 2026-06-03
completed: 2026-06-03
total_tests: 2
passed: 2
skipped: 0
issues: 0
---

UAT for removing the typed-project-name confirmation from the admin archive flow. Verify on the running app at /board with demo data seeded, logged in as an ADMIN (archive is admin-only). A Selenium replay that parks you on each screen is at `ui-seed/uat_replay_02.py` (run `cd ui-seed && E2E_HEADLESS=0 python3 uat_replay_02.py`). The replay opens the dialog and screenshots it but does NOT click the final "Archive card" (that hard-deletes files) — you judge and click.

## Tests

### P01-T01: Archive confirm dialog has no typed-name gate

- **Plan:** 02-01 -- Archive Without Typed Project-Name Confirmation
- **Scenario:** Log in as an ADMIN, open the Board (/board), open a card's detail modal, and click the "Archive card" button. Look at the confirmation dialog that appears.
- **Expected:** A confirmation dialog opens with an "Archive card" action and a "Cancel" button, plus the warning copy (permanently deletes N files totalling X; comments/notes preserved; schedule assignment not affected; cannot be undone). There is NO field asking you to type the project name, and the "Archive card" button is enabled immediately — you do not have to type anything to enable it. Clicking "Archive card" archives the card in a single confirm (it disappears from the default board view; its files are deleted).
- **Result:** pass

### P01-T02: A card with no linked project archives cleanly

- **Plan:** 02-01 -- Archive Without Typed Project-Name Confirmation
- **Scenario:** Open the Archive confirm dialog for a card that has no linked project name (a project-less card), if you have one. If you don't have one handy, judge the dialog's behaviour generally: nothing in it should depend on a project name existing.
- **Expected:** The same single-confirm dialog appears and the card archives cleanly — there is no broken or empty "type the project name" state that blocks the Archive button. The old edge case (a project-less card had no typeable confirmation target) is gone.
- **Result:** pass
- **Note:** A project-less card cannot be produced through the normal schedule→board flow: a board card is only created when an assignment passes the Planner-eligibility gate (`isPlannerEligible` in `backend/src/services/projectService.ts` — requires a non-empty project name **and** a client **and** ≥1 tag). A nameless schedule assignment keeps `projectId` NULL and never appears on the board. This is intended Phase 24 / Planner behaviour, independent of Phase 2; the Phase-2 archive contract no longer references a project name at all (QA-verified), so the edge case is handled correctly even though it is effectively unreachable in practice.
