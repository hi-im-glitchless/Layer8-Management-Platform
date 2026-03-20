# Phase 6: Executive Report Generator — Research

## Findings

### 1. WizardState Redis Pattern (wizardState.ts)
- `WizardState` interface with sessionId, userId, currentStep, plus domain-specific fields
- Redis key pattern: `layer8:wizard:{userId}:{sessionId}`, 24h TTL
- `createWizardSession(userId)` → creates fresh state
- `updateWizardSession(userId, sessionId, updates)` → deep-merge updates
- Phase 6 needs `ReportWizardState` with report-specific fields: findingsJson, chartData, narrativeSections, riskScore, complianceMatrix, sanitizationMappings, metadata, denyList

### 2. SSE Streaming Pattern (useStreamingLLM.ts, templateAdapter.ts)
- Event types: `delta` (text chunks), `mapping_update` (structured JSON), `done` (usage stats), `error`
- Frontend hook `useStreamingLLM()` with SSE frame parser
- Phase 6 needs additional event types: stage events (`extracting`, `computing`, `charts`, `narrative`, `rendering`), narrative progress, chart generated

### 3. LLM Client Feature-Based Model Selection (llm/client.ts)
- `resolveModel(feature)` maps feature → model: `'executive-report'` → Opus 4.6
- DB config already has `executiveReportModel` field in LlmSettings
- Fallback chain: CLIProxyAPI → Anthropic API

### 4. DOCX Parsing (docx_parser.py)
- Extracts paragraphs with heading levels and zone tags (cover/body/table_cell/header/footer)
- Tables with merge info, images with dimensions, text boxes
- Paragraph index is stable across re-parses
- Zone detection identifies cover/body structure automatically

### 5. PDF Conversion Queue (pdfQueue.ts)
- BullMQ-based with Gotenberg backend
- `addPdfConversionJob(docxPath, filename)` → jobId
- `getPdfJobStatus(jobId)` for polling
- Concurrency = 1 (LibreOffice not thread-safe)
- Auto-cleanup: 3600s on completion, 86400s on failure

### 6. WizardShell Architecture (WizardShell.tsx)
- Currently 4-step with hard-coded `STEP_SEQUENCE`
- `maxReachableIndex` logic works for any step count
- `advanceToStep()` is generic
- Needs parametrization: `steps[]` as prop instead of hard-coded sequence

### 7. ChatPanel (ChatPanel.tsx)
- Props: sessionId, onMappingUpdate, iterationCount, maxIterations
- Has adapter-specific logic (mapping updates)
- Recommendation: Create new ReportReviewChat for Phase 6 (different event types)

### 8. AnalysisProgress (AnalysisProgress.tsx)
- Already supports custom steps via `steps?: StepDef[]` prop
- Can reuse directly for report generation progress with report-specific step definitions

### 9. Sanitization Integration (sanitize.py)
- `POST /sanitize` with text, deny_list_terms, language, entities
- Returns sanitized text with entity positions
- Phase 6: loop paragraphs from parsed DOCX, POST each to /sanitize, accumulate mappings
- `POST /desanitize` for reverse mapping

### 10. Backend Service Pattern (templateAdapter.ts)
- Routes orchestrate: Python service calls → LLM calls → PDF conversion → KB persistence
- `createLLMClient()` for feature-scoped model selection
- Streaming endpoints use Express SSE pattern with chunked transfer

### 11. Shared UI Components
- Already shared: Button, Card, Input, Badge, PdfPreview, FileUpload
- Need promotion: AnalysisProgress, WizardShell (with parametrization)

## Relevant Patterns

1. Redis-backed wizard state — 24h TTL, deep-merge updates, session isolation
2. Python service orchestration — fetch for HTTP calls, snake_case ↔ camelCase conversion
3. SSE streaming — event types: delta, done, error; client-side SSE parser
4. Feature-scoped LLM models — Opus 4.6 for reports
5. BullMQ PDF queue — single concurrency, progress polling
6. Paragraph indexing — stable across re-parses, zone-aware
7. Audit logging — every significant action logged
8. Step-based wizard navigation — maxReachableIndex enforces progression
9. Zod validation — all route inputs validated

## Risks

1. **PDF queue concurrency:** Multiple PDFs (sanitized preview, final report) queue sequentially. Estimate 30-60s per PDF. Plan for 2-3 min total.
2. **LLM cost:** Two-pass Opus 4.6 pipeline costs ~$0.10-0.30 per report.
3. **Sanitization/regeneration mismatch:** Store raw paragraph texts as canonical source.
4. **Chart rendering:** No matplotlib examples in current codebase — new Python module needed.
5. **Session state bloat:** Large report findings + narrative can strain Redis. Consider compression.
6. **Language auto-detection:** Must be deterministic for skeleton DOCX selection.

## Recommendations

1. Create `ReportWizardState` extending existing Redis state pattern
2. Parametrize WizardShell for step count (steps[] prop)
3. Create new Python module for chart rendering (chart_renderer.py)
4. Store skeleton DOCX paths in config
5. Implement paragraph-by-paragraph sanitization cache in wizard state
6. Use BullMQ job return value for PDF path storage
7. Create separate executiveReport.ts routes and service (clean separation from adapter)
8. Promote AnalysisProgress to shared component
9. De-sanitize narrative text before DOCX build (pre-render approach)

## Key File References

| Component | File | Signature |
|-----------|------|-----------|
| Redis State | `backend/src/services/wizardState.ts` | `createWizardSession(userId)` |
| State Update | `backend/src/services/wizardState.ts` | `updateWizardSession(userId, sessionId, updates)` |
| LLM Client | `backend/src/services/llm/client.ts` | `createLLMClient()` |
| Stream Generator | `backend/src/services/llm/client.ts` | `generateStream(messages, options)` |
| PDF Queue | `backend/src/services/pdfQueue.ts` | `addPdfConversionJob(docxPath, filename)` |
| Sanitize | `sanitization-service/app/routes/sanitize.py` | `POST /sanitize` |
| DOCX Parser | `sanitization-service/app/services/docx_parser.py` | `parse(file_bytes)` |
| Streaming Hook | `frontend/src/hooks/useStreamingLLM.ts` | `useStreamingLLM()` |
| Wizard Shell | `frontend/src/features/adapter/components/WizardShell.tsx` | `WizardShell()` |
| Chat Panel | `frontend/src/features/adapter/components/ChatPanel.tsx` | `ChatPanel()` |
| Progress Display | `frontend/src/features/adapter/components/AnalysisProgress.tsx` | `AnalysisProgressDisplay()` |
