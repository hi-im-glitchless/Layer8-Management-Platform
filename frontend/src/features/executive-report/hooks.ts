import { useState, useCallback, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { reportApi } from './api'
import type {
  ReportMetadata,
  ReportChatMessage,
  ReportGenerateSSEEvent,
  ReportChatSSEEvent,
  EntityMapping,
} from './types'

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Upload a DOCX technical report and create a report wizard session.
 * Returns sanitizedHtml and entityMappings in the response.
 */
export function useUploadReport() {
  return useMutation({
    mutationFn: (file: File) => reportApi.uploadReport(file),
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload report')
    },
  })
}

/**
 * Update entity mappings and re-sanitize HTML.
 */
export function useUpdateEntityMappings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      sessionId,
      mappings,
    }: {
      sessionId: string
      mappings: EntityMapping[]
    }) => reportApi.updateEntityMappings(sessionId, mappings),
    onSuccess: (_data, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['report', 'session', sessionId] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update entity mappings')
    },
  })
}

/**
 * Lock sanitization and trigger Pass 1 (LLM extraction).
 */
export function useApproveSanitization() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => reportApi.approveSanitization(sessionId),
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['report', 'session', sessionId] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to approve sanitization')
    },
  })
}

/**
 * Update metadata fields before generation.
 */
export function useUpdateMetadata() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      sessionId,
      metadata,
    }: {
      sessionId: string
      metadata: Partial<ReportMetadata>
    }) => reportApi.updateMetadata(sessionId, metadata),
    onSuccess: (_data, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['report', 'session', sessionId] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update metadata')
    },
  })
}

/**
 * Delete a report session (reset / start over).
 * Removes cached query data immediately to prevent auto-resume race conditions.
 */
export function useResetReportSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => reportApi.deleteSession(sessionId),
    onSuccess: (_data, sessionId) => {
      queryClient.removeQueries({ queryKey: ['report', 'session', sessionId] })
      queryClient.setQueryData(['report', 'active-session'], { session: null })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reset session')
    },
  })
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Fetch full report wizard session state for restoration / display.
 */
export function useReportSession(sessionId: string | null) {
  return useQuery({
    queryKey: ['report', 'session', sessionId],
    queryFn: () => reportApi.getSession(sessionId!),
    enabled: !!sessionId,
    staleTime: 30_000,
  })
}

/**
 * Check for the user's active report session (for auto-resume).
 */
export function useActiveReportSession() {
  return useQuery({
    queryKey: ['report', 'active-session'],
    queryFn: () => reportApi.getActiveSession(),
    staleTime: 60_000,
  })
}

/**
 * Poll PDF preview status with 2s interval.
 * Stops polling when status is completed or failed.
 */
export function useReportPreviewStatus(sessionId: string | null) {
  return useQuery({
    queryKey: ['report', 'preview-status', sessionId],
    queryFn: () => reportApi.getPreviewStatus(sessionId!),
    enabled: !!sessionId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'completed' || status === 'failed' || status === 'no_job') {
        return false
      }
      return 2000
    },
  })
}

// ---------------------------------------------------------------------------
// SSE Generation Hook
// ---------------------------------------------------------------------------

/**
 * Parse a single SSE line pair (event + data) into a typed generation event.
 */
function parseGenerateSSEEvent(eventType: string, data: string): ReportGenerateSSEEvent | null {
  try {
    const parsed = JSON.parse(data)
    switch (eventType) {
      case 'stage':
        return { type: 'stage', stage: parsed.stage, progress: parsed.progress ?? 0 }
      case 'delta':
        return { type: 'delta', text: parsed.text }
      case 'done':
        return { type: 'done', usage: parsed.usage ?? parsed }
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
 * Custom hook for SSE generation streaming.
 * Tracks stage progression, narrative text accumulation, and error state.
 */
export function useReportGeneration(sessionId: string | null) {
  const [currentStage, setCurrentStage] = useState<string>('')
  const [stageProgress, setStageProgress] = useState<number>(0)
  const [narrativeText, setNarrativeText] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDone, setIsDone] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const startGeneration = useCallback(async () => {
    if (!sessionId || isGenerating) return

    setIsGenerating(true)
    setError(null)
    setIsDone(false)
    setCurrentStage('')
    setStageProgress(0)
    setNarrativeText('')

    const abortController = new AbortController()
    abortRef.current = abortController

    try {
      const response = await reportApi.streamGenerate(sessionId, abortController.signal)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          (errorData as { error?: string }).error || `Generation failed with status ${response.status}`,
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
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6)
            const event = parseGenerateSSEEvent(currentEventType, data)

            if (event) {
              switch (event.type) {
                case 'stage':
                  setCurrentStage(event.stage)
                  setStageProgress(event.progress)
                  break
                case 'delta':
                  setNarrativeText((prev) => prev + event.text)
                  break
                case 'done':
                  setIsDone(true)
                  break
                case 'error':
                  setError(event.message)
                  toast.error(event.message || 'Generation error')
                  break
              }
            }
            currentEventType = ''
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const message = (err as Error).message || 'Generation connection failed'
        setError(message)
        toast.error(message)
      }
    } finally {
      setIsGenerating(false)
      abortRef.current = null
    }
  }, [sessionId, isGenerating])

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return {
    startGeneration,
    cancelGeneration,
    currentStage,
    stageProgress,
    narrativeText,
    isGenerating,
    isDone,
    error,
  }
}

// ---------------------------------------------------------------------------
// SSE Chat Hook
// ---------------------------------------------------------------------------

/**
 * Parse a single SSE line pair (event + data) into a typed chat event.
 */
function parseChatSSEEvent(eventType: string, data: string): ReportChatSSEEvent | null {
  try {
    const parsed = JSON.parse(data)
    switch (eventType) {
      case 'delta':
        return { type: 'delta', text: parsed.text }
      case 'section_update':
        return { type: 'section_update', sectionKey: parsed.sectionKey, text: parsed.text }
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
 * Custom hook for SSE chat corrections in the review step.
 * Same pattern as useAdapterChat but with report-specific event types.
 */
export function useReportChat(sessionId: string | null) {
  const [messages, setMessages] = useState<ReportChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [latestSectionUpdate, setLatestSectionUpdate] = useState<{
    sectionKey: string
    text: string
  } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(
    async (message: string) => {
      if (!sessionId || isStreaming) return

      // Add user message
      const userMsg: ReportChatMessage = {
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsStreaming(true)
      setLatestSectionUpdate(null)

      // Prepare assistant placeholder
      let assistantContent = ''
      const assistantTimestamp = new Date().toISOString()

      const abortController = new AbortController()
      abortRef.current = abortController

      try {
        const response = await reportApi.streamChat(
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
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEventType = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              const data = line.slice(6)
              const event = parseChatSSEEvent(currentEventType, data)

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
                  case 'section_update':
                    setLatestSectionUpdate({
                      sectionKey: event.sectionKey,
                      text: event.text,
                    })
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
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          toast.error((err as Error).message || 'Chat connection failed')
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
    setLatestSectionUpdate(null)
  }, [])

  return {
    messages,
    isStreaming,
    latestSectionUpdate,
    sendMessage,
    cancelStream,
    clearMessages,
  }
}
