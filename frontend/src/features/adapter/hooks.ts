import { useState, useCallback, useReducer, useMemo, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { adapterApi } from './api'
import type {
  TemplateType,
  TemplateLanguage,
  ChatMessage,
  ChatSSEEvent,
  MappingEntry,
  MappingPlan,
  MappingUpdateRequest,
  SelectionEntry,
  SelectionAction,
  SelectionMappingResult,
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
 * Run auto-map: LLM analysis + placeholder insertion in one shot.
 * Used by StepUpload to run the full mapping pipeline after upload.
 */
export function useAutoMap() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => adapterApi.autoMap(sessionId),
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['adapter', 'session', sessionId] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Auto-mapping failed')
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

/**
 * Request placeholder-styled preview of the adapted DOCX.
 * Shows Jinja expressions with light blue backgrounds for verification.
 */
export function usePlaceholderPreview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => adapterApi.requestPlaceholderPreview(sessionId),
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['adapter', 'annotated-preview', sessionId] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate placeholder preview')
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
export function useAnnotatedPreview(options?: { greenOnly?: boolean }) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) =>
      adapterApi.requestAnnotatedPreview(sessionId, { greenOnly: options?.greenOnly }),
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
    queryFn: () => adapterApi.getAnnotatedPreview(sessionId!),
    enabled: !!sessionId && !!pdfJobId,
    refetchInterval: (query) => {
      const data = query.state.data
      const pdfUrl = data?.pdfUrl
      // Stop polling once we have a PDF URL or if it failed
      if (pdfUrl) return false
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
    staleTime: 5_000,
    // Poll every 3s until we have a pdfUrl (handles mutation response loss)
    refetchInterval: (query) => {
      if (query.state.data?.pdfUrl) return false
      return 3_000
    },
  })
}

/**
 * Fetch document structure (all paragraphs including empty/invisible ones).
 * staleTime=Infinity because the DOCX doesn't change within a session.
 * Result is cached server-side in wizard state after first fetch.
 */
