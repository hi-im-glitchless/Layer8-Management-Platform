import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { documentsApi } from './api'

/**
 * Upload a document (DOCX) and queue PDF conversion.
 * Returns mutation with jobId on success.
 */
export function useUploadDocument() {
  return useMutation({
    mutationFn: (file: File) => documentsApi.uploadDocument(file),
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload document')
    },
  })
}

/**
 * Poll PDF conversion job status.
 * Refetches every 2s while queued/active, stops when completed/failed.
 */
export function usePdfJobStatus(jobId: string | null) {
  return useQuery({
    queryKey: ['documents', 'pdf-job', jobId],
    queryFn: () => documentsApi.getPdfJobStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'completed' || status === 'failed') {
        return false
      }
      return 2000
    },
  })
}

/**
 * Request a template preview (render + PDF conversion).
 */
export function useDocumentPreview() {
  return useMutation({
    mutationFn: ({ templatePath, reportId }: { templatePath: string; reportId: number }) =>
      documentsApi.requestPreview(templatePath, reportId),
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate preview')
    },
  })
}

/**
 * Fetch Ghostwriter report data by ID.
 */
export function useGhostwriterReport(reportId: number | null) {
  return useQuery({
    queryKey: ['ghostwriter', 'report', reportId],
    queryFn: () => documentsApi.getGhostwriterReport(reportId!),
    enabled: !!reportId && reportId > 0,
  })
}

/**
 * Check Ghostwriter service health.
 */
export function useGhostwriterHealth() {
  return useQuery({
    queryKey: ['ghostwriter', 'health'],
    queryFn: () => documentsApi.getGhostwriterHealth(),
    staleTime: 60_000, // Cache health check for 1 minute
  })
}
