# Requirements: Template AI Engine

**Defined:** 2026-02-10
**Core Value:** Pentesters spend their time on security work, not on manual template adaptation and executive report writing

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication & Session Management

- [ ] **AUTH-01**: User can create account with username and password
- [ ] **AUTH-02**: User must set up TOTP MFA (authenticator app) during first login
- [ ] **AUTH-03**: User can log in with username/password + TOTP code
- [ ] **AUTH-04**: User can enable "remember me" to skip TOTP on trusted devices for a configurable period
- [ ] **AUTH-05**: User session is isolated via Redis-backed session storage with cryptographic session IDs
- [ ] **AUTH-06**: User can log out, which destroys session and all associated temporary data

### Security & Compliance

- [ ] **SECR-01**: Uploaded templates are scanned for Jinja2 template injection attempts before processing
- [ ] **SECR-02**: All user actions are logged in a tamper-evident hash-chain audit trail (who, what, when)
- [ ] **SECR-03**: All LLM interactions are logged in audit trail (sanitized prompts sent, responses received)
- [ ] **SECR-04**: Audit logs are exportable for compliance auditors
- [ ] **SECR-05**: Sanitization mappings are stored per-session in Redis and never sent to the LLM
- [ ] **SECR-06**: Admin can manually trigger cleanup of expired sessions and temporary files

### Template Adapter — Core

- [ ] **TMPL-01**: User can upload a client .docx template file
- [ ] **TMPL-02**: User can select report type (web/external, internal, mobile) for the uploaded template
- [ ] **TMPL-03**: User can select target language(s) (English, PT-PT, or both) for the template
- [ ] **TMPL-04**: System validates template compatibility and warns about unsupported Word features before processing
- [ ] **TMPL-05**: LLM analyzes uploaded template structure against reference templates and inserts correct Jinja2 placeholders
- [ ] **TMPL-06**: LLM responses stream to the user in real-time during template analysis and generation
- [ ] **TMPL-07**: User can view a pixel-perfect PDF preview of the adapted template rendered with dummy Ghostwriter data
- [ ] **TMPL-08**: User can add inline annotations (highlight + comment) on the preview to provide feedback
- [ ] **TMPL-09**: User can submit multiple annotations as a batch, and the LLM corrects the template based on all feedback
- [ ] **TMPL-10**: User can iterate through multiple feedback rounds until satisfied
- [ ] **TMPL-11**: User can approve and download the final adapted .docx template

### Template Adapter — Translation

- [ ] **TRNS-01**: User can request EN → PT-PT translation of static template text during adaptation
- [ ] **TRNS-02**: User can request PT-PT → EN translation of static template text during adaptation
- [ ] **TRNS-03**: Translation preserves all Jinja2 variables and template logic unchanged
- [ ] **TRNS-04**: Portuguese translation uses European Portuguese (PT-PT) exclusively, never Brazilian Portuguese

### Template Adapter — Modification

- [ ] **TMOD-01**: User can select an existing reference template as a base for modification
- [ ] **TMOD-02**: User can describe desired modifications in natural language (logo, colors, sections, formatting)
- [ ] **TMOD-03**: User can upload assets (logos, images) as part of the modification request
- [ ] **TMOD-04**: LLM applies modifications while preserving existing Jinja2 placeholders
- [ ] **TMOD-05**: Modified template goes through the same preview and feedback loop as new adaptations

### Template Adapter — Bulk Processing

- [ ] **BULK-01**: User can upload multiple .docx templates in a single operation
- [ ] **BULK-02**: Templates are processed in a background queue with progress tracking
- [ ] **BULK-03**: User can view status of each template in the queue (pending, processing, complete, failed)
- [ ] **BULK-04**: User can download completed templates individually or review them through the normal feedback flow

### Executive Report — Core

- [ ] **EXEC-01**: User can upload a finalized technical pentest report (.docx)
- [ ] **EXEC-02**: System auto-detects the document language (English or PT-PT)
- [ ] **EXEC-03**: Presidio sanitizes the document with standard PII recognizers plus custom pentest-specific recognizers (IPs, hostnames, domains, AD objects, network paths, usernames, project codes)
- [ ] **EXEC-04**: User can review the sanitized version of the document with all sensitive data replaced by placeholder tokens
- [ ] **EXEC-05**: User can see a sanitization summary (counts by entity type: IPs, hosts, domains, persons, orgs)
- [ ] **EXEC-06**: User must explicitly approve sanitization before any data is sent to the LLM
- [ ] **EXEC-07**: LLM generates an executive report from the sanitized content with streaming output
- [ ] **EXEC-08**: System validates that all placeholder tokens from the input survive in the LLM output
- [ ] **EXEC-09**: User can view a desanitized preview of the executive report with real client data restored
- [ ] **EXEC-10**: User can add inline annotations on the desanitized preview to provide feedback
- [ ] **EXEC-11**: User feedback is re-sanitized using the same mapping before being sent to the LLM
- [ ] **EXEC-12**: User can iterate through multiple feedback rounds until satisfied
- [ ] **EXEC-13**: User can approve and download the final desanitized .docx executive report

