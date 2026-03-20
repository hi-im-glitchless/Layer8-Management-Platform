---
phase: "06"
plan: "06-B"
title: "Backend Report Infrastructure -- State, Routes, Service Layer"
wave: 1
depends_on: []
cross_phase_deps: []
skills_used:
  - docker-expert
must_haves:
  - "reportWizardState.ts exports ReportWizardState interface with report-specific fields"
  - "reportWizardState.ts exports create/get/update/delete/getActive functions with 'layer8:report-wizard' key prefix"
  - "executiveReport.ts routes registered at /api/report with requireAuth middleware"
  - "executiveReport.ts has upload, sanitize-review, generate, chat, preview, download endpoints"
  - "reportService.ts orchestrates Python calls + LLM calls (stubbed initially)"
  - "Zod schemas validate all route inputs"
  - "Route mounted in backend/src/index.ts"
---

## Objective

Build the backend infrastructure for the executive report wizard: a separate Redis-backed wizard state (ReportWizardState), Express routes at `/api/report/*`, and a service layer that will orchestrate the Python services and LLM calls. This plan creates the full route skeleton with Zod validation -- the actual LLM/Python integration happens in Plan 06-C.

## Context

- `@backend/src/services/wizardState.ts` -- existing Redis state pattern to replicate (same CRUD, different key prefix and interface)
- `@backend/src/routes/templateAdapter.ts` -- route pattern: Zod validation, requireAuth, session ownership checks, multer upload
- `@backend/src/services/templateAdapter.ts` -- service pattern: Python HTTP calls, LLM streaming, PDF queue
- `@backend/src/services/llm/client.ts` -- `resolveModel('executive-report')` already wired to Opus 4.6
- `@backend/src/services/sanitization.ts` -- `sanitizeText()` and `desanitizeText()` for reuse
- `@backend/src/services/pdfQueue.ts` -- `addPdfConversionJob()` for Gotenberg PDF
- `@backend/src/index.ts` -- mount new router here
- `@06-CONTEXT.md` decisions: separate ReportWizardState, 24h TTL, 5-step wizard, paragraph-by-paragraph sanitization, session-scoped deny list, Opus 4.6 model

## Tasks

### Task 1: ReportWizardState -- Redis-backed state for report wizard

**Files:**
- `backend/src/services/reportWizardState.ts` (new)

**What:** Create a new wizard state module following the exact pattern of `wizardState.ts` but with report-specific types and a different Redis key prefix (`layer8:report-wizard`).

Types:
```typescript
type ReportWizardStep = 'upload' | 'sanitize-review' | 'generate' | 'review' | 'download';

interface ReportMetadata {
  clientName: string;
  projectCode: string;
  startDate: string;
  endDate: string;
  scopeSummary: string;
}

interface ReportWizardState {
  sessionId: string;
  userId: string;
  currentStep: ReportWizardStep;
  // Upload
  uploadedFile: { originalName: string; storagePath: string; base64: string; uploadedAt: string; };
  detectedLanguage: string; // 'en' | 'pt'
  // Sanitization
  sanitizedParagraphs: Array<{ index: number; original: string; sanitized: string; entities: Array<{ type: string; start: number; end: number; text: string; placeholder: string; }> }>;
  denyListTerms: string[];
  sanitizationMappings: { forward: Record<string, string>; reverse: Record<string, string>; };
  // Extraction (Pass 1)
  findingsJson: Record<string, unknown> | null;
  metadata: ReportMetadata;
  warnings: string[];
  // Generation (Pass 2)
  riskScore: number | null;
  complianceScores: Record<string, number> | null;
  chartData: Record<string, unknown> | null;
  narrativeSections: Record<string, string> | null;
  // Report
  reportDocxPath: string | null;
  reportPdfJobId: string | null;
  reportPdfUrl: string | null;
  // Chat
  chatHistory: Array<{ role: string; content: string; timestamp: string; }>;
  chatIterationCount: number;
  // Timestamps
  createdAt: string;
  updatedAt: string;
}
```

