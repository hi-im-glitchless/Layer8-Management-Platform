# Template AI Engine Roadmap

Layer8 automates template adaptation and executive report generation for offensive security teams. The roadmap progresses through security-first infrastructure, LLM and document processing capabilities, then delivers the two main features with progressive enhancement.

## Phases

- [x] Phase 1: Foundation, Security & Web UI Design
- [x] Phase 1.1: UI/UX Visual Polish (INSERTED)
- [x] Phase 2: Sanitization Infrastructure
- [x] Phase 2.1: Profile Page Completion (INSERTED)
- [x] Phase 3: LLM Integration
- [x] Phase 4: Document Processing
- [x] Phase 5: Template Adapter - Core
- [x] Phase 5.1: Analysis Preview & Mapping Memory (INSERTED)
- [x] Phase 5.2: Interactive PDF Mapping (INSERTED)
- [x] Phase 5.3: Placeholder Verification & Correction (INSERTED)
- [x] Phase 5.4: Intelligent Knowledge Base (INSERTED)
- [x] Phase 5.5: LLM-Powered Placeholder Regeneration (INSERTED)
- [x] Phase 5.6: Prescriptive Knowledge Base (INSERTED)
- [x] Phase 6: Executive Report Generator
- [x] Phase 6.1: Executive Report HTML Overhaul (INSERTED)
- [x] Phase 7: UI Polish (INSERTED)
- [x] Phase 8: Role-Based Access Control (INSERTED)
- [ ] Phase 9: Team Schedule & Allocation
- [ ] Phase 10: Security Hardening

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
**Plans:** 3/3 complete

### Phase 4: Document Processing
**Goal:** DOCX parsing, PDF generation, Ghostwriter integration, reusable document UI
**Deps:** Phase 1
**Reqs:** DOCP-01-05, GHST-01-03, UIUX-07-08
**Success:** Parse/generate DOCX, pixel-perfect PDF via Gotenberg, Ghostwriter GraphQL integration
**Plans:** 5/5 complete

### Phase 5: Template Adapter - Core
**Goal:** LLM-powered Jinja2 insertion with pixel-perfect preview, iterative feedback loop
**Deps:** Phase 3, Phase 4
**Reqs:** TMPL-01-11, UIUX-09-10
**Success:** Upload → analyze → preview → annotate → download workflow complete
**Plans:** 5/5 complete

### Phase 5.1: Analysis Preview & Mapping Memory (INSERTED)
**Goal:** Annotated document preview in Analysis step highlighting mapped vs missing placeholders, plus a persistent knowledge base that stores completed mappings as few-shot examples for future LLM analyses
**Deps:** Phase 5
**Reqs:** TMPL-01, TMPL-06, UIUX-09
**Success:** Annotated PDF preview shows green (mapped) / yellow (gap) highlights in Step 2; completed mappings persist in DB and inject as few-shot examples in future analyses, reducing repeated misses
**Plans:** 5/5 complete

### Phase 5.2: Interactive PDF Mapping (INSERTED)
**Goal:** Replace table-based mapping UI with a PDF-first, select-and-describe workflow
**Deps:** Phase 5.1
**Reqs:** TMPL-01, TMPL-06, UIUX-09, UIUX-10
**Success:** Users can select text on PDF + pick blank paragraphs from structure panel, batch-describe selections via chat, LLM maps all at once, PDF regenerates with green shading, KB stores mappings per template type for few-shot reuse
**Plans:** 5/5 complete

### Phase 5.3: Placeholder Verification & Correction (INSERTED)
**Goal:** Analysis step renders the PDF with visible Jinja placeholders, three correction modes via LLM chat
**Deps:** Phase 5.2
**Reqs:** TMPL-01, TMPL-06, UIUX-09, UIUX-10
**Success:** Analysis step shows PDF with raw Jinja placeholders, three selection-based correction modes work end-to-end, LLM processes corrections, regenerate produces corrected PDF
**Plans:** 5/5 complete

### Phase 5.4: Intelligent Knowledge Base (INSERTED)
**Goal:** Structural intelligence layer with zone patterns, blueprints, and confidence calibration
**Deps:** Phase 5.3
**Reqs:** TMPL-01, TMPL-06
**Success:** KB stores zone patterns, repetition rules, structural blueprints; auto-map accuracy 80%+ on familiar templates
**Plans:** 5/5 complete

### Phase 5.5: LLM-Powered Placeholder Regeneration (INSERTED)
**Goal:** Replace mechanical find-and-replace with LLM-based intelligent placeholder placement
**Deps:** Phase 5.4
**Reqs:** TMPL-01, TMPL-06
**Success:** LLM produces correctly-placed placeholders without document corruption; mapping table UI unchanged
**Plans:** 4/4 complete

### Phase 5.6: Prescriptive Knowledge Base (INSERTED)
**Goal:** Transform KB from advisory to deterministic mapping cache with LLM fallback
**Deps:** Phase 5.5
**Reqs:** TMPL-01, TMPL-06
**Success:** Re-uploading mapped document produces near-identical mappings with zero LLM calls for known sections
**Plans:** 5/5 complete

