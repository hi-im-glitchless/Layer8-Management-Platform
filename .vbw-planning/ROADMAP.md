# Template AI Engine Roadmap

Layer8 automates template adaptation and executive report generation for offensive security teams. The roadmap progresses through security-first infrastructure, LLM and document processing capabilities, then delivers the two main features with progressive enhancement.

## Phases

- [x] Phase 1: Foundation, Security & Web UI Design
- [x] Phase 1.1: UI/UX Visual Polish (INSERTED)
- [x] Phase 2: Sanitization Infrastructure
- [x] Phase 2.1: Profile Page Completion (INSERTED)
- [ ] Phase 3: LLM Integration
- [ ] Phase 4: Document Processing
- [ ] Phase 5: Template Adapter - Core
- [ ] Phase 6: Template Adapter - Translation
- [ ] Phase 7: Template Adapter - Modification & Bulk
- [ ] Phase 8: Executive Report Generator
- [ ] Phase 9: Production Deployment

### Phase 1: Foundation, Security & Web UI Design
**Goal:** Secure infrastructure for authentication, session isolation, compliance-grade audit logging, and fully designed frontend
**Deps:** None
**Reqs:** AUTH-01-06, SECR-01-04, SECR-06, UIUX-01-04
**Success:** Auth + MFA working, audit trail tamper-evident, frontend scaffold complete
**Plans:** 6/6 complete

### Phase 1.1: UI/UX Visual Polish (INSERTED)
**Goal:** Polished visual identity with deep-dark theme, cool blue accent, atmospheric login
**Deps:** Phase 1
**Reqs:** Visual polish (no formal requirement IDs)
**Success:** Professional dark theme, logo integration, Notion-like sidebar
**Plans:** 3/3 complete

### Phase 2: Sanitization Infrastructure
**Goal:** Production-grade PII sanitization with custom pentest recognizers and session-scoped mappings
**Deps:** Phase 1
**Reqs:** SECR-05
**Success:** Presidio + custom recognizers detect PII, mappings stored per-session, never sent to LLM
**Plans:** 8/8 complete

### Phase 2.1: Profile Page Completion (INSERTED)
**Goal:** User profile with avatar, display name, password change, TOTP regeneration
**Deps:** Phase 2
**Reqs:** Profile management (no formal requirement IDs)
**Success:** Profile page functional, header avatar integration
**Plans:** 2/2 complete

### Phase 3: LLM Integration
**Goal:** Multi-provider LLM client with SSE streaming, compliance-grade interaction logging, and streaming UI components
**Deps:** Phase 1 (audit logging)
**Reqs:** LLMI-01-05, SECR-03, UIUX-05-06
**Success:** CLIProxyAPI + Anthropic fallback, SSE streaming, streaming UI component, audit logging, error states, per-feature model config
**Plans:** 3 plans (planned, not executed)

### Phase 4: Document Processing
**Goal:** DOCX parsing, PDF generation, Ghostwriter integration, reusable document UI
**Deps:** Phase 1
**Reqs:** DOCP-01-05, GHST-01-03, UIUX-07-08
**Success:** Parse/generate DOCX, pixel-perfect PDF via Gotenberg, Ghostwriter GraphQL integration

### Phase 5: Template Adapter - Core
**Goal:** LLM-powered Jinja2 insertion with pixel-perfect preview, iterative feedback loop
**Deps:** Phase 3, Phase 4
**Reqs:** TMPL-01-11, UIUX-09-10
**Success:** Upload → analyze → preview → annotate → download workflow complete

### Phase 6: Template Adapter - Translation
**Goal:** Bidirectional EN/PT-PT translation preserving Jinja2 logic
**Deps:** Phase 5
**Reqs:** TRNS-01-04, UIUX-11
**Success:** Translation preserves all Jinja2 variables, uses PT-PT exclusively

### Phase 7: Template Adapter - Modification & Bulk
**Goal:** Reference template modification and bulk upload queue
**Deps:** Phase 5
**Reqs:** TMOD-01-05, BULK-01-04, UIUX-12-13
**Success:** Modify existing templates, bulk queue with per-template progress

### Phase 8: Executive Report Generator
**Goal:** Sanitized executive report generation with complete workflow
**Deps:** Phase 2, Phase 3, Phase 4
**Reqs:** EXEC-01-13, DENY-01-04, LANG-01-03, UIUX-14-15
**Success:** Upload → sanitize → review → generate → desanitize → annotate → download

### Phase 9: Production Deployment
**Goal:** Production-ready Docker Compose stack with multi-user concurrency
**Deps:** Phase 5, Phase 8
**Reqs:** DEPL-01-03
**Success:** Docker Compose running, concurrent users, Nginx reverse proxy with SSE

## Progress

| Phase | Done | Status | Date |
|-------|------|--------|------|
| 1 - Foundation | 6/6 | Complete | 2026-02-11 |
| 1.1 - UI Polish | 3/3 | Complete | 2026-02-11 |
| 2 - Sanitization | 8/8 | Complete | 2026-02-12 |
| 2.1 - Profile | 2/2 | Complete | 2026-02-11 |
| 3 - LLM Integration | 0/3 | Planned | - |
| 4 - Document Processing | 0/TBD | Not started | - |
| 5 - Template Adapter Core | 0/TBD | Not started | - |
| 6 - Translation | 0/TBD | Not started | - |
| 7 - Modification & Bulk | 0/TBD | Not started | - |
| 8 - Executive Report | 0/TBD | Not started | - |
| 9 - Deployment | 0/TBD | Not started | - |

---
*Imported from GSD: 2026-02-12*
