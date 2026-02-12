# Template AI Engine (Layer8)

An internal web application for the offensive security team that automates two time-consuming tasks: converting client-provided Word templates into Ghostwriter-compatible templates with Jinja2 placeholders, and generating executive-level summary reports from finalized technical pentest reports. Supports English and European Portuguese (PT-PT), with a 2-5 person pentester team as the initial user base.

**Core value:** Pentesters spend their time on security work, not on manual template adaptation and executive report writing. Both features must produce output that's good enough to send to clients with minimal human editing.

## Requirements

### Validated
- [x] Authentication with username/password + TOTP MFA and "remember me"
- [x] Compliance-grade audit log (tamper-evident hash chain, exportable)
- [x] Admin panel (user CRUD, session management, audit viewer)
- [x] Frontend scaffold with React 19, Vite 6, Tailwind CSS 4, shadcn/ui
- [x] Application shell with responsive sidebar, theme toggle, routing
- [x] Presidio-based PII sanitization with custom pentest recognizers
- [x] User profile with avatar, display name, security settings

### Active
- [ ] Multi-provider LLM client with SSE streaming and compliance logging
- [ ] DOCX parsing, PDF generation, and Ghostwriter integration
- [ ] LLM-powered Jinja2 template adaptation with preview and feedback loop
- [ ] EN/PT-PT translation preserving Jinja2 placeholders
- [ ] Template modification and bulk processing queue
- [ ] Executive report generation with sanitization workflow
- [ ] Docker Compose production deployment

### Out of Scope
- Automated technical report review -- Deferred to v2
- Direct Ghostwriter integration for executive reports -- Manual upload for v1
- OAuth/SSO/AD integration -- Simple login + TOTP sufficient for small team
- Mobile app -- Web-only
- Languages beyond EN and PT-PT

## Constraints
- **LLM Access**: Primary via CLIProxyAPI (OpenAI SDK format) with Anthropic API fallback
- **Network**: Ghostwriter is VPN-only
- **Language**: Must support EN and PT-PT (European Portuguese specifically)
- **Data Handling**: Technical reports must NEVER leave local environment unsanitized. GDPR and NDA compliance mandatory
- **Preview Rendering**: Pixel-perfect PDF preview required
- **Concurrency**: Multiple pentesters may use the tool simultaneously

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| OpenAI SDK format as primary LLM client | CLIProxyAPI exposes OpenAI-compatible endpoint; works with Max subscription | Pending |
| TOTP MFA for authentication | Simple, secure, no dependency on SSO infrastructure | Complete |
| Separate sanitization microservice | Isolates heavy NLP models, independent scaling | Complete |
| Feature-based frontend organization | Domain-driven modules keep code organized as features grow | Complete |
| SQLite for dev, PostgreSQL for prod | Prisma makes migration seamless | In progress |