### Phase 6: Executive Report Generator
**Goal:** Sanitized executive report generation with complete workflow
**Deps:** Phase 2, Phase 3, Phase 4
**Reqs:** EXEC-01-13, DENY-01-04, LANG-01-03, UIUX-14-15
**Success:** Upload → sanitize → review → generate → desanitize → annotate → download
**Plans:** 4/4 complete

### Phase 6.1: Executive Report HTML Overhaul (INSERTED)
**Goal:** Replace DOCX-based report generation with HTML template rendering via Gotenberg
**Deps:** Phase 6
**Reqs:** EXEC-01-13
**Success:** HTML templates produce pixel-perfect PDF reports matching corporate branding
**Plans:** 5/5 complete

### Phase 7: UI Polish (INSERTED)
**Goal:** Complete the dashboard and minor visual details across the application
**Deps:** Phase 6
**Reqs:** Visual polish (no formal requirement IDs)
**Success:** Dashboard fully functional, minor visual inconsistencies resolved, polished user experience
**Plans:** 5/5 complete

### Phase 8: Role-Based Access Control (INSERTED)
**Goal:** Role-based permissions (ADMIN, MANAGER, PENTESTER) with route guards and UI enforcement
**Deps:** Phase 1
**Reqs:** AUTH-01-06
**Success:** Three roles with distinct permissions, admin user management panel, route-level RBAC middleware
**Plans:** 5/5 complete

### Phase 9: Team Schedule & Allocation
**Goal:** Build a team allocation dashboard that lets managers assign pentesters to projects on a weekly calendar, track availability (holidays, absences), and manage team composition — integrated natively with the app's existing UI patterns (React/shadcn/TanStack), Prisma data layer, and RBAC system
**Deps:** Phase 8 (RBAC for role-gated access)
**Reqs:** SCHED-01 through SCHED-12
**Success:**
- Weekly calendar grid with sticky headers/columns showing team × weeks for full year
- Per-day availability indicators (available/holiday/absence) rendered inline
- Click-to-edit assignments with project name, color, status (confirmed/needs-reqs/placeholder)
- Split-cell support (two projects in same week)
- Drag-and-drop to swap/move assignments between cells
- Ctrl+click copy/paste assignments across cells
- Lock assignments to prevent accidental changes
- Team management panel (add/remove/reorder members)
- Holiday configuration (Portuguese public holidays, extensible)
- Absence management (click day dots to toggle personal absences)
- Auto-OUT logic (week becomes OUT when all days unavailable)
- ADMIN/MANAGER can edit; PENTESTER read-only view
**Requirements:**
- SCHED-01: Multi-section calendar (quarterly views + all-year tab)
- SCHED-02: Sticky column/header scrollable grid
- SCHED-03: Weekly assignment cells with color-coded projects
- SCHED-04: Per-day availability dots (5 per week: Mon-Fri)
- SCHED-05: Edit modal with color palette and status cycling
- SCHED-06: Split cell support (two projects per week)
- SCHED-07: Drag-and-drop assignment swapping
- SCHED-08: Ctrl+click clipboard copy/paste
- SCHED-09: Lock/unlock assignments
- SCHED-10: Team management panel (add/remove/reorder)
- SCHED-11: Holiday and absence management
- SCHED-12: RBAC integration (ADMIN/MANAGER write, PENTESTER read-only)

### Phase 10: Security Hardening
**Goal:** Production security hardening with rate limiting, CSRF protection, and security headers
**Deps:** Phase 8
**Reqs:** SECR-01-06
**Success:** OWASP-compliant security posture, rate limiting, CSRF tokens, security headers

## Progress

| Phase | Done | Status | Date |
|-------|------|--------|------|
| 1 - Foundation | 6/6 | Complete | 2026-02-11 |
| 1.1 - UI Polish | 3/3 | Complete | 2026-02-11 |
| 2 - Sanitization | 8/8 | Complete | 2026-02-12 |
| 2.1 - Profile | 2/2 | Complete | 2026-02-11 |
| 3 - LLM Integration | 3/3 | Complete | 2026-02-12 |
| 4 - Document Processing | 5/5 | Complete | 2026-02-13 |
| 5 - Template Adapter Core | 5/5 | Complete | 2026-02-14 |
| 5.1 - Analysis Preview & Memory | 5/5 | Complete | 2026-02-13 |
| 5.2 - Interactive PDF Mapping | 5/5 | Complete | 2026-02-14 |
| 5.3 - Placeholder Verification | 5/5 | Complete | 2026-02-14 |
| 5.4 - Intelligent KB | 5/5 | Complete | 2026-02-14 |
| 5.5 - LLM Placeholder Regen | 4/4 | Complete | 2026-02-15 |
| 5.6 - Prescriptive KB | 5/5 | Complete | 2026-02-15 |
| 6 - Executive Report | 4/4 | Complete | 2026-02-16 |
| 6.1 - Executive Report HTML | 5/5 | Complete | 2026-02-16 |
| 7 - UI Polish | 5/5 | Complete | 2026-02-17 |
| 8 - Role-Based Access Control | 5/5 | Complete | 2026-02-18 |
| 9 - Team Schedule & Allocation | 0/TBD | Not started | - |
| 10 - Security Hardening | 0/TBD | Not started | - |