export function useDocumentStructure(sessionId: string | null) {
  return useQuery({
    queryKey: ['adapter', 'document-structure', sessionId],
    queryFn: () => adapterApi.getDocumentStructure(sessionId!),
    enabled: !!sessionId,
    staleTime: Infinity,
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
// Interactive PDF Selection State (Phase 5.2)
// ---------------------------------------------------------------------------

interface SelectionState {
  selections: SelectionEntry[]
  nextNumber: number
}

const initialSelectionState: SelectionState = {
  selections: [],
  nextNumber: 1,
}

function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case 'add': {
      const newEntry: SelectionEntry = {
        ...action.entry,
        id: crypto.randomUUID(),
        selectionNumber: state.nextNumber,
        status: 'pending',
        gwField: null,
        markerType: null,
        confidence: null,
      }
      return {
        selections: [...state.selections, newEntry],
        nextNumber: state.nextNumber + 1,
      }
    }
    case 'remove': {
      const remaining = state.selections.filter((s) => s.id !== action.id)
      // Recalculate nextNumber so removed trailing numbers get reused
      const maxNum = remaining.reduce((max, s) => Math.max(max, s.selectionNumber), 0)
      return {
        selections: remaining,
        nextNumber: remaining.length === 0 ? 1 : maxNum + 1,
      }
    }
    case 'confirm':
      return {
        ...state,
        selections: state.selections.map((s) =>
          s.id === action.id ? { ...s, status: 'confirmed' as const } : s,
        ),
      }
    case 'reject':
      return {
        ...state,
        selections: state.selections.map((s) =>
          s.id === action.id ? { ...s, status: 'rejected' as const } : s,
        ),
      }
    case 'update_mapping':
      return {
        ...state,
        selections: state.selections.map((s) =>
          s.selectionNumber === action.selectionNumber
            ? { ...s, gwField: action.gwField, markerType: action.markerType, confidence: action.confidence }
            : s,
        ),
      }
    case 'reset':
      return initialSelectionState
    default:
      return state
  }
}

/**
 * Manages numbered text selections on the interactive PDF viewer.
 * Auto-increments selection numbers that remain stable on removal.
 *
 * NOTE (Phase 5.4): StepVerify no longer uses this hook. PDF text selections
 * now add rows directly to the mapping table. This hook is retained for
 * InteractivePdfViewer overlay rendering compatibility.
 */
export function useSelectionState() {
  const [state, dispatch] = useReducer(selectionReducer, initialSelectionState)

  const addSelection = useCallback(
    (entry: Omit<SelectionEntry, 'id' | 'selectionNumber' | 'status' | 'gwField' | 'markerType' | 'confidence'>) => {
      const num = state.nextNumber
      dispatch({ type: 'add', entry })
      toast.success(`#${num} added`)
    },
    [state.nextNumber],
  )

  const removeSelection = useCallback((id: string) => {
    dispatch({ type: 'remove', id })
  }, [])

  const updateSelectionMapping = useCallback(
    (selectionNumber: number, gwField: string, markerType: string, confidence: number) => {
      dispatch({ type: 'update_mapping', selectionNumber, gwField, markerType, confidence })
    },
    [],
  )

  const resetSelections = useCallback(() => {
    dispatch({ type: 'reset' })
  }, [])

  const counter = useMemo(
    () => ({
      confirmed: state.selections.filter((s) => s.status === 'confirmed').length,
      total: state.selections.length,
    }),
    [state.selections],
  )

  return {
    selections: state.selections,
    nextNumber: state.nextNumber,
    counter,
    addSelection,
    removeSelection,
    updateSelectionMapping,
    resetSelections,
  }
}

// ---------------------------------------------------------------------------
// Selection-to-MappingPlan Sync (Phase 5.2)
// ---------------------------------------------------------------------------

/**
 * Convert a confirmed SelectionEntry into a MappingEntry.
 * Only valid for selections with gwField/markerType/confidence set.
 */
function selectionToMappingEntry(sel: SelectionEntry): MappingEntry | null {
  if (!sel.gwField || !sel.markerType || sel.confidence === null) return null
  return {
    sectionIndex: sel.paragraphIndex,
    sectionText: sel.text,
    gwField: sel.gwField,
    placeholderTemplate: `{{ ${sel.gwField} }}`,
    confidence: sel.confidence,
    markerType: sel.markerType,
    rationale: `User-confirmed mapping from selection #${sel.selectionNumber}`,
  }
}

/**
 * Convert an array of confirmed selections into MappingEntry objects.
 * Filters out selections missing required mapping fields.
 */
export function confirmedSelectionsToMappingEntries(
  selections: SelectionEntry[],
): MappingEntry[] {
  return selections
    .filter((s) => s.status === 'confirmed')
    .map(selectionToMappingEntry)
    .filter((entry): entry is MappingEntry => entry !== null)
}

/**
 * Merge new entries into an existing MappingPlan, deduplicating by sectionIndex (paragraphIndex).
 * New entries overwrite existing entries at the same sectionIndex.
 */
function mergeIntoMappingPlan(
  existing: MappingPlan,
  newEntries: MappingEntry[],
): MappingPlan {
  const byIndex = new Map<number, MappingEntry>()

  // Existing entries first
  for (const entry of existing.entries) {
    byIndex.set(entry.sectionIndex, entry)
  }
  // New entries overwrite
  for (const entry of newEntries) {
    byIndex.set(entry.sectionIndex, entry)
  }

  return {
    ...existing,
    entries: Array.from(byIndex.values()).sort((a, b) => a.sectionIndex - b.sectionIndex),
  }
}

/**
 * Hook that bridges confirmed selections into MappingPlan entries.
 * Call syncConfirmedSelections() after accepting/confirming selections
 * to merge them into the current mapping plan.
 */
export function useSelectionToMappingSync(currentPlan: MappingPlan | null) {
  const [mergedPlan, setMergedPlan] = useState<MappingPlan | null>(currentPlan)

  // Update merged plan when the upstream plan changes
  const syncConfirmedSelections = useCallback(
    (selections: SelectionEntry[]) => {
      const newEntries = confirmedSelectionsToMappingEntries(selections)
      if (newEntries.length === 0) return

      const basePlan: MappingPlan = mergedPlan ?? currentPlan ?? {
        entries: [],
        templateType: 'web',
        language: 'en',
        warnings: [],
      }

      setMergedPlan(mergeIntoMappingPlan(basePlan, newEntries))
    },
    [mergedPlan, currentPlan],
  )

  // Reset when upstream plan changes (e.g., after re-analysis)
  const resetMergedPlan = useCallback(() => {
    setMergedPlan(currentPlan)
  }, [currentPlan])

  return {
    /** The merged mapping plan including confirmed selections */
    mergedPlan: mergedPlan ?? currentPlan,
    /** Sync confirmed selections into the merged plan */
    syncConfirmedSelections,
    /** Reset the merged plan back to the upstream plan */
    resetMergedPlan,
  }
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
      case 'selection_mapping':
        return {
          type: 'selection_mapping',
          selectionNumber: parsed.selectionNumber,
          gwField: parsed.gwField,
          markerType: parsed.markerType,
          confidence: parsed.confidence,
          rationale: parsed.rationale,
        }
      case 'batch_complete':
        return {
          type: 'batch_complete',
          resolvedCount: parsed.resolvedCount,
          totalCount: parsed.totalCount,
        }
      case 'correction_result':
        return {
          type: 'correction_result',
          mappingPlan: parsed.mappingPlan,
        }
      case 'regeneration_complete':
        return {
          type: 'regeneration_complete',
          pdfJobId: parsed.pdfJobId,
          placeholderCount: parsed.placeholderCount,
        }
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
  const [selectionMappings, setSelectionMappings] = useState<Map<number, SelectionMappingResult>>(new Map())
  const [isBatchComplete, setIsBatchComplete] = useState(false)
  const [latestCorrectionResult, setLatestCorrectionResult] = useState<MappingPlan | null>(null)
  const [regenerationResult, setRegenerationResult] = useState<{ pdfJobId: string; placeholderCount: number } | null>(null)
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
      setSelectionMappings(new Map())
      setIsBatchComplete(false)
      setLatestCorrectionResult(null)
      setRegenerationResult(null)

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
                  case 'selection_mapping':
                    setSelectionMappings((prev) => {
                      const updated = new Map(prev)
                      updated.set(event.selectionNumber, {
                        gwField: event.gwField,
                        markerType: event.markerType,
                        confidence: event.confidence,
                        rationale: event.rationale,
                      })
                      return updated
                    })
                    break
                  case 'batch_complete':
                    setIsBatchComplete(true)
                    break
                  case 'correction_result':
                    setLatestCorrectionResult(event.mappingPlan)
                    break
                  case 'regeneration_complete':
                    setRegenerationResult({
                      pdfJobId: event.pdfJobId,
                      placeholderCount: event.placeholderCount,
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
    setSelectionMappings(new Map())
    setIsBatchComplete(false)
    setLatestCorrectionResult(null)
    setRegenerationResult(null)
  }, [])

  const clearSelectionMappings = useCallback(() => {
    setSelectionMappings(new Map())
    setIsBatchComplete(false)
  }, [])

  const clearCorrectionState = useCallback(() => {
    setLatestCorrectionResult(null)
    setRegenerationResult(null)
  }, [])

  return {
    messages,
    isStreaming,
    latestMappingUpdate,
    selectionMappings,
    isBatchComplete,
    latestCorrectionResult,
    regenerationResult,
    sendMessage,
    cancelStream,
    clearMessages,
    clearSelectionMappings,
    clearCorrectionState,
  }
}
