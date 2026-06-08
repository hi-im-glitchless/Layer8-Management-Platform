# State

**Project:** Template AI Engine (Layer8)
**Milestone:** Board Refinements

## Current Phase
Phase: 6 of 6 (Auth Rate Limiter Dev Override)
Plans: 1/1
Progress: 100%
Status: complete

## Phase Status
- **Phase 1 (Board Stopped Column Horizontal Drag Auto Scroll):** Complete
- **Phase 2 (Archive Without Typed Project Name Confirmation):** Complete
- **Phase 3 (File Download Permission Fix):** Complete
- **Phase 4 (Board Card Pentester Avatars):** Complete
- **Phase 5 (Board Bug Fixes Status Sync Modal Overlap):** Complete
- **Phase 6 (Auth Rate Limiter Dev Override):** Complete

## Key Decisions
| Decision | Date | Rationale |
|----------|------|-----------|
| CLIProxyAPI as primary LLM provider (OpenAI SDK format) | | |
| Anthropic API as fallback (only if CLIProxy unavailable) | | |
| Per-feature model config: Sonnet 4.5 for templates, Opus 4.6 for reports | | |
| Manual retry only (no auto-retry to avoid burning credits) | | |
| Full sanitized prompts stored in audit log for GDPR compliance | | |
| python-docx in sanitization service for DOCX operations | | |
| Gotenberg Docker container for PDF generation (dev + prod) | | |
| Ghostwriter always reachable (no offline fallback) | | |
| react-pdf for PDF preview, strict upload validation | | |
| docxtpl for Jinja2 template rendering (native GW template syntax support) | | |

## Todos
- [SIDE-FINDING] ArchiveCardDialog has empty-projectName UX edge case — when a card has no linked schedule assignment, the typed-confirmation target is empty string and the user has no visible name to type. Recommend disabling Archive when no project, or using a literal "DELETE" sentinel. (Surfaced in Phase 23 UAT R01, P05-T2; not blocking — typical cards have project names. See remediation/uat/round-01/R01-UAT.md.)
- [KNOWN-ISSUE] scheduleIsolation.phase23.test.ts (6/6) (backend/src/services/__tests__/scheduleIsolation.phase23.test.ts): better-sqlite3 NODE_MODULE_VERSION mismatch when run with Node v22.22.2 (comp... — accepted as process-exception for this phase (phase 23, seen 1x) (see remediation/qa/round-02/R02-SUMMARY.md) (added 2026-05-07) (ref:013d20be)
- [KNOWN-ISSUE] scheduleIsolation.phase23 (concurrent run) (backend/src/services/__tests__/scheduleIsolation.phase23.test.ts): 4/6 tests fail when run concurrently with scheduleIsolation.phase24.test.ts d... (phase 24, seen 1x) (see 24-VERIFICATION.md) (added 2026-05-07) (ref:115b175a)
- [KNOWN-ISSUE] scheduleIsolation.phase23 (concurrent run) (backend/src/services/__tests__/scheduleIsolation.phase23.test.ts): 4/6 tests fail when run concurrently with scheduleIsolation.phase24.test.ts d... — accepted as process-exception for this phase (phase 24, seen 2x) (see remediation/qa/round-01/R01-SUMMARY.md) (added 2026-06-03) (ref:b990eb11)
- [UAT-DEVIATION] R01: None — documentation-only plan-amendment; no product code touched. (phase 22, see remediation/qa/round-01/R01-SUMMARY.md) (added 2026-05-29) (ref:572f43e0)
- [UAT-DEVIATION] R01: None — documentation-only plan-amendment; `git diff` of `frontend/` and `backend/` is empty. (phase 22, see remediation/qa/round-01/R01-SUMMARY.md) (added 2026-05-30) (ref:8b751374)
- [KNOWN-ISSUE] scheduleIsolation.phase23 (concurrent run) (backend/src/services/__tests__/scheduleIsolation.phase23.test.ts): 4/6 tests fail when run concurrently with scheduleIsolation.phase24.test.ts d... (phase 24, seen 1x) (see 24-VERIFICATION.md) (added 2026-06-03) (ref:77b1f849)
- [KNOWN-ISSUE] pdfQueue > addPdfConversionJob > should reject an invalid file path / should reject an empty file path (backend/src/services/__tests__/pdfQueue.test.ts): expected error including 'Invalid DOCX path' but got 'Invalid source file pat... — accepted as process-exception for this phase (phase 01, seen 1x) (see remediation/qa/round-01/R01-SUMMARY.md) (added 2026-06-03) (ref:00587024)
- [KNOWN-ISSUE] scheduleIsolation.phase23/phase24 + audit/session services (concurrent run only) (backend/src/services/__tests__/scheduleIsolation.phase24.test.ts): SQLite single-writer 'Operation has timed out' / 'database is locked' under c... — accepted as process-exception for this phase (phase 01, seen 1x) (see remediation/qa/round-01/R01-SUMMARY.md) (added 2026-06-03) (ref:e7a9bb3e)
- [KNOWN-ISSUE] templateAdapter > analyzeTemplate > calls Python service and LLM in correct order (backend/src/services/__tests__/templateAdapter.test.ts): expected vi.fn() to be called with arguments [...] — stale mock expectation; ... — accepted as process-exception for this phase (phase 01, seen 1x) (see remediation/qa/round-01/R01-SUMMARY.md) (added 2026-06-03) (ref:76aeafeb)
- [KNOWN-ISSUE] templateMapping > queryFewShotExamples > (sorted by usageCount DESC / filters by templateType+language / respects limit) (backend/src/services/__tests__/templateMapping.test.ts): expected vi.fn() to be called with arguments [...] — stale mock expectation; ... — accepted as process-exception for this phase (phase 01, seen 1x) (see remediation/qa/round-01/R01-SUMMARY.md) (added 2026-06-03) (ref:36c58190)
- [KNOWN-ISSUE] pdfQueue > addPdfConversionJob > should reject an invalid file path / should reject an empty file path (backend/src/services/__tests__/pdfQueue.test.ts): expected error including ''Invalid DOCX path'' but got ''Invalid source file ... — accepted as process-exception for this phase (phase 01, seen 1x) (see remediation/qa/round-01/R01-SUMMARY.md) (added 2026-06-03) (ref:e6d90381)
- [KNOWN-ISSUE] scheduleIsolation.phase23/phase24 + audit/session services (concurrent run only) (backend/src/services/__tests__/scheduleIsolation.phase24.test.ts): SQLite single-writer ''Operation has timed out'' / ''database is locked'' und... — accepted as process-exception for this phase (phase 01, seen 1x) (see remediation/qa/round-01/R01-SUMMARY.md) (added 2026-06-03) (ref:5d68e30c)
- [KNOWN-ISSUE] archives the card with an empty body and a valid ADMIN session → 200 (backend/src/routes/__tests__/boardAdminArchive.test.ts): SQLite SocketTimeout (PrismaClientKnownRequestError: DriverAdapterError: Sock... — accepted as process-exception for this phase (phase 02, seen 1x) (see remediation/qa/round-01/R01-SUMMARY.md) (added 2026-06-03) (ref:2e874278)
- [KNOWN-ISSUE] DEVN-05: react-refresh/only-export-components on findCardById (frontend/src/features/board/components/KanbanCard.tsx): Fast refresh only works when a file only exports components. Use a new file t... (phase 04, seen 1x) (see 04-VERIFICATION.md) (added 2026-06-03) (ref:8d061d5c)
## Blockers
None

## Activity Log
- 2026-06-03: Created Board Refinements milestone (3 phases)
