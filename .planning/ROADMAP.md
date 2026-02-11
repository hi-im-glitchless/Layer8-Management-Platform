# Roadmap: Template AI Engine

## Overview

Layer8 automates two time-consuming tasks for offensive security teams: converting client Word templates into Ghostwriter-compatible Jinja2 templates using LLM analysis, and generating executive summaries from technical pentest reports. The roadmap progresses through security-first infrastructure (authentication, audit logging, sanitization), then builds core LLM and document processing capabilities, and finally delivers the two main features with progressive enhancement (core → translation → bulk processing). All phases prioritize GDPR/NDA compliance and pixel-perfect document fidelity.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation, Security & Web UI Design** - Frontend scaffold, design system, auth UI, authentication, session management, audit logging, and security scanning
- [ ] **Phase 2: Sanitization Infrastructure** - Presidio-based PII sanitization with custom pentest recognizers
- [ ] **Phase 3: LLM Integration** - Multi-provider LLM client with SSE streaming and compliance logging
- [ ] **Phase 4: Document Processing** - DOCX parsing, PDF generation, and Ghostwriter integration
- [ ] **Phase 5: Template Adapter - Core** - LLM-powered Jinja2 insertion with preview and feedback loop
- [ ] **Phase 6: Template Adapter - Translation** - Bidirectional EN↔PT-PT translation preserving Jinja2 placeholders
- [ ] **Phase 7: Template Adapter - Modification & Bulk** - Reference template modification and bulk processing queue
- [ ] **Phase 8: Executive Report Generator** - Sanitized executive report generation with feedback and language override
- [ ] **Phase 9: Production Deployment** - Docker Compose stack with multi-user concurrency and reverse proxy

## Phase Details

### Phase 1: Foundation, Security & Web UI Design
**Goal**: Secure infrastructure for user authentication, session isolation, and compliance-grade audit logging — with a fully designed and scaffolded frontend application including auth UI
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, SECR-01, SECR-02, SECR-03, SECR-04, SECR-06, UIUX-01, UIUX-02, UIUX-03, UIUX-04
**Success Criteria** (what must be TRUE):
  1. Frontend application scaffolded with React 19, Vite, TypeScript, shadcn/ui, and Tailwind CSS design system with consistent color palette and typography
  2. Application shell built with responsive layout, navigation sidebar, header with user/session info, and client-side routing for all planned pages
  3. Login page with username/password form, styled and functional
  4. TOTP MFA setup flow UI with QR code display and code verification input
  5. TOTP verification dialog for returning users, with "remember me" checkbox for trusted devices
  6. User can create account with username and password
  7. User must complete TOTP MFA setup during first login using authenticator app
  8. User can log in with username/password + TOTP code and enable "remember me" for trusted devices
  9. User session is isolated from other users via cryptographic session IDs and Redis-backed storage
  10. User can log out, destroying session and all associated temporary data
  11. All user actions are logged in a tamper-evident hash-chain audit trail
  12. Admin panel UI for manual session cleanup and basic system management
  13. Uploaded templates are scanned for Jinja2 template injection attempts before processing *(defense-in-depth, low priority)*
**Plans**: 6 plans

Plans:
- [ ] 01-01-PLAN.md — Frontend scaffold, design system, app shell (sidebar, header, theme toggle, routing)
- [ ] 01-02-PLAN.md — Backend scaffold, Prisma schema, Redis session store, env config
- [ ] 01-03-PLAN.md — Authentication backend (Argon2, TOTP, sessions, rate limiting, CSRF)
- [ ] 01-04-PLAN.md — Authentication frontend (split-screen login, TOTP setup/verify, onboarding wizard)
- [ ] 01-05-PLAN.md — Audit logging (hash-chain service, middleware, query/export API)
- [ ] 01-06-PLAN.md — Admin panel (user CRUD, session management, audit viewer, template scanner)

### Phase 2: Sanitization Infrastructure
**Goal**: Production-grade PII sanitization pipeline with custom pentest recognizers and session-scoped reversible mappings
**Depends on**: Phase 1 (requires session management for mapping storage)
**Requirements**: SECR-05
**Success Criteria** (what must be TRUE):
  1. System can sanitize documents with Presidio Analyzer detecting standard PII (names, emails, phone numbers)
  2. System can detect pentest-specific entities (IP addresses, hostnames, domains, AD objects, network paths, project codes) using custom recognizers
  3. Sanitization mappings are stored per-session in Redis with automatic TTL-based expiration
  4. Mappings are never sent to the LLM, only placeholder tokens
  5. System can desanitize content by restoring original values from session-scoped mappings
**Plans**: TBD

Plans:
- [ ] 02-01: TBD during phase planning

