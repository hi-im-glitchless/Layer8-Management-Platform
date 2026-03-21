import { apiClient, apiUpload } from '@/lib/api'
import type {
  UploadResponse,
  PdfConversionJob,
  DocumentPreviewResult,
  GhostwriterReport,
  GhostwriterHealth,
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:3001')

/**
 * Documents feature API
 */
export const documentsApi = {
  /**
   * Upload a DOCX file and queue PDF conversion.
   * Returns job ID and initial status.
   */
  async uploadDocument(file: File): Promise<UploadResponse> {
    const formData = new FormData()
    formData.append('file', file)
    return apiUpload<UploadResponse>('/api/documents/convert-pdf', formData)
  },

  /**
   * Poll the status of a PDF conversion job.
   */
  async getPdfJobStatus(jobId: string): Promise<PdfConversionJob> {
    return apiClient<PdfConversionJob>(`/api/documents/convert-pdf/${jobId}`)
  },

  /**
   * Build a full download URL for a document filename.
   */
  downloadUrl(filename: string): string {
    return `${API_BASE_URL}/api/documents/download/${filename}`
  },

  /**
   * Request a template preview: render template with GW data and queue PDF conversion.
   */
  async requestPreview(
    templatePath: string,
    reportId: number,
  ): Promise<DocumentPreviewResult> {
    return apiClient<DocumentPreviewResult>('/api/documents/preview', {
      method: 'POST',
      body: JSON.stringify({ templatePath, reportId }),
    })
  },

  /**
   * Fetch a Ghostwriter report by ID with mapped template context.
   */
  async getGhostwriterReport(reportId: number): Promise<GhostwriterReport> {
    return apiClient<GhostwriterReport>(`/api/ghostwriter/report/${reportId}`)
  },

  /**
   * Check Ghostwriter connectivity and authentication.
   */
  async getGhostwriterHealth(): Promise<GhostwriterHealth> {
    return apiClient<GhostwriterHealth>('/api/ghostwriter/health')
  },
}
