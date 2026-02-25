# State

**Project:** Template AI Engine (Layer8)

## Current Phase
Phase: 6 of 15 (06.1 Executive Report Html Overhaul)
Plans: 0/TBD
Progress: 0%
Status: needs_remediation

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
- Plan Phase 9 (Team Schedule & Allocation)

## Blockers
None

## Skills
**Installed:** docker-expert, fastapi-expert, python-testing-patterns, find-skills
**Suggested:** None
**Stack detected:** TypeScript, React, Express, FastAPI, Presidio, spaCy
**Registry available:** yes

## Activity Log
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
