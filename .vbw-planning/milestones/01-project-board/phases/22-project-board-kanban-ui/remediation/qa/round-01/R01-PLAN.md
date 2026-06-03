---
phase: 22
round: 1
plan: R01
title: "QA Remediation R01 — Document weekStart sort relocation (MH-T06)"
type: remediation
autonomous: true
effort_override: balanced
skills_used: []
files_modified:
  - .vbw-planning/phases/22-project-board-kanban-ui/22-02-PLAN.md
forbidden_commands: []
fail_classifications:
  - {id: "MH-T06", type: "plan-amendment", source_plan: "22-02-PLAN.md", rationale: "weekStart-ascending sorting IS genuinely guaranteed in the parent/data layer, exactly as 22-02-SUMMARY deviations[2] claimed. Board.tsx (line 38) reads data.cards, computes cardsByStage via groupCardsByStage(filteredCards) in a useMemo (lines 170-173), and passes cardsByStage[stage] to <KanbanColumn cards=...> (line 297). groupCardsByStage (frontend/src/features/board/types.ts lines 123-152) sorts each stage group ascending by the earliest assignment.weekStart using localeCompare, with assignment-less cards sorted last via a sentinel. The truth is satisfied; KanbanColumn is correctly a pure presentational renderer. The only defect is that 22-02-PLAN.md never recorded this relocation as an explicit amendment under the MH-T06 truth (unlike the client-name amendment at PLAN.md line 54). This is a documentation/traceability gap, not a code defect — code-fix would add a redundant second sort. Resolution: add the missing Amendment block to the source plan."}
known_issues_input: []
known_issue_resolutions: []
must_haves:
  truths:
    - "22-02-PLAN.md records an explicit Amendment (R01-QA) block under the MH-T06 truth documenting that weekStart-ascending sorting lives in the board data layer (groupCardsByStage), not in KanbanColumn"
  artifacts:
    - path: .vbw-planning/phases/22-project-board-kanban-ui/22-02-PLAN.md
      provides: "Documented plan-amendment for the MH-T06 sorting truth"
      contains: "Amendment (R01-QA)"
  key_links:
    - from: .vbw-planning/phases/22-project-board-kanban-ui/22-02-PLAN.md
      to: frontend/src/features/board/types.ts
      via: "Amendment block names groupCardsByStage as the location of weekStart sorting"
---
<objective>
Resolve QA FAIL MH-T06 ("Cards sorted by assignment.weekStart ascending within each column") as a plan-amendment. Investigation confirmed the sort is genuinely guaranteed at the board data layer — not missing. KanbanColumn is intentionally a pure presentational renderer of its `cards` prop; the parent Board.tsx pre-sorts cards per stage via `groupCardsByStage`. The original 22-02-SUMMARY recorded this as a deviation, but 22-02-PLAN.md never documented the corresponding amendment under the MH-T06 truth. This plan adds that explicit amendment block to the source plan so the plan, the shipped code, and the verification agree. No product code is modified.
</objective>
<context>
@.vbw-planning/phases/22-project-board-kanban-ui/22-02-PLAN.md
@.vbw-planning/phases/22-project-board-kanban-ui/22-02-SUMMARY.md
@.vbw-planning/phases/22-project-board-kanban-ui/22-VERIFICATION.md
@frontend/src/features/board/types.ts
@frontend/src/routes/Board.tsx
@frontend/src/features/board/components/KanbanColumn.tsx

Evidence chain (verified at commit b7828564):
- frontend/src/routes/Board.tsx:38 — `const cards = data?.cards`
- frontend/src/routes/Board.tsx:170-173 — `const cardsByStage = useMemo(() => groupCardsByStage(filteredCards), [filteredCards])`
- frontend/src/routes/Board.tsx:297 — `<KanbanColumn ... cards={cardsByStage[stage] ?? []} ... />`
- frontend/src/features/board/types.ts:123-152 — `groupCardsByStage` sorts each stage group ascending by earliest `assignment.weekStart` via `localeCompare`; cards with no assignments sort last (sentinel `'￿'`).
- frontend/src/features/board/components/KanbanColumn.tsx:43-49 — renders `cards.map` verbatim (pure presentational, memo-friendly).
Rationale for plan-amendment over code-fix: the truth is already satisfied; adding a second sort inside KanbanColumn would be redundant and would couple a presentational component to data-shaping concerns. The defect is purely the missing plan documentation.
</context>
<tasks>
<task type="auto">
  <name>Add Amendment (R01-QA) block under the MH-T06 sorting truth in 22-02-PLAN.md</name>
  <files>
    .vbw-planning/phases/22-project-board-kanban-ui/22-02-PLAN.md
  </files>
  <action>
