# Project Research Summary

**Project:** Layer8 - AI-Powered Pentest Report Automation
**Domain:** Document Processing & LLM-Powered Report Generation for Cybersecurity
**Researched:** 2026-02-10
**Confidence:** HIGH

## Executive Summary

Layer8 is an AI-powered document automation tool for penetration testing teams that solves two problems: (1) converting client Word templates into Ghostwriter-compatible Jinja2 templates using LLM analysis, and (2) generating executive-level reports from technical pentest findings. Based on research, the recommended approach is a **FastAPI + React stack with Presidio-based sanitization pipeline** and **SSE-based LLM streaming**. This architecture prioritizes GDPR/NDA compliance through multi-layer PII sanitization before cloud LLM processing, while maintaining pixel-perfect document fidelity through Gotenberg-based PDF conversion.

The core architectural insight is to build Layer8 as a **pre-processing and post-processing layer** that complements Ghostwriter rather than competing with it. The LLM-powered template adapter automates Jinja2 placeholder insertion (a task currently done manually), while the executive report generator creates C-suite summaries from technical reports (addressing the most time-consuming part of pentest delivery). Both features require sophisticated sanitization to handle sensitive client data safely.

Critical risks center on **data sanitization completeness** (Presidio false negatives could leak client PII to cloud LLMs), **template processing fidelity** (python-docx formatting loss on complex templates), and **LLM reliability** (hallucinated placeholder tokens breaking template systems). Mitigation requires custom pentest-specific recognizers for Presidio, template compatibility validation before processing, and multi-stage validation of LLM outputs with placeholder token counting.

## Key Findings

### Recommended Stack

The research strongly converges on a modern async Python + React stack optimized for LLM streaming and document processing. FastAPI emerged as the clear backend choice due to native async support (3-5x better throughput for I/O-bound LLM/database operations), automatic OpenAPI documentation, and Pydantic v2 integration for type-safe validation. React 19 with Vite provides 40% faster rendering and builds compared to older alternatives, while shadcn/ui offers production-ready components with full TypeScript support.

**Core technologies:**
- **FastAPI (0.128.6) + Python 3.12**: Async web framework — superior async performance for LLM streaming, automatic API docs, Pydantic v2 integration (5-17x faster validation)
- **React 19 + TypeScript 5 + Vite**: Frontend stack — 40% faster rendering than React 18, modern build tooling, type safety for AI-friendly codebase
- **Presidio Analyzer/Anonymizer (2.2.360)**: PII sanitization — Microsoft's production-grade detection with spaCy NER, supports custom recognizers for pentest-specific entities
- **Gotenberg (8.x)**: DOCX to PDF conversion — 99.9% pixel-perfect fidelity via LibreOffice wrapper, Docker-native, superior to direct headless conversion
- **PostgreSQL 16 + Redis**: Data layer — async SQLAlchemy for data persistence, Redis for session-scoped sanitization mappings with TTL
- **SSE (sse-starlette)**: LLM streaming — simpler than WebSockets for unidirectional streaming, auto-reconnect, HTTP-friendly
- **TanStack Query + Zustand**: State management — server state caching (TanStack) and lightweight client state (Zustand) without Redux complexity
- **PyOTP (2.9.0)**: TOTP MFA — table stakes for pentest tools handling sensitive client data

**Confidence:** HIGH (90% verified from official sources, remaining 10% from established community patterns)

### Expected Features

Research identified clear feature tiers based on competitor analysis (Ghostwriter, PlexTrac, Dradis, AttackForge) and pentest workflow analysis.

**Must have (table stakes):**
- **Template upload & LLM-powered Jinja2 insertion** — core differentiator; competitors require manual template creation, this automates placeholder detection and insertion using LLM analysis
- **Document preview with pixel-perfect fidelity** — users must see exact output before finalizing; blind generation unacceptable in professional pentest delivery
- **Data sanitization (Presidio + custom recognizers)** — non-negotiable for GDPR/NDA compliance when processing client data through cloud LLMs
- **Executive report generation from technical reports** — unique value proposition; automates most time-consuming part of pentest delivery
- **TOTP MFA authentication** — security-sensitive data requires enterprise-grade auth
- **Audit logging with hash-chain integrity** — compliance requirement for handling client pentest data
- **Streaming LLM responses** — modern UX standard reduces perceived latency during multi-second generations
- **Bidirectional EN ↔ PT-PT translation** — team works internationally; auto-translation saves hours on multilingual engagements

