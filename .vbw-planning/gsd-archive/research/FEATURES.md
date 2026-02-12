# Feature Landscape

**Domain:** Pentest Report Automation and Document Processing
**Researched:** 2026-02-10
**Confidence:** MEDIUM

## Table Stakes

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Template upload & parsing** | Core workflow requirement - users need to convert their existing Word templates | HIGH | Requires .docx parsing, structure analysis, placeholder detection. Use python-docx or similar |
| **Document preview** | Users must see output before finalizing - blind generation is unacceptable | MEDIUM | PDF rendering from templates with sample data. Need pixel-accurate preview |
| **Multi-format export** | Industry standard - all competitors support Word/PDF at minimum | MEDIUM | DOCX and PDF required. Ghostwriter supports DOCX, XLSX, PPTX, JSON |
| **Authentication & access control** | Security-sensitive data requires enterprise-grade auth | MEDIUM | TOTP MFA is table stakes for pentest tools in 2026. RBAC for team environments |
| **Audit logging** | Compliance requirement for handling client pentest data | MEDIUM | Track all operations: uploads, generations, downloads, template modifications. Immutable logs |
| **Template library/storage** | Users need to store and reuse templates across engagements | LOW | Basic CRUD for templates with metadata (client, type, language) |
| **Language detection** | Pentest teams work internationally - auto-detecting EN/PT-PT saves time | LOW | Simple language detection for uploaded documents. spaCy or langdetect |
| **Error handling & validation** | Poor error messages break trust in automation tools | MEDIUM | Clear validation feedback for template structure, missing fields, invalid formats |
| **Data sanitization** | Non-negotiable for GDPR/NDA compliance when processing client data | HIGH | PII detection and redaction before LLM processing. Presidio is industry standard |
| **Progress indicators** | LLM operations take time - users need real-time feedback | LOW | Streaming responses for LLM operations. Modern UX standard in 2026 |
| **Report type categorization** | Different pentest types have different structures (web, internal, mobile) | LOW | Template categorization and filtering by assessment type |

## Differentiators

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **LLM-powered template adaptation** | Competitors require manual template creation - this automates Jinja2 placeholder insertion | HIGH | Core differentiator. Analyze structure, identify fields, insert {{placeholders}} intelligently |
| **Inline annotation feedback** | Most tools have separate review stages - inline commenting during preview accelerates iteration | MEDIUM | Highlight + comment workflow similar to PDF annotation tools. Batch submission |
| **Pre-sanitization deny lists** | Traditional sanitization is one-pass - allowing custom term blocking prevents client-specific leaks | MEDIUM | User-defined blocklist before Presidio processing. Domain-specific for pentest context |
| **Review-time deny lists** | Second layer of protection - catch terms that passed initial sanitization | LOW | Add terms during review phase, reprocess automatically |
| **Pixel-perfect preview validation** | Competitors show "approximate" previews - ensuring exact output builds trust | HIGH | Render actual DOCX/PDF, not approximation. Use real Ghostwriter data structures |
| **Bidirectional translation (EN ↔ PT-PT)** | Most tools don't offer translation - saves teams hours on multilingual engagements | MEDIUM | Neural MT for pentest terminology. Preserve technical terms, translate narrative |
| **Executive report from technical** | Unique value - automates the most time-consuming part of pentest delivery | HIGH | LLM summarization of technical findings for C-level audience. Industry trend for 2026 |
| **Custom pentest recognizers** | Generic PII tools miss pentest-specific terms (IP ranges, CVEs, tool names) | MEDIUM | Presidio custom recognizers for vulnerability data, infrastructure details |
| **Placeholder token validation** | Prevents template corruption - validates {{tokens}} match Ghostwriter schema | MEDIUM | Compare against Ghostwriter's expected variables. Catch typos before generation |
| **Desanitized preview** | See final output with real data restored - critical for verifying content accuracy | MEDIUM | Token replacement after LLM generation. Validate sanitization round-trip |
| **Bulk upload queue** | Process multiple templates in parallel - saves time for teams migrating to Ghostwriter | MEDIUM | Background job queue with progress tracking. Handle 10+ templates concurrently |
| **Template modification workflow** | Adapting existing templates is different from new creation - optimized UX for this | LOW | Detect existing Jinja2, preserve custom logic, suggest improvements |
| **Streaming LLM responses** | Modern expectation for AI tools - typewriter effect reduces perceived latency | LOW | SSE or WebSockets for real-time generation feedback. UX standard in 2026 |

