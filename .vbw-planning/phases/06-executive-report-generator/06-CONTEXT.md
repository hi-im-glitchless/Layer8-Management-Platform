# Phase 6: Executive Report Generator — Context

## User Vision

Generate professional executive security reports from uploaded pentest technical reports. The system automates what pentesters currently do manually: reading a technical report, extracting key findings, computing risk metrics, generating charts, and writing executive-level prose — all while keeping sensitive client data away from the LLM. The output must match the quality and structure of `test-templates/executive/Template Executivo.pdf`.

**Critical clarification:** This feature has NO Ghostwriter interaction. The input is any technical pentest report (DOCX), and the output is a brand new executive report built programmatically with python-docx. There are no Jinja2 template markers. The report is constructed entirely in Python code using a skeleton DOCX for branding/layout.

## Essential Features

### 5-Step Wizard
1. **Upload** — DOCX upload only. Auto-triggers pipeline: parse DOCX → sanitize paragraphs → LLM Pass 1 extraction. Progress displayed via AnalysisProgressDisplay.
2. **Sanitize & Review** — Top: side-by-side diff (original left, sanitized right) with highlighted replacements + inline deny list editor. Bottom: metadata editor showing LLM-extracted values (possibly sanitized) with editable inputs for user to confirm/correct (client name, project code, dates). User approves before generation proceeds.
3. **Generate** — Python computes metrics + charts, LLM Pass 2 generates narrative, python-docx builds exec report DOCX, Gotenberg converts to PDF. Progress via SSE stage events + LLM token streaming.
4. **Review & Annotate** — PDF preview + chat corrections (same layout as template adapter). Targeted regeneration: only affected text sections re-generated, charts only if underlying data changed.
5. **Download** — Automatic de-sanitization of narrative text before final DOCX build. Both DOCX and PDF available (PDF via Gotenberg pipeline).

### Report Structure (matching Template Executivo)
- Cover page (Layer8 branding, client, project code, date, CONFIDENCIAL badge)
- Sumário Executivo / Executive Summary (narrative with key stats)
- Pontuação de Risco Global / Global Risk Score (big score card + CVSS methodology)
- Métricas Principais / Key Metrics (6 color-coded cards: total, high, medium, low, categories, compliance standards)
- Distribuição por Severidade / Severity Distribution (pie chart)
- Vulnerabilidades por Categoria / Vulnerabilities by Category (horizontal bar chart)
- Análise Detalhada: Severidade por Categoria / Detailed Analysis (stacked bar chart)
- Principais Ameaças / Key Threats (top findings + business impact)
- Risco de Não Conformidade / Compliance Risk (radar chart + framework table: ISO 27001, NIST CSF, GDPR, PCI-DSS, CIS Controls)
- Top 10 Vulnerabilidades / Top 10 Vulnerabilities (CVSS bar chart + methodology)
- Recomendações Estratégicas / Strategic Recommendations (tiered: immediate 0-30d, short 1-3mo, long 3-12mo + board recs)
- Aspetos Positivos / Positive Aspects (what client does well)
- Conclusão / Conclusion

### DOCX Construction
- **Skeleton DOCX** per language (en/pt-pt) stored in codebase — defines page layout, margins, Layer8 header/footer, font styles, color scheme, cover page structure, section headers, static labels
- **python-docx** fills content programmatically — text sections, charts, tables, cover page metadata
- Skeleton has placeholder paragraphs for charts (e.g., `[CHART: Severity Distribution]`) that get replaced with matplotlib images via `add_picture()`
- The skeleton must match Template Executivo.pdf EXACTLY — same colors, logo, placement, fonts, section structure
- Only variable parts change per report: dates, client names, vulnerability-specific text, and charts
- **Template schema:** Parse skeleton with `docx_parser.py` to extract section structure as JSON. Include in LLM prompts so the LLM follows the template structure meticulously

### Chart Generation
- Engine: matplotlib on the sanitization service (Python)
- LLM outputs chart data as structured JSON, Python renders to PNG images
- Charts embedded in DOCX via python-docx `add_picture()` at skeleton placeholder positions
- 5+ chart types: pie, horizontal bar, stacked bar, radar, score card
- Color scheme: Python constants module (`report_theme.py`) matching Template Executivo (red/yellow/green severity, Layer8 branding)

