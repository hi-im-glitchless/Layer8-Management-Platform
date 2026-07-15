---
phase: 3
round: 1
title: "Phase 03 QA Remediation R01 — Known-Issues Acceptance (5 stale-expectation fixes + 1 process-exception)"
type: remediation
status: complete
completed: 2026-07-10
tasks_completed: 2
tasks_total: 2
commit_hashes:
  - 2c0774ffac87d881b70e8a1cd094f96b41797230
  - eee3301b18850111eab0a7dc6727b735e1446480
files_modified:
  - backend/src/services/__tests__/pdfQueue.test.ts
  - backend/src/services/__tests__/templateMapping.test.ts
deviations: []
known_issue_outcomes:
  - '{"test":"pdfQueue > addPdfConversionJob > should reject an empty file path","file":"backend/src/services/__tests__/pdfQueue.test.ts","error":"expected throw including Invalid DOCX path but got Invalid source file path: — same documented env-dependent flake as above","disposition":"resolved","rationale":"Verified from production source that the thrown wording is deliberate: pdfQueue.ts line 139 throws Invalid source file path after the report pipeline was generalized to accept HTML or DOCX (commit 3bce424, feat report update generation pipeline for HTML output and Gotenberg HTML input); the addPdfConversionJob docstring now documents source file HTML or DOCX. The test fully mocks BullMQ, config and fs and is deterministic with no real Redis dependency, so the historical env-dependent framing does not apply to this assertion. This round updated the stale expected string from Invalid DOCX path to Invalid source file path to assert the intended contract, which strengthens rather than weakens the test."}'
  - '{"test":"pdfQueue > addPdfConversionJob > should reject an invalid file path","file":"backend/src/services/__tests__/pdfQueue.test.ts","error":"expected throw including Invalid DOCX path but got Invalid source file path: ... — documented recurring env-dependent (Redis/BullMQ/Gotenberg) flake, unrelated to board changes (STATE.md known-issues, seen across phases 01/03/09)","disposition":"resolved","rationale":"Same root cause and verification as the empty-file-path case: pdfQueue.ts line 139 deliberately throws Invalid source file path (commit 3bce424) and the assertion fires on the fs.existsSync guard before any queue interaction, so the fully mocked test is deterministic and does not need Redis or BullMQ. This round aligned the stale expected string with the shipped wording in the same file and commit as the paired case."}'
  - '{"test":"templateAdapter service > analyzeTemplate > calls Python service and LLM in correct order","file":"backend/src/services/__tests__/templateAdapter.test.ts","error":"mocked call-order/shape assertion mismatch in AI template pipeline — documented recurring known-issue (STATE.md, phases 01/03/09), file untouched by this phase","disposition":"accepted-process-exception","rationale":"Accepted as a justified process-exception. The failing assertion checks the mocked Python-service and LLM call order and argument shape inside analyzeTemplate. Unlike the pdfQueue and templateMapping drifts, the intended call order could not be traced to a single deliberate feature commit, so asserting the current shape is correct would risk cementing an unreviewed regression in the AI template-adaptation pipeline, a subsystem entirely outside this client-notes phase, which touched only boardService.ts and its own new test plus four frontend files (git diff name-only confirmed by QA). This exact case was accepted as process-exception in phase 01 (STATE.md ref 76aeafeb and 9d9370c2), phase 03 (ref c88126f1) and phase 09 (ref 32c56445). Left untouched this round; templateAdapter.test.ts was not modified."}'
  - '{"test":"templateMapping service > queryFewShotExamples > filters by templateType and language correctly","file":"backend/src/services/__tests__/templateMapping.test.ts","error":"same documented stale-mock orderBy-shape known-issue as above","disposition":"resolved","rationale":"Verified from production source that the sort shape is deliberate: queryFewShotExamples in templateMapping.ts line 431 now sends orderBy [{confidence:desc},{usageCount:desc}] to prioritize confidence-first for reproducible mappings (commit 38288d5, feat adapter add template snapshot replay for reproducible mappings). The test uses a prisma mock and is deterministic. This round updated the stale orderBy expectation from {usageCount:desc} to the confidence-then-usageCount shape; the where and take assertions already match production and stay intact."}'
  - '{"test":"templateMapping service > queryFewShotExamples > respects limit parameter","file":"backend/src/services/__tests__/templateMapping.test.ts","error":"same documented stale-mock orderBy-shape known-issue as above","disposition":"resolved","rationale":"Same verified root cause as the filters case: the prisma-mocked assertion expected orderBy {usageCount:desc} but templateMapping.ts line 431 deliberately sends [{confidence:desc},{usageCount:desc}] (commit 38288d5). This round aligned the orderBy expectation while preserving the take:3 limit assertion, which already matches production."}'
  - '{"test":"templateMapping service > queryFewShotExamples > returns entries sorted by usageCount DESC","file":"backend/src/services/__tests__/templateMapping.test.ts","error":"expected orderBy {usageCount: desc} but service now sends [{confidence:desc},{usageCount:desc}] — documented stale-mock known-issue (STATE.md, phases 01/03/09), file untouched by this phase","disposition":"resolved","rationale":"Verified against templateMapping.ts line 431: production sends orderBy [{confidence:desc},{usageCount:desc}] (commit 38288d5). Only the orderBy call-shape assertion was stale; the result-ordering assertions on the mocked records still hold. This round updated the orderBy expectation to the shipped confidence-then-usageCount shape without weakening the deterministic prisma-mocked test."}'
