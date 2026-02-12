# Template AI Engine Requirements

Defined: 2026-02-10 | Core value: Pentesters spend their time on security work, not on manual template adaptation and executive report writing

## v1 Requirements

### Authentication & Session Management
- [x] **AUTH-01**: User can create account with username and password
- [x] **AUTH-02**: User must set up TOTP MFA (authenticator app) during first login
- [x] **AUTH-03**: User can log in with username/password + TOTP code
- [x] **AUTH-04**: User can enable "remember me" to skip TOTP on trusted devices
- [x] **AUTH-05**: User session is isolated via Redis-backed session storage
- [x] **AUTH-06**: User can log out, destroying session and temporary data

### Security & Compliance
- [x] **SECR-01**: Uploaded templates scanned for Jinja2 injection (defense-in-depth)
- [x] **SECR-02**: All user actions logged in tamper-evident hash-chain audit trail
- [ ] **SECR-03**: All LLM interactions logged in audit trail
- [x] **SECR-04**: Audit logs exportable for compliance auditors
- [x] **SECR-05**: Sanitization mappings stored per-session, never sent to LLM
- [x] **SECR-06**: Admin can manually trigger cleanup of expired sessions

### LLM Infrastructure
- [ ] **LLMI-01**: System connects to Claude via CLIProxyAPI (OpenAI-compatible)
- [ ] **LLMI-02**: System can fall back to Anthropic API if CLIProxyAPI unavailable
- [ ] **LLMI-03**: LLM responses streamed via SSE for real-time display
- [ ] **LLMI-04**: LLM client handles retries with exponential backoff
- [ ] **LLMI-05**: Clear error state when LLM unavailable, with retry option

### Template Adapter - Core
- [ ] **TMPL-01** through **TMPL-11**: Upload, analyze, preview, annotate, download adapted templates

### Template Adapter - Translation
- [ ] **TRNS-01** through **TRNS-04**: Bidirectional EN/PT-PT translation preserving Jinja2

### Template Adapter - Modification & Bulk
- [ ] **TMOD-01** through **TMOD-05**: Modify existing reference templates
- [ ] **BULK-01** through **BULK-04**: Bulk upload and background queue processing

### Executive Report
- [ ] **EXEC-01** through **EXEC-13**: Upload, sanitize, generate, review, download executive reports
- [ ] **DENY-01** through **DENY-04**: Pre-sanitization deny list management
- [ ] **LANG-01** through **LANG-03**: Language override with PT-PT support

### Document Processing
- [ ] **DOCP-01** through **DOCP-05**: DOCX parsing, PDF generation, Jinja2 rendering

### Ghostwriter Integration
- [ ] **GHST-01** through **GHST-03**: GraphQL API, dummy data, reference templates

### Deployment
- [ ] **DEPL-01** through **DEPL-03**: Docker Compose, concurrency, Nginx reverse proxy

### UI/UX
- [x] **UIUX-01** through **UIUX-04**: Foundation (scaffold, shell, login, admin)
- [ ] **UIUX-05** through **UIUX-06**: LLM streaming UI (Phase 3)
- [ ] **UIUX-07** through **UIUX-08**: Document processing UI (Phase 4)
- [ ] **UIUX-09** through **UIUX-10**: Template adapter UI (Phase 5)
- [ ] **UIUX-11**: Translation UI (Phase 6)
- [ ] **UIUX-12** through **UIUX-13**: Modification & bulk UI (Phase 7)
- [ ] **UIUX-14** through **UIUX-15**: Executive report UI (Phase 8)

## v2 Requirements
- RETN-01 through RETN-03: Configurable data retention
- REVW-01 through REVW-02: Automated report review
- ADVN-01 through ADVN-05: Direct GW integration, history, template library, SSO

## Out of Scope
| Feature | Reason |
|---------|--------|
| Full report authoring | Ghostwriter's domain |
| Findings library | Ghostwriter already provides this |
| Real-time collaboration | 2-5 person team doesn't need it |
| Custom LLM fine-tuning | Prompt engineering more maintainable |
| Languages beyond EN/PT-PT | Quality over quantity |

## Traceability
- v1 requirements: 68 total, all mapped to phases
- Phase 1: AUTH-01-06, SECR-01-04, SECR-06, UIUX-01-04
- Phase 2: SECR-05
- Phase 3: LLMI-01-05, SECR-03, UIUX-05-06
- Phase 4: DOCP-01-05, GHST-01-03, UIUX-07-08
- Phase 5: TMPL-01-11, UIUX-09-10
- Phase 6: TRNS-01-04, UIUX-11
- Phase 7: TMOD-01-05, BULK-01-04, UIUX-12-13
- Phase 8: EXEC-01-13, DENY-01-04, LANG-01-03, UIUX-14-15
- Phase 9: DEPL-01-03

---
*Imported from GSD: 2026-02-12*
