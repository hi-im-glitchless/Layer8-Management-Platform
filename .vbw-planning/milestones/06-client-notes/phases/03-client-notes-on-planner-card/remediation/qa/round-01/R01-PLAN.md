---
phase: 3
round: 1
plan: R01
title: "Phase 03 QA Remediation R01 — Known-Issues Acceptance (5 stale-expectation fixes + 1 process-exception)"
type: remediation
autonomous: true
effort_override: balanced
skills_used: []
files_modified:
  - backend/src/services/__tests__/pdfQueue.test.ts
  - backend/src/services/__tests__/templateMapping.test.ts
forbidden_commands:
  - "prisma migrate reset"
  - "prisma migrate dev"
  - "prisma db push"
  - "rm dev.db"
fail_classifications: []
known_issues_input:
  - '{"test":"pdfQueue > addPdfConversionJob > should reject an empty file path","file":"backend/src/services/__tests__/pdfQueue.test.ts","error":"expected throw including Invalid DOCX path but got Invalid source file path: — same documented env-dependent flake as above"}'
  - '{"test":"pdfQueue > addPdfConversionJob > should reject an invalid file path","file":"backend/src/services/__tests__/pdfQueue.test.ts","error":"expected throw including Invalid DOCX path but got Invalid source file path: ... — documented recurring env-dependent (Redis/BullMQ/Gotenberg) flake, unrelated to board changes (STATE.md known-issues, seen across phases 01/03/09)"}'
  - '{"test":"templateAdapter service > analyzeTemplate > calls Python service and LLM in correct order","file":"backend/src/services/__tests__/templateAdapter.test.ts","error":"mocked call-order/shape assertion mismatch in AI template pipeline — documented recurring known-issue (STATE.md, phases 01/03/09), file untouched by this phase"}'
  - '{"test":"templateMapping service > queryFewShotExamples > filters by templateType and language correctly","file":"backend/src/services/__tests__/templateMapping.test.ts","error":"same documented stale-mock orderBy-shape known-issue as above"}'
  - '{"test":"templateMapping service > queryFewShotExamples > respects limit parameter","file":"backend/src/services/__tests__/templateMapping.test.ts","error":"same documented stale-mock orderBy-shape known-issue as above"}'
  - '{"test":"templateMapping service > queryFewShotExamples > returns entries sorted by usageCount DESC","file":"backend/src/services/__tests__/templateMapping.test.ts","error":"expected orderBy {usageCount: desc} but service now sends [{confidence:desc},{usageCount:desc}] — documented stale-mock known-issue (STATE.md, phases 01/03/09), file untouched by this phase"}'
