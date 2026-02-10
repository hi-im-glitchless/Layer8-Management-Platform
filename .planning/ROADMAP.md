# Roadmap: Template AI Engine

## Overview

Layer8 automates two time-consuming tasks for offensive security teams: converting client Word templates into Ghostwriter-compatible Jinja2 templates using LLM analysis, and generating executive summaries from technical pentest reports. The roadmap progresses through security-first infrastructure (authentication, audit logging, sanitization), then builds core LLM and document processing capabilities, and finally delivers the two main features with progressive enhancement (core → translation → bulk processing). All phases prioritize GDPR/NDA compliance and pixel-perfect document fidelity.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Security** - Authentication, session management, audit logging, and security scanning
- [ ] **Phase 2: Sanitization Infrastructure** - Presidio-based PII sanitization with custom pentest recognizers
- [ ] **Phase 3: LLM Integration** - Multi-provider LLM client with SSE streaming and compliance logging
- [ ] **Phase 4: Document Processing** - DOCX parsing, PDF generation, and Ghostwriter integration
- [ ] **Phase 5: Template Adapter - Core** - LLM-powered Jinja2 insertion with preview and feedback loop
- [ ] **Phase 6: Template Adapter - Translation** - Bidirectional EN↔PT-PT translation preserving Jinja2 placeholders
- [ ] **Phase 7: Template Adapter - Modification & Bulk** - Reference template modification and bulk processing queue
- [ ] **Phase 8: Executive Report Generator** - Sanitized executive report generation with feedback and language override
- [ ] **Phase 9: Production Deployment** - Docker Compose stack with multi-user concurrency and reverse proxy

## Phase Details

### Phase 1: Foundation & Security
**Goal**: Secure infrastructure for user authentication, session isolation, and compliance-grade audit logging
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, SECR-01, SECR-02, SECR-03, SECR-04, SECR-06
**Success Criteria** (what must be TRUE):
  1. User can create account with username and password
  2. User must complete TOTP MFA setup during first login using authenticator app
  3. User can log in with username/password + TOTP code and enable "remember me" for trusted devices
  4. User session is isolated from other users via cryptographic session IDs and Redis-backed storage
  5. User can log out, destroying session and all associated temporary data
  6. All user actions are logged in a tamper-evident hash-chain audit trail
  7. Uploaded templates are scanned for Jinja2 template injection attempts before processing
  8. Admin can manually trigger cleanup of expired sessions and temporary files
**Plans**: TBD

Plans:
- [ ] 01-01: TBD during phase planning

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
**Goal**: Multi-provider LLM client with SSE streaming and compliance-grade interaction logging
**Depends on**: Phase 1 (requires audit logging infrastructure)
**Requirements**: LLMI-01, LLMI-02, LLMI-03, LLMI-04, LLMI-05
**Success Criteria** (what must be TRUE):
  1. System connects to Claude via CLIProxyAPI (OpenAI-compatible endpoint) for LLM requests
  2. System can fall back to official Anthropic API when CLIProxyAPI is unavailable
  3. LLM responses stream to the frontend in real-time via Server-Sent Events
  4. LLM client handles transient failures with exponential backoff and retry logic
  5. All LLM interactions are logged in the audit trail (sanitized prompts sent, responses received)
  6. System shows clear error state with retry option when LLM is unavailable
**Plans**: TBD

Plans:
- [ ] 03-01: TBD during phase planning

### Phase 4: Document Processing
**Goal**: DOCX parsing, PDF generation, and Ghostwriter integration for realistic template previews
**Depends on**: Phase 1 (requires session management for temporary file storage)
**Requirements**: DOCP-01, DOCP-02, DOCP-03, DOCP-04, DOCP-05, GHST-01, GHST-02, GHST-03
**Success Criteria** (what must be TRUE):
  1. System can parse .docx files extracting text content, structure, and formatting metadata
  2. System can generate .docx files with Jinja2 placeholders correctly placed
  3. System renders .docx to pixel-perfect PDF via Gotenberg (LibreOffice wrapper)
  4. PDF generation runs in a background queue to handle LibreOffice's non-thread-safe constraint
  5. System can render Jinja2 templates with dummy Ghostwriter data for realistic previews
  6. System connects to Ghostwriter GraphQL API to fetch dummy project data
  7. Reference templates for all 3 report types (web/external, internal, mobile) and both languages (EN, PT-PT) are stored in the app
**Plans**: TBD

Plans:
- [ ] 04-01: TBD during phase planning

