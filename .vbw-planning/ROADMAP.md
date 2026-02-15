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
- [ ] Phase 5.5: LLM-Powered Placeholder Regeneration (INSERTED)
- [ ] Phase 5.6: Prescriptive Knowledge Base (INSERTED)
- [ ] Phase 6: Executive Report Generator
- [ ] Phase 7: UI Polish (INSERTED)
- [ ] Phase 8: Production Deployment

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
**Goal:** Replace table-based mapping UI with a PDF-first, select-and-describe workflow. Users scroll through a continuously rendered PDF, select unmapped text sections (numbered #1, #2, #3...) or pick blank/invisible paragraphs from a document structure browser, then describe all selections in a single chat message. The LLM resolves each selection to a Ghostwriter field and marker type. Only confirmed mappings are highlighted (green); no yellow gap shading. Coverage counter shows progress without prescribing specific gaps. Each completed session feeds the KB per template type (internal/web/mobile), improving auto-mapping accuracy over time.
**Deps:** Phase 5.1
**Reqs:** TMPL-01, TMPL-06, UIUX-09, UIUX-10
**Success:** Users can select text on PDF + pick blank paragraphs from structure panel, batch-describe selections via chat, LLM maps all at once, PDF regenerates with green shading, KB stores mappings per template type for few-shot reuse
**Plans:** 5/5 complete

### Phase 5.3: Placeholder Verification & Correction (INSERTED)
**Goal:** Analysis step renders the PDF with visible Jinja placeholders (not rendered content), replacing green markings. Users verify placeholder correctness by selecting text in three correction modes: (1) select unmapped text/empty space that should be a placeholder, (2) select a wrong placeholder that needs correction, (3) select a placeholder that should be removed. User describes all corrections in a single LLM chatbox message, LLM updates the mapping, and user clicks regenerate to produce the PDF with fixed placeholders.
**Deps:** Phase 5.2
**Reqs:** TMPL-01, TMPL-06, UIUX-09, UIUX-10
**Success:** Analysis step shows PDF with raw Jinja placeholders (no green shading), three selection-based correction modes work end-to-end, LLM processes natural-language correction prompts and updates mapping, regenerate produces corrected PDF
**Plans:** 5/5 complete

### Phase 5.4: Intelligent Knowledge Base (INSERTED)
**Goal:** Evolve the flat mapping KB into a structural intelligence layer that understands document zones (header/footer/body/table), repetition patterns, structural blueprints (loop templates, co-occurring markers), style-based heuristics, and confidence calibration from correction feedback — so the LLM auto-maps with near-complete accuracy on familiar template types
**Deps:** Phase 5.3
**Reqs:** TMPL-01, TMPL-06
**Success:** KB stores zone patterns, repetition rules, structural blueprints, and marker co-occurrences; LLM prompt receives structural context instead of flat examples; auto-map accuracy on web/en templates jumps from ~15/90 to 80%+ without manual corrections
**Plans:** 5/5 complete

### Phase 5.5: LLM-Powered Placeholder Regeneration (INSERTED)
**Goal:** Replace the mechanical find-and-replace regeneration engine with an LLM-based approach. When the user edits mappings in the table and clicks "Regenerate Placeholders", instead of the sanitization service doing brittle text matching and paragraph-index lookups, the LLM reads the actual DOCX content, understands document structure (headers, footers, sections, paragraphs, tables), and intelligently places each placeholder at the correct location. The mapping table UI stays exactly as-is — only the backend regeneration path changes. This also enables richer KB population since the LLM can infer structural context for each placement.
**Deps:** Phase 5.4
**Reqs:** TMPL-01, TMPL-06
**Success:** User edits mappings in table, clicks regenerate, LLM produces correctly-placed placeholders without document corruption; mapping table UI unchanged; KB receives structural context from LLM placement decisions

### Phase 5.6: Prescriptive Knowledge Base (INSERTED)
**Goal:** Transform the KB from an advisory few-shot prompt enhancer into a deterministic mapping cache with LLM fallback. For each document section, normalize text and look up the KB — if a high-confidence match exists (≥ 0.8), lock that mapping directly without LLM involvement. Only send unmatched or low-confidence sections to the LLM for analysis. Prune dead KB entries (confidence < 0.3) to reduce noise. Factor zone into lookup matching to avoid cross-zone collisions. Show locked mappings as pre-filled but editable in StepVerify so the user retains final say.
**Deps:** Phase 5.5
**Reqs:** TMPL-01, TMPL-06
**Success:** Re-uploading a previously mapped document produces near-identical correct mappings with zero LLM calls for known sections; only genuinely new/unknown sections go to the LLM; users can still override any locked mapping; dead entries pruned from KB

### Phase 6: Executive Report Generator
**Goal:** Sanitized executive report generation with complete workflow
**Deps:** Phase 2, Phase 3, Phase 4
**Reqs:** EXEC-01-13, DENY-01-04, LANG-01-03, UIUX-14-15
**Success:** Upload → sanitize → review → generate → desanitize → annotate → download

### Phase 7: UI Polish (INSERTED)
**Goal:** Complete the dashboard and minor visual details across the application
**Deps:** Phase 6
**Reqs:** Visual polish (no formal requirement IDs)
**Success:** Dashboard fully functional, minor visual inconsistencies resolved, polished user experience

### Phase 8: Production Deployment
**Goal:** Production-ready Docker Compose stack with multi-user concurrency
**Deps:** Phase 5, Phase 6
**Reqs:** DEPL-01-03
**Success:** Docker Compose running, concurrent users, Nginx reverse proxy with SSE

## Progress

| Phase | Done | Status | Date |
|-------|------|--------|------|
| 1 - Foundation | 6/6 | Complete | 2026-02-11 |
| 1.1 - UI Polish | 3/3 | Complete | 2026-02-11 |
| 2 - Sanitization | 8/8 | Complete | 2026-02-12 |
| 2.1 - Profile | 2/2 | Complete | 2026-02-11 |
| 3 - LLM Integration | 3/3 | Complete | 2026-02-12 |
| 4 - Document Processing | 5/5 | Complete | 2026-02-13 |
| 5 - Template Adapter Core | 4/4 | complete | 2026-02-14 |
| 5.1 - Analysis Preview & Memory | 5/5 | Complete | 2026-02-13 |
| 5.2 - Interactive PDF Mapping | 5/5 | Complete | 2026-02-14 |
| 5.3 - Placeholder Verification | 5/5 | Complete | 2026-02-14 |
| 5.4 - Intelligent KB | 0/TBD | Not started | - |
| 5.5 - LLM Placeholder Regen | 0/4 | Planned | - |
| 5.6 - Prescriptive KB | 0/TBD | Not started | - |
| 6 - Executive Report | 0/TBD | Not started | - |
| 7 - UI Polish | 0/TBD | Not started | - |
| 8 - Deployment | 0/TBD | Not started | - |

---
*Imported from GSD: 2026-02-12*
