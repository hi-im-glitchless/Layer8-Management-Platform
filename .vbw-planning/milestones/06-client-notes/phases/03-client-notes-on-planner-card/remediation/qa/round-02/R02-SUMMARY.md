---
phase: 3
round: 2
title: "Phase 03 QA Remediation R02 — Known-Issues Acceptance Round (re-affirm single carried process-exception)"
type: remediation
status: complete
completed: 2026-07-15
tasks_completed: 1
tasks_total: 1
commit_hashes:
  - 4a32abcff9cd0bdc00dc34eeff903cf827c8ada4
files_modified:
  - .vbw-planning/phases/03-client-notes-on-planner-card/remediation/qa/round-02/R02-SUMMARY.md
deviations:
  - "None. Documentation/acceptance-only round: the single carried known issue (templateAdapter call-order TypeError) is re-affirmed as an accepted-process-exception mirroring R01 MH-07. No product code, test, or production source was modified; the phase contract is already a clean PASS (source_fail_count 0)."
known_issue_outcomes:
  - '{"test":"templateAdapter service > analyzeTemplate > calls Python service and LLM in correct order","file":"backend/src/services/__tests__/templateAdapter.test.ts","error":"TypeError: Cannot read properties of undefined (reading filter) at templateAdapter.ts:248 — accepted process-exception per remediation/qa/round-01 (R01-VERIFICATION.md MH-07); mocked fetch sequence lacks a Step-0 /adapter/document-structure response, file untouched since before Phase 03 started","disposition":"accepted-process-exception","rationale":"Pre-existing test-harness mock gap in the out-of-scope AI/template-adaptation pipeline; templateAdapter.test.ts and templateAdapter.ts were last touched at 38288d5, an ancestor of the Phase 03 start commit 982325a, so they predate this frontend client-notes phase and were untouched by any remediation round. Mirrors the R01 MH-07 acceptance exactly. Fixing the missing Step-0 /adapter/document-structure mock is a multi-call-shape rework outside Phase 03 scope and must not block Phase 03 UAT."}'
---

Closed QA remediation round 02 for Phase 03 as a known-issues-only acceptance round: re-affirmed the single carried templateAdapter call-order TypeError as an accepted-process-exception (mirroring R01 MH-07) with no product code changes.

## Task 1: Re-affirm and record the accepted-process-exception disposition for the single carried known issue

### What Was Built
- Re-affirmed the accepted-process-exception disposition for the one carried known issue (templateAdapter analyzeTemplate call-order TypeError), matching R02-KNOWN-ISSUES.json byte-for-byte on test/file/error and mirroring the R01 MH-07 acceptance.
- Verified the supporting evidence remains true: `git merge-base --is-ancestor 38288d5 982325a^` succeeds (the templateAdapter files predate the Phase 03 start commit 982325a), and `git log 982325a^..HEAD -- backend/src/services/__tests__/templateAdapter.test.ts backend/src/services/templateAdapter.ts` is empty (no phase or round touched these files).
- Confirmed the phase contract is a clean PASS this round (source_fail_count 0, no FAIL checks); the single deferred item is a pre-existing test-harness mock gap in the out-of-scope AI/template-adaptation pipeline that must not block Phase 03 UAT.

### Files Modified
- `.vbw-planning/phases/03-client-notes-on-planner-card/remediation/qa/round-02/R02-SUMMARY.md` -- create: records the accepted-process-exception outcome and evidence for the single carried known issue. No product source, test, or production code was modified.

### Known Issue Outcomes
- `templateAdapter service > analyzeTemplate > calls Python service and LLM in correct order` (`backend/src/services/__tests__/templateAdapter.test.ts`) — `accepted-process-exception`: Pre-existing test-harness mock gap in the out-of-scope AI/template-adaptation pipeline. The mocked fetch sequence covers only 2 of the now-3 sequential fetch calls, omitting the Step-0 /adapter/document-structure response, so analyzeTemplate reads `.filter` on an undefined body and throws a TypeError at templateAdapter.ts:248. Both files were last touched at 38288d5, an ancestor of the Phase 03 start commit 982325a, so they predate this frontend client-notes phase and were untouched by any remediation round. Mirrors the R01 MH-07 acceptance exactly; the fix is a multi-call-shape rework outside Phase 03 scope and must not block Phase 03 UAT.

### Deviations
None
