---
milestone: 04-out-today-absence-api-out-today-dashboard-widget-board
shipped: 2026-07-02
phases: 3
tasks: 12
tag: milestone/04-out-today-absence-api-out-today-dashboard-widget-board
---

# Shipped: Out-Today Dashboard + Board Checklist Access

Two feature threads delivered on the Layer8 Management Platform.

## Phases

1. **Out-Today Absence API** — backend endpoint `GET /api/schedule/absences/out-today` returning who is absent on a given date, reusing the existing `Absence` model + `absenceService`. QA verified.
2. **Out-Today Dashboard Widget** — Dashboard `/` widget listing users out today via the established React Query pattern (`useAbsencesOutToday` → `scheduleApi.getAbsencesOutToday` → `apiClient`), with loading/empty/error states. QA PASS (16/16) + UAT PASS (3/3).
3. **Board Checklist — Open Access & Report-Share Item** — `PATCH /api/board/cards/:id` now lets any authenticated user check/uncheck checklist items on any project's card (checklist-only bodies skip the ownership check; ADMIN-only archive and PM/ADMIN-only stage-lock unchanged). `DEFAULT_CHECKLIST` gained a `Report is on client's share` item (default on new cards; idempotent backfill script for existing cards). QA PASS + UAT PASS (3/3).

## Notable

- Phase 03 QA required one remediation round (round 01): the two implementation deviations were recorded as plan-amendments and 9 pre-existing/environment-dependent test failures were accepted as process-exceptions. A known VBW quote-escaping gate quirk was normalized to let the gate pass.

## Operational follow-up (one-time, on deploy)

- Run the existing-card backfill once against the deployed DB:
  `npx tsx backend/scripts/backfill-checklist-report-share-item.ts` (idempotent; safe to re-run).
