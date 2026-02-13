# State

**Project:** Template AI Engine (Layer8)

## Current Phase
Phase: 5.1 of 9 (Analysis Preview & Mapping Memory)
Plans: 0/TBD
Progress: 0%
Status: Pending planning

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
- Plan Phase 5.1 (Analysis Preview & Mapping Memory)

## Blockers
None

## Skills
**Installed:** docker-expert, fastapi-expert, python-testing-patterns, find-skills
**Suggested:** None
**Stack detected:** TypeScript, React, Express, FastAPI, Presidio, spaCy
**Registry available:** yes

## Activity Log
- 2026-02-13: Phase 5 completed (template adapter core) - QA: 35/35 PASS
- 2026-02-13: Phase 5 planned (5 plans, 3 waves) — two-pass LLM strategy, 5-step wizard, rules engine
- 2026-02-13: Phase 5 discussed (30 questions, 27 decisions) — full context captured
- 2026-02-13: Phase 4 completed (document processing) - QA: 35/35 PASS
- 2026-02-13: Phase 4 planned (5 plans, 3 waves) — GW GraphQL researched, template placeholders mapped
- 2026-02-12: Phase 3 completed (LLM integration) - QA: 29/29 PASS
- 2026-02-12: VBW initialized (migrated from GSD)
- 2026-02-12: Phase 2 completed (sanitization infrastructure)
- 2026-02-11: Phase 1, 1.1, 2.1 completed
