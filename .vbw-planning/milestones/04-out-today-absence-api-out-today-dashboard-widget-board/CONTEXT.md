# Template AI Engine (Layer8) — Milestone Context

Gathered: 2026-06-29
Calibration: builder

## Scope Boundary

Two threads of work on the existing platform:
1. **Out-Today dashboard widget** (Phases 1–2): a read-only "Out Today" view on the Dashboard listing users absent on the current day, backed by existing `Absence` scheduling data. Original request: "We need some kind of widget in the dashboard listing the users that are out on that day."
2. **Board checklist adjustments** (Phase 3, added mid-milestone): open checklist check/edit access to all authenticated users, and add a standard `Report is on client's share` checklist item to all project cards. Request: "everyone can review the checklist of all projects" + "add a new line to the checklist with the text 'Report is on client's share'."

## Decomposition Decisions

### Phase Count & Grouping
3 phases:
- Phase 1 (backend): a query/endpoint that returns who is out on a given date, reusing `Absence` + `absenceService.ts`.
- Phase 2 (frontend): the Dashboard widget that consumes it.
- Phase 3 (backend-only): board checklist open-access authz change + default/backfilled `Report is on client's share` item. Independent of Phases 1–2 (different domain: Board/Kanban), added after they were built+verified.
Phases 1–2 split along the codebase's routes → services → frontend layering, keeping each independently plannable/testable. Phase 3 is grouped as a single backend phase because both of its changes are small, surgical, and touch the same board/checklist surface.

### Phase Ordering
Phase 1 before Phase 2 (the widget consumes the Phase 1 API — contract first). Phase 3 last, appended after 1–2 shipped; no dependency on them.

### Scope Coverage
Covers: (1) surfacing existing absence data for "today" as a dashboard widget; (2) opening board checklist check/edit to any authenticated user and adding the report-share checklist item everywhere.
Excluded / deferred: creating/editing absences, absence approval workflows, date-range/"out this week" absence views, notifications; opening the board `notes` field to non-owners (checklist only); changing the ADMIN-only archive and PM/ADMIN-only stage-lock restrictions.

## Requirement Mapping

| Phase | Requirements |
|-------|--------------|
| 1 — Out-Today Absence API | Scheduling/planner (absence data), RBAC (authenticated read consistent with `/api/schedule`) |
| 2 — Out-Today Dashboard Widget | Dashboard (widget surface), Scheduling/planner (absence display) |
| 3 — Board Checklist Open Access & Report-Share Item | Board (Kanban checklist), RBAC (authenticated checklist write; ADMIN/PM archive + stage-lock kept restricted) |

## Key Decisions

- Reuse the existing `Absence` Prisma model and `absenceService.ts` rather than introducing a new absence data model.
- Surface "out today" through the existing schedule/absence route surface, with authz consistent with current `/api/schedule` access (server authoritative).
- Build the widget inside the feature-sliced `features/dashboard` structure using shared shadcn UI primitives and the established React Query data pattern.
- Phase 3: gate checklist writes per-field — a `checklist`-only PATCH body from any authenticated user skips the assignment-ownership check; any other field keeps the existing ownership/PM/ADMIN gating. Keep `BoardCard.checklist` as free-form JSON-in-TEXT (no schema change). Seed the new default item in `DEFAULT_CHECKLIST` and backfill existing cards with a manual idempotent `npx tsx` script (matches repo one-off-script convention).

## Deferred Ideas

- "Out this week" / date-range absence views (a Phase 03 for this was scoped and then aborted by the user — the projects dashboard uses two always-visible Current/Next columns, not a toggle; revisit if wanted).
- Absence creation/editing from the dashboard widget.
- Notifications when someone is out.
- Opening the board `notes` field to non-owners (Phase 3 opened checklist only).