known_issue_resolutions:
  - '{"test":"pdfQueue > addPdfConversionJob > should reject an empty file path","file":"backend/src/services/__tests__/pdfQueue.test.ts","error":"expected throw including Invalid DOCX path but got Invalid source file path: — same documented env-dependent flake as above","disposition":"resolved","rationale":"Verified from production source that the thrown wording is deliberate: pdfQueue.ts line 139 throws Invalid source file path after the report pipeline was generalized to accept HTML or DOCX (commit 3bce424, feat report update generation pipeline for HTML output and Gotenberg HTML input); the addPdfConversionJob docstring now documents source file HTML or DOCX. The test fully mocks BullMQ, config and fs and is deterministic with no real Redis dependency, so the historical env-dependent framing does not apply to this assertion. This round updates the stale expected string from Invalid DOCX path to Invalid source file path to assert the intended contract, which strengthens rather than weakens the test."}'
  - '{"test":"pdfQueue > addPdfConversionJob > should reject an invalid file path","file":"backend/src/services/__tests__/pdfQueue.test.ts","error":"expected throw including Invalid DOCX path but got Invalid source file path: ... — documented recurring env-dependent (Redis/BullMQ/Gotenberg) flake, unrelated to board changes (STATE.md known-issues, seen across phases 01/03/09)","disposition":"resolved","rationale":"Same root cause and verification as the empty-file-path case: pdfQueue.ts line 139 deliberately throws Invalid source file path (commit 3bce424) and the assertion fires on the fs.existsSync guard before any queue interaction, so the fully mocked test is deterministic and does not need Redis or BullMQ. This round aligns the stale expected string with the shipped wording in the same file and commit as the paired case."}'
  - '{"test":"templateAdapter service > analyzeTemplate > calls Python service and LLM in correct order","file":"backend/src/services/__tests__/templateAdapter.test.ts","error":"mocked call-order/shape assertion mismatch in AI template pipeline — documented recurring known-issue (STATE.md, phases 01/03/09), file untouched by this phase","disposition":"accepted-process-exception","rationale":"Accepted as a justified process-exception. The failing assertion checks the mocked Python-service and LLM call order and argument shape inside analyzeTemplate. Unlike the pdfQueue and templateMapping drifts, the intended call order could not be traced to a single deliberate feature commit, so asserting the current shape is correct would risk cementing an unreviewed regression in the AI template-adaptation pipeline, a subsystem entirely outside this client-notes phase, which touched only boardService.ts and its own new test plus four frontend files (git diff name-only confirmed by QA). This exact case was accepted as process-exception in phase 01 (STATE.md ref 76aeafeb and 9d9370c2), phase 03 (ref c88126f1) and phase 09 (ref 32c56445)."}'
  - '{"test":"templateMapping service > queryFewShotExamples > filters by templateType and language correctly","file":"backend/src/services/__tests__/templateMapping.test.ts","error":"same documented stale-mock orderBy-shape known-issue as above","disposition":"resolved","rationale":"Verified from production source that the sort shape is deliberate: queryFewShotExamples in templateMapping.ts line 431 now sends orderBy [{confidence:desc},{usageCount:desc}] to prioritize confidence-first for reproducible mappings (commit 38288d5, feat adapter add template snapshot replay for reproducible mappings). The test uses a prisma mock and is deterministic. This round updates the stale orderBy expectation from {usageCount:desc} to the confidence-then-usageCount shape; the where and take assertions already match production and stay intact."}'
  - '{"test":"templateMapping service > queryFewShotExamples > respects limit parameter","file":"backend/src/services/__tests__/templateMapping.test.ts","error":"same documented stale-mock orderBy-shape known-issue as above","disposition":"resolved","rationale":"Same verified root cause as the filters case: the prisma-mocked assertion expects orderBy {usageCount:desc} but templateMapping.ts line 431 deliberately sends [{confidence:desc},{usageCount:desc}] (commit 38288d5). This round aligns the orderBy expectation while preserving the take:3 limit assertion, which already matches production."}'
  - '{"test":"templateMapping service > queryFewShotExamples > returns entries sorted by usageCount DESC","file":"backend/src/services/__tests__/templateMapping.test.ts","error":"expected orderBy {usageCount: desc} but service now sends [{confidence:desc},{usageCount:desc}] — documented stale-mock known-issue (STATE.md, phases 01/03/09), file untouched by this phase","disposition":"resolved","rationale":"Verified against templateMapping.ts line 431: production sends orderBy [{confidence:desc},{usageCount:desc}] (commit 38288d5). Only the orderBy call-shape assertion is stale; the result-ordering assertions on the mocked records still hold. This round updates the orderBy expectation to the shipped confidence-then-usageCount shape without weakening the deterministic prisma-mocked test."}'
