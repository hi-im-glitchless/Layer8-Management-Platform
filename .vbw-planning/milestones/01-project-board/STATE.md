# State

**Project:** Template AI Engine (Layer8)

## Current Phase
Phase: 24 of 3 (Project Board Schedule Integration)
Plans: complete
Progress: 100%
Status: complete

## Decisions
- CLIProxyAPI as primary LLM provider (OpenAI SDK format)
- Anthropic API as fallback (only if CLIProxy unavailable)
- Per-feature model config: Sonnet 4.5 for templates, Opus 4.6 for reports
- Manual retry only (no auto-retry to avoid burning credits)
- Full sanitized prompts stored in audit log for GDPR compliance
- python-docx in sanitization service for DOCX operations
- Gotenberg Docker container for PDF generation (dev + prod)
- Ghostwriter always reachable (no offline fallback)
- react-pdf for PDF preview, strict upload validation
- docxtpl for Jinja2 template rendering (native GW template syntax support)

## Todos
- Milestone (Phases 22–24) is built but unverified — run QA/UAT verification, then archive. Note: ROADMAP.md still lists phases 1–21 (no dirs — earlier completed work); decide whether to trim/archive the roadmap to clear the roadmap_vs_summaries drift.
- [SIDE-FINDING] ArchiveCardDialog has empty-projectName UX edge case — when a card has no linked schedule assignment, the typed-confirmation target is empty string and the user has no visible name to type. Recommend disabling Archive when no project, or using a literal "DELETE" sentinel. (Surfaced in Phase 23 UAT R01, P05-T2; not blocking — typical cards have project names. See remediation/uat/round-01/R01-UAT.md.)
- [KNOWN-ISSUE] scheduleIsolation.phase23.test.ts (6/6) (backend/src/services/__tests__/scheduleIsolation.phase23.test.ts): better-sqlite3 NODE_MODULE_VERSION mismatch when run with Node v22.22.2 (comp... — accepted as process-exception for this phase (phase 23, seen 1x) (see remediation/qa/round-02/R02-SUMMARY.md) (added 2026-05-07) (ref:013d20be)
- [KNOWN-ISSUE] scheduleIsolation.phase23 (concurrent run) (backend/src/services/__tests__/scheduleIsolation.phase23.test.ts): 4/6 tests fail when run concurrently with scheduleIsolation.phase24.test.ts d... (phase 24, seen 1x) (see 24-VERIFICATION.md) (added 2026-05-07) (ref:115b175a)
- [KNOWN-ISSUE] scheduleIsolation.phase23 (concurrent run) (backend/src/services/__tests__/scheduleIsolation.phase23.test.ts): 4/6 tests fail when run concurrently with scheduleIsolation.phase24.test.ts d... — accepted as process-exception for this phase (phase 24, seen 2x) (see remediation/qa/round-01/R01-SUMMARY.md) (added 2026-06-03) (ref:b990eb11)
- [UAT-DEVIATION] R01: None — documentation-only plan-amendment; no product code touched. (phase 22, see remediation/qa/round-01/R01-SUMMARY.md) (added 2026-05-29) (ref:572f43e0)
- [UAT-DEVIATION] R01: None — documentation-only plan-amendment; `git diff` of `frontend/` and `backend/` is empty. (phase 22, see remediation/qa/round-01/R01-SUMMARY.md) (added 2026-05-30) (ref:8b751374)
- [KNOWN-ISSUE] scheduleIsolation.phase23 (concurrent run) (backend/src/services/__tests__/scheduleIsolation.phase23.test.ts): 4/6 tests fail when run concurrently with scheduleIsolation.phase24.test.ts d... (phase 24, seen 1x) (see 24-VERIFICATION.md) (added 2026-06-03) (ref:77b1f849)
## Blockers
None

## Skills
**Installed:** docker-expert, fastapi-expert, python-testing-patterns, find-skills
**Suggested:** None
**Stack detected:** TypeScript, React, Express, FastAPI, Presidio, spaCy
**Registry available:** yes

## Activity Log
- 2026-05-29: Reconciled VBW bookkeeping with shipped code (no code changed). Backfilled missing 22-02-SUMMARY.md (Kanban components were built 2026-04-02 in commit 8aaef33, iterated since); phase-detect now reports all_done. Updated Current Phase pointer 22→24. ROADMAP 1–21 structural drift left for a deliberate archive/trim decision.
- 2026-05-07: Phase 23 UAT R02 complete — @mention pipeline wired (new /api/board/members endpoint, useBoardMembers, autocomplete UI, mentions delivery through useAddComment). P07-T1 + P07-T2 PASS. Commits: c85cd39 (backend), e1d00a4 (frontend).
- 2026-05-07: Phase 23 UAT R01 complete — fixed CardDetailModal data-source defect (modal pulled from list query missing files/comments/notes; switched to useBoardCard detail query, unwrapped data?.card response, aligned mutation cache keys). 7/9 PASS, 1 SKIP (P07-T2 dep), 1 ISSUE (P07-T1 — @mention gap routed to R02). Commits: 0fdec0e, ab30fee.
- 2026-05-07: Phase 23 in-progress UAT discarded per user request — to be re-run fresh
- 2026-05-07: Phase 23 QA R02 acceptance round complete — better-sqlite3 ABI mismatch accepted as non-blocking process-exception
- 2026-05-07: Phase 23 QA R01 remediation complete — 5 DEVN classifications resolved (1 code-fix, 1 process-exception, 3 plan-amendments); R01-VERIFICATION PASS 13/13
- 2026-05-06: Phase 23 plans 23-01..23-07 completed (board files/notes/comments/notifications/admin archive); phase-level QA returned PARTIAL with 5 deviations
- 2026-04-06: Phase 22 UAT remediation R01 complete (kanban UI accepted)
- 2026-04-02: Phase 22 build complete + QA R01 remediation PASS (kanban UI)
- 2026-04-01: Phase 21 build complete; UAT complete (board data model & API)
- Late March 2026: Phases 18, 19, 20 built; user-accepted informally without formal VBW UAT
- 2026-03-24: Phases 16, 17 built; phase 16 has formal QA PASS (auth light mode fix); user-accepted informally without formal UAT
- 2026-03-20: Phases 10-14 completed (schedule polish, UI cleanup, clients/tags, dashboard redesign, security hardening)
- 2026-03-20: Phase 15 planned and built (production deployment script); user-accepted informally without formal VBW UAT/QA
- 2026-02-25: Phase 9 reset — reverted code to pre-Phase-9 (705d53e), cleared planning artifacts, rewrote requirements from Alocacao reference study
- 2026-02-18: Phase 8 completed (role-based access control)
- 2026-02-17: Phase 7 completed (UI polish)
- 2026-02-16: Phase 6.1 completed (executive report HTML overhaul)
- 2026-02-16: Phase 6 completed (executive report generator)
- 2026-02-15: Phase 5.6 completed (prescriptive knowledge base) - QA: 46/46 PASS
- 2026-02-15: Phase 5.5 completed (LLM placeholder regeneration)
- 2026-02-14: Phase 5.4 completed (intelligent knowledge base) - QA: 21/23 PASS
- 2026-02-14: Phase 5.3 completed (placeholder verification & correction) - QA: 46/46 PASS
- 2026-02-14: Phase 5.2 completed (interactive PDF mapping) - QA: 23/23 PASS
- 2026-02-13: Phase 5.1 completed (analysis preview & mapping memory) - QA: 37/37 PASS
- 2026-02-13: Phase 5 completed (template adapter core) - QA: 35/35 PASS
- 2026-02-13: Phase 4 completed (document processing) - QA: 35/35 PASS
- 2026-02-12: Phase 3 completed (LLM integration) - QA: 29/29 PASS
- 2026-02-12: VBW initialized (migrated from GSD)
- 2026-02-12: Phase 2 completed (sanitization infrastructure)
- 2026-02-11: Phase 1, 1.1, 2.1 completed
