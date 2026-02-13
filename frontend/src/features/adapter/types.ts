/**
 * Template Adapter wizard types.
 * Mirrors backend WizardState and API response shapes.
 */

export type WizardStep = 'upload' | 'analysis' | 'adaptation' | 'preview' | 'download'

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

/** SSE event types from /api/adapter/chat */
export type ChatSSEEvent =
  | { type: 'delta'; text: string }
  | { type: 'mapping_update'; mappingPlan: MappingPlan }
  | { type: 'done'; usage: Record<string, unknown> }
  | { type: 'error'; message: string; retryable: boolean }
