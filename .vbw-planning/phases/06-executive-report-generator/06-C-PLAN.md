---
phase: "06"
plan: "06-C"
title: "Skeleton DOCX + End-to-End Report Pipeline"
wave: 2
depends_on:
  - "06-A"
  - "06-B"
cross_phase_deps: []
skills_used:
  - fastapi-expert
  - python-testing-patterns
must_haves:
  - "Skeleton DOCX files exist at test-templates/executive/skeleton-en.docx and skeleton-pt-pt.docx"
  - "Python routes/report.py exposes /report/build-extraction-prompt, /report/validate-extraction, /report/compute-metrics, /report/render-charts, /report/build-narrative-prompt, /report/validate-narrative, /report/build-report endpoints"
  - "reportService.ts sanitizeReport() calls /sanitize per paragraph and stores mappings"
  - "reportService.ts extractFindings() calls Python prompt builder then LLM then validator"
  - "reportService.ts generateReport() orchestrates compute -> charts -> narrative -> DOCX build -> PDF"
  - "Full pipeline testable: upload DOCX -> sanitize -> extract -> generate -> download DOCX + PDF"
---

## Objective

Wire the complete end-to-end report generation pipeline: create skeleton DOCX templates, expose Python services via FastAPI routes, and implement the reportService.ts orchestration so that uploading a technical report produces a complete executive report DOCX + PDF.

## Context

- `@06-A-PLAN.md` -- Python services: chart_renderer, compliance_matrix, report_extraction_prompt, report_narrative_prompt, report_builder, report_theme
- `@06-B-PLAN.md` -- Backend: ReportWizardState, executiveReport routes, reportService stubs, SSE infrastructure
- `@sanitization-service/app/routes/adapter.py` -- FastAPI route pattern with Pydantic request/response models
- `@sanitization-service/app/main.py` -- mount new router in lifespan
- `@backend/src/services/templateAdapter.ts` -- orchestration pattern: Python HTTP calls -> LLM -> PDF queue
- `@backend/src/services/sanitization.ts` -- sanitizeText() / desanitizeText() for paragraph-level sanitization
- `@backend/src/services/llm/client.ts` -- generateStream() with feature='executive-report' for Opus 4.6
- `@06-CONTEXT.md` decisions: paragraph-by-paragraph sanitization, 2-pass LLM, pre-render de-sanitization, skeleton DOCX per language, auto-detect language

## Tasks

### Task 1: Create skeleton DOCX templates (EN + PT-PT)

**Files:**
- `test-templates/executive/skeleton-en.docx` (new)
- `test-templates/executive/skeleton-pt-pt.docx` (new)
- `sanitization-service/app/services/report_builder.py` (modify)

**What:** Create two minimal but structurally complete skeleton DOCX files using python-docx programmatically (a script or direct construction). Each skeleton contains:

**Structure (each as a heading or styled paragraph):**
- Cover page area: `[COVER: Client Name]`, `[COVER: Project Code]`, `[COVER: Date]`, `[COVER: Confidential Badge]`
- `Executive Summary` / `Sumario Executivo` (Heading 1)
- `Global Risk Score` / `Pontuacao de Risco Global` (Heading 1) + `[CHART: Risk Score Card]`
- `Key Metrics` / `Metricas Principais` (Heading 1)
- `Severity Distribution` / `Distribuicao por Severidade` (Heading 1) + `[CHART: Severity Distribution]`
- `Vulnerabilities by Category` / `Vulnerabilidades por Categoria` (Heading 1) + `[CHART: Category Bar]`
- `Detailed Analysis` / `Analise Detalhada` (Heading 1) + `[CHART: Stacked Severity]`
- `Key Threats` / `Principais Ameacas` (Heading 1)
- `Compliance Risk` / `Risco de Nao Conformidade` (Heading 1) + `[CHART: Compliance Radar]`
- `Top 10 Vulnerabilities` / `Top 10 Vulnerabilidades` (Heading 1) + `[CHART: Top Vulnerabilities]`
- `Strategic Recommendations` / `Recomendacoes Estrategicas` (Heading 1)
- `Positive Aspects` / `Aspetos Positivos` (Heading 1)
- `Conclusion` / `Conclusao` (Heading 1)

