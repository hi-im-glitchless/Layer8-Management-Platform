import { useState, useCallback, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { adapterApi } from './api'
import type {
  TemplateType,
  TemplateLanguage,
  ChatMessage,
  ChatSSEEvent,
  MappingPlan,
  MappingUpdateRequest,
} from './types'

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Upload a DOCX template and create a wizard session.
 */
export function useUploadTemplate() {
  return useMutation({
    mutationFn: ({
      file,
      templateType,
      language,
    }: {
      file: File
      templateType: TemplateType
      language: TemplateLanguage
    }) => adapterApi.uploadTemplate(file, templateType, language),
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload template')
    },
  })
}

/**
 * Run LLM Pass 1 analysis on the uploaded template.
 */
export function useAnalyzeTemplate() {
  return useMutation({
    mutationFn: ({
      file,
      templateType,
      language,
    }: {
      file: File
      templateType: TemplateType
      language: TemplateLanguage
    }) => adapterApi.analyzeTemplate(file, templateType, language),
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to analyze template')
    },
  })
}

/**
 * Run LLM Pass 1 analysis using the template stored in an existing session.
 * Used after page refresh when the File object is no longer available.
 */
export function useAnalyzeFromSession() {
  return useMutation({
    mutationFn: (sessionId: string) => adapterApi.analyzeFromSession(sessionId),
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to analyze template')
    },
  })
}

/**
 * Apply LLM Pass 2 instructions to adapt the template.
 */
export function useApplyInstructions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => adapterApi.applyInstructions(sessionId),
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['adapter', 'session', sessionId] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to apply instructions')
    },
  })
}

/**
 * Request preview generation (render + PDF conversion).
 */
export function useRequestPreview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => adapterApi.requestPreview(sessionId),
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['adapter', 'session', sessionId] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate preview')
    },
  })
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Poll preview status with 2s interval (same pattern as usePdfJobStatus).
 * Stops polling when status is completed or failed.
 */
export function usePreviewStatus(sessionId: string | null) {
  return useQuery({
    queryKey: ['adapter', 'preview-status', sessionId],
    queryFn: () => adapterApi.getPreviewStatus(sessionId!),
    enabled: !!sessionId,
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
 * Fetch full wizard session state for restoration / display.
 */
export function useWizardSession(sessionId: string | null) {
  return useQuery({
    queryKey: ['adapter', 'session', sessionId],
    queryFn: () => adapterApi.getSession(sessionId!),
    enabled: !!sessionId,
    staleTime: 30_000,
  })
}

/**
 * Check for the user's active wizard session (for auto-resume).
 */
export function useActiveSession() {
  return useQuery({
    queryKey: ['adapter', 'active-session'],
    queryFn: () => adapterApi.getActiveSession(),
    staleTime: 60_000,
  })
}

/**
 * Delete a wizard session (reset / start over).
 * Removes cached query data immediately to prevent auto-resume race conditions.
 */
export function useResetSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => adapterApi.deleteSession(sessionId),
    onSuccess: (_data, sessionId) => {
      queryClient.removeQueries({ queryKey: ['adapter', 'session', sessionId] })
      queryClient.setQueryData(['adapter', 'active-session'], { session: null })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reset session')
    },
  })
}

// ---------------------------------------------------------------------------
// Annotated Preview & Mapping Update Hooks (Phase 5.1)
// ---------------------------------------------------------------------------

/**
 * Request annotated preview generation (POST mutation).
 * Returns pdfJobId + tooltipData + unmappedParagraphs + gapSummary.
 */
export function useAnnotatedPreview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => adapterApi.requestAnnotatedPreview(sessionId),
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['adapter', 'annotated-preview', sessionId] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate annotated preview')
    },
  })
}

/**
 * Poll annotated preview PDF status.
 * Reuses the same preview status endpoint (PDF conversion is shared).
 * Stops polling when status is 'completed' or 'failed'.
 */