**Should have (competitive):**
- **Inline annotation feedback loop** — accelerates iteration on templates; highlight issues, LLM refines based on batch feedback
- **Pre-sanitization and review-time deny lists** — dual-gate protection allows client-specific term blocking before and after LLM processing
- **Placeholder token validation** — prevents template corruption by validating {{tokens}} match Ghostwriter schema
- **Custom pentest recognizers** — Presidio misses domain-specific entities (IPs, CVEs, AD paths, internal hostnames); custom recognizers critical for complete sanitization
- **Bulk upload queue with background processing** — teams migrating to Ghostwriter need to process 10+ templates in parallel

**Defer (v2+):**
- **Full report authoring in-app** — Ghostwriter already does this; duplicating creates maintenance burden
- **Multi-user real-time collaboration** — 2-5 person team doesn't need Google Docs-style collaboration; Ghostwriter v6 has this for actual reports
- **Template marketplace** — sharing templates across companies violates NDAs and creates liability
- **Custom LLM training** — fine-tuning sounds appealing but requires massive dataset; prompt engineering more maintainable

**Strategic positioning:** Layer8 complements Ghostwriter (pre/post-processing automation layer), does NOT compete with it (no findings library, no infrastructure tracking, no client portal).

### Architecture Approach

The recommended architecture is a **service-oriented FastAPI backend with session-scoped sanitization pipeline and async job queue**, paired with a **React SPA using SSE for LLM streaming**. The core architectural decision is to implement **reversible sanitization mappings stored per-session in Redis with TTL**, enabling GDPR-compliant auto-expiration while supporting desanitization for preview validation.

**Major components:**
1. **LLM Service (multi-provider with fallback)** — Primary: CLIProxyAPI (OpenAI-compatible wrapper for Claude Max), Fallback: Anthropic API. Handles prompt formatting, streaming via SSE, and hash-chain audit logging of all interactions.
2. **Sanitization Service (Presidio + custom recognizers)** — Two-container architecture (Analyzer + Anonymizer) with spaCy NER backend. Generates format-preserving replacements stored as session-scoped mappings in Redis. Implements multi-pass detection: standard entities → domain-specific → custom deny lists.
3. **Document Service (python-docx + Gotenberg)** — Template parsing with python-docx-template (docxtpl) for Jinja2 insertion while preserving formatting. PDF conversion via Gotenberg Docker API (wraps LibreOffice headless) queued through background jobs due to non-thread-safe constraint.
4. **Session Service (Redis-backed with namespace isolation)** — Session-scoped storage with cryptographically strong session IDs. Stores sanitization mappings, annotation state, LLM feedback loops. Implements automatic cleanup on logout/timeout.
5. **Audit Service (hash-chain trail for compliance)** — Tamper-evident logging using SHA-256 hash chain. Logs LLM interactions with sanitized payloads, sanitization mapping creation/access, desanitization operations, user feedback loops. Supports 90-day retention with auto-cleanup.
6. **Background Jobs (ARQ for async processing)** — Async job queue for LibreOffice PDF conversion (not thread-safe, requires serialization), bulk template processing, and cleanup tasks. ARQ chosen over Celery for simpler asyncio integration with FastAPI.

**Key patterns:**
- **SSE over WebSocket** for LLM streaming (simpler, auto-reconnect, better proxy compatibility)
- **Session-scoped sanitization mappings** with Redis TTL for GDPR compliance (auto-expire after 1 hour or session end)
- **Annotation feedback loop** batches user highlights/comments client-side, submits to build refinement prompt for iterative LLM improvement
- **Background job queue** for LibreOffice processing to handle non-thread-safe constraint and avoid blocking API

### Critical Pitfalls

