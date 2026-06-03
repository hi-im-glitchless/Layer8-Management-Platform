---
phase: 24
plan: 04
title: "Dashboard Current/Next ProjectCard → /board?card=<id>"
wave: 2
status: complete
completed: 2026-05-07
tasks_completed: 3
tasks_total: 3
commit_hashes:
  - eccbeccc5f1a9a160c6e49d970f2e21416d7c384
  - b0cda26031b61fbb59d19bd2185410c3f9031934
  - a5758c1570b888a1f2196b730337e9d09f8c8b46
files_modified:
  - frontend/src/features/dashboard/types.ts
  - frontend/src/features/dashboard/utils.ts
  - frontend/src/features/dashboard/components/ProjectCard.tsx
deviations:
  - code: DEVN-01
    summary: "Plan listed Dashboard.tsx as a contingent fourth file but its Task 4 explicitly says to skip the edit if the assignmentId already arrives intact at ProjectCard. Confirmed by inspection — Dashboard.tsx passes the entire project object through (lines 118/130: `<ProjectCard project={currentProject} variant=...>`), so the new assignmentId field flows through without code changes. Task 4's optional chore commit is omitted per the plan's own instruction."
pre_existing_issues: []
ac_results:
  - criterion: "DashboardProject type gains a new optional field assignmentId: string | undefined; existing fields remain unchanged"
    verdict: "pass"
    evidence: "frontend/src/features/dashboard/types.ts:16 — `assignmentId?: string` added with JSDoc; existing 8 fields (projectName, projectColor, clientName, tags, startDate, endDate, durationWeeks, status) untouched; commit eccbecc"
  - criterion: "buildProjectTimeline populates assignmentId from the underlying Assignment.id; if no Assignment underpins the row, assignmentId stays undefined"
    verdict: "pass"
    evidence: "frontend/src/features/dashboard/utils.ts:85 — `assignmentId: assignment.id` added to the new-group construction; the `if (assignments.length === 0) return []` empty path never builds a row, so synthetic-empty stays undefined; commit b0cda26"
  - criterion: "ProjectCard becomes a clickable element when assignmentId is present, using same query key as 24-02 (queryClient.fetchQuery on click, NOT a useQuery)"
    verdict: "pass"
    evidence: "frontend/src/features/dashboard/components/ProjectCard.tsx:121-124 — queryClient.fetchQuery with queryKey ['board', 'cards', { assignmentId }] (matches useBoardCardByAssignmentId in board/hooks.ts:41) and queryFn boardApi.getCards({ assignmentId }); fires on click only, not at render"
  - criterion: "If assignmentId is undefined OR the lookup returns no card, ProjectCard is a static <div> / silent no-op"
    verdict: "pass"
    evidence: "ProjectCard.tsx:103-109 — early return renders inert <div> when !assignmentId; ProjectCard.tsx:127-130 — `if (cardId) navigate(...)` else silent; catch block also silent (consistent with 24-02/24-03 pattern)"
  - criterion: "Hover/focus styling matches existing app conventions; no nested anchors"
    verdict: "pass"
    evidence: "ProjectCard.tsx:138 — uses `hover:bg-accent/10 transition-colors` (matches the commented-out card style in Dashboard.tsx:53,68 and other clickable cards) plus `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`; `grep -nE '<a |<Link' src/features/dashboard/components/ProjectCard.tsx` returns zero matches in JSX (only in comments)"
  - criterion: "Phase 24 schedule-isolation invariant: only frontend files modified; zero writes to Assignment / TeamMember / Absence / Holiday tables"
    verdict: "pass"
    evidence: "git diff --stat eccbecc..a5758c1 covers only three files all under frontend/src/features/dashboard/; no backend or schema files touched; lookup uses GET /api/board/cards (read-only)"
  - criterion: "artifact: frontend/src/features/dashboard/types.ts contains 'assignmentId'"
    verdict: "pass"
    evidence: "grep -n 'assignmentId' src/features/dashboard/types.ts → line 16"
  - criterion: "artifact: frontend/src/features/dashboard/utils.ts contains 'assignmentId'"
    verdict: "pass"
    evidence: "grep -n 'assignmentId' src/features/dashboard/utils.ts → line 85"
  - criterion: "artifact: frontend/src/features/dashboard/components/ProjectCard.tsx contains '/board?card=' AND 'Link'"
    verdict: "pass"
    evidence: "grep '/board?card=' → line 126 (`navigate(\\`/board?card=\\${cardId}\\`)`); grep 'Link' → lines 114, 116 in the design-rationale comment explaining why we chose useNavigate over a react-router Link"
  - criterion: "key link: ProjectCard navigates to Board.tsx via /board?card=<id>; Board reads ?card via 24-01 plumbing"
    verdict: "pass"
    evidence: "ProjectCard.tsx:126 calls navigate(`/board?card=${cardId}`); Board.tsx (24-01 commit 4c1f939) syncs ?card to selectedCardId, opening the card detail modal"
  - criterion: "key link: ProjectCard uses assignmentId→cardId lookup at click time via the same cache key as 24-02"
    verdict: "pass"
    evidence: "ProjectCard.tsx queryKey ['board', 'cards', { assignmentId }] matches board/hooks.ts:41 useBoardCardByAssignmentId (24-02), so cache hits cross both surfaces"
  - criterion: "TypeScript clean: cd frontend && npx tsc --noEmit exits 0"
    verdict: "pass"
    evidence: "Run via Node v20.20.2 from $HOME/.nvm/versions/node/v20.20.2/bin/npx — exit 0, no diagnostic output"
