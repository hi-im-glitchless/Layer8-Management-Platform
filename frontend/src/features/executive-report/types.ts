/**
 * Executive Report wizard types.
 * Mirrors backend ReportWizardState and API response shapes.
 */

export type ReportWizardStep = 'upload' | 'sanitize-review' | 'generate' | 'review' | 'download'

export interface SanitizedEntity {
  type: string
  start: number
  end: number
  text: string
  placeholder: string
}

export interface SanitizedParagraph {
  index: number
  original: string
  sanitized: string
  entities: SanitizedEntity[]
}

export interface ReportMetadata {
  clientName: string
  projectCode: string
  startDate: string
  endDate: string
  scopeSummary: string
}

export interface SanitizationMappings {
  forward: Record<string, string>
  reverse: Record<string, string>
}

export interface ReportChatMessage {
  role: string
  content: string
  timestamp: string
}

/** Entity mapping for the HTML-centric sanitization pipeline. */
export interface EntityMapping {
  originalValue: string
  placeholder: string
  entityType: string
  isManual: boolean
}

/** Supplementary text extracted from DOCX headers, footers, and text boxes. */
export interface SupplementaryText {
  headers: string[]
  footers: string[]
  textBoxes: string[]
}

export interface ReportWizardState {
  sessionId: string
  currentStep: ReportWizardStep
  uploadedFile: {
    originalName: string
    uploadedAt: string
  }
  detectedLanguage: string
  // HTML pipeline
  uploadedHtml: string
  sanitizedHtml: string
  entityMappings: EntityMapping[]
  entityCounterMap: Record<string, Record<string, number>>
  supplementaryText: SupplementaryText
  // Sanitization (backward compat)
  sanitizedParagraphs: SanitizedParagraph[]
  sanitizationMappings: SanitizationMappings
  // Extraction
  findingsJson: Record<string, unknown> | null
  metadata: ReportMetadata
  warnings: string[]
  // Generation
  riskScore: number | null
  complianceScores: Record<string, number> | null
  chartConfigs: Record<string, object> | null
  narrativeSections: Record<string, string> | null
  // Report
  generatedHtml: string | null
  reportPdfJobId: string | null
  reportPdfUrl: string | null
  // Chat
  chatHistory: ReportChatMessage[]
  chatIterationCount: number
  // Timestamps
  createdAt: string
  updatedAt: string
}

/** POST /api/report/upload response (includes sanitization since pipeline auto-completes) */
export interface ReportUploadResponse {
  sessionId: string
  detectedLanguage: string
  sanitizedHtml: string
  entityMappings: EntityMapping[]
  currentStep: ReportWizardStep
}

/** POST /api/report/update-entity-mappings response */
export interface ReportUpdateEntityMappingsResponse {
  sanitizedHtml: string
  entityMappings: EntityMapping[]
}

/** POST /api/report/approve-sanitization response */
export interface ReportExtractResponse {
  findings: Record<string, unknown>[]
  metadata: ReportMetadata
  warnings: string[]
}

/** POST /api/report/update-metadata response */
export interface ReportMetadataResponse {
  metadata: ReportMetadata
}

/** GET /api/report/preview/:sessionId response */
export interface ReportPreviewResponse {
  status: string
  progress: number
  pdfUrl?: string
  error?: string
}

/** GET /api/report/session (active session summary) */
export interface ReportActiveSessionResponse {
  session: {
    sessionId: string
    currentStep: ReportWizardStep
    uploadedFile: {
      originalName: string
      uploadedAt: string
    }
    detectedLanguage: string
    metadata: ReportMetadata
    createdAt: string
    updatedAt: string
  } | null
}

/** SSE event types from /api/report/generate */
export type ReportGenerateSSEEvent =
  | { type: 'stage'; stage: string; progress: number }
  | { type: 'delta'; text: string }
  | { type: 'done'; usage: Record<string, unknown> }
  | { type: 'error'; message: string; retryable: boolean }

/** SSE event types from /api/report/chat */
export type ReportChatSSEEvent =
  | { type: 'delta'; text: string }
  | { type: 'section_update'; sectionKey: string; text: string }
  | { type: 'done'; usage: Record<string, unknown> }
  | { type: 'error'; message: string; retryable: boolean }
