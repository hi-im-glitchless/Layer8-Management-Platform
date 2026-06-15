---
phase: 5
plan: "01"
title: Status sync — schedule status edit propagates to board card
status: complete
completed: 2026-06-03
tasks_completed: 4
tasks_total: 4
commit_hashes:
  - f95891d
  - dbe1cdf
  - 576e225
  - b83672f
deviations: []
pre_existing_issues: []
ac_results:
  - criterion: "upsertByKey UPDATES Project.status (and color) when the project already exists and the incoming value differs, instead of returning the stale row"
    verdict: "pass"
    evidence: "f95891d projectService.ts upsertByKey; dbe1cdf projectUpsertStatus.test.ts (2/2 pass)"
  - criterion: "The dedupe key {name, clientId, tags} and the BoardCard auto-create-on-first-creation behavior are unchanged"
    verdict: "pass"
    evidence: "f95891d — only the if(existing) branch changed; create-with-BoardCard branch and dedupe where-triple untouched"
  - criterion: "KanbanCard memo comparator re-renders the card when card.project.status (or color, or client.name) changes"
    verdict: "pass"
    evidence: "576e225 KanbanCard.tsx comparator; b83672f KanbanCard.test.tsx re-render test (6/6 pass)"
  - criterion: "The status-edit save path from the schedule invalidates ['board','cards'] so the board refetches"
    verdict: "pass"
    evidence: "b83672f hooks.ts useUpdateAssignment line 148; useUpsertAssignment already line 131"
  - criterion: "Board read path stays read-only against Assignment/TeamMember/Absence/Holiday; only Project is written; no Prisma migration is introduced"
    verdict: "pass"
    evidence: "upsertByKey writes only Project (+ existing BoardCard auto-create); no migration files added (git status clean of prisma/migrations)"
  - criterion: "backend/src/services/projectService.ts contains prisma.project.update"
    verdict: "pass"
    evidence: "f95891d — grep confirms prisma.project.update present"
  - criterion: "frontend/src/features/board/components/KanbanCard.tsx contains prev.card.project.status === next.card.project.status"
    verdict: "pass"
    evidence: "576e225 — grep confirms the comparator line present"
  - criterion: "frontend/src/features/schedule/hooks.ts contains queryKey: ['board', 'cards'] in both useUpsertAssignment and useUpdateAssignment"
    verdict: "pass"
    evidence: "b83672f — grep shows ['board','cards'] at lines 131 and 148"
---

Bug 1 fully resolved: schedule status (and color) edits now propagate to the Planner board card via a backend upsertByKey sync-on-found, a KanbanCard memo comparator that tracks project.status/color/client.name, and board-cache invalidation on the useUpdateAssignment path.

## What Was Built

- Backend `upsertByKey` now UPDATEs `Project.status`/`Project.color` when an existing project's values differ from the incoming ones (last-writer-wins), instead of returning the stale row. Dedupe triple {name, clientId, tags} and the first-creation BoardCard auto-create are unchanged; only the `Project` table is written.
- New backend regression test (`projectUpsertStatus.test.ts`, 2 cases) proving status/color sync-on-found with id stability / no duplicate, and a no-op when values match. Seeds only Client + Project (+ auto BoardCard); schedule-isolated tables untouched; scoped afterEach cleanup with a withDbRetry wrapper for SQLite single-writer contention.
- KanbanCard memo comparator extended with `project.status`, `project.color`, and `project.client?.name` equality checks so the card re-renders on a status/color/client change instead of memoizing stale.
- `useUpdateAssignment.onSuccess` now invalidates `['board','cards']` (mirroring `useUpsertAssignment`); new KanbanCard test asserts the status badge re-renders ("Confirmed" → "Placeholder") when `project.status` changes.

## Files Modified

- `backend/src/services/projectService.ts` -- modified: upsertByKey syncs status/color on existing projects (f95891d)
- `backend/src/services/__tests__/projectUpsertStatus.test.ts` -- created: regression test for status/color sync-on-found (dbe1cdf)
- `frontend/src/features/board/components/KanbanCard.tsx` -- modified: memo comparator covers project.status/color/client.name (576e225)
- `frontend/src/features/schedule/hooks.ts` -- modified: useUpdateAssignment invalidates ['board','cards'] (b83672f)
- `frontend/src/features/board/components/__tests__/KanbanCard.test.tsx` -- modified: re-render-on-status-change test + makeCard projectOverrides param (b83672f)

## Deviations

None. All work stayed within the plan's listed files and intent. No Prisma migration introduced; schedule isolation preserved (only Project written; board read path remains read-only against Assignment/TeamMember/Absence/Holiday).
