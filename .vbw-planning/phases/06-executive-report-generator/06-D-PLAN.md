---
phase: "06"
plan: "06-D"
title: "Frontend Executive Report Module -- 5-Step Wizard UI"
wave: 2
depends_on:
  - "06-B"
cross_phase_deps: []
skills_used: []
must_haves:
  - "features/executive-report/ module with types.ts, api.ts, hooks.ts, components/"
  - "ReportWizardShell renders 5-step wizard with step indicator"
  - "StepUpload handles DOCX upload with file-upload component"
  - "StepSanitizeReview shows side-by-side diff with entity highlights + metadata editor + deny list editor"
  - "StepGenerate shows AnalysisProgressDisplay with report generation stages"
  - "StepReview shows PDF preview (no chat yet -- chat wired in 06-E)"
  - "StepDownload provides DOCX + PDF download buttons"
  - "ExecutiveReport route page renders the wizard"
---

## Objective

Build the complete frontend feature module for the executive report wizard. This creates the 5-step UI matching the existing adapter wizard pattern, with report-specific components for sanitization review, generation progress, and PDF preview.

## Context

- `@frontend/src/features/adapter/types.ts` -- type pattern to follow for report types
- `@frontend/src/features/adapter/api.ts` -- API client pattern (apiClient/apiUpload wrappers)
- `@frontend/src/features/adapter/hooks.ts` -- TanStack Query hooks pattern (mutations, queries, SSE chat)
- `@frontend/src/features/adapter/components/WizardShell.tsx` -- wizard shell pattern (step management, navigation, error boundary)
- `@frontend/src/features/adapter/components/StepIndicator.tsx` -- step indicator pattern (STEP_ORDER, circle + connector)
- `@frontend/src/features/adapter/components/AnalysisProgress.tsx` -- AnalysisProgressDisplay with custom steps[] prop
- `@frontend/src/components/ui/pdf-preview.tsx` -- PdfPreview for report preview
- `@frontend/src/components/ui/file-upload.tsx` -- FileUpload for DOCX upload
- `@frontend/src/routes/ExecutiveReport.tsx` -- existing placeholder page to replace
- `@frontend/src/App.tsx` -- route already defined at /executive-report
- `@06-CONTEXT.md` decisions: 5-step wizard, side-by-side diff, metadata editor, inline deny list, AnalysisProgressDisplay reuse, PDF preview + chat for review

## Tasks

### Task 1: Feature module foundation -- types.ts + api.ts

**Files:**
- `frontend/src/features/executive-report/types.ts` (new)
- `frontend/src/features/executive-report/api.ts` (new)

**What:** Create the type definitions and API client for the executive report feature.

**types.ts:**
```typescript
export type ReportWizardStep = 'upload' | 'sanitize-review' | 'generate' | 'review' | 'download';

export interface SanitizedParagraph {
  index: number;
  original: string;
  sanitized: string;
  entities: Array<{
    type: string; start: number; end: number;
    text: string; placeholder: string;
  }>;
}

export interface ReportMetadata {
  clientName: string;
  projectCode: string;
  startDate: string;
  endDate: string;
  scopeSummary: string;
}

export interface ReportWizardState {
  sessionId: string;
  currentStep: ReportWizardStep;
  uploadedFile: { originalName: string; uploadedAt: string; };
  detectedLanguage: string;
  sanitizedParagraphs: SanitizedParagraph[];
  denyListTerms: string[];
  findingsJson: Record<string, unknown> | null;
  metadata: ReportMetadata;
  warnings: string[];
  riskScore: number | null;
  reportPdfUrl: string | null;
  reportDocxPath: string | null;
  chatHistory: Array<{ role: string; content: string; timestamp: string; }>;
  chatIterationCount: number;
  createdAt: string;
  updatedAt: string;
}

// Response types for each endpoint
export interface ReportUploadResponse { sessionId: string; detectedLanguage: string; }
export interface ReportSanitizeResponse { sanitizedParagraphs: SanitizedParagraph[]; }
export interface ReportExtractResponse { findings: Record<string, unknown>[]; metadata: ReportMetadata; warnings: string[]; }
export interface ReportPreviewResponse { status: string; progress: number; pdfUrl: string | null; }
export interface ReportActiveSessionResponse { session: { sessionId: string; currentStep: ReportWizardStep; uploadedFile: { originalName: string; }; detectedLanguage: string; } | null; }

// SSE event types for generation streaming
export type ReportSSEEvent =
  | { type: 'stage'; stage: string; progress: number; }
  | { type: 'delta'; text: string; }
  | { type: 'section_update'; sectionKey: string; text: string; }
  | { type: 'done'; usage: Record<string, unknown>; }
  | { type: 'error'; message: string; retryable: boolean; };
```