Each section heading is followed by a placeholder paragraph for text insertion. Chart placeholders are separate paragraphs with `[CHART: ...]` text. The skeleton defines page margins, font styles (heading style = bold, body = normal), and basic formatting.

Also update `report_builder.py` to properly load these skeletons and implement the `_replace_chart_placeholder()` and `_fill_text_section()` methods for real content insertion.

**Acceptance:**
- [ ] Both skeleton files exist and are valid DOCX (openable in LibreOffice)
- [ ] Each skeleton has all 13 section headings + 6 chart placeholders
- [ ] EN and PT-PT have matching structure with translated section names
- [ ] ReportBuilder loads skeleton and fills content without errors
- [ ] Chart placeholder replacement works (paragraph text replaced with image)

**Commit:** `feat(report): create skeleton DOCX templates and wire report builder`

### Task 2: Python report routes + Pydantic models

**Files:**
- `sanitization-service/app/routes/report.py` (new)
- `sanitization-service/app/models/report.py` (new)
- `sanitization-service/app/main.py` (modify)
- `sanitization-service/app/routes/__init__.py` (modify)

**What:** Create FastAPI routes that expose the Python report services to the Node.js backend.

**Pydantic models** (`models/report.py`):
- `BuildExtractionPromptRequest` -- sanitized_paragraphs: list[str], language: str, skeleton_schema: dict | None
- `BuildExtractionPromptResponse` -- system_prompt: str, user_prompt: str
- `ValidateExtractionRequest` -- raw_json: str
- `ValidateExtractionResponse` -- findings: list[dict], metadata: dict, warnings: list[str], valid: bool, error: str | None
- `ComputeMetricsRequest` -- findings: list[dict]
- `ComputeMetricsResponse` -- risk_score: float, risk_level: str, severity_counts: dict, compliance_scores: dict, category_counts: dict
- `RenderChartsRequest` -- severity_counts: dict, category_counts: dict, stacked_data: dict, compliance_scores: dict, risk_score: float
- `RenderChartsResponse` -- charts: dict[str, str] (chart_name -> base64 PNG)
- `BuildNarrativePromptRequest` -- findings: list[dict], metrics: dict, compliance_scores: dict, risk_score: float, chart_descriptions: dict, language: str
- `BuildNarrativePromptResponse` -- system_prompt: str, user_prompt: str
- `ValidateNarrativeRequest` -- raw_json: str
- `ValidateNarrativeResponse` -- sections: dict[str, str], valid: bool, error: str | None
- `BuildReportRequest` -- language: str, narrative_sections: dict[str, str], metadata: dict, chart_images: dict[str, str] (base64), risk_score: float, risk_level: str
- `BuildReportResponse` -- docx_base64: str, filename: str

**Routes** (`routes/report.py`):
- `POST /report/build-extraction-prompt` -- calls report_extraction_prompt builders
- `POST /report/validate-extraction` -- calls validate_extraction_response
- `POST /report/compute-metrics` -- calls compliance_matrix compute functions + severity counting
- `POST /report/render-charts` -- calls chart_renderer methods, returns base64 PNGs
- `POST /report/build-narrative-prompt` -- calls report_narrative_prompt builders
- `POST /report/validate-narrative` -- calls validate_narrative_response
- `POST /report/build-report` -- calls ReportBuilder with skeleton path based on language

Mount `report_router` in `main.py` and export from `routes/__init__.py`.

