---
phase: 2
plan: "01"
title: Lift & Generalize the Shared NotesEditor
status: complete
completed: 2026-07-10
tasks_completed: 3
tasks_total: 3
commit_hashes:
  - f832db3
  - 04e59a2
  - d5be383
deviations:
  - "None affecting scope. Bookkeeping note: the Task 2 commit was created with `git commit` then `git commit --amend` because a combined `git add` (deleted path + modal edit) aborted atomically on the already-`git rm`'d path; the final commit 04e59a2 correctly contains both the CardDetailModal edit and the old-file deletion. Still one atomic commit for the task."
pre_existing_issues: []
ac_results:
  - criterion: "Exactly ONE markdown notes editor exists: frontend/src/components/NotesEditor.tsx; old board file deleted, grep returns zero hits, no second file defines a sanitize schema."
    verdict: "pass"
    evidence: "grep -rn 'features/board/components/NotesEditor' frontend/src → zero hits; only frontend/src/components/NotesEditor.tsx defines SANITIZE_SCHEMA; commit 04e59a2"
  - criterion: "NotesEditor imports no board hook; saves via onSave(notes) => Promise<unknown> | void; Save/Cancel disabled state + label driven by isSaving (not update.isPending)."
    verdict: "pass"
    evidence: "grep 'useUpdateNotes|features/board' frontend/src/components/NotesEditor.tsx → clean; disabled={!dirty || isSaving}, {isSaving ? 'Saving…' : 'Save'}; commit f832db3"
  - criterion: "Hardened SANITIZE_SCHEMA (defaultSchema minus script/iframe/object/embed) preserved byte-for-byte; no field added/removed/reordered."
    verdict: "pass"
    evidence: "diff of the schema+relativeTime block old-vs-new returned exit 0 (identical); sanitize unit test strips <script> + javascript: link; commit f832db3"
  - criterion: "On resolved onSave the editor switches to Preview; on rejected onSave it stays on Edit (onSuccess-only setTab('preview'))."
    verdict: "pass"
    evidence: "handleSave: try { await onSave(draft); setTab('preview') } catch {}; tests 'flips to the Preview tab when onSave resolves' + 'stays on the Edit tab when onSave rejects'; commit d5be383"
  - criterion: "CardDetailModal imports NotesEditor from '@/components/NotesEditor', owns const updateNotes = useUpdateNotes(), passes onSave={(notes) => updateNotes.mutateAsync({ cardId: card.id, notes })} + isSaving={updateNotes.isPending}; board notes still save + optimistically update + flip to Preview."
    verdict: "pass"
    evidence: "CardDetailModal.tsx:40 import, :407 useUpdateNotes(), :643-644 isSaving/onSave; board suite green (23 tests); commit 04e59a2"
  - criterion: "Generalized props: initialNotes; notesUpdatedAt; notesUpdatedBy (pre-resolved name or null); onSave; isSaving; resetKey?. Draft-reset effect depends on [resetKey, initialNotes]; CardDetailModal passes resetKey={card.id}."
    verdict: "pass"
    evidence: "NotesEditorProps in frontend/src/components/NotesEditor.tsx; useEffect deps [resetKey, initialNotes]; CardDetailModal.tsx:642 resetKey={card.id}; commits f832db3, 04e59a2"
---

Lifted the board-only NotesEditor to frontend/src/components/NotesEditor.tsx and generalized its hardcoded useUpdateNotes() save into an onSave/isSaving/resetKey contract, so a non-board route can reuse the same editor and hardened rehype-sanitize schema; the board's card-notes save is unchanged.

## What Was Built

- A single shared, entity-agnostic markdown NotesEditor at `frontend/src/components/NotesEditor.tsx` (Edit/Preview tabs, byte-for-byte-preserved hardened SANITIZE_SCHEMA), saving exclusively through an `onSave(notes) => Promise<unknown> | void` prop with `isSaving` driving disabled/label state and `resetKey` driving the `[resetKey, initialNotes]` draft-reset dep.
- CardDetailModal rewired to consume `@/components/NotesEditor`, owning its own `const updateNotes = useUpdateNotes()` and passing `onSave`/`isSaving`/`resetKey`; the old board-local editor file deleted so exactly one editor remains.
- Pure-props unit coverage (7 cases) proving the onSave contract, preview-on-resolve / stay-on-Edit-on-reject, not-dirty and isSaving disabled states, and sanitize hardening (script tag + javascript: link stripped from Preview).

## Files Modified

- `frontend/src/components/NotesEditor.tsx` -- added: the generalized shared editor (copied verbatim from the board file, save contract lifted to onSave/isSaving/resetKey; SANITIZE_SCHEMA unchanged).
- `frontend/src/features/board/components/CardDetailModal.tsx` -- modified: import from `@/components/NotesEditor`, instantiate `useUpdateNotes()`, pass new prop contract (drop cardId).
- `frontend/src/features/board/components/NotesEditor.tsx` -- deleted: old board-local editor retired after its sole importer was rewired.
- `frontend/src/components/__tests__/NotesEditor.test.tsx` -- added: 7-case pure-props unit suite.

## Deviations

None affecting scope or behavior. Verification results: `cd frontend && npx tsc --noEmit` exit 0; `npx vitest run` full frontend suite 71/71 passing (incl. the new 7 NotesEditor cases and the 23 board cases); no `backend/` files modified. Bookkeeping only: the Task 2 commit was finalized via `git commit --amend` after a combined `git add` aborted on the already-`git rm`'d path — the resulting single commit 04e59a2 contains both the modal edit and the old-file deletion.