### Data Extraction
- LLM reads sanitized DOCX content (paragraph-by-paragraph) and extracts structured findings as JSON
- Also extracts metadata (client name, project code, dates) for pre-filling the metadata editor
- Best-effort with warnings: missing data (no CVSS, unclear severity) flagged during extraction
- User can fill gaps via the metadata editor or chat before generation proceeds
- No dependency on specific report format — works with any pentest DOCX

### Compliance Framework Mapping
- Static Python dict (`compliance_matrix.py`) maps vulnerability category → compliance frameworks
- LLM refines edge cases and generates impact descriptions
- Frameworks: ISO/IEC 27001, NIST CSF, GDPR, PCI-DSS, CIS Controls
- Radar chart + risk table with per-framework scoring

### Risk Scoring
- Deterministic Python computation: (High×10 + Medium×5 + Low×2) / max_possible × 100
- Reproducible and auditable
- LLM generates the methodology explanation text

### Sanitization Flow
- **Paragraph-by-paragraph:** `docx_parser.py` extracts paragraphs from uploaded DOCX, then `/sanitize` endpoint called per paragraph with session deny list terms
- Forward mappings accumulated into a session-scoped map for reverse mapping
- Preserves document structure and gives precise per-paragraph reverse mappings

### Deny List
- Custom sensitive terms that Presidio can't auto-detect (project codenames, client names, tool names)
- Inline editor in Sanitize & Review step — user adds terms on-the-fly
- Terms applied immediately, sanitized view updates
- **Session-scoped only** (deny list terms live for the duration of the wizard session, not persistent)

### De-sanitization
- **Pre-render:** Desanitize narrative text sections via `/desanitize` BEFORE building the DOCX
- Reverse mappings from session map restore all sanitized terms to originals
- Both DOCX and PDF contain real names/data — no post-processing needed
- No user intervention required

### Language Support
- **No manual language selection** — output language matches input report language
- **Auto-detect** via spaCy/langdetect at sanitization service (models already loaded: en_core_web_lg, pt_core_news_lg)
- Detected language drives: skeleton DOCX selection, LLM language instruction
- Two skeleton DOCX files: `skeleton-en.docx` and `skeleton-pt-pt.docx`, auto-selected

### Metadata Handling
- **LLM pre-fill + user edit:** Pass 1 extracts metadata alongside findings
- **Lightweight metadata editor** in Step 2 (sub-section below sanitization review)
- Form-table layout: field label | LLM-extracted value (read-only, may show sanitized placeholders) | editable input
- Fields: client name, project code, start date, end date
- User corrects sanitized placeholders with real values before generation

## Technical Preferences

### LLM Pipeline
- **Pass 1 (Extract):** Python builds prompt (`report_extraction_prompt.py`), Node calls Opus 4.6 via `generateStream()`, Python validates JSON → structured findings + metadata
- **Python Compute:** Risk score, severity distributions, compliance mapping (static rules + LLM refinement), chart data (JSON for matplotlib)
- **Pass 2 (Generate):** Python builds prompt (`report_narrative_prompt.py`), single LLM call for all ~12 narrative sections, plain text + minimal style hints output (**bold**, numbered lists), Python applies DOCX styles from skeleton
- **Model:** Opus 4.6 (per key decision: Opus for reports)
- **Prompt flow:** Node → Python (build prompt) → Node (call LLM) → Python (validate JSON) — same pattern as template adapter

### DOCX Template (Skeleton)
- Two skeleton DOCX files per language stored at `test-templates/executive/`
- Designed in LibreOffice/Word to match Template Executivo.pdf exactly
- Not user-customizable in v1 (admin-configurable is a v2 concern)
- python-docx fills content, replaces chart placeholders, builds tables
- **Report schema:** Parse skeleton with `docx_parser.py` → JSON section structure included in LLM prompts for structure fidelity