**api.ts:**
API client mapping 1:1 to backend routes at `/api/report/*`. Functions:
- `uploadReport(file: File) -> ReportUploadResponse`
- `sanitizeReport(sessionId: string) -> ReportSanitizeResponse`
- `updateDenyList(sessionId: string, terms: string[], action: 'add'|'remove')`
- `approveSanitization(sessionId: string) -> ReportExtractResponse`
- `updateMetadata(sessionId: string, metadata: Partial<ReportMetadata>)`
- `streamGenerate(sessionId: string, signal?: AbortSignal) -> Response` (raw fetch for SSE)
- `streamChat(sessionId: string, message: string, signal?: AbortSignal) -> Response` (raw fetch for SSE)
- `getSession(sessionId: string) -> ReportWizardState`
- `getActiveSession() -> ReportActiveSessionResponse`
- `deleteSession(sessionId: string)`
- `getPreviewStatus(sessionId: string) -> ReportPreviewResponse`
- `downloadUrl(sessionId: string) -> string`
- `pdfDownloadUrl(sessionId: string) -> string`

**Acceptance:**
- [ ] All types match backend ReportWizardState shape
- [ ] API client covers all 12 backend endpoints
- [ ] SSE streaming functions use raw fetch (not apiClient) with CSRF token
- [ ] Download URLs use API_BASE_URL constant

**Commit:** `feat(report-ui): add executive report types and API client`

### Task 2: hooks.ts -- TanStack Query hooks + SSE generation hook

**Files:**
- `frontend/src/features/executive-report/hooks.ts` (new)

**What:** Create TanStack Query hooks following the adapter pattern.

**Mutations:**
- `useUploadReport()` -- upload DOCX, returns sessionId
- `useSanitizeReport()` -- trigger sanitization
- `useUpdateDenyList()` -- add/remove deny list terms
- `useApproveSanitization()` -- approve and trigger Pass 1
- `useUpdateMetadata()` -- update metadata fields
- `useResetReportSession()` -- delete session

**Queries:**
- `useReportSession(sessionId)` -- fetch full wizard state, staleTime 30s
- `useActiveReportSession()` -- check for active session (auto-resume), staleTime 60s
- `useReportPreviewStatus(sessionId)` -- poll preview status every 2s until completed/failed

**SSE Hook -- `useReportGeneration(sessionId)`:**
Custom hook for SSE generation streaming (same pattern as useAdapterChat but for generation):
- `startGeneration()` -- opens SSE stream to POST /api/report/generate
- Parses SSE events: `stage`, `delta`, `done`, `error`
- Tracks: `currentStage`, `stageProgress`, `narrativeText` (accumulated deltas), `isGenerating`, `error`
- Returns: `{ startGeneration, currentStage, stageProgress, narrativeText, isGenerating, error }`

**SSE Hook -- `useReportChat(sessionId)`:**
Chat hook for corrections in review step (same pattern as useAdapterChat):
- `sendMessage(message)` -- opens SSE stream to POST /api/report/chat
- Parses: `delta`, `section_update`, `done`, `error`
- Tracks: `messages`, `isStreaming`, `latestSectionUpdate`
- Returns: `{ messages, isStreaming, sendMessage, cancelStream, latestSectionUpdate }`

**Acceptance:**
- [ ] All 6 mutations follow TanStack pattern with toast.error on failure
- [ ] All 3 queries follow polling/staleTime patterns
- [ ] useReportGeneration tracks stage progression from SSE events
- [ ] useReportChat accumulates message history from SSE delta events
- [ ] Cache invalidation on mutations (invalidate session query)