---

Dispositioned all six Phase 03 tracked known issues: five stale test expectations aligned with git-verified deliberately-shipped production behaviour, one templateAdapter call-order case carried as a justified accepted-process-exception. Backend services suite moved from 122 pass / 6 fail to 127 pass / 1 fail (the one remaining failure is the accepted exception); frontend stayed 87/87.

## Task 1: Align pdfQueue test expectations with shipped error wording

### What Was Built
- Verified pdfQueue.ts:139 deliberately throws `Invalid source file path: ${docxPath}` (commit 3bce424 generalizing the report pipeline to HTML or DOCX; addPdfConversionJob docstring documents "source file (HTML or DOCX)") — not an accidental regression.
- Updated the two stale path-rejection assertions from `Invalid DOCX path` to `Invalid source file path`; both cases now pass, full file green at 15/15.

### Files Modified
- `backend/src/services/__tests__/pdfQueue.test.ts` -- edit: changed the "should reject an invalid file path" and "should reject an empty file path" expected substrings to the shipped wording; mocks and other assertions untouched.

### Known Issue Outcomes
- `pdfQueue > addPdfConversionJob > should reject an empty file path` (`backend/src/services/__tests__/pdfQueue.test.ts`) — `resolved`: stale expected string aligned with the deliberate `Invalid source file path` wording (pdfQueue.ts:139, commit 3bce424); deterministic fully-mocked test strengthened.
- `pdfQueue > addPdfConversionJob > should reject an invalid file path` (`backend/src/services/__tests__/pdfQueue.test.ts`) — `resolved`: same root cause; assertion fires on the fs.existsSync guard before any queue interaction, independent of Redis/BullMQ.

### Deviations
None.

## Task 2: Align templateMapping test expectations with shipped orderBy shape

### What Was Built
- Verified templateMapping.ts:431 deliberately sends `orderBy [{ confidence: 'desc' }, { usageCount: 'desc' }]` (commit 38288d5 for reproducible mappings; docstring documents "confidence DESC, then usageCount DESC") — not an accidental regression.
- Updated the three `queryFewShotExamples` orderBy assertions to the confidence-then-usageCount array shape; the file passes 27/27, where/take/result-ordering assertions untouched.

### Files Modified
- `backend/src/services/__tests__/templateMapping.test.ts` -- edit: changed the orderBy expectation in the "returns entries sorted by usageCount DESC", "filters by templateType and language correctly", and "respects limit parameter" cases; prisma mock and all other assertions untouched.

### Known Issue Outcomes
- `templateMapping service > queryFewShotExamples > filters by templateType and language correctly` (`backend/src/services/__tests__/templateMapping.test.ts`) — `resolved`: stale orderBy expectation aligned with the shipped confidence-first sort (templateMapping.ts:431, commit 38288d5).
- `templateMapping service > queryFewShotExamples > respects limit parameter` (`backend/src/services/__tests__/templateMapping.test.ts`) — `resolved`: same root cause; take:3 limit assertion preserved.
- `templateMapping service > queryFewShotExamples > returns entries sorted by usageCount DESC` (`backend/src/services/__tests__/templateMapping.test.ts`) — `resolved`: orderBy call-shape assertion updated; mocked result-ordering assertions still hold.
- `templateAdapter service > analyzeTemplate > calls Python service and LLM in correct order` (`backend/src/services/__tests__/templateAdapter.test.ts`) — `accepted-process-exception`: call-order intent not traceable to a single deliberate commit; out-of-scope AI pipeline subsystem; carried as a verified non-blocking exception (prior acceptances phases 01/03/09). File left untouched.

### Deviations
None.

## Pre-Existing Issues
- `templateAdapter service > analyzeTemplate > calls Python service and LLM in correct order` remains failing by design — it is the one carried `accepted-process-exception`, deliberately not modified this round. It is the sole remaining failure in the backend services suite (127 pass / 1 fail) and is out of scope for this client-notes phase. This is informational, not a deviation.
