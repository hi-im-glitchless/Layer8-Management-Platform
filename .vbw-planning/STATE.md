# State

**Project:** Template AI Engine (Layer8)

## Current Phase
Phase: 5.6 of 12 (Prescriptive Knowledge Base)
Plans: 5/5
Progress: 100%
Status: Built

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
- Verify Phase 5.6 (Prescriptive Knowledge Base)

## Blockers
None

## Skills
**Installed:** docker-expert, fastapi-expert, python-testing-patterns, find-skills
**Suggested:** None
**Stack detected:** TypeScript, React, Express, FastAPI, Presidio, spaCy
**Registry available:** yes

## Activity Log
- 2026-02-15: Phase 5.6 completed (prescriptive knowledge base) - QA: 46/46 PASS
- 2026-02-15: Phase 8 added (UI polish) — complete dashboard and minor visual details, inserted before Production Deployment (renumbered to Phase 9)
- 2026-02-15: Phase 7 removed (Template Adapter - Modification & Bulk) — Phases 8-9 renumbered to 7-8
- 2026-02-15: Phase 5.6 planned (5 plans, 3 waves) — schema migration + prescriptive lookup, annotated prompt + persistence overhaul, frontend KB badge + banner
- 2026-02-15: Phase 5.6 discussed (18 questions, 11 decisions) — match key, exact match only, lock threshold, delete-and-recreate, inline annotations, remove cross-type fallback
- 2026-02-15: Phase 5.6 added (prescriptive knowledge base) — transform KB from advisory to deterministic mapping cache with LLM fallback
- 2026-02-14: Phase 5.5 planned (4 plans, 3 waves) — placement prompt builder + validation, LLM pipeline backend, unified pipeline + KB enrichment, dead code removal + CSS cleanup
- 2026-02-14: Phase 5.5 discussed (7 questions, 7 decisions) — full regen, zone map input, placement instructions output, skip-and-warn, replace mechanical entirely, unified pipeline, KB enrichment
- 2026-02-14: Phase 5.5 added (LLM-powered placeholder regeneration) — replace mechanical find-and-replace with LLM-based intelligent placement, mapping table UI unchanged
- 2026-02-14: Phase 5.4 completed (intelligent knowledge base) - QA: 21/23 PASS (2 pre-existing/manual)
- 2026-02-14: Phase 5.4 planned (5 plans, 3 waves) — schema evolution, zone-aware parser, structured prompt, frontend mapping table UX, integration & E2E
- 2026-02-14: Phase 5.4 discussed (18 questions, 18 decisions) — zone storage, blueprints, confidence calibration, style hints, direct mapping table replaces correction chat
- 2026-02-14: Phase 5.3 completed (placeholder verification & correction) - QA: 46/46 PASS
- 2026-02-14: Phase 5.3 planned (5 plans, 3 waves) — backend auto-map + placeholder styling, wizard restructuring, StepVerify component, correction pipeline, navigation map + polish
- 2026-02-14: Phase 5.3 discussed (16 questions, 16 decisions) — auto-map on upload, 4-step wizard, placeholder styling, correction flow, regeneration pipeline, structure browser repurpose
- 2026-02-14: Phase 5.3 added (placeholder verification & correction) — analysis shows raw Jinja placeholders, three correction modes via LLM chat, regenerate with fixes
- 2026-02-14: Phase 5.2 completed (interactive PDF mapping) - QA: 23/23 PASS
- 2026-02-13: Phase 5.2 planned (5 plans, 3 waves) — selection state, structure browser, LLM batch prompt, inline overlays, chat integration
- 2026-02-13: Phase 5.2 discussed (8 questions, 8 decisions) — selection UX, structure panel, batch chat, inline confirmation, coverage visibility, rejection recovery, batch correction, visual states
- 2026-02-13: Phase 5.2 added (interactive PDF mapping) — PDF text selection, structure browser, batch chat mapping, green-only shading, KB feedback loop
- 2026-02-13: Phase 5.1 completed (analysis preview & mapping memory) - QA: 37/37 PASS
- 2026-02-13: Phase 6 planned (4 plans, 3 waves) — translation engine, backend orchestration, frontend wizard step, integration tests
- 2026-02-13: Phase 6 discussed (11 questions, 11 decisions) — full context captured
- 2026-02-13: Phase 5.1 planned (5 plans, 3 waves) — KB data layer, annotated DOCX, backend integration, few-shot prompt, frontend redesign
- 2026-02-13: Phase 5 completed (template adapter core) - QA: 35/35 PASS
- 2026-02-13: Phase 5 planned (5 plans, 3 waves) — two-pass LLM strategy, 5-step wizard, rules engine
- 2026-02-13: Phase 5 discussed (30 questions, 27 decisions) — full context captured
- 2026-02-13: Phase 4 completed (document processing) - QA: 35/35 PASS
- 2026-02-13: Phase 4 planned (5 plans, 3 waves) — GW GraphQL researched, template placeholders mapped
- 2026-02-12: Phase 3 completed (LLM integration) - QA: 29/29 PASS
- 2026-02-12: VBW initialized (migrated from GSD)
- 2026-02-12: Phase 2 completed (sanitization infrastructure)
- 2026-02-11: Phase 1, 1.1, 2.1 completed