### Executive Report — Deny Lists

- [ ] **DENY-01**: User can enter known client-specific terms (company names, project codes, system names) before running sanitization
- [ ] **DENY-02**: Pre-sanitization deny list terms are added to the sanitization pipeline alongside Presidio recognizers
- [ ] **DENY-03**: During sanitization review, user can highlight missed sensitive data to add to the deny list
- [ ] **DENY-04**: Document is re-sanitized with updated deny list and user reviews again

### Executive Report — Language

- [ ] **LANG-01**: User can override the output language to generate the executive report in a different language than the source
- [ ] **LANG-02**: Portuguese output uses European Portuguese (PT-PT) exclusively, never Brazilian Portuguese
- [ ] **LANG-03**: Language-specific terminology follows PT-PT cybersecurity industry standards

### LLM Infrastructure

- [ ] **LLMI-01**: System connects to Claude via CLIProxyAPI (OpenAI-compatible endpoint) as the primary LLM provider
- [ ] **LLMI-02**: System can fall back to the official Anthropic API if CLIProxyAPI is unavailable
- [ ] **LLMI-03**: LLM responses are streamed to the frontend via SSE (Server-Sent Events) for real-time display
- [ ] **LLMI-04**: LLM client handles retries with exponential backoff on transient failures
- [ ] **LLMI-05**: System shows clear error state when LLM is unavailable, with retry option

### Document Processing

- [ ] **DOCP-01**: System can parse .docx files extracting text content, structure, and formatting metadata
- [ ] **DOCP-02**: System can generate .docx files with Jinja2 placeholders correctly placed
- [ ] **DOCP-03**: System renders .docx to pixel-perfect PDF via Gotenberg (LibreOffice wrapper)
- [ ] **DOCP-04**: PDF generation runs in a background queue (LibreOffice is not thread-safe)
- [ ] **DOCP-05**: System can render Jinja2 templates with dummy Ghostwriter data for preview

### Ghostwriter Integration

- [ ] **GHST-01**: System connects to Ghostwriter GraphQL API (read-only) to fetch dummy project data
- [ ] **GHST-02**: Dummy project data is used to render realistic template previews
- [ ] **GHST-03**: Reference templates for all 3 report types (web/external, internal, mobile) and both languages (EN, PT-PT) are stored in the app

### Deployment

- [ ] **DEPL-01**: Application runs as a Docker Compose stack (frontend, backend, Presidio, Redis, DB, Gotenberg)
- [ ] **DEPL-02**: Multiple users can use the application concurrently without interference
- [ ] **DEPL-03**: Frontend is served via Nginx reverse proxy with SSE support

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Data Retention

- **RETN-01**: Admin can configure data retention periods per data type
- **RETN-02**: System automatically cleans up expired data on schedule
- **RETN-03**: Retention policies are auditable and configurable via admin UI

### Automated Report Review

- **REVW-01**: LLM performs first-pass QA on technical reports (CVSS alignment, completeness, writing quality)
- **REVW-02**: Review findings are presented to user for triage

### Advanced Features

- **ADVN-01**: Direct Ghostwriter integration for Feature 2 (pull reports from GW instead of manual upload)
- **ADVN-02**: Generation history with ability to browse and re-download past outputs
- **ADVN-03**: Executive report template library (multiple styles: one-pager, detailed, board presentation)
- **ADVN-04**: Template version management (detect GW schema changes, identify affected templates)
- **ADVN-05**: SSO/AD authentication integration

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Full report authoring | Ghostwriter's domain — duplicating creates maintenance burden |
| Findings library / vulnerability database | Ghostwriter already provides this |
| Infrastructure tracking / client portal | Ghostwriter's domain |
| Multi-user real-time collaboration | 2-5 person team doesn't need Google Docs-style collab |
| Template marketplace (sharing across orgs) | NDA/liability risk |
| Custom LLM fine-tuning | Prompt engineering more maintainable; fine-tuning requires massive dataset |
| Mobile app | Web-only for v1 and foreseeable future |
| Languages beyond EN and PT-PT | Quality over quantity; two languages is sufficient |
| Auto-template updates when GW schema changes | Safety concern — templates should be manually verified |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| — | — | (Populated during roadmap creation) |

**Coverage:**
- v1 requirements: 53 total
- Mapped to phases: 0
- Unmapped: 53 (pending roadmap creation)

---
*Requirements defined: 2026-02-10*
*Last updated: 2026-02-10 after initial definition*