### Phase 3: LLM Integration
**Goal**: Multi-provider LLM client with SSE streaming, compliance-grade interaction logging, and streaming UI components
**Depends on**: Phase 1 (requires audit logging infrastructure)
**Requirements**: LLMI-01, LLMI-02, LLMI-03, LLMI-04, LLMI-05, UIUX-05, UIUX-06
**Success Criteria** (what must be TRUE):
  1. System connects to Claude via CLIProxyAPI (OpenAI-compatible endpoint) for LLM requests
  2. System can fall back to official Anthropic API when CLIProxyAPI is unavailable
  3. LLM responses stream to the frontend in real-time via Server-Sent Events
  4. Streaming LLM response display component with typewriter effect and loading indicators is built and reusable across features
  5. LLM client handles transient failures with exponential backoff and retry logic
  6. All LLM interactions are logged in the audit trail (sanitized prompts sent, responses received)
  7. LLM error state UI shows clear messaging and retry controls when LLM is unavailable
**Plans**: TBD

Plans:
- [ ] 03-01: TBD during phase planning

### Phase 4: Document Processing
**Goal**: DOCX parsing, PDF generation, Ghostwriter integration, and reusable document UI components (upload, preview, progress)
**Depends on**: Phase 1 (requires session management for temporary file storage)
**Requirements**: DOCP-01, DOCP-02, DOCP-03, DOCP-04, DOCP-05, GHST-01, GHST-02, GHST-03, UIUX-07, UIUX-08
**Success Criteria** (what must be TRUE):
  1. System can parse .docx files extracting text content, structure, and formatting metadata
  2. System can generate .docx files with Jinja2 placeholders correctly placed
  3. System renders .docx to pixel-perfect PDF via Gotenberg (LibreOffice wrapper)
  4. PDF generation runs in a background queue to handle LibreOffice's non-thread-safe constraint
  5. System can render Jinja2 templates with dummy Ghostwriter data for realistic previews
  6. System connects to Ghostwriter GraphQL API to fetch dummy project data
  7. Reference templates for all 3 report types (web/external, internal, mobile) and both languages (EN, PT-PT) are stored in the app
  8. Reusable file upload component with drag-and-drop, file type validation, and upload progress indicator
  9. PDF preview component with page navigation for rendered document previews
**Plans**: TBD

Plans:
- [ ] 04-01: TBD during phase planning

### Phase 5: Template Adapter - Core
**Goal**: LLM-powered Jinja2 placeholder insertion with pixel-perfect preview, iterative feedback loop, and complete template adapter workflow UI
**Depends on**: Phase 3 (LLM integration), Phase 4 (document processing)
**Requirements**: TMPL-01, TMPL-02, TMPL-03, TMPL-04, TMPL-05, TMPL-06, TMPL-07, TMPL-08, TMPL-09, TMPL-10, TMPL-11, UIUX-09, UIUX-10
**Success Criteria** (what must be TRUE):
  1. Template adapter workflow UI built: upload → select report type/language → analysis view → preview → annotate → download
  2. User can upload a client .docx template file and select report type (web/external, internal, mobile) and target language(s) via styled selectors
  3. System validates template compatibility and warns about unsupported Word features before processing
  4. LLM analyzes uploaded template structure against reference templates and suggests Jinja2 placeholder insertions
  5. LLM responses stream to the user in real-time during template analysis using the streaming display component
  6. User can view a pixel-perfect PDF preview of the adapted template rendered with dummy Ghostwriter data
  7. Inline annotation canvas on PDF preview with highlight, comment, and batch submission controls
  8. User can submit multiple annotations as a batch, and the LLM corrects the template based on all feedback
  9. User can iterate through multiple feedback rounds until satisfied
  10. User can approve and download the final adapted .docx template
**Plans**: TBD

Plans:
- [ ] 05-01: TBD during phase planning

### Phase 6: Template Adapter - Translation
**Goal**: Bidirectional EN↔PT-PT translation of static template text while preserving all Jinja2 logic, with translation UI integrated into template adapter workflow
**Depends on**: Phase 5 (template adapter core)
**Requirements**: TRNS-01, TRNS-02, TRNS-03, TRNS-04, UIUX-11
**Success Criteria** (what must be TRUE):
  1. Translation option selector integrated into the template adapter workflow UI
  2. User can request EN → PT-PT translation of static template text during adaptation
  3. User can request PT-PT → EN translation of static template text during adaptation
  4. Translation preserves all Jinja2 variables and template logic unchanged
  5. Portuguese translation uses European Portuguese (PT-PT) exclusively, never Brazilian Portuguese
  6. Translated templates go through the same preview and feedback loop as new adaptations
**Plans**: TBD