## Anti-Features

Features to explicitly NOT build.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Full report authoring in-app** | Ghostwriter already does this well - duplicating creates maintenance burden | Focus on template adaptation and executive generation - let Ghostwriter handle report writing |
| **Multi-user real-time collaboration** | 2-5 person team doesn't need Google Docs-style collaboration - adds complexity for minimal value | Support concurrent users but sequential editing. Ghostwriter v6 has collaborative editing for actual reports |
| **Findings library management** | Ghostwriter already manages findings - reimplementing creates data sync issues | Import from Ghostwriter when needed, don't try to replace it |
| **Infrastructure tracking** | Ghostwriter tracks domains/servers - scope creep to duplicate this | Focus on document processing, not project management |
| **Custom LLM training** | Fine-tuning for pentest reports sounds appealing but requires massive dataset and maintenance | Use prompt engineering with general-purpose models - more maintainable |
| **Auto-translation of all languages** | Supporting 50+ languages creates testing nightmare and quality issues | EN and PT-PT only - covers team's actual needs |
| **Template marketplace** | Sharing templates across companies violates NDAs and creates liability | Keep templates internal to team |
| **Automatic template updates** | Auto-modifying client templates without review is dangerous | Always require manual review and approval |
| **Built-in vulnerability scanner** | Out of scope - let dedicated tools handle scanning | Import findings, don't generate them |
| **Client portal for template submission** | 2-5 person team receives templates via email/Slack - portal is overkill | Manual upload is sufficient |

## Feature Dependencies

```
Document Processing (Template Adapter):
├── Template Upload → Template Parsing → Structure Analysis → Jinja2 Insertion
├── PDF Preview ← Template Storage
│   └── Inline Annotation ← PDF Preview
├── Language Detection → Template Upload
└── Placeholder Validation ← Jinja2 Insertion

Executive Report Generator:
├── Document Upload → Language Detection → Data Sanitization → LLM Generation
├── Pre-sanitization Deny Lists → Data Sanitization
├── Review-time Deny Lists → Desanitized Preview
├── Custom Pentest Recognizers → Data Sanitization
└── Placeholder Token Validation → Desanitized Preview

Shared Infrastructure:
├── TOTP MFA → All Features
├── Audit Logging → All Features
├── Streaming LLM → (Jinja2 Insertion, LLM Generation)
└── Batch Upload Queue → (Template Upload, Document Upload)

Translation (Both Features):
└── Bidirectional Translation ← Language Detection
```

### Dependency Notes

- **Template Parsing requires Structure Analysis:** Can't insert Jinja2 without understanding document structure (headings, tables, lists)
- **Inline Annotation requires PDF Preview:** Annotations are meaningless without rendered output to annotate
- **Data Sanitization blocks LLM Generation:** Must sanitize before sending to LLM for GDPR/NDA compliance
- **Placeholder Validation requires Jinja2 Insertion:** Can only validate tokens after they're inserted
- **Desanitized Preview requires Token Validation:** Must ensure tokens are valid before restoring real data
- **Streaming LLM enhances user experience:** Not a hard dependency but significantly improves UX for long-running operations
- **Audit Logging is foundational:** Must be present from day one for compliance, can't retrofit

## MVP Recommendation

### Launch With (v1)

**Template Adapter Core:**
- [ ] Template upload (DOCX only) - Foundation for entire feature
- [ ] Basic template parsing - Extract structure without advanced analysis
- [ ] Manual Jinja2 insertion guidance - LLM suggests, user confirms/edits
- [ ] PDF preview with dummy data - Validate output matches expectations
- [ ] Template storage and retrieval - Save work, reuse templates

**Executive Report Generator Core:**
- [ ] Document upload (DOCX/PDF) - Accept technical reports
- [ ] Language detection (EN/PT-PT) - Auto-detect, user can override
- [ ] Presidio sanitization (standard recognizers) - GDPR compliance baseline
- [ ] LLM executive summary generation - Core value proposition
- [ ] Desanitized preview - Verify output before finalization

**Security & Compliance (Shared):**
- [ ] TOTP MFA authentication - Non-negotiable for pentest data
- [ ] Basic audit logging - Track uploads, generations, downloads
- [ ] Role-based access (admin/user) - Minimal RBAC for team

