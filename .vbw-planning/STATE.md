# State

**Project:** Template AI Engine (Layer8)

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

## Blockers
None

