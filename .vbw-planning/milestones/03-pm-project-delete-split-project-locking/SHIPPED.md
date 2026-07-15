# Shipped: PM Project Delete & Split-Project Locking

**Milestone:** 03-pm-project-delete-split-project-locking
**Project:** Template AI Engine (Layer8)
**Shipped:** 2026-06-29
**Tag:** milestone/03-pm-project-delete-split-project-locking

## Goal

PM Project Controls — let project managers delete projects (with confirmation) and lock split projects from the assignment edit modal.

## What shipped

- **PM can delete projects** — project deletion authorized server-side for PM in addition to ADMIN, with a UI confirmation alert before the destructive action. Board card delete cascades to delete the project and all its linked schedule assignments; a locked linked assignment blocks the whole card delete.
- **Lock control for split projects** — split projects (assignments with split cells / `splitProjectId`) now surface the lock control, and the locker is present in the assignment-edit modal used by project managers.

## Metrics

- Phases: 1
- Plans: 2 (both complete)
- UAT remediation rounds: 2 (resolved, 0 outstanding issues)
- QA remediation rounds: 1 (PASS)
- Deviations: 2

## Verification

- QA: round-01 remediation `R01-VERIFICATION.md` — PASS (8/8)
- UAT: round-02 `R02-UAT.md` — complete, 2/2 passed, 0 issues