**UI/UX Foundation (Phase 1):**
- [ ] Frontend scaffold (React 19, Vite, TypeScript, shadcn/ui, Tailwind CSS design system)
- [ ] Application shell (responsive layout, navigation, routing for all pages)
- [ ] Auth UI (login page, TOTP setup/verification, remember me)
- [ ] Admin panel UI (session cleanup, system management)

**Essential UX (woven into each feature phase):**
- [ ] Streaming LLM responses display component - Modern UX standard, reduces perceived latency
- [ ] Error handling and validation UI - Clear feedback on failures
- [ ] File upload component (drag-and-drop, validation, progress) - Reusable across features
- [ ] PDF preview component (page navigation) - Reusable across features
- [ ] Inline annotation canvas (highlight, comment, batch submit) - Shared by both features

### Add After Validation (v1.x)

**Enhanced Template Adapter:**
- [ ] Inline annotation feedback - Iterate on templates faster
- [ ] Placeholder token validation - Catch Ghostwriter schema mismatches
- [ ] Template modification workflow - Optimize for adapting existing templates

**Enhanced Executive Generator:**
- [ ] Pre-sanitization deny lists - Client-specific term blocking
- [ ] Review-time deny lists - Second layer of protection
- [ ] Custom pentest recognizers - Catch IPs, CVEs, tool names

**Productivity Features:**
- [ ] Bulk upload queue - Process multiple templates in parallel
- [ ] Bidirectional translation - EN ↔ PT-PT for multilingual engagements

**Advanced UX:**
- [ ] Pixel-perfect preview validation - Ensure exact output match

### Future Consideration (v2+)

**Advanced Capabilities:**
- [ ] LLM-powered full template adaptation - Fully automated Jinja2 insertion (v1 requires manual confirmation)
- [ ] Multi-format template support - Excel, PowerPoint templates (beyond core DOCX)
- [ ] Advanced collaborative features - If team grows beyond 5 people
- [ ] Template versioning system - Track changes over time
- [ ] Diff view for template modifications - Compare original vs. adapted

**Extended Compliance:**
- [ ] SOC 2 compliance features - If selling to external clients
- [ ] Data retention automation - Auto-delete after configurable period
- [ ] Enhanced audit reporting - Compliance report generation

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Phase |
|---------|------------|---------------------|----------|-------|
| Template upload & parsing | HIGH | HIGH | P1 | MVP |
| LLM Jinja2 insertion | HIGH | HIGH | P1 | MVP |
| Document preview | HIGH | MEDIUM | P1 | MVP |
| Data sanitization (Presidio) | HIGH | MEDIUM | P1 | MVP |
| Executive report generation | HIGH | MEDIUM | P1 | MVP |
| TOTP MFA | HIGH | MEDIUM | P1 | MVP |
| Audit logging | HIGH | MEDIUM | P1 | MVP |
| Streaming LLM responses | MEDIUM | LOW | P1 | MVP |
| Language detection | MEDIUM | LOW | P1 | MVP |
| Template storage | MEDIUM | LOW | P1 | MVP |
| Inline annotation feedback | HIGH | MEDIUM | P2 | v1.x |
| Placeholder validation | MEDIUM | MEDIUM | P2 | v1.x |
| Pre-sanitization deny lists | MEDIUM | MEDIUM | P2 | v1.x |
| Custom pentest recognizers | MEDIUM | MEDIUM | P2 | v1.x |
| Bulk upload queue | MEDIUM | MEDIUM | P2 | v1.x |
| Bidirectional translation | MEDIUM | MEDIUM | P2 | v1.x |
| Pixel-perfect preview | HIGH | HIGH | P2 | v1.x |
| Template modification workflow | MEDIUM | LOW | P2 | v1.x |
| Review-time deny lists | LOW | LOW | P2 | v1.x |
| Full LLM automation | HIGH | HIGH | P3 | v2+ |
| Template versioning | MEDIUM | MEDIUM | P3 | v2+ |
| Multi-format templates | MEDIUM | HIGH | P3 | v2+ |
| SOC 2 compliance | LOW | HIGH | P3 | v2+ |

**Priority key:**
- P1: Must have for launch - core value proposition
- P2: Should have for competitive offering - add after validation
- P3: Nice to have for future growth - defer until product-market fit

## Competitor Feature Analysis

