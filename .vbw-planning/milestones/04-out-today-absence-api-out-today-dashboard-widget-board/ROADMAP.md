# Template AI Engine (Layer8) Roadmap

**Goal:** Add a dashboard widget that lists the users who are out (absent) on the current day, so the team can see at a glance who is unavailable.

**Scope:** 3 phases

## Progress
| Phase | Status | Plans | Tasks | Commits |
|-------|--------|-------|-------|---------|
| 01 | ● Done |
| 02 | ● Done |
| 03 | ◐ Needs Verification |

---

## Phase List
- [x] [Phase 1: Out-Today Absence API](#phase-1-out-today-absence-api)
- [x] [Phase 2: Out-Today Dashboard Widget](#phase-2-out-today-dashboard-widget)
- [x] [Phase 3: Board Checklist — Open Check Access & Default Report-Share Item](#phase-3-board-checklist--open-check-access--default-report-share-item)

---

## Phase 1: Out-Today Absence API

**Goal:** Provide a backend capability that returns the set of users/team members who are out (have an `Absence`) on a given date (defaulting to "today"). Reuse the existing `Absence` model and `absenceService.ts`; expose the result through the schedule/absence route surface so the frontend can fetch "who is out today" in a single call. Server remains authoritative for auth/RBAC consistent with existing schedule routes.

**Deps:** None (builds on the shipped scheduling/planner domain — `Absence`, `TeamMember`, `User`)

**Requirements:** Scheduling/planner (absence data), RBAC (authenticated read consistent with `/api/schedule`)

**Success Criteria:**
- An authenticated request can retrieve the users/team members marked absent on a specified date, defaulting to the current day.
- The response identifies each out person (name / linked user where available) and is shaped for direct widget consumption.
- Reuses existing absence data — no new absence data model is introduced; no duplication of `absenceService` logic.
- Authz/visibility is consistent with existing schedule endpoints; no NORMAL-role over-exposure beyond current schedule access.
- Behavior is covered by tests (date boundary "today", empty/none-out case, multi-absence day).

## Phase 2: Out-Today Dashboard Widget

**Goal:** Add a widget to the Dashboard (route `/`, `features/dashboard`) that lists the users who are out today, consuming the Phase 1 API via a React Query hook. The widget follows existing dashboard component and shadcn UI conventions, handles the empty state ("no one is out today"), and refreshes consistently with other dashboard data.

**Deps:** Phase 1 (consumes the out-today API)

**Requirements:** Dashboard (widget surface), Scheduling/planner (absence display)

**Success Criteria:**
- The Dashboard shows an "Out Today" widget listing each user who is absent on the current day.
- Empty state is handled gracefully when no one is out.
- The widget uses the feature-sliced dashboard structure (`features/dashboard`) and shared UI primitives, matching existing dashboard styling.
- Data loads via the established React Query pattern; loading and error states are handled.
- No regressions to existing dashboard content (schedule/project cards).

## Phase 3: Board Checklist — Open Check Access & Default Report-Share Item

**Goal:** Two independent board-checklist changes to the Kanban board.
1. **Open checklist check/edit to everyone:** Any authenticated user (including unassigned NORMAL pentesters) can check/uncheck checklist items on ANY project's card. Implemented by making `PATCH /api/board/cards/:id` (`backend/src/routes/board.ts`) skip the assignment-ownership 403 when the request body touches **only** `checklist`; every other field path is unchanged.
2. **Add a standard checklist item `Report is on client's share`:** Appended to `DEFAULT_CHECKLIST` (`backend/src/services/boardService.ts`, `order: 6`) so all newly-created project cards include it, AND backfilled onto all existing cards via a one-off idempotent script (`backend/scripts/backfill-checklist-report-share-item.ts`, run once via `npx tsx`).

No frontend changes (the checklist UI already has no role/assignment gate) and no schema/migration changes (`BoardCard.checklist` is already free-form JSON-in-TEXT). Realtime board sync already broadcasts checklist edits to all clients.

**Deps:** None (independent of Phases 1–2; operates on the shipped Board/Kanban + Project/Assignment domains)

**Requirements:** Board (Kanban checklist), RBAC (authenticated write, keeping ADMIN/PM restrictions on archive + stage-lock)

**Key decisions (locked with user):**
- Access opens for the `checklist` field **only** — `notes` stays ownership-gated; `stage='archived'` stays ADMIN-only; `stageLockedBy` stays PM/ADMIN-only. A mixed body (`checklist` + any other field) from a non-owner is rejected wholesale (403, checklist not partially applied).
- The new item is added **both** as a default on new cards **and** backfilled onto existing cards.
- The new item is appended at the end (after "Delivery"); backfill computes per-card `max(order)+1` to tolerate cards that drift from the default set.

**Open decisions for planning:**
- Whether the one-off backfill script gets its own Vitest or documented manual validation (repo convention leaves one-off scripts untested).
- Whether to wire the backfill into `package.json` (current convention: manual `npx tsx`, not wired).

**Success Criteria:**
- An unassigned NORMAL user can `PATCH /api/board/cards/:id` with a checklist-only body and the change persists (200).
- A non-owner NORMAL user is still 403'd when the body includes `stage`, `stageLockedBy`, or `stage='archived'`; a mixed `checklist`+`stage` body is rejected and the card's checklist is left unchanged.
- ADMIN-only archive and PM/ADMIN-only stage-lock guards remain enforced; assigned NORMAL/PM/ADMIN checklist edits still work.
- Newly created project cards include a `Report is on client's share` checklist item.
- After the backfill runs, every existing card's checklist contains the item exactly once; re-running the backfill adds no duplicates.
- Backend `tsc` build and the board/service test suites pass, with new tests covering the access matrix and the default/backfill behavior.

## Progress
| Phase | Done | Status | Date |
|-------|------|--------|------|
| 1 - Out-Today Absence API | 1/1 | complete | 2026-07-02 |
| 2 - Out-Today Dashboard Widget | 1/1 | complete | 2026-07-02 |
| 3 - Board Checklist Open Access | 1/1 | needs verification | - |