**Commit:** `feat(report-ui): add TanStack Query hooks and SSE streaming hooks`

### Task 3: ReportWizardShell + StepIndicator + StepUpload

**Files:**
- `frontend/src/features/executive-report/components/ReportStepIndicator.tsx` (new)
- `frontend/src/features/executive-report/components/ReportWizardShell.tsx` (new)
- `frontend/src/features/executive-report/components/StepUpload.tsx` (new)

**What:** Create the wizard shell and first step component.

**ReportStepIndicator.tsx:**
5-step indicator following adapter StepIndicator pattern. Steps:
1. Upload (FileUp icon)
2. Sanitize & Review (Shield icon)
3. Generate (Sparkles icon)
4. Review (Eye icon)
5. Download (Download icon)

Same visual design: circles + connector lines, complete/active/pending states.

**ReportWizardShell.tsx:**
Follows WizardShell.tsx pattern:
- Props: `{ sessionId, onSessionCreate, onSessionClear }`
- Uses `useReportSession(sessionId)` for state
- Step sequence: `['upload', 'sanitize-review', 'generate', 'review', 'download']`
- `overrideStep` state for back navigation
- `maxReachableIndex` from server step
- Back/Forward/Start Over buttons (hidden on upload and download steps)
- Error boundary rendering
- Lazy-loads step components

**StepUpload.tsx:**
- FileUpload component for DOCX only (50MB limit)
- No template type or language selector (auto-detected)
- On file select: call `useUploadReport()`, then auto-trigger `useSanitizeReport()`
- Show AnalysisProgressDisplay during upload+sanitization with steps:
  1. "Uploading report..." (5%)
  2. "Detecting language..." (15%)
  3. "Sanitizing paragraphs..." (50%)
  4. "Extracting findings..." (80%)
- On complete: advance to 'sanitize-review' step

**Acceptance:**
- [ ] ReportStepIndicator renders 5 steps with correct labels
- [ ] ReportWizardShell manages step navigation for 5 steps
- [ ] StepUpload accepts DOCX upload with drag-and-drop
- [ ] Progress display shows 4 stages during upload pipeline
- [ ] Auto-advances to sanitize-review after pipeline completes

**Commit:** `feat(report-ui): add wizard shell, step indicator, and upload step`

### Task 4: StepSanitizeReview -- diff view + metadata editor + deny list

**Files:**
- `frontend/src/features/executive-report/components/StepSanitizeReview.tsx` (new)
- `frontend/src/features/executive-report/components/SanitizationDiffView.tsx` (new)
- `frontend/src/features/executive-report/components/MetadataEditor.tsx` (new)
- `frontend/src/features/executive-report/components/DenyListEditor.tsx` (new)

**What:** Build the sanitization review step with three sub-components.

**SanitizationDiffView.tsx:**
Side-by-side two-panel display:
- Left panel: "Original" -- original paragraph text
- Right panel: "Sanitized" -- sanitized text with highlighted entity replacements
- Entity highlights: use entity positions (start/end) to wrap replaced text in `<mark>` spans with entity-type color coding (PERSON=blue, ORG=purple, IP=orange, etc.)
- Scrollable list of paragraphs, only non-empty shown
- Entity type legend at top
- Summary row: "X entities detected across Y paragraphs"

**MetadataEditor.tsx:**
Form-table layout with 5 rows:
- Client Name: `[LLM extracted value (read-only)] | [editable input]`
- Project Code: same pattern
- Start Date: date input
- End Date: date input
- Scope Summary: textarea
LLM-extracted values shown in a muted read-only column. User editable column has inputs pre-filled with LLM values. Note: some LLM values may contain sanitized placeholders (e.g., `[PERSON_1]`) -- show as-is, user replaces with real values.

**DenyListEditor.tsx:**
Inline editor below the diff view:
- Input + "Add" button to add new deny list terms
- Chip/tag display of current terms with X remove button
- Adding/removing a term calls `useUpdateDenyList()` and triggers re-sanitization
- Show loading state during re-sanitization