| Feature | Ghostwriter | PlexTrac | Dradis | AttackForge | Template AI Engine |
|---------|-------------|----------|--------|-------------|-------------------|
| **Report generation** | Jinja2 templates, collaborative editing | AI-powered with 25K+ writeups | Tool import, QA workflow | Custom DOCX templates | LLM-powered adaptation + exec gen |
| **Template customization** | Manual Jinja2 editing | Reusable content repos | Simple yet powerful templates | DOCX+JSON automation | Auto Jinja2 insertion (differentiator) |
| **Collaboration** | Real-time (v6) | Real-time with AI assist | QA review workflow | On-demand by stakeholders | Inline annotation (simpler than full collab) |
| **Export formats** | DOCX, XLSX, PPTX, JSON | DOCX, PDF | DOCX, HTML, Excel, PDF | DOCX, PDF (encrypted) | PDF preview, DOCX export via Ghostwriter |
| **Data sanitization** | Not mentioned | Not mentioned | Not mentioned | Not mentioned | Presidio + custom recognizers (differentiator) |
| **Language support** | Not mentioned | Not mentioned | Not mentioned | Not mentioned | EN/PT-PT with translation (differentiator) |
| **MFA/Security** | RBAC, SSO, MFA | Enterprise security | Self-hosted (security by isolation) | Encrypted PDF emails | TOTP MFA, audit logging |
| **AI features** | None (v6 as of 2025) | AI writeups, auto-descriptions | Echo AI assistant (on-premise) | Not mentioned | LLM template adaptation + exec reports (core value) |
| **Integration** | Mythic C2, Cobalt Strike, GraphQL API | Jira, Tenable, scanners | Scanner imports (Nessus, Burp, etc.) | ReportGen CLI, Node.js library | Ghostwriter integration (consumes its templates) |
| **Client portal** | Not mentioned | Interactive dashboards, Gateway | Interactive Gateway with remediation tracker | Customer access to reports | Not needed (internal tool) |
| **Use case** | Full pentest management | Enterprise pentest programs | Collaboration & reporting | Offensive security mgmt | Internal template automation for Ghostwriter users |

### Key Insights

**What competitors do well:**
- PlexTrac leads in AI-powered content generation with massive writeup library and integration automation
- Ghostwriter excels at infrastructure tracking and collaborative writing for offensive teams
- Dradis focuses on self-hosted security and tool integration for diverse scanner outputs
- AttackForge automates report delivery and email workflows for client-facing operations

**Where Template AI Engine differentiates:**
1. **LLM-powered template adaptation** - No competitor automates Jinja2 placeholder insertion
2. **Data sanitization for GDPR/NDA** - Critical for LLM processing, not addressed by competitors
3. **Executive report generation** - Unique offering that solves different problem than technical reports
4. **Pentest-specific PII handling** - Custom recognizers for vulnerability data, not generic PII

**What to avoid:**
- Don't build findings library (Ghostwriter/PlexTrac do this)
- Don't build full collaboration (Ghostwriter v6 has this)
- Don't build infrastructure tracking (Ghostwriter's strength)
- Don't build client portals (not needed for internal tool)

**Strategic positioning:**
Template AI Engine is a **pre-processing and post-processing layer** for Ghostwriter:
- **Pre-processing:** Convert client Word templates → Ghostwriter-compatible Jinja2
- **Post-processing:** Generate executive reports from technical reports
- **Complement, don't compete:** Let Ghostwriter handle report authoring, we handle automation around it

## Sources