CRUD functions: `createReportSession(userId)`, `getReportSession(userId, sessionId)`, `updateReportSession(userId, sessionId, updates)`, `deleteReportSession(userId, sessionId)`, `getActiveReportSession(userId)`. All follow the existing pattern with 24h TTL and deep-merge for nested objects.

**Acceptance:**
- [ ] ReportWizardState interface has all fields listed above
- [ ] Key prefix is `layer8:report-wizard` (no collision with adapter wizard)
- [ ] Deep merge covers all nested objects (uploadedFile, metadata, sanitizationMappings, etc.)
- [ ] createReportSession returns initialized state with empty defaults
- [ ] getActiveReportSession finds most recent session by updatedAt

**Commit:** `feat(report): add ReportWizardState Redis-backed session management`

### Task 2: Zod schemas + route skeleton for executiveReport.ts

**Files:**
- `backend/src/routes/executiveReport.ts` (new)

**What:** Create the route file with all endpoint definitions, Zod input validation, and error handling. Endpoints are wired to stub handlers that return placeholder responses -- actual logic comes in Plan 06-C.

Routes (pattern matches templateAdapter.ts):
- `POST /upload` -- multer DOCX upload, creates session, returns sessionId
- `POST /sanitize` -- triggers paragraph-by-paragraph sanitization for session
- `POST /update-deny-list` -- adds/removes deny list terms, re-sanitizes affected paragraphs
- `POST /approve-sanitization` -- locks sanitization, triggers Pass 1 extraction
- `POST /update-metadata` -- user edits metadata fields before generation
- `POST /generate` -- triggers full generation pipeline (compute + Pass 2 + build + PDF)
- `POST /chat` -- SSE streaming for corrections (targeted section regeneration)
- `GET /session/:sessionId` -- get full wizard state
- `GET /session` -- get user's active report session
- `DELETE /session/:sessionId` -- delete session
- `GET /preview/:sessionId` -- get PDF status/URL
- `GET /download/:sessionId` -- download DOCX file

Zod schemas for each endpoint's body/params. All routes use `requireAuth` middleware. Session ownership verified on every request.

**Acceptance:**
- [ ] All 12 endpoints defined with correct HTTP methods and paths
- [ ] Zod schemas validate sessionId (UUID), message (1-10000 chars), metadata fields, deny list terms
- [ ] requireAuth middleware applied to all routes
- [ ] Session ownership checked (userId match)
- [ ] Stub responses return correct shapes
- [ ] Error handling follows existing pattern (try/catch -> 500 with message)

**Commit:** `feat(report): add executive report route skeleton with Zod validation`

### Task 3: Mount routes in index.ts + report service stubs

**Files:**
- `backend/src/index.ts` (modify)
- `backend/src/services/reportService.ts` (new)

**What:**

1. In `index.ts`: import `executiveReportRouter` from `./routes/executiveReport.js` and mount at `/api/report`. Place after the adapter router mount.

2. Create `reportService.ts` with stubbed orchestration functions that the routes will call. Each function accepts the relevant state/params and returns a typed result. Stubs return empty/default values or throw "not implemented" for complex operations.

Functions:
- `uploadReport(file: Buffer, originalName: string, userId: string) -> { sessionId, detectedLanguage }` -- creates session, stores file, detects language
- `sanitizeReport(userId: string, sessionId: string) -> { sanitizedParagraphs, sanitizationMappings }` -- paragraph-by-paragraph sanitization
- `updateDenyList(userId: string, sessionId: string, terms: string[], action: 'add'|'remove') -> { updatedParagraphs }` -- modify deny list and re-sanitize
- `extractFindings(userId: string, sessionId: string) -> { findings, metadata, warnings }` -- LLM Pass 1
- `generateReport(userId: string, sessionId: string) -> { reportDocxPath, pdfJobId }` -- compute + Pass 2 + build + PDF
- `processReportChat(userId: string, sessionId: string, message: string, res: Response)` -- SSE streaming for corrections
- `getReportDownloadPath(userId: string, sessionId: string) -> string` -- resolve DOCX path for download

