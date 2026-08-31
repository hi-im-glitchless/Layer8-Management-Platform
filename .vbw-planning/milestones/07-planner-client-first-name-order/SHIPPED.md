# Shipped: Planner Client-First Name Order

**Shipped:** 2026-08-31
**Slug:** `07-planner-client-first-name-order`
**Tag:** `milestone/07-planner-client-first-name-order`

## What shipped

The Planner (the Kanban board at `/board`) now reads **client-first**: the client name leads and the project name follows, on both Planner surfaces, with the visual emphasis following the position.

- **Kanban card** (`KanbanCard.tsx`) — row 1 is the client name in the `text-lg font-semibold leading-tight line-clamp-2` headline style; row 2 is the project name in `text-sm font-bold leading-tight`. The pin indicator travels with row 1, staying top-right.
- **Card detail modal** (`CardDetailModal.tsx`) — `DialogTitle` carries the client name with the project name on a smaller bold line beneath it. The duplicate client `<span>` was removed from the meta row, which is now tags-only.
- **Clientless fallback** — `Project.clientId` is nullable (`onDelete: SetNull`, and deleting a Client through `ClientManager` nulls it on live projects), so both surfaces use the chained-OR idiom `client?.name || project.name || '(No project)'` with the second line guarded on the client name. A clientless project promotes its own name into the headline and renders it exactly once: never blank, never duplicated.

Deliberately out of scope and left byte-identical: the schedule grid (`AssignmentCell.tsx`) and the HTML export (`exportHtml.ts`), which already rendered `client - project`; and the dashboard `ProjectCard.tsx`, a different surface.

## Metrics

| | |
|---|---|
| Phases | 1 |
| Plans | 1 |
| Tasks | 4 |
| Commits | 5 (4 feature/test + 1 remediation docs) |
| Deviations | 0 |
| Tests | 98/98 across 15 files; KanbanCard 16 → 20, CardDetailModal 5 → 7 |

## Commits

| Commit | Message |
|---|---|
| `cbcdcb2` | `feat(board): lead planner cards with the client name` |
| `82b135a` | `test(board): cover planner card client-first name order` |
| `3e1cb23` | `feat(board): lead the card detail modal header with the client name` |
| `af619c4` | `test(board): cover the modal header client-first name order` |
| `eb51be3` | `docs(concerns): record accepted Radix dialog description and repo-wide lint exceptions (R01)` |

## Verification

- **QA (phase-level):** PASS — 31/32 checks, 1 WARN, 0 FAIL. The WARN was on the written rationale of a mid-execution plan amendment, not on delivered behaviour; the rationale was corrected in `01-01-PLAN.md`.
- **QA remediation R01:** PASS — 9/9. Triggered by `known_issues_override` (two tracked pre-existing issues blocking UAT), not by any defect. Documentation-only round.
- **UAT:** 5/5 pass, replayed through `ui-seed/uat_replay_09.py` with screenshots in `ui-seed/uat-screenshots/`.

## Accepted exceptions carried forward

Both were dispositioned `accepted-process-exception` and recorded as tracked items in `.vbw-planning/codebase/CONCERNS.md` — **deferred with an owner, not discharged**:

- **Item 18 (Accessibility).** `CardDetailModal.tsx:497` and `ClientNotesModal.tsx:46` render a Radix `DialogContent` without a `Description`. The dialogs are correctly *named* (`aria-labelledby` resolves to the `DialogTitle`, so WCAG 4.1.2 holds — and this milestone improved the accessible name by putting the client first), but `aria-describedby` is set to an ID that resolves to `null`. AT drops it silently, so impact is negligible. Not fixed here because the cheap patch (`aria-describedby={undefined}`) buys zero accessibility and only silences the warning, while a real `DialogDescription` needs description copy nobody has specified and would land in the exact `DialogHeader` subtree this milestone changed. These two are the only dialogs in the repo lacking `DialogDescription` (16 `DialogContent` users vs 14 `DialogDescription` users), so a one-file patch would leave the pattern half-addressed. **A small follow-up milestone covering both modals is the right home for this.**
- **Item 19 (Lint / tooling debt).** `eslint .` reports 59 problems (45 errors, 14 warnings) across 31 files, none in the four files this milestone touched. Neither `build` (`tsc -b && vite build`) nor CI gates lint — there is no `.github/workflows` at the repo root — so this backlog is unenforced and needs its own cleanup phase.

## Note on DEVN-05

`react-refresh/only-export-components` on `KanbanCard.tsx`, listed open at `CONCERNS.md:30`, **no longer reproduces**. `npx eslint src/features/board` exits 0 with the rule confirmed active via `--print-config`, identical before and after this milestone's diff. Root cause of the non-reproduction: the `findCardById` non-component export that originally triggered it is no longer in the file, refactored away sometime after Phase 22. Left untouched by this milestone — no fix, no disable comment. **The `CONCERNS.md` entry appears stale and is a candidate for retirement**, but resolving it was outside this milestone's scope.
