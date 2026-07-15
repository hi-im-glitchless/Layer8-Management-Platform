# Template AI Engine (Layer8) Roadmap

**Goal:** PM Project Controls — let project managers delete projects (with confirmation) and lock split projects from the assignment edit modal.

**Scope:** 1 phase

## Progress
| Phase | Status | Plans | Tasks | Commits |
|-------|--------|-------|-------|---------|
| 01 | ⚠ UAT Issues |

---

## Phase List
- [x] [Phase 1: PM Project Delete & Split-Project Locking](#phase-1-pm-project-delete--split-project-locking)

---

## Phase 1: PM Project Delete & Split-Project Locking

**Goal:** Two project-management capability changes, grouped because both extend PM control over projects and touch the same project/assignment authz + planner-modal surfaces:
1. **PM can delete projects** — extend project deletion (currently restricted) so PM-role users may delete a project. The UI presents a confirmation alert before the destructive action; cancelling aborts with no change.
2. **Lock control for split projects** — split projects (assignments with split cells / `splitProjectId`) currently do not show the lock control to lock the project. Surface the lock control for split projects, and add the locker to the modal where project managers edit the assignment.

**Deps:** None (builds on shipped Project Board + Board Refinements milestones)

**Requirements:** Project management (delete authz), Planner/board project locking, RBAC (PM role)

**Success Criteria:**
- A PM-role user can delete a project; deletion is authorized server-side for PM in addition to ADMIN (server remains authoritative for RBAC).
- The UI shows a confirmation alert before deleting; confirming deletes the project, cancelling makes no change.
- Split projects display the lock control to lock the project, consistent with non-split projects.
- The lock control is also present in the assignment-edit modal used by project managers.
- Existing board/schedule authz and locking invariants preserved; no unintended changes to NORMAL-role access.

## Progress
| Phase | Done | Status | Date |
|-------|------|--------|------|
| 1 - PM Project Delete | 2/2 | uat issues | - |