**StepSanitizeReview.tsx:**
Combines all three sub-components:
- Top: SanitizationDiffView (takes most space)
- Middle: DenyListEditor
- Bottom: MetadataEditor
- "Approve & Generate" button at bottom -- calls approveSanitization, then advances to 'generate' step
- Warnings from extraction shown as alert banner

**Acceptance:**
- [ ] Side-by-side diff shows original vs sanitized with entity highlights
- [ ] Entity positions correctly map to highlight spans
- [ ] Metadata editor shows 5 fields with LLM pre-fill + editable inputs
- [ ] Deny list editor adds/removes terms and triggers re-sanitization
- [ ] "Approve & Generate" advances to generate step
- [ ] Loading states shown during re-sanitization

**Commit:** `feat(report-ui): add sanitization review with diff, metadata, and deny list`

### Task 5: StepGenerate + StepReview + StepDownload + route page

**Files:**
- `frontend/src/features/executive-report/components/StepGenerate.tsx` (new)
- `frontend/src/features/executive-report/components/StepReview.tsx` (new)
- `frontend/src/features/executive-report/components/StepDownload.tsx` (new)
- `frontend/src/features/executive-report/components/index.ts` (new)
- `frontend/src/routes/ExecutiveReport.tsx` (modify)

**What:** Build the remaining three steps and wire everything together.

**StepGenerate.tsx:**
- Uses `useReportGeneration(sessionId)` hook
- Auto-starts generation when step mounts (call startGeneration)
- AnalysisProgressDisplay with custom report generation steps:
  1. "Extracting findings from report..." (10%)
  2. "Computing risk metrics..." (30%)
  3. "Generating charts..." (45%)
  4. "Writing executive narrative..." (70%)
  5. "Building report document..." (85%)
  6. "Converting to PDF..." (95%)
- Maps SSE stage events to activeStepIndex
- On 'done': advance to 'review' step
- On error: show error with retry button

**StepReview.tsx:**
- PDF preview using PdfPreview component (polls for PDF URL via useReportPreviewStatus)
- Loading skeleton while PDF converts
- "Satisfied" button to advance to download
- "Regenerate" button to go back to generate step
- (Chat panel placeholder -- actual chat corrections wired in Plan 06-E)

**StepDownload.tsx:**
- Two download buttons: DOCX (primary) + PDF (secondary)
- DOCX download via `<a href={reportApi.downloadUrl(sessionId)} download>`
- PDF download via `<a href={pdfUrl} download>` (from session state)
- Report summary card: file name, language, risk score, findings count
- "Generate Another" button to clear session and start over

**ExecutiveReport.tsx (modify):**
Replace the existing placeholder with the full wizard:
- Same pattern as TemplateAdapter.tsx: sessionId state, auto-resume via useActiveReportSession, WizardErrorBoundary, search params sync
- Render ReportWizardShell

**index.ts:**
Barrel export for all components.

**Acceptance:**
- [ ] StepGenerate shows 6-stage progress from SSE events
- [ ] StepReview shows PDF preview with polling
- [ ] StepDownload provides both DOCX and PDF download links
- [ ] ExecutiveReport.tsx renders wizard with session auto-resume
- [ ] Full wizard navigable: Upload -> Sanitize -> Generate -> Review -> Download
- [ ] Back navigation works between steps

**Commit:** `feat(report-ui): add generate, review, download steps and wire route page`

## Verification

```bash
cd /home/rl/Documents/Projects/Layer8/frontend
npx tsc --noEmit  # TypeScript compilation
npm run dev       # Dev server starts without errors
# Manual test: navigate to /executive-report, upload a DOCX, verify 5-step wizard renders
```

## Success Criteria

- Feature module has complete types, API client, hooks, and 5 step components
- Wizard navigates through all 5 steps
- Upload triggers sanitization pipeline with progress display
- Sanitization review shows side-by-side diff with entity highlights
- Metadata editor shows LLM-extracted values with editable inputs
- Deny list editor adds/removes terms and triggers re-sanitization
- Generation step shows 6-stage progress from SSE streaming
- Review step shows PDF preview
- Download step provides both DOCX + PDF
- Route page auto-resumes active sessions
- Zero TypeScript errors
