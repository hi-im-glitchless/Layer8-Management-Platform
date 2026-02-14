import { apiClient, apiUpload } from '@/lib/api'
import type {
  TemplateType,
  TemplateLanguage,
  UploadResponse,
  AnalyzeResponse,
  ApplyResponse,
  AutoMapResponse,
  PreviewResponse,
  PreviewStatusResponse,
  WizardState,
  ActiveSessionResponse,
  AnnotatedPreviewResponse,
  AnnotatedPreviewStatus,
  MappingUpdateRequest,
  MappingPlan,
  DocumentStructureResponse,
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

/**
 * Template Adapter feature API.
 * Maps 1:1 to backend/src/routes/templateAdapter.ts endpoints.
 */
export const adapterApi = {
  /**
   * Upload a DOCX template and create a new wizard session.
   * Multipart POST to /api/adapter/upload with file + type + language.
   */
  async uploadTemplate(
    file: File,
    templateType: TemplateType,
    language: TemplateLanguage,
  ): Promise<UploadResponse> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', templateType)
    formData.append('language', language)
    return apiUpload<UploadResponse>('/api/adapter/upload', formData)
  },

  /**
   * Run LLM Pass 1 analysis on an uploaded template.
   * Multipart POST to /api/adapter/analyze with file + type + language.
   */
  async analyzeTemplate(
    file: File,
    templateType: TemplateType,
    language: TemplateLanguage,
  ): Promise<AnalyzeResponse> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', templateType)
    formData.append('language', language)
    return apiUpload<AnalyzeResponse>('/api/adapter/analyze', formData)
  },

  /**
   * Run LLM Pass 1 analysis using the template stored in an existing session.
   * Used after page refresh when the File object is lost.
   */
  async analyzeFromSession(sessionId: string): Promise<AnalyzeResponse> {
    return apiClient<AnalyzeResponse>('/api/adapter/analyze-session', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    })
  },

  /**
   * Apply LLM Pass 2 instructions to the template.
   * POST to /api/adapter/apply with sessionId.
   */
  async applyInstructions(sessionId: string): Promise<ApplyResponse> {
    return apiClient<ApplyResponse>('/api/adapter/apply', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    })
  },

  /**
   * Run auto-map: LLM analysis + placeholder insertion in one shot.
   * POST to /api/adapter/auto-map with sessionId.
   */
  async autoMap(sessionId: string): Promise<AutoMapResponse> {
    return apiClient<AutoMapResponse>('/api/adapter/auto-map', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    })
  },

  /**
   * Request preview of the adapted template with GW dummy data.
   * POST to /api/adapter/preview with sessionId.
   */
  async requestPreview(sessionId: string): Promise<PreviewResponse> {
    return apiClient<PreviewResponse>('/api/adapter/preview', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    })
  },

  /**
   * Poll preview status (PDF conversion progress).
   * GET /api/adapter/preview/:sessionId
   */
  async getPreviewStatus(sessionId: string): Promise<PreviewStatusResponse> {
    return apiClient<PreviewStatusResponse>(`/api/adapter/preview/${sessionId}`)
  },

  /**
   * Build the download URL for the adapted DOCX (with Jinja2 placeholders).
   * Used with <a download> for browser download.
   */
  downloadUrl(sessionId: string): string {
    return `${API_BASE_URL}/api/adapter/download/${sessionId}`
  },

  /**
   * Get full wizard state for a session.
   * GET /api/adapter/session/:sessionId
   */
  async getSession(sessionId: string): Promise<WizardState> {
    return apiClient<WizardState>(`/api/adapter/session/${sessionId}`)
  },

  /**
   * Get the user's active wizard session (most recent).
   * GET /api/adapter/session
   */
  async getActiveSession(): Promise<ActiveSessionResponse> {
    return apiClient<ActiveSessionResponse>('/api/adapter/session')
  },

  /**
   * Delete a wizard session (reset / start over).
   * DELETE /api/adapter/session/:sessionId
   */
  async deleteSession(sessionId: string): Promise<{ success: boolean }> {
    return apiClient<{ success: boolean }>(`/api/adapter/session/${sessionId}`, {
      method: 'DELETE',
    })
  },

  /**
   * Request annotated preview generation (green/yellow paragraph shading).
   * POST /api/adapter/annotated-preview with sessionId.
   * When greenOnly is true, only mapped paragraphs get green shading (no yellow gaps).
   */
  async requestAnnotatedPreview(
    sessionId: string,
    options?: { greenOnly?: boolean },
  ): Promise<AnnotatedPreviewResponse> {
    return apiClient<AnnotatedPreviewResponse>('/api/adapter/annotated-preview', {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        ...(options?.greenOnly ? { greenOnly: true } : {}),
      }),
    })
  },

  /**
   * Get cached annotated preview status (for page reload restoration).
   * GET /api/adapter/annotated-preview/:sessionId
   */
  async getAnnotatedPreview(sessionId: string): Promise<AnnotatedPreviewStatus> {
    return apiClient<AnnotatedPreviewStatus>(`/api/adapter/annotated-preview/${sessionId}`)
  },

  /**
   * Get document structure (all paragraphs including empty/invisible ones).
   * GET /api/adapter/document-structure/:sessionId
   */
  async getDocumentStructure(sessionId: string): Promise<DocumentStructureResponse> {
    return apiClient<DocumentStructureResponse>(`/api/adapter/document-structure/${sessionId}`)
  },

  /**
   * Update mapping plan with inline edits or added entries.
   * POST /api/adapter/update-mapping with sessionId + updates.
   */
  async updateMapping(request: MappingUpdateRequest): Promise<{ mappingPlan: MappingPlan }> {
    return apiClient<{ mappingPlan: MappingPlan }>('/api/adapter/update-mapping', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  },

  /**
   * Open an SSE stream for iterative chat feedback.
   * POST /api/adapter/chat with { sessionId, message }.
   * Returns a ReadableStream that emits SSE events.
   *
   * Must use fetch + ReadableStream (not EventSource, which only supports GET).
   */
  async streamChat(
    sessionId: string,
    message: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    // Read CSRF token from cookie
    const csrfMatch = document.cookie.match(/(?:^|; )__csrf=([^;]*)/)
    const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : undefined

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
    }

    return fetch(`${API_BASE_URL}/api/adapter/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionId, message }),
      credentials: 'include',
      signal,
    })
  },
}
