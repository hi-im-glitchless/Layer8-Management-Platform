# Template AI Engine

## What This Is

An internal web application for the offensive security team that automates two time-consuming tasks: converting client-provided Word templates into Ghostwriter-compatible templates with Jinja2 placeholders, and generating executive-level summary reports from finalized technical pentest reports. Supports English and European Portuguese (PT-PT), with a 2-5 person pentester team as the initial user base.

## Core Value

Pentesters spend their time on security work, not on manual template adaptation and executive report writing. Both features must produce output that's good enough to send to clients with minimal human editing.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

**Feature 1 — Ghostwriter Template Adapter:**
- [ ] Upload client .docx template and select report type (web/external, internal, mobile) and language (EN, PT-PT, both)
- [ ] LLM analyzes template structure against reference templates and inserts correct Jinja2 placeholders
- [ ] Pixel-perfect PDF preview rendered with dummy Ghostwriter project data
- [ ] Streaming LLM responses during generation
- [ ] Inline annotation feedback loop — highlight + comment on preview, batch submit, LLM corrects
- [ ] EN ↔ PT-PT translation of static template text (Jinja2 variables unchanged)
- [ ] Template modification sub-feature — modify existing reference templates (logo, colors, sections)
- [ ] Bulk upload — process multiple templates in a background queue
- [ ] Download final adapted .docx template

**Feature 2 — Executive Report Generator:**
- [ ] Upload finalized technical report (.docx), auto-detect language
- [ ] Presidio + spaCy sanitization with custom pentest-specific recognizers
- [ ] Pre-sanitization deny list for known client-specific terms
- [ ] User reviews sanitized output, highlights missed terms, re-sanitizes until approved
- [ ] LLM generates executive report from sanitized content with streaming output
- [ ] Placeholder token validation — verify all tokens survive in LLM output
- [ ] Desanitized preview for user review
- [ ] Inline annotation feedback loop with re-sanitization of user feedback before sending to LLM
- [ ] Language override (EN ↔ PT-PT)
- [ ] Download final desanitized .docx executive report

**Shared Infrastructure:**
- [ ] Authentication with username/password + TOTP MFA (authenticator app) and "remember me"
- [ ] Compliance-grade audit log (who, what, when, what was sent to LLM, what came back, exportable)
- [ ] Configurable data retention with auto-cleanup (admin sets retention period)
- [ ] LLM client abstraction supporting CLIProxyAPI (OpenAI-compatible, primary) and Anthropic API (fallback)
- [ ] Docker Compose deployment (frontend, backend, Presidio, DB)
- [ ] Concurrent multi-user support

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Automated technical report review — Deferred to v2. High complexity, not core to initial value.
- Direct Ghostwriter integration for Feature 2 (pull report from GW) — Manual upload for v1. GW integration adds complexity and requires robust workflow state tracking.
- Full generation history with versioning/comparison — v1 has audit log only. Browsable history is v2.
- OAuth/SSO/AD integration — Simple login + TOTP is sufficient for a small team. SSO can be added later.
- Mobile app — Web-only for v1.
- Real-time chat/messaging — Not needed.
- Template version management (auto-detect GW schema changes) — Future feature.
- Executive report template library (multiple styles) — Single default template for v1.

## Context

**Team & Workflow:**
- Offensive security team of 2-5 pentesters
- Template adaptation happens roughly quarterly (varies with new client onboarding)
- Executive reports are a weekly/monthly task
- Turnaround expectations vary by client — tool should make this near-instant
- Team uses Ghostwriter for report generation, accessible over VPN

**Technical Environment:**
- Ghostwriter instance running behind VPN — API token access needs to be set up
- CLIProxyAPI (https://help.router-for.me/) wraps Claude Max subscription as OpenAI-compatible API — available for dev, needs setup for prod
- Reference Ghostwriter templates (.docx) for all 3 report types need to be gathered
- Dummy Ghostwriter project with sample findings will be created manually by the user
- Development is local machine + VPN to reach Ghostwriter
- Production will likely be a server inside the VPN network

**Key Technical Concerns (from user):**
- Placeholder accuracy — Will the LLM place Jinja2 variables correctly?
- Sanitization completeness — Will Presidio catch all sensitive data? Custom client terms are the biggest worry.
- Output quality — Will executive reports be client-ready with minimal editing?
- PDF preview fidelity — Must be pixel-perfect (research phase will determine best rendering approach)

**Compliance:**
- GDPR applies (EU client data)
- Client NDAs restrict how data can be processed/stored
- All sanitization mappings stay local, never sent to LLM
- Audit trail must be compliance-grade and exportable

## Constraints

- **LLM Access**: Primary via CLIProxyAPI (OpenAI SDK format) with Anthropic API as fallback. Production needs CLIProxyAPI setup or API keys.
- **Network**: Ghostwriter is VPN-only. Dev connects over VPN; prod server will be inside VPN network.
- **Language**: Must support EN and PT-PT (European Portuguese specifically — never Brazilian Portuguese).
- **Report Types**: All three (web/external, internal, mobile) required for v1.
- **Data Handling**: Technical reports must NEVER leave local environment unsanitized. GDPR and NDA compliance mandatory.
- **Preview Rendering**: Pixel-perfect PDF preview required. Research phase to determine best approach (LibreOffice headless or alternative).
- **Annotations**: Inline highlight + comment annotations on preview are a must-have, not a nice-to-have. Batch submission of multiple annotations per feedback round.
- **Concurrency**: Multiple pentesters may use the tool simultaneously.

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| OpenAI SDK format as primary LLM client | CLIProxyAPI exposes OpenAI-compatible endpoint; works with Max subscription | — Pending |
| TOTP MFA for authentication | Simple, secure, no dependency on SSO infrastructure | — Pending |
| Both features built in parallel | Shared infrastructure supports both; team wants both for v1 | — Pending |
| Simple text chat → inline annotations | Annotations are must-have; start simple chat during infra phase, add annotations before v1 | — Pending |
| Configurable retention over fixed policy | GDPR/NDA requirements vary by client; admin-configurable is more flexible | — Pending |
| Batch template upload queue | Users may need to process multiple templates; background queue handles this | — Pending |
| Pre-sanitization + review-time deny list | Custom client terms are the biggest sanitization gap; both stages needed | — Pending |

---
*Last updated: 2026-02-10 after initialization*