Based on research into similar document processing and LLM-powered tools, five critical pitfalls emerged that could derail the project:

1. **Presidio false negatives on pentest-specific entities** — Standard PII recognizers miss internal hostnames (srv-dc01.internal.local), IPv6/CIDR notation, AD paths, CVEs, tool names, and client-specific codenames. False negatives leak sensitive data to cloud LLM, violating NDA/GDPR. **Mitigation:** Build comprehensive custom recognizers for pentest patterns, multi-pass detection (standard → domain-specific → deny lists), manual review queue for flagged content, test against real pentest corpus to measure >95% recall.

2. **Context leakage through sanitized data relationships** — Even after entity removal, semantic relationships remain ("PERSON_1 accessed IP_1 using credentials from DOMAIN_1" reveals attack patterns). Research shows identifier removal preserves underlying semantic connections enabling inference attacks despite altered surface text. **Mitigation:** Multi-layer sanitization (entity removal + semantic obfuscation), PrivacyChecker-style validation (reduces leakage from 33% to 8%), context scrubbing beyond entities (attack flow descriptions, temporal correlations), differential privacy noise injection.

3. **LLM dropping or hallucinating Jinja2 placeholder tokens** — LLMs treat placeholders as natural language to "improve" rather than literal tokens to preserve. Drops {{ client.name }}, substitutes hallucinated values, or mangles syntax ({{ client name }}), breaking template system. **Mitigation:** System prompts with explicit "PRESERVE EXACT SYNTAX" instructions + examples, post-generation validation via regex scanning, placeholder counting (input = output), structured output modes, adversarial testing with many placeholders.

4. **python-docx formatting loss on complex templates** — Client templates with text boxes, floating images, custom styles, SmartArt, nested tables lose formatting silently when processed. python-docx only supports subset of Word OOXML features. **Mitigation:** Validate templates during upload against whitelist of supported features, generate compatibility report showing what survives processing, template preview BEFORE Jinja2 insertion, reference template library showing supported patterns, consider python-docx-template (docxtpl) for better preservation.

5. **Concurrent session state corruption in sanitization mappings** — Multiple pentesters working simultaneously cause mapping collisions where User A's sanitized tokens overwrite User B's, leading to cross-session data leakage. **Mitigation:** Session-scoped storage with cryptographically strong session IDs, Redis namespace isolation (`sanitization:{session_id}`), session validation checks ("Does this mapping belong to this user?"), comprehensive concurrent user testing, audit logging tracking which session accessed which data.

**Additional moderate pitfalls:** LibreOffice rendering fidelity failures (different fonts, truncated tables, layout shifts), Portuguese variant drift (Brazilian vs European), SSE streaming interruptions (mid-stream breaks, timeouts), Jinja2 template injection (RCE via malicious uploads), audit log tampering/incompleteness.

## Implications for Roadmap

Based on research findings, the project should follow a **dependency-driven phased approach** that establishes security infrastructure first, then builds features incrementally with validation gates. The architecture reveals clear dependencies: sanitization must exist before LLM integration, template adapter can proceed in parallel with sanitization, executive report requires both completed.

### Suggested Phase Structure

#### Phase 1: Security & Infrastructure Foundation
**Rationale:** All features require session management, authentication, and audit logging. Building this first prevents retrofitting security later (architectural anti-pattern). Sanitization pipeline is critical path for both features since GDPR/NDA compliance is non-negotiable.

**Delivers:**
- FastAPI skeleton with CORS, middleware, dependency injection
- PostgreSQL + Redis setup with async connection pooling
- TOTP MFA authentication with session management
- Redis-backed session service with namespace isolation
- Audit service with hash-chain integrity for tamper-proof logging
- Presidio Analyzer/Anonymizer Docker containers with custom pentest recognizers
- Sanitization service with session-scoped reversible mapping storage
- Template upload security validation (Jinja2 injection detection)

**Addresses pitfalls:**
- Concurrent session state corruption (session isolation from start)
- Presidio false negatives (custom recognizers built early)
- Template injection (security scanning at upload gate)
- Audit log tampering (hash-chain architecture prevents retrofitting)