---

ProjectCards on the Dashboard ("Current Project" / "Next Project") are now clickable and deep-link to the corresponding board card via /board?card=<id>. The navigation reuses the URL plumbing from plan 24-01 and the cache key from plan 24-02, so opening the board after the click hits cache rather than refetching.

## What Was Built

- Added optional `assignmentId?: string` to the `DashboardProject` type with a JSDoc explaining its role as the deep-link anchor (commit eccbecc).
- Threaded `assignment.id` through `buildProjectTimeline` so each new project group captures its anchor assignment id; consecutive-week continuations preserve the first assignment's id, and synthetic empty paths leave the field undefined (commit b0cda26).
- Converted `ProjectCard` from an inert `<div>` to a `<button>` when `assignmentId` is present. On click, the component performs the assignmentId→cardId lookup via `queryClient.fetchQuery` (NOT `useQuery`, to avoid spawning N parallel queries on dashboard mount) using the same query key as `useBoardCardByAssignmentId` from plan 24-02. Successful lookup navigates in-place to `/board?card=<id>`; a missing card or network error is a silent no-op. When `assignmentId` is undefined (placeholder rows), the card renders as the original static `<div>` — visually identical to before, no button wrapper (commit a5758c1).
- Hover/focus styling uses Tailwind classes that match other clickable cards in the codebase (`hover:bg-accent/10`, `transition-colors`, `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`).
- TypeScript clean: `cd frontend && npx tsc --noEmit` exits 0.
- `Dashboard.tsx` was listed as a contingent fourth file in the plan; live inspection confirmed the route already passes the full `project` object through to `ProjectCard`, so no edit was needed (per Task 4's own escape clause).

## Files Modified

- `frontend/src/features/dashboard/types.ts` — modify: add optional `assignmentId?: string` field to `DashboardProject` interface with JSDoc explaining its role.
- `frontend/src/features/dashboard/utils.ts` — modify: in `buildProjectTimeline`, populate `assignmentId: assignment.id` when constructing each new project group; continuations and synthetic empty rows leave it undefined naturally.
- `frontend/src/features/dashboard/components/ProjectCard.tsx` — modify: split the card body into a shared `cardBody` JSX fragment; render an inert `<div>` wrapper when `assignmentId` is undefined and an interactive `<button>` (with hover/focus styling and a click-time assignmentId→cardId lookup via `queryClient.fetchQuery`) when it is present. Successful lookup calls `navigate('/board?card=<id>')`; missing card / errors are silent no-ops.

## Deviations

- **DEVN-01 (minor):** Plan listed `frontend/src/routes/Dashboard.tsx` as a contingent fourth file. Inspection of `Dashboard.tsx:117-118` and `:129-130` confirmed the route already passes the full `project` object through to `ProjectCard`, so the new `assignmentId` field flows through with zero code changes. Per Task 4's own instruction ("if the live edit ends up empty, document that in the plan summary"), the optional `chore(24-04)` commit was omitted and `Dashboard.tsx` was NOT staged.

## Plan Amendment Reference

*See `.vbw-planning/phases/24-project-board-schedule-integration/remediation/qa/round-01/R01-PLAN.md` Task 1 amendment (and the resulting `R01-SUMMARY.md`) for the formal `resolved-by-contingent-skip` classification of DEVN-01. The amendment block in 24-04-PLAN.md (under "Task 4 — Amendment (QA Round 01, resolved-by-contingent-skip)") quotes the original escape-clause text and records the Dashboard.tsx:117-118 / :129-130 live-inspection evidence. The existing `deviations[]` YAML entry above is preserved verbatim; this section is purely additive cross-referencing per the QA contract.*