### Backend Architecture
- **New `executiveReport.ts` routes** — separate from template adapter (different wizard, state, endpoints)
- **New `reportWizardState.ts`** — Redis-backed, 24h TTL, report-specific fields (findingsJson, chartData, narrativeSections, riskScore, complianceMatrix, sanitizationMappings, metadata)
- **Reuse:** LLM Client (`generateStream()`, `resolveModel('executive-report')`), PDF Queue (Gotenberg), sanitization endpoints

### Python Architecture
- **New `routes/report.py`** — report-specific endpoints (extraction prompt, chart rendering, metrics computation, report building)
- **New services:**
  - `report_extraction_prompt.py` — builds Pass 1 LLM prompt from sanitized paragraphs
  - `report_narrative_prompt.py` — builds Pass 2 LLM prompt from computed data + findings
  - `report_builder.py` — python-docx document construction from skeleton + data
  - `chart_renderer.py` — matplotlib chart generation (pie, bar, stacked bar, radar, score card)
  - `report_theme.py` — color constants matching Template Executivo (SEVERITY_COLORS, BRAND_COLORS, CHART_FONTS)
  - `compliance_matrix.py` — static category→framework mapping dict
- **Reuse:** `docx_parser.py`, `sanitizer.py`, `/sanitize` + `/desanitize` endpoints

### Frontend Architecture
- **New `features/executive-report/` module** — own types.ts, api.ts, hooks.ts, components/
- **Promote to shared (`components/ui/` or `components/wizard/`):**
  - WizardShell (make step-count agnostic — steps[] as a prop)
  - ChatPanel
  - AnalysisProgressDisplay
- **Reuse from `components/ui/`:** PdfPreview, FileUpload
- **New components:**
  - SanitizationDiffView — dual-panel with highlight spans from entity positions
  - MetadataEditor — lightweight form-table for LLM pre-fill + user edit
  - Report-specific step components (StepUpload, StepSanitizeReview, StepGenerate, StepReviewAnnotate, StepDownload)
- **New hook:** `useReportChat` — same SSE pattern as adapter but with report-specific event types (section_update, narrative_regeneration)

### SSE Streaming
- Stage events during generation: `{stage: 'extracting', progress: N}`, `{stage: 'computing'}`, `{stage: 'charts'}`, `{stage: 'narrative'}`, `{stage: 'rendering'}`
- LLM passes also stream token chunks for live feedback
- Frontend maps stage events to AnalysisProgressDisplay steps

### Corrections Flow
- Targeted regeneration: only affected text sections re-generated via single-section LLM call
- Charts regenerate only if underlying data (findings, severities) changed
- Corrections via chat: user asks LLM to revise specific sections, adjust tone, fix inaccuracies
- Each correction: desanitize updated section → rebuild DOCX → Gotenberg PDF → update preview

## Boundaries