Each stub has complete TypeScript signatures, JSDoc, and either returns placeholder data or logs "TODO: implement in Plan 06-C".

**Acceptance:**
- [ ] `app.use('/api/report', executiveReportRouter)` in index.ts
- [ ] Import added to index.ts
- [ ] reportService.ts has all 7 function stubs with correct signatures
- [ ] No TypeScript compilation errors
- [ ] Server starts without errors after changes

**Commit:** `feat(report): mount report routes and add service layer stubs`

### Task 4: Wire routes to service stubs + upload endpoint implementation

**Files:**
- `backend/src/routes/executiveReport.ts` (modify)

**What:** Replace stub handlers with actual calls to `reportService.ts` functions. Implement the upload endpoint fully:

Upload flow:
1. Multer receives DOCX file (same config as adapter: 50MB limit, .docx only)
2. Call `uploadReport()` which: creates ReportWizardState session, stores base64 in state, saves file to `uploads/documents/`, detects language via Python `/detect-language` or by calling the existing language_detector (first 500 chars of parsed text)
3. Return `{ sessionId, detectedLanguage, currentStep: 'upload' }`

Also implement:
- `GET /session/:sessionId` -- return full ReportWizardState from Redis
- `GET /session` -- return active session summary
- `DELETE /session/:sessionId` -- delete session and clean up files

All other endpoints call their respective service stubs (returning stub responses for now).

**Acceptance:**
- [ ] Upload endpoint creates session, stores file, returns sessionId + language
- [ ] GET session returns full state
- [ ] GET active session returns summary or null
- [ ] DELETE session removes Redis key and uploaded file
- [ ] Other endpoints call service stubs without error

**Commit:** `feat(report): wire routes to service layer with full upload implementation`

### Task 5: SSE streaming infrastructure for report generation

**Files:**
- `backend/src/routes/executiveReport.ts` (modify)

**What:** Implement the SSE streaming setup for the `/generate` and `/chat` endpoints. Pattern follows templateAdapter.ts SSE:

For `/generate`:
- Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Define stage event emitter: `sendStageEvent(stage, progress?)` emitting `event: stage\ndata: {"stage": "...", "progress": N}\n\n`
- Define text delta emitter for LLM streaming: `sendDelta(text)`
- Define done event: `sendDone(usage)`
- Define error event: `sendError(message, retryable)`
- Stages: 'extracting' (Pass 1), 'computing' (metrics/charts), 'generating_charts', 'narrative' (Pass 2), 'building_report', 'converting_pdf'
- Call `generateReport()` from service layer (stub will be fleshed out in 06-C)

For `/chat`:
- Same SSE infrastructure
- Event types: `delta` (LLM text), `section_update` (JSON with updated section key + text), `done`, `error`
- Call `processReportChat()` from service layer

**Acceptance:**
- [ ] `/generate` endpoint sets SSE headers correctly
- [ ] Stage events emitted with correct format
- [ ] `/chat` endpoint streams delta + section_update events
- [ ] Error events include retryable flag
- [ ] SSE connection properly closed on completion or error

**Commit:** `feat(report): add SSE streaming for report generation and chat`

## Verification

```bash
cd /home/rl/Documents/Projects/Layer8/backend
npx tsc --noEmit  # TypeScript compilation check
# Start the server and test endpoints:
# curl -X POST http://localhost:3001/api/report/upload -F 'file=@test.docx' -b 'session=...'
# curl http://localhost:3001/api/report/session -b 'session=...'
```

## Success Criteria

- ReportWizardState fully typed and functional with Redis CRUD
- All 12 route endpoints defined and reachable
- Upload endpoint creates sessions and stores files end-to-end
- SSE infrastructure ready for generation and chat streaming
- Zero TypeScript errors
- Server starts and routes respond (even if some return stub data)
- No key collisions with existing adapter wizard state