must_haves:
  truths:
    - "All six phase-03 tracked known issues are dispositioned: two pdfQueue and three templateMapping cases resolved by aligning stale test expectations with verified production behaviour; one templateAdapter case accepted as a justified process-exception."
    - "No passing test is weakened or deleted: frontend 87/87 and boardCardClientNotes.pm.test.ts 2/2 remain green, and boardService.ts, CardDetailModal.tsx, NotesEditor.tsx, board/types.ts plus every phase-added test are untouched."
    - "The five resolved fixes only correct stale assertion expectations to match already-shipped, git-verified production behaviour; no production source under backend/src/services and no frontend file is modified."
  artifacts:
    - {path: "backend/src/services/__tests__/pdfQueue.test.ts", provides: "error-string expectations matching current production wording", contains: "Invalid source file path"}
    - {path: "backend/src/services/__tests__/templateMapping.test.ts", provides: "orderBy expectations matching current production sort shape", contains: "confidence"}
  key_links:
    - {from: "backend/src/services/__tests__/pdfQueue.test.ts", to: "backend/src/services/pdfQueue.ts", via: "assertion matches the Invalid source file path thrown at line 139"}
    - {from: "backend/src/services/__tests__/templateMapping.test.ts", to: "backend/src/services/templateMapping.ts", via: "assertion matches orderBy confidence-then-usageCount at line 431"}
---
<objective>
Close QA remediation round 01 for Phase 03. QA returned a clean PASS (27/27, zero deviations) on the phase's actual client-notes work; this round exists solely to disposition the six tracked known issues so known-issues.json can clear and UAT can proceed.

All six failures live in AI/template-report pipeline test files that Phase 03 never modified. Investigation of the production source and git history shows five of them are stale test expectations that diverged from deliberately-shipped, documented behaviour and are safely fixable in isolated, fully-mocked, deterministic tests. The sixth (templateAdapter call-order) cannot be traced to a deliberate commit, so it is accepted as a justified process-exception rather than risk cementing an unreviewed regression in an out-of-scope subsystem.

Deliver two atomic test-expectation corrections (one commit each) and record the acceptance reasoning for the single carried exception.
</objective>
<context>
@backend/src/services/pdfQueue.ts
@backend/src/services/templateMapping.ts
@.vbw-planning/phases/03-client-notes-on-planner-card/remediation/qa/round-01/R01-KNOWN-ISSUES.json
<!-- pdfQueue.ts:139 deliberately throws `Invalid source file path` (commit 3bce424, HTML+DOCX pipeline generalization); the addPdfConversionJob docstring documents "source file (HTML or DOCX)". templateMapping.ts:431 deliberately sends orderBy [{confidence:desc},{usageCount:desc}] (commit 38288d5, reproducible mappings). Both test files fully mock their externals (BullMQ/config/fs and prisma), so the assertions are deterministic and independent of Redis/Python/LLM. templateAdapter call-order intent is NOT verifiable from a single commit and is accepted, not touched. -->
</context>
<tasks>
<!-- Tasks are executed sequentially — task N+1 sees the results of task N.
     Order matters: place foundational fixes before dependent ones. -->
<task type="auto">
  <name>Align pdfQueue test expectations with shipped error wording</name>
  <files>
    backend/src/services/__tests__/pdfQueue.test.ts
  </files>
  <action>
In backend/src/services/__tests__/pdfQueue.test.ts, update the two stale error-string assertions to match production. At the two `.rejects.toThrow('Invalid DOCX path')` sites (currently lines 83 and 92 — the "should reject an invalid file path" and "should reject an empty file path" cases), change the expected substring from `Invalid DOCX path` to `Invalid source file path`.

This matches the deliberate wording thrown by addPdfConversionJob in pdfQueue.ts line 139, generalized when the report pipeline began accepting HTML as well as DOCX (commit 3bce424; docstring documents "source file (HTML or DOCX)"). Do NOT touch any other assertion, the BullMQ/config/fs mocks, or production source. Do NOT alter the two passing tests unrelated to this wording.
  </action>
  <verify>
Run only this file: `cd backend && npx vitest run src/services/__tests__/pdfQueue.test.ts`. Confirm the "should reject an invalid file path" and "should reject an empty file path" cases now PASS and no previously-passing case in the file regresses. Grep the file to confirm `Invalid DOCX path` no longer appears and `Invalid source file path` appears at both former sites.
  </verify>
  <done>
