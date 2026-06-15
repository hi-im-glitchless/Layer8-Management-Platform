---
phase: 5
round: 1
plan: R01
title: Fix react-hooks purity & refs lint violations in CardDetailModal
type: remediation
autonomous: true
effort_override: balanced
skills_used: []
files_modified: [frontend/src/features/board/components/CardDetailModal.tsx]
forbidden_commands: []
fail_classifications: []
known_issues_input:
  - '{"test":"eslint src/features/board/components/CardDetailModal.tsx","file":"frontend/src/features/board/components/CardDetailModal.tsx:404","error":"react-hooks/refs — Cannot update ref (markReadRef.current) during render. Pre-existing on HEAD, unrelated to the title-row padding change."}'
  - '{"test":"eslint src/features/board/components/CardDetailModal.tsx","file":"frontend/src/features/board/components/CardDetailModal.tsx:91","error":"react-hooks/purity — Cannot call impure function (Date.now()/new Date()) during render in editability check. Pre-existing on HEAD, unrelated to the title-row padding change."}'
known_issue_resolutions:
  - '{"test":"eslint src/features/board/components/CardDetailModal.tsx","file":"frontend/src/features/board/components/CardDetailModal.tsx:404","error":"react-hooks/refs — Cannot update ref (markReadRef.current) during render. Pre-existing on HEAD, unrelated to the title-row padding change.","disposition":"resolved","rationale":"Move the markReadRef.current = markReadMutate assignment out of the render body into a useEffect so the ref is updated post-render. The mark-read effect still reads the latest mutate via ref; once-per-open-transition fire behavior on [open, cardId] is preserved."}'
  - '{"test":"eslint src/features/board/components/CardDetailModal.tsx","file":"frontend/src/features/board/components/CardDetailModal.tsx:91","error":"react-hooks/purity — Cannot call impure function (Date.now()/new Date()) during render in editability check. Pre-existing on HEAD, unrelated to the title-row padding change.","disposition":"resolved","rationale":"Move the Date.now() clock read out of the render body. Evaluate the EDIT_WINDOW_MS window at interaction time (when the user clicks edit) instead of during render, preserving the same 10-minute author-edit-window semantics for showing/permitting comment edits."}'
must_haves:
  truths:
    - "ESLint no longer reports react-hooks/purity at CardDetailModal.tsx:~91 (Date.now()/new Date() not called during render)"
    - "ESLint no longer reports react-hooks/refs at CardDetailModal.tsx:~404 (markReadRef.current not assigned during render)"
    - "Comment editability behavior is unchanged: an author can still edit/delete their own non-deleted comment only within EDIT_WINDOW_MS (10 minutes) of createdAt"
    - "Mark-read behavior is unchanged: opening the modal for a cardId fires markRead once per open transition (effect keyed on [open, cardId]) clearing the sidebar dot"
    - "Phase-5 Bug-2 fix is intact: the modal title row pr-8 padding and other modal behavior are unaffected"
    - "frontend builds clean: tsc -b && vite build green"
  artifacts:
    - path: "frontend/src/features/board/components/CardDetailModal.tsx"
      provides: "CardDetailModal with lint-clean editability check and mark-read ref handling"
      contains: "useEffect"
  key_links:
    - from: "frontend/src/features/board/components/CardDetailModal.tsx"
      to: "react-hooks/purity + react-hooks/refs ESLint rules"
      via: "neither rule fires on the file after the fix"
---
<objective>
Resolve two carried, pre-existing react-hooks ESLint violations in CardDetailModal.tsx as pure lint-correctness fixes. These are not behavior changes: the comment editability time-window and the mark-read-on-open behavior must remain byte-for-byte equivalent in observable behavior. No contract FAILs this round; input_mode=known-issues, both issues dispositioned resolved.
</objective>
<context>
@frontend/src/features/board/components/CardDetailModal.tsx
Relevant render-time facts:
- Line 49: `const EDIT_WINDOW_MS = 10 * 60 * 1000`.
- Lines 88-91 (inside `CommentRow`): `inWindow = isAuthor && !comment.isDeleted && Date.now() - new Date(comment.createdAt).getTime() < EDIT_WINDOW_MS`. `inWindow` gates whether the author may edit/delete the comment. The `Date.now()` call during render is the purity violation.
- Lines 402-409 (inside `CardDetailModal`): `markReadMutate` is captured, `markReadRef.current = markReadMutate` is assigned during render (line 404 = refs violation), and a `useEffect(..., [open, cardId])` fires `markReadRef.current({ cardId })` once per open transition.
- `formatRelative` (line 59) also calls `Date.now()` but is a plain helper function, NOT a component render body — it is not the flagged site; do not change it.
</context>
<tasks>
<task type="auto">
  <name>Fix purity (line ~91) and refs (line ~404) violations in CardDetailModal.tsx</name>
  <files>
    frontend/src/features/board/components/CardDetailModal.tsx
  </files>
  <action>