- No user-customizable templates in v1 (static bundled skeleton only)
- No report history/storage (session-scoped, download and it's gone)
- No Ghostwriter integration (manual DOCX upload, all data from the technical report)
- No Jinja2/docxtpl — report built entirely with python-docx
- No automated technical report review (v2 requirement REVW-01-02)
- No interactive chart editing (charts are generated from data, not editable)
- No findings library integration (Ghostwriter's domain)
- Deny list is session-scoped, not persistent across sessions
- No manual language selection — output language auto-matches input language

## Acceptance Criteria

1. User can upload any pentest technical report (DOCX)
2. System auto-detects report language (EN or PT-PT) and selects matching skeleton
3. System sanitizes PII with Presidio + user-defined deny list terms (paragraph-by-paragraph)
4. Side-by-side review shows original vs sanitized with highlighted differences
5. LLM extracts findings data + metadata from sanitized report as structured JSON
6. Metadata editor shows LLM-extracted values for user confirmation/correction
7. Python computes deterministic risk score and generates charts (pie, bar, stacked bar, radar)
8. LLM generates professional executive-level narrative text for all report sections in a single call
9. Python builds exec report DOCX with python-docx from skeleton, matching Template Executivo exactly
10. PDF preview + chat corrections work for iterative refinement
11. Targeted regeneration: only affected sections re-generated on correction
12. De-sanitization automatically restores all PII in narrative text before final DOCX build
13. Both DOCX and PDF download available
14. Best-effort parsing with warnings when input report is poorly structured

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Input format | Any DOCX report | Flexible, not tied to Ghostwriter export format |
| Output method | python-docx programmatic build | No Jinja2/docxtpl — full control over DOCX construction |
| Skeleton DOCX | Pre-designed DOCX per language | Defines branding/layout/styles/headers, python-docx fills content |
| No GW interaction | All data from uploaded technical report | Executive report is standalone, not connected to Ghostwriter |
| Wizard steps | 5-step wizard | Upload → Sanitize & Review → Generate → Review → Download |
| Sanitization flow | Paragraph-by-paragraph | docx_parser.py extracts paragraphs, /sanitize per paragraph, accumulate mappings |
| Deny list | Session-scoped only | Keeps v1 simple, persistent deny list is a v2 concern |
| Sanitize review | Dual-panel with highlight spans | Entity positions from /sanitize drive exact highlights, no diff library needed |
| De-sanitization | Pre-render (before DOCX build) | Desanitize narrative text first, then build DOCX — cleanest approach |
| Language | Auto-detect, match input | No manual selection. spaCy/langdetect detects, output matches input language |
| Chart engine | matplotlib only | Server-side PNG rendering, embedded via python-docx add_picture() |
| Chart colors | Python constants module (report_theme.py) | Hard-coded to match Template Executivo, single file to update |
| Chart embedding | python-docx add_picture() | Skeleton has placeholder paragraphs, replaced with chart images |
| Data extraction | LLM extraction (structured JSON) | Two-pass: extract findings+metadata, then generate narrative |
| Metadata | LLM pre-fill + user edit | Pass 1 extracts metadata, user confirms/edits in Step 2 metadata editor |
| Metadata editor | Lightweight form-table in Step 2 | Sub-section below sanitization review, field label + extracted value + editable input |
| Metadata timing | Auto-trigger after upload | Parse → sanitize → Pass 1 runs during upload progress, Step 2 opens with data ready |
| LLM pipeline | 2 passes + Python compute | Extract → Compute → Generate |
| Pass 1 prompt | Python prompt builder | report_extraction_prompt.py, same Node→Python→LLM→Python flow as adapter |
| Pass 2 narrative | Single LLM call, all sections | One Opus 4.6 call returns JSON with ~12 narrative sections |
| LLM output format | Plain text + style hints | **bold**, numbered lists. Python applies DOCX styles from skeleton |
| Compliance mapping | Static Python dict + LLM refinement | compliance_matrix.py for rules, LLM for edge cases |
| Risk scoring | Deterministic Python computation | CVSS-weighted, reproducible, auditable |
| Corrections | Single-section regeneration | Only affected section re-generated, charts if data changed |
| Report structure | Match Template Executivo exactly | Template schema parsed from skeleton, included in LLM prompts |
| Session state | Separate ReportWizardState | Different fields than adapter, Redis-backed, 24h TTL |
| Backend routes | New executiveReport.ts | Clean separation from adapter routes |
| Python routes | New routes/report.py | Report-specific endpoints, reuses /render-template from docx.py |
| Frontend module | New features/executive-report/ | Own types, api, hooks, components. Same pattern as adapter |
| Component sharing | Promote WizardShell, ChatPanel, AnalysisProgressDisplay | Move to shared directory, both features import from same place |
| WizardShell | Step-count agnostic | steps[] as a prop, works with 4-step adapter and 5-step report |
| Chat hook | New useReportChat | Same SSE pattern, report-specific event types |
| SSE streaming | Stage events + LLM token streaming | Multi-step progress + live LLM output during generation |
| Progress display | Reuse AnalysisProgressDisplay | Same component, report-specific step labels |
| Navigation | Separate top-level route | Own sidebar entry, distinct feature |
| Template config | Static bundled skeleton files | Not customizable in v1 |
| Download format | Both DOCX + PDF | DOCX for editing, PDF for client delivery |
| Parse failures | Best-effort + warnings | Flag missing data, user fills gaps |
| LLM model | Opus 4.6 | Per key decision: Opus for reports |