Both pdfQueue path-rejection assertions expect `Invalid source file path`, the file's suite is green, and no other assertion or mock was modified. One atomic commit: `test(pdf): align pdfQueue error-path expectations with shipped source-file wording`.
  </done>
</task>
<task type="auto">
  <name>Align templateMapping test expectations with shipped orderBy shape</name>
  <files>
    backend/src/services/__tests__/templateMapping.test.ts
  </files>
  <action>
In backend/src/services/__tests__/templateMapping.test.ts, update the three stale `queryFewShotExamples` assertions (the "returns entries sorted by usageCount DESC", "filters by templateType and language correctly", and "respects limit parameter" cases). In each `expect(mockFindMany).toHaveBeenCalledWith({...})` block, change the expected `orderBy: { usageCount: 'desc' }` to `orderBy: [{ confidence: 'desc' }, { usageCount: 'desc' }]`.

This matches the deliberate confidence-first sort shipped in templateMapping.ts line 431 (commit 38288d5, template snapshot replay for reproducible mappings). Leave the `where` and `take` fields of each assertion unchanged (they already match production). Do NOT modify the result-ordering assertions on the mocked records, any other test in the file, the prisma mock, or production source.
  </action>
  <verify>
Run only this file: `cd backend && npx vitest run src/services/__tests__/templateMapping.test.ts`. Confirm the three named queryFewShotExamples cases now PASS and no previously-passing case regresses. Grep the file to confirm no remaining `orderBy: { usageCount: 'desc' }` inside the queryFewShotExamples describe block and that the confidence-then-usageCount array shape is present at the three former sites.
  </verify>
  <done>
All three queryFewShotExamples orderBy assertions expect `[{ confidence: 'desc' }, { usageCount: 'desc' }]`, the file's suite is green, and where/take/result-ordering assertions are untouched. One atomic commit: `test(template): align queryFewShotExamples orderBy expectation with confidence-first sort`.
  </done>
</task>
</tasks>
<verification>
1. `cd backend && npx vitest run src/services/__tests__/pdfQueue.test.ts src/services/__tests__/templateMapping.test.ts` — the five previously-failing cases pass, zero regressions.
2. `git diff --name-only` for this round shows ONLY backend/src/services/__tests__/pdfQueue.test.ts and backend/src/services/__tests__/templateMapping.test.ts — no frontend, no boardService.ts, no CardDetailModal.tsx, no NotesEditor.tsx, no board/types.ts, no phase-added test.
3. templateAdapter.test.ts is unchanged (accepted-process-exception, deliberately not touched).
4. The frontend suite (87/87) and boardCardClientNotes.pm.test.ts (2/2) remain green — no passing test was weakened.
5. Every one of the six known issues appears in both known_issues_input and known_issue_resolutions with a matching, disposition-tagged entry.
</verification>
<success_criteria>
- All six tracked known issues are dispositioned: five resolved (2 pdfQueue, 3 templateMapping) and one accepted-process-exception (templateAdapter), enabling known-issues.json to clear and UAT to proceed.
- The two resolved commits correct only stale assertion expectations to match git-verified, deliberately-shipped production behaviour; no production or frontend code changes.
- The single accepted exception carries a specific, source-grounded rationale naming the file, the reason its intent is not verifiable, and its prior acceptance refs across phases 01/03/09.
- No passing test is weakened or deleted; the phase's own new tests and forbidden files are untouched; dev.db is never reset or mutated.
</success_criteria>
<known_issue_workflow>
- known_issues_input and known_issue_resolutions each contain all six carried issues, byte-for-byte on test/file/error, none dropped.
- Five entries are dispositioned `resolved` (fixed this round by aligning stale expectations with verified production behaviour); one is `accepted-process-exception` (verified non-blocking carryover, intent not confirmable, out of phase scope).
- No issue is marked `unresolved`; none is carried into a further round.
</known_issue_workflow>
<output>
R01-SUMMARY.md
</output>