Edit `.vbw-planning/phases/22-project-board-kanban-ui/22-02-PLAN.md` to add an explicit amendment documenting where weekStart sorting lives, mirroring the existing client-name amendment style at line 54 (`> **Amendment (R01):** ...`).

The plan body has no dedicated section that restates the MH-T06 truth (the sorting truth appears only in the `must_haves.truths` frontmatter array, line 19, and is implied by Task 2 which renders the card list). Add the amendment in the most discoverable place that ties it to the column-rendering task. Under Task 2 ("Create KanbanColumn component"), immediately after the "Cards: map `cards` rendering `<KanbanCard>` for each" bullet (line 73), insert a blockquote:

> **Amendment (R01-QA):** The MH-T06 truth "Cards sorted by `assignment.weekStart` ascending within each column" is satisfied at the board data layer, not inside KanbanColumn. KanbanColumn is intentionally a pure presentational renderer of its `cards` prop. Sorting is performed by `groupCardsByStage` in `frontend/src/features/board/types.ts` (sorts each stage group ascending by earliest `assignment.weekStart` via `localeCompare`; cards with no assignments sort last). The parent `frontend/src/routes/Board.tsx` calls `groupCardsByStage(filteredCards)` in a memo and passes the pre-sorted `cardsByStage[stage]` into `<KanbanColumn cards=...>`. Rationale: ordering belongs with data assembly so the column stays dumb and memo-friendly; this matches existing board conventions and avoids a redundant in-component sort. This formalizes the deviation recorded in 22-02-SUMMARY deviations[2].

Use the exact REQ/truth wording above. Do NOT alter the frontmatter `must_haves.truths` array, any other task, or any code file. This is a single additive blockquote in the markdown body.
  </action>
  <verify>
grep -n "Amendment (R01-QA)" .vbw-planning/phases/22-project-board-kanban-ui/22-02-PLAN.md
grep -n "groupCardsByStage" .vbw-planning/phases/22-project-board-kanban-ui/22-02-PLAN.md
git -C /home/rm/Documents/Layer8-Management-Platform diff --name-only -- frontend/   # expect: empty (no product code touched)
  </verify>
  <done>
22-02-PLAN.md contains an "Amendment (R01-QA)" blockquote under Task 2 that names `groupCardsByStage` (in `frontend/src/features/board/types.ts`) and `Board.tsx` as the location of weekStart-ascending sorting, references the MH-T06 truth, and explains the rationale. No frontend/backend source files are modified.
  </done>
</task>
</tasks>
<verification>
1. `grep -n "Amendment (R01-QA)" .vbw-planning/phases/22-project-board-kanban-ui/22-02-PLAN.md` returns a match.
2. The amendment text names both `groupCardsByStage` / `types.ts` and `Board.tsx`, and references the `assignment.weekStart` ascending sort.
3. `git -C /home/rm/Documents/Layer8-Management-Platform diff --name-only` shows only `22-02-PLAN.md` (and the new R01 plan/summary artifacts) changed — no `frontend/` or `backend/` source files.
4. Re-verification of MH-T06 against the live source still holds: `groupCardsByStage` in `frontend/src/features/board/types.ts` sorts by earliest `weekStart` ascending and is wired into `Board.tsx` -> `KanbanColumn`.
</verification>
<success_criteria>
- MH-T06 is classified and resolved as a plan-amendment with source_plan 22-02-PLAN.md.
- 22-02-PLAN.md documents, under the MH-T06 truth, that weekStart-ascending sorting is performed by `groupCardsByStage` (`frontend/src/features/board/types.ts`) and consumed by `Board.tsx`, with rationale — mirroring the existing client-name amendment style.
- No product code (frontend/backend) is modified; the truth was already satisfied in the shipped code.
- Plan, shipped code, and verification are now mutually consistent on MH-T06.
</success_criteria>
<known_issue_workflow>
- No carried known issues this round (input_mode: verification). `known_issues_input` and `known_issue_resolutions` are both empty arrays.
</known_issue_workflow>
<output>
R01-SUMMARY.md
</output>
