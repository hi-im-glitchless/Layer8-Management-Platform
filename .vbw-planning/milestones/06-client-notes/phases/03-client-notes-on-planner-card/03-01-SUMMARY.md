---
phase: 3
plan: "01"
title: Read-Only Client Notes on the Planner Card
status: complete
completed: 2026-07-10
tasks_completed: 5
tasks_total: 5
commit_hashes:
  - 982325a
  - 013f4a5
  - 2b00d47
  - cdad67f
  - aee1b35
deviations: []
pre_existing_issues:
  - "{\"test\": \"pdfQueue > addPdfConversionJob > should reject an invalid file path\", \"file\": \"backend/src/services/__tests__/pdfQueue.test.ts\", \"error\": \"expected throw including 'Invalid DOCX path' but got 'Invalid source file path: /nonexisten…' — AI/report pipeline test drift, unrelated to board changes\"}"
  - "{\"test\": \"pdfQueue > addPdfConversionJob > should reject an empty file path\", \"file\": \"backend/src/services/__tests__/pdfQueue.test.ts\", \"error\": \"expected throw including 'Invalid DOCX path' but got 'Invalid source file path:' — AI/report pipeline test drift, unrelated to board changes\"}"
  - "{\"test\": \"templateAdapter service > analyzeTemplate > calls Python service and LLM in correct order\", \"file\": \"backend/src/services/__tests__/templateAdapter.test.ts\", \"error\": \"mocked call-order/shape assertion mismatch in AI template pipeline, unrelated to board changes\"}"
  - "{\"test\": \"templateMapping service > queryFewShotExamples > returns entries sorted by usageCount DESC\", \"file\": \"backend/src/services/__tests__/templateMapping.test.ts\", \"error\": \"expected vi.fn() called with { where: {…} } — prisma-mock call-shape drift in AI template pipeline, unrelated to board changes\"}"
  - "{\"test\": \"templateMapping service > queryFewShotExamples > filters by templateType and language correctly\", \"file\": \"backend/src/services/__tests__/templateMapping.test.ts\", \"error\": \"expected vi.fn() called with { where: {…} } — prisma-mock call-shape drift in AI template pipeline, unrelated to board changes\"}"
  - "{\"test\": \"templateMapping service > queryFewShotExamples > respects limit parameter\", \"file\": \"backend/src/services/__tests__/templateMapping.test.ts\", \"error\": \"expected vi.fn() called with { where: {…} } — prisma-mock call-shape drift in AI template pipeline, unrelated to board changes\"}"
ac_results:
  - criterion: "Exactly one SANITIZE_SCHEMA and one markdown render path (NotesPreview) exist; SANITIZE_SCHEMA stays module-private in NotesEditor.tsx."
    verdict: "pass"
    evidence: "013f4a5; grep shows single `const SANITIZE_SCHEMA` (NotesEditor.tsx:26), no exported schema, `export function NotesPreview` sole render path"
  - criterion: "The card client-notes section is read-only for every role including ADMIN: no textarea, no Edit/Preview tabs, no Save/Cancel button in its DOM subtree."
    verdict: "pass"
    evidence: "CardDetailModal.test.tsx case (d) role ADMIN asserts section subtree has no textarea/button/[role=tab] (aee1b35)"
  - criterion: "A card whose project.client is null, or whose client.notes is empty/whitespace, renders no section and no heading (single guard project.client?.notes?.trim())."
    verdict: "pass"
    evidence: "CardDetailModal.tsx guard `project.client?.notes?.trim() &&` (cdad67f); test cases (b) null client and (c) empty notes assert queryByText(/client notes/i) is null"
  - criterion: "KanbanCard.tsx is not modified and the Kanban tile renders identically regardless of client.notes presence."
    verdict: "pass"
    evidence: "git diff HEAD~5 shows KanbanCard.tsx untouched; KanbanCard.test.tsx regression case asserts identical normalised DOM with/without notes (2b00d47)"
  - criterion: "The client-notes section renders above the existing project NotesEditor, inside the same space-y-6 container in CardDetailModal."
    verdict: "pass"
    evidence: "cdad67f inserts the section directly above the `{/* Notes */}` block; test case (a) asserts DOM order via compareDocumentPosition"
  - criterion: "backend/src/services/boardService.ts provides widened client select containing notesUpdatedBy: true"
    verdict: "pass"
    evidence: "982325a: PROJECT_CLIENT_SELECT const with notesUpdatedBy: true used by listCards + getCard"
  - criterion: "frontend/src/components/NotesEditor.tsx contains export function NotesPreview"
    verdict: "pass"
    evidence: "013f4a5 NotesEditor.tsx:44"
  - criterion: "frontend/src/features/board/types.ts BoardCard.project.client carries notesUpdatedBy: string | null"
    verdict: "pass"
    evidence: "2b00d47 types.ts widened client inline type"
  - criterion: "backend/src/services/__tests__/boardCardClientNotes.pm.test.ts covers getCard returning client.notes and null client"
    verdict: "pass"
    evidence: "982325a; both seeded cases pass"
  - criterion: "key_link: CardDetailModal imports { NotesPreview } from @/components/NotesEditor"
    verdict: "pass"
    evidence: "cdad67f import line `import { NotesEditor, NotesPreview } from '@/components/NotesEditor'`"