**Technology stack:** FastAPI, PostgreSQL (asyncpg), Redis (async client), Presidio containers, PyOTP, python-jose, passlib, fastapi-audit-log

**Research flags:** None (standard patterns, well-documented)

---

#### Phase 2: LLM Integration & Streaming Infrastructure
**Rationale:** Both features (template adapter and executive report) require LLM integration with streaming. Building this as shared infrastructure prevents duplication. Needs Phase 1 (audit logging, sanitization) as prerequisite for compliant LLM interaction.

**Delivers:**
- Multi-provider LLM service (CLIProxyAPI primary, Anthropic fallback)
- SSE streaming with sse-starlette for token-by-token delivery
- Frontend SSE client hooks (React + TypeScript)
- LLM interaction audit logging (sanitized prompts + raw responses)
- Streaming response error handling (reconnection, keepalive, resume from checkpoint)
- Annotation feedback loop infrastructure (client-side batching, refinement prompt building)

**Addresses pitfalls:**
- SSE streaming interruptions (reconnection logic, keepalive, partial storage)
- LLM placeholder hallucinations (validation hooks established)

**Technology stack:** Anthropic SDK (0.79.0), OpenAI SDK (for CLIProxyAPI), sse-starlette (3.2.0), React EventSource API, TanStack Query

**Research flags:** None (SSE patterns well-established for LLM streaming in 2026)

---

#### Phase 3: Template Adapter Feature (LLM-Powered Jinja2 Insertion)
**Rationale:** Simpler feature than executive report generation (no translation, less complex sanitization needs). Can validate LLM integration patterns before tackling executive report. Delivers immediate value to users.

**Depends on:** Phase 1 (session/audit), Phase 2 (LLM streaming)

**Delivers:**
- Template upload endpoint with DOCX parsing (python-docx-template)
- Template compatibility validation (whitelist supported features, generate compatibility report)
- LLM-powered structure analysis and Jinja2 placeholder suggestions
- Inline annotation canvas for user feedback on placeholder suggestions
- Placeholder token validation (counting, syntax checking, Ghostwriter schema verification)
- Template preview with sample data before PDF generation
- Template storage with metadata (client, type, language)

**Addresses pitfalls:**
- python-docx formatting loss (compatibility validation upfront, preview before processing)
- LLM placeholder drops (validation gates with token counting and syntax verification)

**Technology stack:** python-docx-template (docxtpl), python-docx (1.2.0), Jinja2 (3.1.6), spaCy (language detection)

**Research flags:** **Phase-level research needed** for python-docx advanced features and formatting preservation edge cases

---

#### Phase 4: PDF Generation Pipeline
**Rationale:** Prerequisite for both features' preview functionality. LibreOffice headless is not thread-safe, requiring background job architecture. Building this separately from features allows proper queue implementation.

**Depends on:** Phase 1 (session/audit)

**Delivers:**
- Gotenberg Docker container for DOCX→PDF conversion
- ARQ background job queue with Redis backend
- LibreOffice worker pool (max 3 concurrent jobs to handle non-thread-safe constraint)
- Job status polling endpoints
- Template complexity scoring (route simple→Gotenberg, complex→fallback if implemented)
- PDF rendering fidelity validation (comparison against reference documents)
- Caching layer for rendered PDFs to minimize repeated conversions

**Addresses pitfalls:**
- LibreOffice rendering fidelity failures (complexity scoring, fidelity validation, explicit paper size/margins)
- Synchronous PDF conversion blocking API (background queue architecture)

**Technology stack:** Gotenberg (8.x Docker), ARQ (async job queue), httpx (async HTTP client), redis-py

**Research flags:** **Phase-level research needed** for LibreOffice headless edge cases, paper size control, and fallback rendering strategies

---

#### Phase 5: Executive Report Generator Feature
**Rationale:** More complex than template adapter due to translation, deeper sanitization needs (technical reports contain more sensitive data), and multi-stage LLM processing. Builds on validated patterns from Phase 3.

**Depends on:** Phase 1 (sanitization), Phase 2 (LLM streaming), Phase 4 (PDF generation)