### Pentest Platforms
- [Ghostwriter - SpecterOps](https://specterops.io/open-source-tools/ghostwriter/)
- [GitHub - GhostManager/Ghostwriter](https://github.com/GhostManager/Ghostwriter)
- [Ghostwriter v6: Collaborative Editing](https://specterops.io/blog/2025/06/18/ghostwriter-v6-introducing-collaborative-editing/)
- [Ghostwriter Documentation - Report Types](https://www.ghostwriter.wiki/features/reporting/report-types)
- [PlexTrac Pentest Reporting](https://plextrac.com/use-case/plextrac-for-pentest-reporting/)
- [Penetration Test Reporting with AI - PlexTrac](https://plextrac.com/platform/reports/)
- [The 2026 State of Pentesting - Help Net Security](https://www.helpnetsecurity.com/2026/01/21/plextrac-pentest-programs-reporting/)
- [Dradis Framework](https://dradis.com/)
- [Pentest Report Generator - Dradis](https://dradis.com/reporting.html)
- [AttackForge - Offensive Security Management](https://attackforge.com)
- [GitHub - AttackForge/ReportGen](https://github.com/AttackForge/ReportGen)
- [SysReptor - GitHub](https://github.com/Syslifters/sysreptor)
- [SysReptor Documentation](https://docs.sysreptor.com/)

### Document Processing & Automation
- [python-docx-template - GitHub](https://github.com/elapouya/python-docx-template)
- [python-docx-template Documentation](https://docxtpl.readthedocs.io/)
- [Document AI - LlamaIndex](https://www.llamaindex.ai/blog/document-ai-the-next-evolution-of-intelligent-document-processing)
- [LLM Automation: Top 7 Tools in 2026](https://research.aimultiple.com/llm-automation/)
- [Beyond Words: AI-Driven Multilingual Document Processing 2026](https://aijourn.com/beyond-words-the-ai-driven-evolution-of-multilingual-document-processing-in-2026/)

### Data Sanitization & Compliance
- [Microsoft Presidio - GitHub](https://github.com/microsoft/presidio)
- [Presidio: Data Protection SDK](https://microsoft.github.io/presidio/)
- [Presidio Practical Guide 2026](https://medium.com/@nkbvikram/presidio-by-microsoft-a-practical-guide-to-detecting-and-masking-pii-at-scale-c3b39ce4f52c)
- [GDPR Compliance Guide 2026](https://secureprivacy.ai/blog/gdpr-compliance-2026)
- [GDPR Data Retention - Usercentrics](https://usercentrics.com/knowledge-hub/gdpr-data-retention/)
- [AI Data Retention for GDPR & EU AI Act](https://techgdpr.com/blog/reconciling-the-regulatory-clock/)

### AI & Translation
- [Top 10 AI Reporting Tools 2026](https://improvado.io/blog/top-ai-reporting-tools)
- [Executive Reports with Generative AI - Syntetica](https://syntetica.ai/blog/blog_article/executive-reports-with-generative-ai)
- [17 Best AI Translation Tools 2026](https://www.pairaphrase.com/blog/ai-translation-tools)
- [AI Translation Trends 2026 - POEditor](https://poeditor.com/blog/ai-translation-trends-2026/)
- [Google TranslateGemma Models - InfoQ](https://www.infoq.com/news/2026/01/google-translategemma-models/)

### UX & Collaboration
- [Streaming LLM Responses - Vellum AI](https://www.vellum.ai/llm-parameters/llm-streaming)
- [Consuming Streamed LLM Responses - Tamas Piros](https://tpiros.dev/blog/streaming-llm-responses-a-deep-dive/)
- [Production-Grade Agentic Apps 2026](https://medium.datadriveninvestor.com/production-grade-agentic-apps-with-ag-ui-real-time-streaming-guide-2026-5331c452684a)
- [10 Best Document Collaboration Tools 2026](https://www.proprofskb.com/blog/best-document-collaboration-tools/)
- [Real-Time Collaboration Tools 2026](https://thedigitalprojectmanager.com/tools/real-time-collaboration-tools/)
- [Top 9 PDF Annotation Apps 2026](https://www.drawboard.com/blog/top-pdf-annotation-apps)
- [Best Visual Feedback Tools 2026](https://bugherd.com/blog/best-16-visual-feedback-tools-for-2026-website-design-video-and-documents)

### Authentication & Security
- [Multifactor Authentication - OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
- [TOTP MFA Implementation Guide](https://medium.com/@emdadulislam162/how-to-implement-multi-factor-authentication-mfa-with-totp-in-your-web-application-678bb5478ebf)
- [User Authentication Guide 2026](https://www.authgear.com/post/what-is-user-authentication-guide-2026)
- [SaaS Authentication Best Practices 2026](https://supastarter.dev/blog/saas-authentication-best-practices)

### Best Practices & Trends
- [Pentest Reporting Best Practices 2026](https://www.helpnetsecurity.com/2026/01/21/plextrac-pentest-programs-reporting/)
- [Top Pentest Reporting Tools 2026](https://zerothreat.ai/blog/penetration-testing-reporting-tools)
- [SOC 2 Penetration Testing Requirements 2026](https://www.blazeinfosec.com/post/soc-2-penetration-testing-requirements/)
- [Compliance Driven Pentesting 2026](https://www.graynodesecurity.com/the-complete-guide-to-compliance-driven-pentesting-in-2026/)

---
*Feature research for: Template AI Engine*
*Researched: 2026-02-10*
*Research confidence: MEDIUM (WebSearch verified with official sources for major platforms, LOW confidence for some UX trends)*