---

Read-only client notes now surface on the planner card detail modal via a widened board select and a single shared NotesPreview markdown path, guarded so null-client and empty-notes cards render nothing.

## What Was Built

- Shared `PROJECT_CLIENT_SELECT` const in boardService (id, name, color, notes, notesUpdatedAt, notesUpdatedBy) used by both `listCards` and `getCard`, so `getCard` reaches `Client.notes` through the modal's existing per-card fetch — no new endpoint call.
- Exported `NotesPreview({ content, className? })` in NotesEditor.tsx as the single read-only markdown render path; `SANITIZE_SCHEMA` stays module-private and the editor's own Preview tab delegates to it with byte-identical DOM.
- Widened `BoardCard['project'].client` type to carry the three notes fields; updated KanbanCard fixtures and added a regression test proving the tile renders identical DOM with/without `client.notes`.
- Guarded read-only "Client Notes" section rendered above the project NotesEditor in CardDetailModal, with no edit affordance for any role.
- New backend seeded test (`boardCardClientNotes.pm.test.ts`) and a new `CardDetailModal.test.tsx` covering the four required rendering cases.

## Files Modified

- `backend/src/services/boardService.ts` -- edit: extract/share PROJECT_CLIENT_SELECT; widen client select in listCards + getCard.
- `backend/src/services/__tests__/boardCardClientNotes.pm.test.ts` -- add: seeded coverage for getCard client.notes + null-client.
- `frontend/src/components/NotesEditor.tsx` -- edit: add exported NotesPreview; delegate Preview tab; keep SANITIZE_SCHEMA private.
- `frontend/src/features/board/types.ts` -- edit: widen BoardCard project.client with notes/notesUpdatedAt/notesUpdatedBy.
- `frontend/src/features/board/components/__tests__/KanbanCard.test.tsx` -- edit: fix client fixtures; add tile-unchanged regression case.
- `frontend/src/features/board/components/CardDetailModal.tsx` -- edit: import NotesPreview; render guarded read-only client-notes section.
- `frontend/src/features/board/components/__tests__/CardDetailModal.test.tsx` -- add: four client-notes rendering cases.

## Deviations

None. All five tasks implemented as planned, one atomic commit each.

## Pre-Existing Issues

Backend suite note: 6 pre-existing failures across `pdfQueue.test.ts`, `templateAdapter.test.ts`, and `templateMapping.test.ts` (AI/template pipeline test drift — changed error wording and prisma-mock call-shape assertions) are recorded in `pre_existing_issues`. They live in unmodified files with no coupling to the board domain and are DEVN-05 pre-existing, not regressions. Frontend suite is fully green: 87/87 (baseline 82 + 5 new tests).