**Acceptance:**
- [ ] All 7 routes respond to POST requests
- [ ] Pydantic models validate inputs (reject invalid types)
- [ ] `/report/render-charts` returns base64-encoded PNG images
- [ ] `/report/build-report` returns base64-encoded DOCX
- [ ] Router mounted in main.py and accessible at /report/* prefix

**Commit:** `feat(report): add Python report FastAPI routes with Pydantic models`

### Task 3: reportService.ts -- sanitization + Pass 1 extraction

**Files:**
- `backend/src/services/reportService.ts` (modify)

**What:** Implement the first half of the report service: upload processing, sanitization, and LLM Pass 1 extraction.

**uploadReport():**
1. Create report session via `createReportSession(userId)`
2. Save file to disk (`uploads/documents/{uuid}.docx`)
3. Store base64 + path in session state
4. Detect language: parse DOCX via Python `/docx/parse`, take first 500 chars, POST to Python sanitize endpoint with empty deny list to get language detection, OR call a simple `/detect-language` if available. Use the `fast-langdetect` result from the first sanitize call.
5. Store detected language in session
6. Return sessionId + detectedLanguage

**sanitizeReport():**
1. Load session state
2. Parse DOCX: POST base64 to Python `/docx/parse` to get paragraphs
3. Loop paragraphs: for each non-empty paragraph, POST to `/sanitize` with session deny list terms
4. Accumulate: original text, sanitized text, entity positions, forward/reverse mappings
5. Store all in session: sanitizedParagraphs[], sanitizationMappings
6. Return sanitized paragraphs for frontend display

**extractFindings():**
1. Load session (must have sanitized paragraphs)
2. POST sanitized paragraph texts to Python `/report/build-extraction-prompt`
3. Get system + user prompts back
4. Call `generateStream()` with feature='executive-report' (Opus 4.6)
5. Collect full LLM response
6. POST raw JSON to Python `/report/validate-extraction`
7. Store findings, metadata, warnings in session
8. Return extracted data

**Acceptance:**
- [ ] uploadReport creates session, stores file, detects language (en or pt)
- [ ] sanitizeReport iterates paragraphs, calls /sanitize per paragraph, stores mappings
- [ ] extractFindings calls Python prompt builder -> LLM -> Python validator
- [ ] Session state updated at each step
- [ ] Errors logged and propagated with meaningful messages

**Commit:** `feat(report): implement upload, sanitization, and Pass 1 extraction`

### Task 4: reportService.ts -- generation pipeline (compute + Pass 2 + build + PDF)

**Files:**
- `backend/src/services/reportService.ts` (modify)

**What:** Implement the generation pipeline that produces the executive report DOCX and PDF.

**generateReport():**
1. Load session (must have findings from Pass 1)
2. **Compute metrics:** POST findings to Python `/report/compute-metrics` -> risk_score, severity_counts, compliance_scores, category_counts
3. **Render charts:** POST metric data to Python `/report/render-charts` -> base64 PNG images for all 6 chart types
4. **Build narrative prompt:** POST findings + metrics + chart descriptions to Python `/report/build-narrative-prompt`
5. **LLM Pass 2:** Call `generateStream()` with narrative prompts (feature='executive-report'). Collect full response. Emit SSE stage events during streaming.
6. **Validate narrative:** POST raw JSON to Python `/report/validate-narrative` -> 12 narrative sections
7. **De-sanitize narratives:** For each narrative section, call `desanitizeText()` with session mappings to restore real names/data
8. **Build report:** POST de-sanitized sections + metadata + chart images to Python `/report/build-report` -> DOCX base64
9. **Save DOCX:** Decode base64, save to `uploads/documents/{uuid}-report.docx`
10. **Queue PDF:** Call `addPdfConversionJob()` for Gotenberg conversion
11. **Update session:** Store reportDocxPath, pdfJobId, narrative sections, risk score, compliance scores, chart data
12. Return { reportDocxPath, pdfJobId }

The entire flow is wrapped in the SSE streaming response from Plan 06-B Task 5, emitting stage events at each step.

**Acceptance:**
- [ ] generateReport calls all 7 Python endpoints in correct order
- [ ] LLM Pass 2 uses Opus 4.6 via generateStream with feature='executive-report'
- [ ] De-sanitization runs on all narrative sections before DOCX build
- [ ] DOCX saved to disk, PDF queued via BullMQ
- [ ] Session state updated with all generation results
- [ ] SSE stage events emitted: extracting, computing, generating_charts, narrative, building_report, converting_pdf

**Commit:** `feat(report): implement full generation pipeline with de-sanitization`

### Task 5: Download endpoint + preview status + integration wiring

**Files:**
- `backend/src/routes/executiveReport.ts` (modify)
- `backend/src/services/reportService.ts` (modify)

**What:** Complete the remaining route implementations.

**GET /preview/:sessionId:**
1. Load session, get pdfJobId
2. Call `getPdfJobStatus(pdfJobId)`
3. If completed, construct PDF URL and store in session
4. Return { status, progress, pdfUrl, reportDocxPath }

**GET /download/:sessionId:**
1. Load session, get reportDocxPath
2. Verify file exists
3. Stream file with correct Content-Disposition header (original-name-executive-report.docx)

**POST /sanitize:**
- Wire to `sanitizeReport()` -- trigger paragraph-by-paragraph sanitization
- Return sanitized paragraphs with entity highlights

**POST /approve-sanitization:**
- Set session step to 'generate', trigger `extractFindings()`
- Return findings + metadata + warnings

**POST /update-metadata:**
- Merge user metadata edits into session
- Return updated metadata

**POST /update-deny-list:**
- Wire to `updateDenyList()` -- add/remove terms, re-sanitize affected paragraphs
- Return updated sanitized paragraphs

**Acceptance:**
- [ ] Preview endpoint returns PDF status with polling support
- [ ] Download endpoint streams DOCX with correct headers
- [ ] Sanitize endpoint returns paragraph-level results with entity positions
- [ ] Metadata update persists to session
- [ ] Deny list update triggers re-sanitization of affected paragraphs
- [ ] Full flow testable: upload -> sanitize -> approve -> generate -> preview -> download

**Commit:** `feat(report): complete route implementations and download endpoint`

## Verification

```bash
# 1. Start all services (backend, sanitization-service, Gotenberg, Redis)
# 2. Test the full pipeline:
curl -X POST http://localhost:3001/api/report/upload \
  -F 'file=@test-templates/executive/L8250203 - Internal Pentest Report_Anonimizado.docx' \
  -b 'session=...' --cookie-jar cookies.txt

# Get session ID from response, then:
curl -X POST http://localhost:3001/api/report/sanitize \
  -H 'Content-Type: application/json' \
  -d '{"sessionId": "SESSION_ID"}' -b cookies.txt

curl -X POST http://localhost:3001/api/report/approve-sanitization \
  -H 'Content-Type: application/json' \
  -d '{"sessionId": "SESSION_ID"}' -b cookies.txt

# SSE generation endpoint (streaming):
curl -X POST http://localhost:3001/api/report/generate \
  -H 'Content-Type: application/json' \
  -d '{"sessionId": "SESSION_ID"}' -b cookies.txt -N

# Check preview:
curl http://localhost:3001/api/report/preview/SESSION_ID -b cookies.txt

# Download:
curl -O http://localhost:3001/api/report/download/SESSION_ID -b cookies.txt
```

## Success Criteria

- Skeleton DOCX files for both languages have correct structure
- Python routes respond to all 7 endpoints
- Full pipeline runs: upload -> sanitize paragraphs -> LLM Pass 1 -> compute metrics -> render charts -> LLM Pass 2 -> de-sanitize -> build DOCX -> PDF
- Generated DOCX has all sections filled and charts embedded
- PDF available via Gotenberg conversion
- Both DOCX and PDF downloadable
- SSE streaming works for generation progress
