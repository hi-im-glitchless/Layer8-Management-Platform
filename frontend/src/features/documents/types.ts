export interface UploadResponse {
  id: string
  filename: string
  originalName: string
  size: number
  mimeType: string
}

export interface PdfConversionJob {
  jobId: string
  status: 'queued' | 'active' | 'completed' | 'failed'
  progress?: number
  pdfUrl?: string
  error?: string
}

export interface DocumentPreviewResult {
  docxUrl: string
  pdfJobId: string
}

export interface GhostwriterReport {
  report: { id: number; title: string; creation: string }
  templateContext: Record<string, unknown>
}

export interface GhostwriterHealth {
  available: boolean
  username?: string
}