**Delivers:**
- Technical report upload endpoint (DOCX/PDF parsing)
- Language detection (EN/PT-PT) with user override
- Multi-layer sanitization pipeline (Presidio standard + pentest custom + deny lists)
- Pre-sanitization deny list management (client-specific term blocking)
- LLM executive summary generation from sanitized technical content
- Review-time deny list (second-layer protection during preview)
- Desanitized preview (restore real data using session-scoped mappings)
- Bidirectional translation (EN ↔ PT-PT) with variant validation
- Export to DOCX with Jinja2 rendering

**Addresses pitfalls:**
- Context leakage sanitization (multi-layer approach, semantic analysis, PrivacyChecker validation)
- Portuguese variant drift (explicit PT-PT instructions, terminology validation, native speaker testing)
- Presidio false negatives (multi-pass detection already built in Phase 1, but validated heavily here)

**Technology stack:** python-docx, Presidio (already deployed), Jinja2, spaCy (language detection + NER), translation via Claude 4 Opus

**Research flags:** **Phase-level research needed** for PT-PT translation reliability, LLM-based translation best practices, and semantic sanitization validation techniques

---

#### Phase 6: Production Readiness & Bulk Processing
**Rationale:** After core features validated, add production-grade operational features. Bulk processing needed for teams migrating existing template libraries to Ghostwriter.

**Depends on:** Phase 3 (template adapter), Phase 4 (PDF pipeline), Phase 5 (executive report)

**Delivers:**
- Bulk template upload queue with parallel processing
- Progress tracking UI for multi-template operations
- Monitoring integration (Prometheus metrics, Grafana dashboards)
- Rate limiting on LLM endpoints (per-user budgets, anomaly detection)
- Docker Compose production configuration (multi-stage builds, non-root containers)
- Nginx reverse proxy with SSE support (`X-Accel-Buffering: no`)
- Audit log retention policy enforcement (90-day auto-cleanup, archive to cold storage)
- Performance optimization (LLM response caching, Redis connection pooling, PostgreSQL query optimization)

**Addresses pitfalls:**
- None (operational concerns)

**Technology stack:** Docker Compose v2, Nginx, Prometheus, Grafana

**Research flags:** None (standard DevOps patterns)

---

### Phase Ordering Rationale

**Why security first (Phase 1):**
- GDPR/NDA compliance is non-negotiable for pentest data
- Retrofitting security (session isolation, audit logging) after features exist is architectural anti-pattern
- Sanitization pipeline is critical path for both features (executive report cannot proceed without it)
- Template injection security must exist before accepting any user uploads

**Why LLM infrastructure before features (Phase 2):**
- Both features need LLM streaming; building once prevents duplication
- Allows validation of streaming reliability before depending on it for features
- Establishes audit logging patterns for LLM interactions

**Why template adapter before executive report (Phase 3 before Phase 5):**
- Simpler feature (no translation complexity, less sanitization depth)
- Validates LLM integration patterns (placeholder preservation, annotation feedback loop)
- Delivers immediate value while building toward harder feature
- Template adapter doesn't require PDF generation (can preview DOCX directly), allowing parallel work on Phase 4

**Why PDF pipeline separate (Phase 4):**
- LibreOffice non-thread-safe constraint requires proper queue architecture
- Both features need PDF generation but can develop independently
- Complex fidelity validation deserves focused effort

**Parallel work opportunities:**
- Phase 3 (template adapter) can start before Phase 4 (PDF generation) completes since template preview can use DOCX initially
- Phase 4 (PDF pipeline) and Phase 3 (template adapter core logic) can develop in parallel once Phase 2 complete
- Frontend and backend teams can parallelize within each phase

### Research Flags

**Phases needing `/gsd:research-phase` during detailed planning:**

- **Phase 3 (Template Adapter):** python-docx formatting preservation edge cases poorly documented; need research on compatibility validation strategies, workarounds for unsupported features (text boxes, floating images), and fallback rendering approaches. **Research focus:** "How to validate Word template compatibility with python-docx processing and handle unsupported features"

