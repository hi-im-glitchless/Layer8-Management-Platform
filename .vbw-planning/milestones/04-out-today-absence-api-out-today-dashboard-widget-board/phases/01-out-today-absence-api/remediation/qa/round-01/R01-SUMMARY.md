---
phase: 1
round: 1
title: Clear tracked TS2835 known-issue in rateLimit.test.ts
type: remediation
status: complete
completed: 2026-07-01
tasks_completed: 1
tasks_total: 1
commit_hashes:
  - 311799ec8908dc947326bfad003167f68b720ac2
files_modified:
  - backend/src/middleware/__tests__/rateLimit.test.ts
deviations: []
known_issue_outcomes:
  - '{"test":"tsc --noEmit (typecheck)","file":"backend/src/middleware/__tests__/rateLimit.test.ts","error":"TS2835: Relative import paths need explicit file extensions in ECMAScript imports when moduleResolution is node16/nodenext (line 15) — pre-existing in an unmodified file, unrelated to this plan","disposition":"resolved","rationale":"The missing .js extension is added to the ../rateLimit import on line 15, so tsc TS2835 no longer fires for this file. Registry entry is legitimately cleared by a code fix rather than a carried process-exception."}'
  - '{"test":"tsc --noEmit (typecheck)","file":"backend/src/middleware/__tests__/rateLimit.test.ts","error":"TS2835: Relative import paths need explicit file extensions in ECMAScript imports when moduleResolution is node16/nodenext (line 15) — pre-existing in an unmodified file, unrelated to this plan; not fixed","disposition":"resolved","rationale":"Duplicate registry record of the same underlying defect. The same one-line .js-extension fix on line 15 resolves both entries; tsc TS2835 no longer fires for this file."}'
---

Cleared the tracked TS2835 known-issue backlog for Phase 01 by adding the explicit `.js` extension to the `../rateLimit` import in rateLimit.test.ts, emptying the registry via a code fix rather than a carried process-exception.

## Task 1: Add explicit .js extension to the rateLimit import

### What Was Built
- Changed line 15 of `rateLimit.test.ts` from `import { resolveAuthRateLimitMax } from '../rateLimit';` to `import { resolveAuthRateLimitMax } from '../rateLimit.js';`, satisfying `moduleResolution: nodenext`.
- Verified `npx tsc --noEmit` (backend workspace) now exits 0 with zero diagnostics — no TS2835, no reference to rateLimit.test.ts.
- Verified `npx vitest run src/middleware/__tests__/rateLimit.test.ts` still loads and passes (1 file, 3 tests passed).

### Files Modified
- `backend/src/middleware/__tests__/rateLimit.test.ts` -- edit: added explicit `.js` extension to the relative `../rateLimit` import so nodenext no longer emits TS2835.

### Known Issue Outcomes
- `tsc --noEmit (typecheck)` (`backend/src/middleware/__tests__/rateLimit.test.ts`) — `resolved`: The missing `.js` extension is added to the `../rateLimit` import on line 15, so tsc TS2835 no longer fires for this file. Registry entry is legitimately cleared by a code fix rather than a carried process-exception.
- `tsc --noEmit (typecheck)` (`backend/src/middleware/__tests__/rateLimit.test.ts`) — `resolved`: Duplicate registry record of the same underlying defect. The same one-line `.js`-extension fix on line 15 resolves both entries; tsc TS2835 no longer fires for this file.

### Deviations
None
