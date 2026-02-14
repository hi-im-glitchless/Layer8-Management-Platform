/**
 * Template Adapter wizard types.
 * Mirrors backend WizardState and API response shapes.
 */

export type WizardStep = 'upload' | 'verify' | 'preview' | 'download'

export type TemplateType = 'web' | 'internal' | 'mobile'

export type TemplateLanguage = 'en' | 'pt-pt'

export interface MappingEntry {
  sectionIndex: number
  sectionText: string
  gwField: string
  placeholderTemplate: string
  confidence: number
  markerType: string
  rationale: string
}

export interface MappingPlan {
  entries: MappingEntry[]
  templateType: TemplateType
  language: TemplateLanguage
  warnings: string[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface AdaptationProgress {
  step: string
  status: 'pending' | 'active' | 'complete' | 'error'
  message: string
}

export interface WizardState {
  sessionId: string
  currentStep: WizardStep
  templateFile: {
    originalName: string
    base64: string
    uploadedAt: string
  }
  config: {
    templateType: TemplateType
    language: TemplateLanguage
  }
  analysis: {
    mappingPlan: MappingPlan | null
    referenceTemplateHash: string
  }
  adaptation: {
    appliedCount: number
    skippedCount: number
    instructions: unknown
    warnings: string[]
  }
  preview: {
    pdfJobId: string | null
    docxUrl: string | null
    pdfUrl: string | null
  }
  chat: {
    messages: ChatMessage[]
    iterationCount: number
  }
  createdAt: string
  updatedAt: string
}

/** POST /api/adapter/upload response */
export interface UploadResponse {
  sessionId: string
  currentStep: WizardStep
}

/** POST /api/adapter/analyze response */
export interface AnalyzeResponse {
  mappingPlan: MappingPlan
  referenceTemplateHash: string
}

/** POST /api/adapter/apply response */
export interface ApplyResponse {
  currentStep: WizardStep
  appliedCount: number
  skippedCount: number
  warnings: string[]
}

/** POST /api/adapter/auto-map response */
export interface AutoMapResponse {
  currentStep: WizardStep
  appliedCount: number
  skippedCount: number
  warnings: string[]
  mappingPlan: MappingPlan
}

/** POST /api/adapter/reapply response */
export interface ReapplyResponse {
  appliedCount: number
  skippedCount: number
  placementWarnings: string[]
}

/** POST /api/adapter/preview response */
export interface PreviewResponse {
  pdfJobId: string
  docxUrl: string
}

/** GET /api/adapter/preview/:sessionId response */
export interface PreviewStatusResponse {
  status: 'queued' | 'active' | 'completed' | 'failed'
  progress: number
  docxUrl: string
  pdfUrl?: string
  error?: string
}

/** GET /api/adapter/session (active session summary) */
export interface ActiveSessionResponse {
  session: {
    sessionId: string
    currentStep: WizardStep
    templateFile: {
      originalName: string
      uploadedAt: string
    }
    config: {
      templateType: TemplateType
      language: TemplateLanguage
    }
    createdAt: string
    updatedAt: string
  } | null
}

/** Resolved mapping for a single selection in a batch */
export interface SelectionMappingResult {
  gwField: string
  markerType: string
  confidence: number
  rationale: string
}

/** SSE event types from /api/adapter/chat */
export type ChatSSEEvent =
  | { type: 'delta'; text: string }
  | { type: 'mapping_update'; mappingPlan: MappingPlan }
  | { type: 'selection_mapping'; selectionNumber: number; gwField: string; markerType: string; confidence: number; rationale: string }
  | { type: 'batch_complete'; resolvedCount: number; totalCount: number }
  | { type: 'correction_result'; mappingPlan: MappingPlan }
  | { type: 'regeneration_complete'; pdfJobId: string; placeholderCount: number }
  | { type: 'done'; usage: Record<string, unknown> }
  | { type: 'error'; message: string; retryable: boolean }

// ---------------------------------------------------------------------------
// Annotated Preview & Mapping Update Types (Phase 5.1)
// ---------------------------------------------------------------------------

/** Single tooltip entry for annotated PDF overlay */
export interface TooltipEntry {
  paragraphIndex: number
  gwField: string
  markerType: string
  sectionText: string
  status: 'mapped' | 'gap'
}

/** Unmapped paragraph available for manual mapping */
export interface UnmappedParagraph {
  paragraphIndex: number
  text: string
  headingLevel: number | null
}

/** Coverage statistics from gap detection */
export interface GapSummary {
  mappedFieldCount: number
  expectedFieldCount: number
  coveragePercent: number
}

/** POST /api/adapter/annotated-preview response */
export interface AnnotatedPreviewResponse {
  pdfJobId: string
  tooltipData: TooltipEntry[]
  unmappedParagraphs: UnmappedParagraph[]
  gapSummary: GapSummary
}

/** GET /api/adapter/annotated-preview/:sessionId response */
export interface AnnotatedPreviewStatus {
  pdfJobId: string | null
  pdfUrl: string | null
  pdfStatus?: 'queued' | 'active' | 'completed' | 'failed' | 'not_found'
  pdfProgress?: number
  pdfError?: string
  placeholders: PlaceholderInfo[]
  placeholderCount: number
  tooltipData: TooltipEntry[]
  unmappedParagraphs: UnmappedParagraph[]
  gapSummary: GapSummary | null
}

/** POST /api/adapter/update-mapping request */
export interface MappingUpdateRequest {
  sessionId: string
  updates: {
    editedEntries?: Array<{
      sectionIndex: number
      gwField: string
      markerType: string
    }>
    addedEntries?: Array<{
      paragraphIndex: number
      gwField: string
      markerType: string
      sectionText?: string
    }>
  }
}

// ---------------------------------------------------------------------------
// Document Structure Types (Phase 5.2)
// ---------------------------------------------------------------------------

/** A single paragraph entry from the document structure endpoint */
export interface ParagraphInfo {
  paragraphIndex: number
  text: string
  headingLevel: number | null
  isEmpty: boolean
  styleName: string | null
}

/** GET /api/adapter/document-structure/:sessionId response */
export interface DocumentStructureResponse {
  paragraphs: ParagraphInfo[]
  totalCount: number
  emptyCount: number
}

// ---------------------------------------------------------------------------
// Interactive PDF Mapping Types (Phase 5.2)
// ---------------------------------------------------------------------------

/** Status of a user text selection on the PDF */
export type SelectionStatus = 'pending' | 'confirmed' | 'rejected'

/** Bounding rectangle for a selection, relative to its PDF page */
export interface SelectionBoundingRect {
  top: number
  left: number
  width: number
  height: number
  pageNumber: number
}

/** A single numbered text selection on the PDF */
export interface SelectionEntry {
  id: string                          // crypto.randomUUID()
  selectionNumber: number             // auto-incremented #1, #2, #3...
  paragraphIndex: number              // pdfjs text layer paragraph mapping
  text: string                        // selected text content
  boundingRect: SelectionBoundingRect
  pageNumber: number
  status: SelectionStatus
  gwField: string | null              // set after LLM resolution
  markerType: string | null           // set after LLM resolution
  confidence: number | null           // set after LLM resolution
}

/** Discriminated union of actions for the selection state reducer */
export type SelectionAction =
  | { type: 'add'; entry: Omit<SelectionEntry, 'id' | 'selectionNumber' | 'status' | 'gwField' | 'markerType' | 'confidence'> }
  | { type: 'remove'; id: string }
  | { type: 'confirm'; id: string }
  | { type: 'reject'; id: string }
  | { type: 'reset' }
  | { type: 'update_mapping'; selectionNumber: number; gwField: string; markerType: string; confidence: number }

/** Single result item from LLM batch mapping resolution */
export interface BatchMappingResultEntry {
  selectionNumber: number
  gwField: string
  markerType: string
  confidence: number
  rationale: string
}

/** LLM batch mapping response */
export type BatchMappingResult = BatchMappingResultEntry[]

// ---------------------------------------------------------------------------
// Placeholder Preview Types (Phase 5.3)
// ---------------------------------------------------------------------------

/** Single placeholder detected in the adapted DOCX */
export interface PlaceholderInfo {
  paragraphIndex: number
  placeholderText: string
  gwField: string
}

/** POST /api/adapter/placeholder-preview response */
export interface PlaceholderPreviewResponse {
  pdfJobId: string
  placeholders: PlaceholderInfo[]
  placeholderCount: number
}