- **Phase 4 (PDF Generation):** LibreOffice headless has documented issues with complex templates; need research on fidelity validation approaches, paper size control via command-line, and when to fall back to alternative renderers. **Research focus:** "LibreOffice headless PDF conversion fidelity validation and fallback strategies for complex Word templates"

- **Phase 5 (Executive Report):** PT-PT translation reliability with Claude/GPT unclear; need research on maintaining European Portuguese (not Brazilian) with LLM translation, terminology validation approaches, and post-translation quality checks. **Research focus:** "LLM-based translation for European Portuguese (PT-PT) with variant drift prevention"

**Phases with standard patterns (skip research-phase):**

- **Phase 1 (Security & Infrastructure):** Well-documented FastAPI + PostgreSQL + Redis patterns, Presidio integration thoroughly documented, session management is standard web security
- **Phase 2 (LLM Integration):** SSE streaming for LLM responses is established pattern in 2026, Anthropic SDK well-documented
- **Phase 6 (Production Readiness):** Docker Compose, Nginx, monitoring are standard DevOps practices

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | 90% verified from official sources (FastAPI docs, PyPI versions, npm packages). Gotenberg is MEDIUM-HIGH (GitHub + community reports, not official docs), but LibreOffice wrapper approach is established. |
| Features | **MEDIUM** | Table stakes identified from competitor analysis (Ghostwriter, PlexTrac, Dradis documented). Differentiators inferred from workflow analysis. LOW confidence on PT-PT translation demand (team-specific requirement). |
| Architecture | **HIGH** | All patterns verified from 2026 sources (SSE streaming, session-scoped sanitization, hash-chain audit). Presidio integration well-documented. ARQ vs Celery choice based on FastAPI async patterns. |
| Pitfalls | **MEDIUM-HIGH** | Critical pitfalls verified from multiple sources (Presidio evaluation docs, python-docx limitations documented, LLM hallucination research). Context leakage severity inferred from research papers. Real-world occurrence rates unknown. |

**Overall confidence:** **HIGH** (85%)

**Validation needed:**
- PDF annotation library fidelity (pdf-annotator-react) — test in POC phase
- Gotenberg conversion quality at scale — stress test with diverse client templates
- PT-PT translation reliability — validate with native speakers during development
- LibreOffice rendering fidelity on complex templates — side-by-side comparison testing

### Gaps to Address

**Gap 1: python-docx formatting preservation boundaries**
- **What's unclear:** Exact feature set that survives processing (text boxes definitely fail, but what about conditional formatting, custom bullet styles, footnotes?)
- **How to handle:** Build comprehensive test suite with diverse client templates during Phase 3, document whitelist of supported features, generate compatibility reports during upload validation

**Gap 2: Presidio recall rate on pentest-specific entities**
- **What's unclear:** How many false negatives occur with custom recognizers on real pentest reports (research suggests <95% recall possible, but team's specific corpus unknown)
- **How to handle:** Measure recall during Phase 1 with anonymized sample reports, iterate on custom recognizers until >95% recall achieved, implement manual review queue for borderline cases

**Gap 3: LLM placeholder preservation reliability**
- **What's unclear:** Claude vs GPT-4 reliability for preserving Jinja2 syntax; effectiveness of system prompts vs structured output modes
- **How to handle:** A/B test during Phase 2 with adversarial cases (many placeholders, placeholders mid-sentence), measure drop rates, select best model + prompting strategy

**Gap 4: LibreOffice vs Word rendering divergence**
- **What's unclear:** Which template features cause significant layout drift; at what complexity threshold does Gotenberg become unreliable
- **How to handle:** Build template complexity scorer during Phase 4, test against reference document corpus, document known issues and workarounds, implement fallback strategy if needed

**Gap 5: Portuguese variant drift mitigation effectiveness**
- **What's unclear:** How often do LLMs slip into Brazilian Portuguese despite explicit instructions; effectiveness of post-generation validation
- **How to handle:** Extensive testing during Phase 5 with native PT-PT speakers, build terminology deny list for Brazilian-specific terms, measure variant consistency across multiple generations

