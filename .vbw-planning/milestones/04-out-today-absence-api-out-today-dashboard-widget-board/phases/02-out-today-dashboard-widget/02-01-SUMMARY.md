---
phase: 2
plan: "01"
title: Out-Today Dashboard Widget
status: complete
completed: 2026-07-02
tasks_completed: 5
tasks_total: 5
commit_hashes:
  - 769cb73
  - 53fc0e5
  - 4952fed
  - 3e497aa
  - 2704268
deviations: []
pre_existing_issues:
  - "{test: 'eslint (npm run lint)', file: 'frontend — 15 sites across unrelated files', error: '@typescript-eslint/no-unused-vars (pre-existing; none in the 5 changed files)'}"
  - "{test: 'eslint (npm run lint)', file: 'frontend — 13 sites (e.g. routes/TemplateAdapter.tsx, routes/ExecutiveReport.tsx)', error: 'react-hooks/set-state-in-effect (pre-existing)'}"
  - "{test: 'eslint (npm run lint)', file: 'frontend — 13 sites across unrelated files', error: 'react-hooks/exhaustive-deps (pre-existing)'}"
  - "{test: 'eslint (npm run lint)', file: 'frontend — 6 sites across unrelated files', error: 'react-hooks/refs (pre-existing)'}"
  - "{test: 'eslint (npm run lint)', file: 'frontend/src/components/ui/{badge,button}.tsx + others (3 sites)', error: 'react-refresh/only-export-components (pre-existing)'}"
  - "{test: 'eslint (npm run lint)', file: 'frontend — 3 sites', error: 'react-hooks/preserve-manual-memoization (pre-existing)'}"
  - "{test: 'eslint (npm run lint)', file: 'frontend — 2 sites', error: '@typescript-eslint/no-explicit-any (pre-existing)'}"
  - "{test: 'eslint (npm run lint)', file: 'frontend — 1 site', error: 'react-hooks/incompatible-library (pre-existing)'}"
ac_results:
  - criterion: "Widget renders on the Dashboard '/' route as a new section after 'Your Schedule'"
    verdict: "pass"
    evidence: "commit 2704268 — <OutTodayWidget/> in a new space-y-4 section at src/routes/Dashboard.tsx:158-160, after the schedule section's closing </div>"
  - criterion: "Data loads via React Query hook useAbsencesOutToday consuming GET /api/schedule/absences/out-today through the shared apiClient wrapper"
    verdict: "pass"
    evidence: "commits 4952fed (useAbsencesOutToday) + 53fc0e5 (scheduleApi.getAbsencesOutToday → apiClient)"
  - criterion: "Widget handles loading (skeleton), empty ('no one is out today'), and error states"
    verdict: "pass"
    evidence: "commit 3e497aa — isLoading/isError/empty/data branches in OutTodayWidget.tsx"
  - criterion: "No backend files are modified — frontend-only change"
    verdict: "pass"
    evidence: "git diff --name-only 769cb73^..HEAD lists only the 5 frontend files; zero backend/ paths"
  - criterion: "tsc build and eslint pass with no new errors"
    verdict: "pass"
    evidence: "npm run build clean (tsc -b && vite build); eslint on the 5 changed files exits 0"
  - criterion: "artifact types.ts contains AbsencesOutTodayResponse"
    verdict: "pass"
    evidence: "commit 769cb73 — AbsenceOutEntry + AbsencesOutTodayResponse at src/features/schedule/types.ts:86-102"
  - criterion: "artifact api.ts contains getAbsencesOutToday"
    verdict: "pass"
    evidence: "commit 53fc0e5 — scheduleApi.getAbsencesOutToday at src/features/schedule/api.ts:134"
  - criterion: "artifact hooks.ts contains useAbsencesOutToday"
    verdict: "pass"
    evidence: "commit 4952fed — key ['schedule','absences','out-today',date] at src/features/schedule/hooks.ts:213"
  - criterion: "artifact OutTodayWidget.tsx contains OutTodayWidget"
    verdict: "pass"
    evidence: "commit 3e497aa — named export OutTodayWidget"
  - criterion: "artifact Dashboard.tsx contains OutTodayWidget"
    verdict: "pass"
    evidence: "commit 2704268 — import + render of OutTodayWidget"
---

Added a frontend-only "Out Today" dashboard widget that lists team members absent today, consuming the Phase 01 GET /api/schedule/absences/out-today endpoint through the established scheduleApi/React Query pattern.

## What Was Built

- `AbsenceOutEntry` + `AbsencesOutTodayResponse` types mirroring the backend out-today projection.
- `scheduleApi.getAbsencesOutToday(params?)` wrapping the endpoint via the shared `apiClient`, with an optional `date` query param.
- `useAbsencesOutToday(date?)` React Query hook, key `['schedule','absences','out-today',date]`, no staleTime (mirrors `useAbsences`).
- `OutTodayWidget` component with loading (skeleton), error, empty ("No one is out today"), and populated-list branches; per-row displayName, type label map (holiday/sick/vacation/other with raw-string fallback), and reason subtext.
- Dashboard route wires the widget into a new `space-y-4` section immediately after "Your Schedule", preserving outer `space-y-6` layout.

## Files Modified

- `frontend/src/features/schedule/types.ts` -- add: `AbsenceOutEntry` + `AbsencesOutTodayResponse` interfaces.
- `frontend/src/features/schedule/api.ts` -- add: `getAbsencesOutToday` to `scheduleApi`; import response type.
- `frontend/src/features/schedule/hooks.ts` -- add: `useAbsencesOutToday` hook.
- `frontend/src/features/dashboard/components/OutTodayWidget.tsx` -- create: widget component (loading/error/empty/data).
- `frontend/src/routes/Dashboard.tsx` -- edit: import + render `OutTodayWidget` section after "Your Schedule".

## Verification Evidence

- `npm run build` (tsc -b && vite build): clean; only the pre-existing informational >500 kB chunk-size notice.
- `npm run lint` on the 5 changed files: exits 0 (no errors/warnings). Whole-repo `npm run lint` reports 59 pre-existing problems in 31 unrelated files — recorded under `pre_existing_issues` (DEVN-05); no new errors introduced.
- `git diff --name-only 769cb73^..HEAD`: only the 5 frontend files; no backend paths.

## Deviations

None.