export function useAnnotatedPreviewStatus(sessionId: string | null, pdfJobId: string | null) {
  return useQuery({
    queryKey: ['adapter', 'annotated-preview-status', sessionId, pdfJobId],
    queryFn: () => adapterApi.getPreviewStatus(sessionId!),
    enabled: !!sessionId && !!pdfJobId,
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
 * Fetch cached annotated preview metadata (for page reload restoration).
 * GET /api/adapter/annotated-preview/:sessionId
 */
export function useCachedAnnotatedPreview(sessionId: string | null) {
  return useQuery({
    queryKey: ['adapter', 'annotated-preview', sessionId],
    queryFn: () => adapterApi.getAnnotatedPreview(sessionId!),
    enabled: !!sessionId,
    staleTime: 60_000,
  })
}

/**
 * Update mapping plan with inline edits or added entries.
 * On success, invalidates session query to refresh mapping plan.
 */
export function useUpdateMapping() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: MappingUpdateRequest) => adapterApi.updateMapping(request),
    onSuccess: (_data, request) => {
      queryClient.invalidateQueries({ queryKey: ['adapter', 'session', request.sessionId] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update mapping')
    },
  })
}

// ---------------------------------------------------------------------------
// SSE Chat Hook
// ---------------------------------------------------------------------------

/**
 * Parse a single SSE line pair (event + data) into a typed event.
 */
function parseSSEEvent(eventType: string, data: string): ChatSSEEvent | null {
  try {
    const parsed = JSON.parse(data)
    switch (eventType) {
      case 'delta':
        return { type: 'delta', text: parsed.text }
      case 'mapping_update':
        return { type: 'mapping_update', mappingPlan: parsed.mappingPlan }
      case 'done':
        return { type: 'done', usage: parsed.usage ?? {} }
      case 'error':
        return { type: 'error', message: parsed.message, retryable: parsed.retryable ?? false }
      default:
        return null
    }
  } catch {
    return null
  }
}

/**
 * Custom hook managing SSE chat connection for iterative feedback.
 * Uses POST + ReadableStream (not EventSource, which is GET-only).
 */
export function useAdapterChat(sessionId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [latestMappingUpdate, setLatestMappingUpdate] = useState<MappingPlan | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(
    async (message: string) => {
      if (!sessionId || isStreaming) return

      // Add user message
      const userMsg: ChatMessage = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsStreaming(true)
      setLatestMappingUpdate(null)

      // Prepare assistant placeholder
      let assistantContent = ''
      const assistantTimestamp = new Date().toISOString()

      // Create abort controller for this stream
      const abortController = new AbortController()
      abortRef.current = abortController

      try {
        const response = await adapterApi.streamChat(
          sessionId,
          message,
          abortController.signal,
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(
            (errorData as { error?: string }).error || `Chat failed with status ${response.status}`,
          )
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('No response stream')

        const decoder = new TextDecoder()
        let buffer = ''
        let currentEventType = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEventType = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              const data = line.slice(6)
              const event = parseSSEEvent(currentEventType, data)

              if (event) {
                switch (event.type) {
                  case 'delta':
                    assistantContent += event.text
                    setMessages((prev) => {
                      const updated = [...prev]
                      const lastIdx = updated.length - 1
                      if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                        updated[lastIdx] = {
                          ...updated[lastIdx],
                          content: assistantContent,
                        }
                      } else {
                        updated.push({
                          role: 'assistant',
                          content: assistantContent,
                          timestamp: assistantTimestamp,
                        })
                      }
                      return updated
                    })
                    break
                  case 'mapping_update':
                    setLatestMappingUpdate(event.mappingPlan)
                    break
                  case 'done':
                    // Stream complete
                    break
                  case 'error':
                    toast.error(event.message || 'Chat error')
                    break
                }
              }
              currentEventType = ''
            }
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          toast.error((error as Error).message || 'Chat connection failed')
          // Add error message to chat
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: 'Connection error. Please try again.',
              timestamp: new Date().toISOString(),
            },
          ])
        }
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [sessionId, isStreaming],
  )

  const cancelStream = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    setLatestMappingUpdate(null)
  }, [])

  return {
    messages,
    isStreaming,
    latestMappingUpdate,
    sendMessage,
    cancelStream,
    clearMessages,
  }
}