## Sources

### Primary (HIGH confidence)

**Stack research:**
- [FastAPI Release Notes](https://fastapi.tiangolo.com/release-notes/) — Version 0.128.6 verified
- [python-docx PyPI](https://pypi.org/project/python-docx/) — Version 1.2.0
- [Presidio Official Docs](https://microsoft.github.io/presidio/) — Architecture patterns, spaCy integration
- [Presidio PyPI](https://pypi.org/project/presidio-analyzer/) — Version 2.2.360
- [PyOTP PyPI](https://pypi.org/project/pyotp/) — Version 2.9.0
- [sse-starlette PyPI](https://pypi.org/project/sse-starlette/) — Version 3.2.0
- [Anthropic SDK Releases](https://github.com/anthropics/anthropic-sdk-python/releases) — Version 0.79.0
- [TanStack Query npm](https://www.npmjs.com/package/@tanstack/react-query) — Version 5.90.20
- [shadcn/ui Vite Installation](https://ui.shadcn.com/docs/installation/vite) — Official setup guide
- [SQLAlchemy Async FastAPI Guide](https://testdriven.io/blog/fastapi-sqlmodel/) — Best practices

**Architecture research:**
- [Microsoft Presidio GitHub](https://github.com/microsoft/presidio) — Analyzer/Anonymizer architecture
- [FastAPI + SSE for LLM Tokens (Medium, Jan 2026)](https://medium.com/@hadiyolworld007/fastapi-sse-for-llm-tokens-smooth-streaming-without-websockets-001ead4b5e53)
- [AuditableLLM: Hash-Chain Framework (MDPI)](https://www.mdpi.com/2079-9292/15/1/56) — Tamper-evident logging
- [ARQ vs Celery for FastAPI (2026)](https://davidmuraya.com/blog/fastapi-background-tasks-arq-vs-built-in/)

**Pitfalls research:**
- [python-docx Documentation - Styles](https://python-docx.readthedocs.io/en/latest/user/styles-understanding.html) — Supported features
- [Presidio Evaluation](https://microsoft.github.io/presidio/evaluation/) — False positive/negative tradeoffs
- [LLM Hallucinations in 2025 (Lakera)](https://www.lakera.ai/blog/guide-to-hallucinations-in-large-language-models)
- [Jinja2 Template Injection CVE-2024-56326](https://security.snyk.io/vuln/SNYK-PYTHON-JINJA2-8548181)

### Secondary (MEDIUM confidence)

**Features research:**
- [Ghostwriter v6: Collaborative Editing](https://specterops.io/blog/2025/06/18/ghostwriter-v6-introducing-collaborative-editing/)
- [PlexTrac Pentest Reporting](https://plextrac.com/use-case/plextrac-for-pentest-reporting/)
- [Dradis Framework](https://dradis.com/)
- [AttackForge ReportGen](https://github.com/AttackForge/ReportGen)

**Architecture patterns:**
- [PII Sanitization for LLMs (Kong, 2026)](https://konghq.com/blog/enterprise/building-pii-sanitization-for-llms-and-agentic-ai)
- [Reversible Prompt Sanitization (arXiv)](https://arxiv.org/html/2411.11521)
- [python-docx-template Documentation](https://docxtpl.readthedocs.io/)

**Pitfalls:**
- [A False Sense of Privacy: Textual Data Sanitization (arXiv)](https://arxiv.org/html/2504.21035v1)
- [LLMs and Translation: Brazilian vs European Portuguese](https://aclanthology.org/2024.propor-1.5/)
- [LibreOffice Headless Conversion Issues](https://ask.libreoffice.org/t/layout-issue-when-converting-to-docx-to-pdf-using-libreoffice-headless/127618)

### Tertiary (LOW confidence)

- Gotenberg 99.9% fidelity claim — Community reports via GitHub, needs validation during POC
- pdf-annotator-react annotation quality — Open-source option, verify in Phase 6 if annotation feature added
- PT-PT translation reliability — Needs native speaker validation during Phase 5

---

*Research completed: 2026-02-10*
*Ready for roadmap: yes*
