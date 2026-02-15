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

export interface ReportWizardState {
  sessionId: string
  currentStep: ReportWizardStep
  uploadedFile: {
    originalName: string
    uploadedAt: string
  }
  detectedLanguage: string
  sanitizedParagraphs: SanitizedParagraph[]
  denyListTerms: string[]
  sanitizationMappings: SanitizationMappings
  findingsJson: Record<string, unknown> | null
  metadata: ReportMetadata
  warnings: string[]
  riskScore: number | null
  complianceScores: Record<string, number> | null
  chartData: Record<string, unknown> | null
  narrativeSections: Record<string, string> | null
  reportDocxPath: string | null
  reportPdfJobId: string | null
  reportPdfUrl: string | null
  chatHistory: ReportChatMessage[]
  chatIterationCount: number
  createdAt: string
  updatedAt: string
}

/** POST /api/report/upload response */
export interface ReportUploadResponse {
  sessionId: string
  detectedLanguage: string
  currentStep: ReportWizardStep
}

/** POST /api/report/sanitize response */
export interface ReportSanitizeResponse {
  sanitizedParagraphs: SanitizedParagraph[]
  sanitizationMappings: SanitizationMappings
}

/** POST /api/report/update-deny-list response */
export interface ReportDenyListResponse {
  updatedParagraphs: SanitizedParagraph[]
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
