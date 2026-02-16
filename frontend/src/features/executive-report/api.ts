import { apiClient, apiUpload } from '@/lib/api'
import type {
  ReportUploadResponse,
  ReportUpdateEntityMappingsResponse,
  ReportExtractResponse,
  ReportMetadataResponse,
  ReportPreviewResponse,
  ReportWizardState,
  ReportActiveSessionResponse,
  ReportMetadata,
  EntityMapping,
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

/**
 * Executive Report feature API.
 * Maps 1:1 to backend/src/routes/executiveReport.ts endpoints.
 */
export const reportApi = {
  /**
   * Upload a DOCX technical report, auto-sanitize HTML, and create a session.
   * Multipart POST to /api/report/upload with file.
   * Returns sessionId, detectedLanguage, sanitizedHtml, entityMappings, currentStep.
   */
  async uploadReport(file: File): Promise<ReportUploadResponse> {
    const formData = new FormData()
    formData.append('file', file)
    return apiUpload<ReportUploadResponse>('/api/report/upload', formData)
  },

  /**
   * Update entity mappings and re-sanitize HTML.
   * POST /api/report/update-entity-mappings with { sessionId, mappings }
   */
  async updateEntityMappings(
    sessionId: string,
    mappings: EntityMapping[],
  ): Promise<ReportUpdateEntityMappingsResponse> {
    return apiClient<ReportUpdateEntityMappingsResponse>('/api/report/update-entity-mappings', {
      method: 'POST',
      body: JSON.stringify({ sessionId, mappings }),
    })
  },

  /**
   * Lock sanitization and trigger Pass 1 (LLM extraction).
   * POST /api/report/approve-sanitization with { sessionId }
   */
  async approveSanitization(sessionId: string): Promise<ReportExtractResponse> {
    return apiClient<ReportExtractResponse>('/api/report/approve-sanitization', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    })
  },

  /**
   * Update metadata fields before generation.
   * POST /api/report/update-metadata with { sessionId, metadata }
   */
  async updateMetadata(
    sessionId: string,
    metadata: Partial<ReportMetadata>,
  ): Promise<ReportMetadataResponse> {
    return apiClient<ReportMetadataResponse>('/api/report/update-metadata', {
      method: 'POST',
      body: JSON.stringify({ sessionId, metadata }),
    })
  },

  /**
   * Open an SSE stream for the full generation pipeline.
   * POST /api/report/generate with { sessionId }
   * Returns a ReadableStream that emits SSE events.
   *
   * Must use fetch + ReadableStream (not EventSource, which only supports GET).
   */
  async streamGenerate(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    const csrfMatch = document.cookie.match(/(?:^|; )__csrf=([^;]*)/)
    const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : undefined

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
    }

    return fetch(`${API_BASE_URL}/api/report/generate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionId }),
      credentials: 'include',
      signal,
    })
  },

  /**
   * Open an SSE stream for chat corrections in review step.
   * POST /api/report/chat with { sessionId, message }
   * Returns a ReadableStream that emits SSE events.
   */
  async streamChat(
    sessionId: string,
    message: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    const csrfMatch = document.cookie.match(/(?:^|; )__csrf=([^;]*)/)
    const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : undefined

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
    }

    return fetch(`${API_BASE_URL}/api/report/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionId, message }),
      credentials: 'include',
      signal,
    })
  },

  /**
   * Get full report wizard state for a session.
   * GET /api/report/session/:sessionId
   */
  async getSession(sessionId: string): Promise<ReportWizardState> {
    return apiClient<ReportWizardState>(`/api/report/session/${sessionId}`)
  },

  /**
   * Get the user's active report session (most recent).
   * GET /api/report/session
   */
  async getActiveSession(): Promise<ReportActiveSessionResponse> {
    return apiClient<ReportActiveSessionResponse>('/api/report/session')
  },

  /**
   * Delete a report session (reset / start over).
   * DELETE /api/report/session/:sessionId
   */
  async deleteSession(sessionId: string): Promise<{ success: boolean }> {
    return apiClient<{ success: boolean }>(`/api/report/session/${sessionId}`, {
      method: 'DELETE',
    })
  },

  /**
   * Poll PDF preview status for a report.
   * GET /api/report/preview/:sessionId
   */
  async getPreviewStatus(sessionId: string): Promise<ReportPreviewResponse> {
    return apiClient<ReportPreviewResponse>(`/api/report/preview/${sessionId}`)
  },

  /**
   * Download the report as de-sanitized PDF.
   * POST /api/report/download-pdf with { sessionId }
   * De-sanitization is applied server-side using session entity mappings.
   * Returns raw Response for blob download.
   */
  async downloadPdf(sessionId: string): Promise<Response> {
    const csrfMatch = document.cookie.match(/(?:^|; )__csrf=([^;]*)/)
    const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : undefined

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
    }

    return fetch(`${API_BASE_URL}/api/report/download-pdf`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ sessionId }),
      credentials: 'include',
    })
  },
}