Plans:
- [ ] 06-01: TBD during phase planning

### Phase 7: Template Adapter - Modification & Bulk
**Goal**: Reference template modification and bulk upload queue with dedicated UI for template browsing, modification requests, and bulk progress tracking
**Depends on**: Phase 5 (template adapter core)
**Requirements**: TMOD-01, TMOD-02, TMOD-03, TMOD-04, TMOD-05, BULK-01, BULK-02, BULK-03, BULK-04, UIUX-12, UIUX-13
**Success Criteria** (what must be TRUE):
  1. Reference template browser UI with filtering by report type and language
  2. User can select an existing reference template as a base for modification
  3. Modification request form UI with natural language input and asset upload
  4. User can describe desired modifications in natural language (logo, colors, sections, formatting)
  5. User can upload assets (logos, images) as part of the modification request
  6. LLM applies modifications while preserving existing Jinja2 placeholders
  7. Modified template goes through the same preview and feedback loop as new adaptations
  8. Bulk upload dashboard with drag-and-drop for multiple .docx files
  9. Templates are processed in a background queue with per-template progress tracking UI
  10. User can view status of each template in the queue (pending, processing, complete, failed) via status cards
  11. User can download completed templates individually or review them through the normal feedback flow
**Plans**: TBD

Plans:
- [ ] 07-01: TBD during phase planning

### Phase 8: Executive Report Generator
**Goal**: Sanitized executive report generation with complete workflow UI including sanitization review, streaming preview, feedback loop, and language override
**Depends on**: Phase 2 (sanitization), Phase 3 (LLM integration), Phase 4 (document processing)
**Requirements**: EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05, EXEC-06, EXEC-07, EXEC-08, EXEC-09, EXEC-10, EXEC-11, EXEC-12, EXEC-13, DENY-01, DENY-02, DENY-03, DENY-04, LANG-01, LANG-02, LANG-03, UIUX-14, UIUX-15
**Success Criteria** (what must be TRUE):
  1. Executive report workflow UI built: upload → deny list → sanitization review → approve → streaming generation → desanitized preview → annotate → download
  2. User can upload a finalized technical pentest report (.docx) and system auto-detects language
  3. Deny list management UI for entering known client-specific terms (company names, project codes) before sanitization
  4. Presidio sanitizes the document with standard PII and custom pentest-specific recognizers
  5. Sanitization review interface with entity highlighting, counts by type (IPs, hosts, domains, persons, orgs), and approve/reject controls
  6. User must explicitly approve sanitization before any data is sent to the LLM
  7. LLM generates an executive report from the sanitized content with streaming output displayed via streaming component
  8. System validates that all placeholder tokens from the input survive in the LLM output
  9. User can view a desanitized preview of the executive report with real client data restored
  10. During sanitization review, user can highlight missed sensitive data to add to the deny list and re-sanitize
  11. User can add inline annotations on the desanitized preview to provide feedback using the annotation canvas
  12. User feedback is re-sanitized using the same mapping before being sent to the LLM
  13. Language override selector to generate the executive report in a different language than the source (EN or PT-PT)
  14. User can iterate through multiple feedback rounds until satisfied
  15. User can approve and download the final desanitized .docx executive report
**Plans**: TBD

Plans:
- [ ] 08-01: TBD during phase planning

### Phase 9: Production Deployment
**Goal**: Production-ready Docker Compose stack with multi-user concurrency and reverse proxy
**Depends on**: Phase 5 (template adapter), Phase 8 (executive report)
**Requirements**: DEPL-01, DEPL-02, DEPL-03
**Success Criteria** (what must be TRUE):
  1. Application runs as a Docker Compose stack (frontend, backend, Presidio, Redis, DB, Gotenberg)
  2. Multiple users can use the application concurrently without interference or session corruption
  3. Frontend is served via Nginx reverse proxy with SSE support configured correctly
  4. All containers run with non-root users and proper security context
  5. Application can be deployed to a VPN-internal server and accessed by the pentest team
**Plans**: TBD

Plans:
- [ ] 09-01: TBD during phase planning

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation, Security & Web UI Design | 0/6 | Planned | - |
| 2. Sanitization Infrastructure | 0/TBD | Not started | - |
| 3. LLM Integration | 0/TBD | Not started | - |
| 4. Document Processing | 0/TBD | Not started | - |
| 5. Template Adapter - Core | 0/TBD | Not started | - |
| 6. Template Adapter - Translation | 0/TBD | Not started | - |
| 7. Template Adapter - Modification & Bulk | 0/TBD | Not started | - |
| 8. Executive Report Generator | 0/TBD | Not started | - |
| 9. Production Deployment | 0/TBD | Not started | - |