### Phase 5: Template Adapter - Core
**Goal**: LLM-powered Jinja2 placeholder insertion with pixel-perfect preview and iterative feedback loop
**Depends on**: Phase 3 (LLM integration), Phase 4 (document processing)
**Requirements**: TMPL-01, TMPL-02, TMPL-03, TMPL-04, TMPL-05, TMPL-06, TMPL-07, TMPL-08, TMPL-09, TMPL-10, TMPL-11
**Success Criteria** (what must be TRUE):
  1. User can upload a client .docx template file and select report type (web/external, internal, mobile) and target language(s)
  2. System validates template compatibility and warns about unsupported Word features before processing
  3. LLM analyzes uploaded template structure against reference templates and suggests Jinja2 placeholder insertions
  4. LLM responses stream to the user in real-time during template analysis
  5. User can view a pixel-perfect PDF preview of the adapted template rendered with dummy Ghostwriter data
  6. User can add inline annotations (highlight + comment) on the preview to provide feedback
  7. User can submit multiple annotations as a batch, and the LLM corrects the template based on all feedback
  8. User can iterate through multiple feedback rounds until satisfied
  9. User can approve and download the final adapted .docx template
**Plans**: TBD

Plans:
- [ ] 05-01: TBD during phase planning

### Phase 6: Template Adapter - Translation
**Goal**: Bidirectional EN↔PT-PT translation of static template text while preserving all Jinja2 logic
**Depends on**: Phase 5 (template adapter core)
**Requirements**: TRNS-01, TRNS-02, TRNS-03, TRNS-04
**Success Criteria** (what must be TRUE):
  1. User can request EN → PT-PT translation of static template text during adaptation
  2. User can request PT-PT → EN translation of static template text during adaptation
  3. Translation preserves all Jinja2 variables and template logic unchanged
  4. Portuguese translation uses European Portuguese (PT-PT) exclusively, never Brazilian Portuguese
  5. Translated templates go through the same preview and feedback loop as new adaptations
**Plans**: TBD

Plans:
- [ ] 06-01: TBD during phase planning

### Phase 7: Template Adapter - Modification & Bulk
**Goal**: Reference template modification and bulk upload queue for processing multiple templates
**Depends on**: Phase 5 (template adapter core)
**Requirements**: TMOD-01, TMOD-02, TMOD-03, TMOD-04, TMOD-05, BULK-01, BULK-02, BULK-03, BULK-04
**Success Criteria** (what must be TRUE):
  1. User can select an existing reference template as a base for modification
  2. User can describe desired modifications in natural language (logo, colors, sections, formatting)
  3. User can upload assets (logos, images) as part of the modification request
  4. LLM applies modifications while preserving existing Jinja2 placeholders
  5. Modified template goes through the same preview and feedback loop as new adaptations
  6. User can upload multiple .docx templates in a single operation
  7. Templates are processed in a background queue with progress tracking
  8. User can view status of each template in the queue (pending, processing, complete, failed)
  9. User can download completed templates individually or review them through the normal feedback flow
**Plans**: TBD

Plans:
- [ ] 07-01: TBD during phase planning

### Phase 8: Executive Report Generator
**Goal**: LLM-powered executive report generation from sanitized technical reports with language override
**Depends on**: Phase 2 (sanitization), Phase 3 (LLM integration), Phase 4 (document processing)
**Requirements**: EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05, EXEC-06, EXEC-07, EXEC-08, EXEC-09, EXEC-10, EXEC-11, EXEC-12, EXEC-13, DENY-01, DENY-02, DENY-03, DENY-04, LANG-01, LANG-02, LANG-03
**Success Criteria** (what must be TRUE):
  1. User can upload a finalized technical pentest report (.docx) and system auto-detects language
  2. User can enter known client-specific terms (company names, project codes) before running sanitization
  3. Presidio sanitizes the document with standard PII and custom pentest-specific recognizers
  4. User can review the sanitized version with all sensitive data replaced by placeholder tokens
  5. User can see a sanitization summary showing counts by entity type (IPs, hosts, domains, persons, orgs)
  6. User must explicitly approve sanitization before any data is sent to the LLM
  7. LLM generates an executive report from the sanitized content with streaming output
  8. System validates that all placeholder tokens from the input survive in the LLM output
  9. User can view a desanitized preview of the executive report with real client data restored
  10. During sanitization review, user can highlight missed sensitive data to add to the deny list and re-sanitize
  11. User can add inline annotations on the desanitized preview to provide feedback
  12. User feedback is re-sanitized using the same mapping before being sent to the LLM
  13. User can override the output language to generate the executive report in a different language than the source (EN or PT-PT)
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
| 1. Foundation & Security | 0/TBD | Not started | - |
| 2. Sanitization Infrastructure | 0/TBD | Not started | - |
| 3. LLM Integration | 0/TBD | Not started | - |
| 4. Document Processing | 0/TBD | Not started | - |
| 5. Template Adapter - Core | 0/TBD | Not started | - |
| 6. Template Adapter - Translation | 0/TBD | Not started | - |
| 7. Template Adapter - Modification & Bulk | 0/TBD | Not started | - |
| 8. Executive Report Generator | 0/TBD | Not started | - |
| 9. Production Deployment | 0/TBD | Not started | - |