Make two surgical lint-correctness edits in this single file. Prefer keeping everything in-file (do not extract a new helper module).

1. react-hooks/refs (line ~404): Move the ref assignment out of render.
   - Remove the bare `markReadRef.current = markReadMutate` statement from the render body.
   - Update it inside a `useEffect` so the latest mutate identity is captured post-render. Either:
     (a) a dedicated `useEffect(() => { markReadRef.current = markReadMutate }, [markReadMutate])`, OR
     (b) assign `markReadRef.current = markReadMutate` as the first line inside the existing mark-read effect body (still keep deps as `[open, cardId]`), so the freshest mutate is used when firing.
   - Keep the fire-once-per-open-transition semantics: the effect that calls `markReadRef.current({ cardId })` must remain keyed on `[open, cardId]` and still guard `if (open && cardId)`. Do NOT change those deps to include `markReadMutate` (that would re-fire mark-read on unrelated mutate identity changes and break the once-per-open contract).

2. react-hooks/purity (line ~91): Move the `Date.now()` clock read out of the `CommentRow` render body, preserving the exact 10-minute author edit-window semantics.
   - The window check `isAuthor && !comment.isDeleted && (now - new Date(comment.createdAt).getTime() < EDIT_WINDOW_MS)` must NOT call `Date.now()` during render.
   - Preferred approach: evaluate the time window at interaction time. Keep the cheap, pure part (`isAuthor && !comment.isDeleted`) as the gate for showing the edit/delete affordances, and read the clock (`Date.now()`) only inside the handler that actually begins/commits an edit (and the delete handler), rejecting the action if the window has closed. This preserves the user-facing rule "author can only edit within 10 minutes" without a render-time impure call.
   - Acceptable alternative if the affordance-visibility must stay time-gated at render: capture "now" into state set from a `useEffect` (e.g. `useState(() => 0)` updated in an effect, or set on open), and compute `inWindow` against that state value rather than a live `Date.now()`. Choose whichever keeps observable behavior identical and the lint rule satisfied.
   - Do NOT touch `formatRelative` (line ~59) — it is a standalone helper, not a render body, and is not the flagged site.

Behavior preservation is mandatory: same edit-window length (EDIT_WINDOW_MS), same author/deleted guards, same mark-read once-per-open firing. These are correctness/lint fixes only.

After editing, check LSP diagnostics on the file and fix any new type errors or unused-variable warnings introduced by the refactor (e.g. a now-unused `markReadMutate` local, or an unused import).
  </action>
  <verify>
From the frontend directory:
- `cd frontend && npx eslint src/features/board/components/CardDetailModal.tsx` — neither `react-hooks/purity` nor `react-hooks/refs` fires (0 errors for these rules; only unrelated pre-existing warnings, if any, may remain).
- `cd frontend && npx tsc -b && npx vite build` — green.
- If any CardDetailModal-related test exists (grep `CardDetailModal` under frontend/src for `*.test.*` / `*.spec.*`), re-run it and confirm it passes.
  </verify>
  <done>
ESLint on CardDetailModal.tsx no longer reports react-hooks/purity (~line 91) or react-hooks/refs (~line 404); tsc -b && vite build are green; editability window and mark-read-on-open behavior are unchanged; any existing CardDetailModal tests pass.
  </done>
</task>
</tasks>
<verification>
1. `cd frontend && npx eslint src/features/board/components/CardDetailModal.tsx` shows neither react-hooks/purity nor react-hooks/refs firing.
2. `cd frontend && npx tsc -b && npx vite build` completes green.
3. Comment edit/delete is permitted only for the author on a non-deleted comment within 10 minutes of createdAt (window length unchanged).
4. Opening the modal fires mark-read once per open transition (sidebar dot clears); no re-fire on unrelated re-renders.
5. Phase-5 Bug-2 title-row `pr-8` padding and other modal behavior remain intact.
</verification>
<success_criteria>
- react-hooks/purity at CardDetailModal.tsx:~91 is GONE.
- react-hooks/refs at CardDetailModal.tsx:~404 is GONE.
- Editability time-window semantics and mark-read-on-open semantics are unchanged.
- frontend tsc -b && vite build green.
- Phase-5 Bug-2 modal padding/behavior intact.
</success_criteria>
<known_issue_workflow>
- Both carried known issues are copied verbatim into `known_issues_input`.
- Both have matching `known_issue_resolutions` entries with `disposition: resolved` and a fix rationale.
- No issue is omitted; the deterministic gate has full coverage.
</known_issue_workflow>
<output>
R01-SUMMARY.md
</output>
