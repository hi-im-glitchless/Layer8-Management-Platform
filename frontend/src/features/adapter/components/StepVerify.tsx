import { useState, useEffect, useCallback, useRef } from 'react'
import { Send, ArrowRight, Brain, RefreshCw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip as TooltipUI,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'
import {
  usePlaceholderPreview,
  useAnnotatedPreviewStatus,
  useCachedAnnotatedPreview,
  useAdapterChat,
  useSelectionState,
} from '../hooks'
import { adapterApi } from '../api'
import { InteractivePdfViewer, type TextSelectionPayload } from './InteractivePdfViewer'
import { PlaceholderNavigator } from './PlaceholderNavigator'
import type {
  TemplateType,
  TemplateLanguage,
  MappingPlan,
  MappingEntry,
  PlaceholderInfo,
} from '../types'

interface StepVerifyProps {
  sessionId: string
  templateType: TemplateType
  language: TemplateLanguage
  initialMappingPlan: MappingPlan | null
  onMappingUpdate: (plan: MappingPlan) => void
  onApprove: () => void
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function StepVerify({
  sessionId,
  templateType,
  language,
  initialMappingPlan,
  onMappingUpdate,
  onApprove,
}: StepVerifyProps) {
  const [mappingPlan, setMappingPlan] = useState<MappingPlan | null>(initialMappingPlan)
  const [chatInput, setChatInput] = useState('')
  const [placeholderPdfJobId, setPlaceholderPdfJobId] = useState<string | null>(null)
  const [placeholders, setPlaceholders] = useState<PlaceholderInfo[]>([])
  const [placeholderCount, setPlaceholderCount] = useState(0)
  const [previewOutdated, setPreviewOutdated] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)

  const placeholderPreviewMutation = usePlaceholderPreview()
  const chat = useAdapterChat(sessionId)
  const selectionState = useSelectionState()
  const hasTriggeredPreview = useRef(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Track the original mapping plan (from auto-map) to always diff against
  // the LLM's original output, not intermediate edits
  const originalMappingPlanRef = useRef<MappingPlan | null>(initialMappingPlan)

  // KB badge state
  const [kbPersisted, setKbPersisted] = useState(false)
  const [kbAnimating, setKbAnimating] = useState(false)

  // PlaceholderNavigator state
  const [navigatorOpen, setNavigatorOpen] = useState(false)
  const [scrollTargetPage, setScrollTargetPage] = useState<number | null>(null)
  const [scrollTargetText, setScrollTargetText] = useState<string | null>(null)

  // Restore cached preview on page reload (polls server for existing annotated preview state)
  const cachedPreview = useCachedAnnotatedPreview(sessionId)

  // Derive pdfJobId from either mutation result or cached wizard state.
  // This ensures we can poll for PDF status even if the mutation response was lost
  // (e.g., due to server restart during fetch).
  const effectivePdfJobId = placeholderPdfJobId ?? cachedPreview.data?.pdfJobId ?? null

  // Poll placeholder PDF status using whichever pdfJobId is available
  const annotatedStatus = useAnnotatedPreviewStatus(sessionId, effectivePdfJobId)
  const annotatedPdfUrl = annotatedStatus.data?.pdfUrl ?? null
  const isAnnotatedPdfReady = !!annotatedPdfUrl || annotatedStatus.data?.pdfStatus === 'completed'
  const isAnnotatedPdfFailed = annotatedStatus.data?.pdfStatus === 'failed'

  // Determine the PDF URL to display
  const displayPdfUrl = annotatedPdfUrl
    ? (annotatedPdfUrl.startsWith('http') ? annotatedPdfUrl : `${API_BASE_URL}${annotatedPdfUrl}`)
    : cachedPreview.data?.pdfUrl
      ? (cachedPreview.data.pdfUrl.startsWith('http') ? cachedPreview.data.pdfUrl : `${API_BASE_URL}${cachedPreview.data.pdfUrl}`)
      : null

  // Loading: mutation pending (but not if we already have a display URL from cache),
  // or waiting for PDF conversion, or regenerating
  const isPreviewLoading = (placeholderPreviewMutation.isPending && !displayPdfUrl) ||
    (!!effectivePdfJobId && !isAnnotatedPdfReady && !isAnnotatedPdfFailed && !displayPdfUrl) ||
    isRegenerating

  // Derive a meaningful error message for display
  const previewError = placeholderPreviewMutation.isError && !displayPdfUrl
    ? (placeholderPreviewMutation.error as Error)?.message || 'Failed to generate placeholder preview'
    : isAnnotatedPdfFailed && !displayPdfUrl
      ? 'Failed to convert placeholder preview to PDF'
      : undefined

  // Auto-trigger placeholder preview on mount
  useEffect(() => {
    if (hasTriggeredPreview.current || placeholderPreviewMutation.isPending) return
    hasTriggeredPreview.current = true
    placeholderPreviewMutation.mutate(sessionId, {
      onSuccess: (data) => {
        setPlaceholderPdfJobId(data.pdfJobId)
        setPlaceholders(data.placeholders)
        setPlaceholderCount(data.placeholderCount)
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Sync placeholders from cached preview when mutation didn't provide them
  // (handles case where mutation response was lost but backend completed)
  useEffect(() => {
    if (placeholders.length > 0) return // already have placeholders from mutation
    const cached = cachedPreview.data
    if (cached?.placeholders?.length) {
      setPlaceholders(cached.placeholders)
      setPlaceholderCount(cached.placeholderCount)
    }
  }, [placeholders.length, cachedPreview.data])

  // Watch for mapping updates from chat (standard chat flow returns updated mapping plan)
  useEffect(() => {
    if (chat.latestMappingUpdate) {
      setMappingPlan(chat.latestMappingUpdate)
      onMappingUpdate(chat.latestMappingUpdate)
      setPreviewOutdated(true)
    }
  }, [chat.latestMappingUpdate, onMappingUpdate])

  // Watch for correction_result SSE event (correction flow: mapping plan updated)
  useEffect(() => {
    if (chat.latestCorrectionResult) {
      setMappingPlan(chat.latestCorrectionResult)
      onMappingUpdate(chat.latestCorrectionResult)
      setIsRegenerating(true) // backend is now regenerating DOCX + PDF
    }
  }, [chat.latestCorrectionResult, onMappingUpdate])

  // Watch for regeneration_complete SSE event (new PDF ready)
  useEffect(() => {
    if (chat.regenerationResult) {
      setPlaceholderPdfJobId(chat.regenerationResult.pdfJobId)
      setPlaceholderCount(chat.regenerationResult.placeholderCount)
      selectionState.resetSelections() // Decision #7: clear selections on regeneration
      setPreviewOutdated(false)
      setIsRegenerating(false)
      toast.success('Placeholders updated -- review the changes')
      toast.info('Selections cleared -- review fresh PDF', { duration: 3000 })
      chat.clearCorrectionState()
    }
  }, [chat.regenerationResult, selectionState, chat])

  // When chat stream finishes and we're still regenerating (regen failed),
  // reset the regenerating state and show Refresh Preview button
  useEffect(() => {
    if (!chat.isStreaming && isRegenerating && !chat.regenerationResult) {
      // Stream ended without a regeneration_complete event — regen failed
      setIsRegenerating(false)
      setPreviewOutdated(true)
    }
  }, [chat.isStreaming, isRegenerating, chat.regenerationResult])

  // Watch for selection_mapping SSE events (batch mapping flow)
  useEffect(() => {
    if (chat.selectionMappings.size === 0) return
    for (const [selNum, result] of chat.selectionMappings) {
      selectionState.updateSelectionMapping(
        selNum,
        result.gwField,
        result.markerType,
        result.confidence,
      )
    }
  }, [chat.selectionMappings, selectionState])

  // Watch for batch_complete event
  useEffect(() => {
    if (chat.isBatchComplete) {
      const resolvedCount = chat.selectionMappings.size
      toast.success(`${resolvedCount} corrections resolved -- review results`)
    }
  }, [chat.isBatchComplete, chat.selectionMappings.size])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [chat.messages])

  const handleSendMessage = useCallback(() => {
    const trimmed = chatInput.trim()
    if (!trimmed) return
    chat.clearSelectionMappings()
    chat.clearCorrectionState()
    chat.sendMessage(trimmed)
    setChatInput('')
  }, [chatInput, chat])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSendMessage()
      }
    },
    [handleSendMessage],
  )

  // Handle text selection from InteractivePdfViewer
  const handleTextSelected = useCallback(
    (selection: TextSelectionPayload) => {
      selectionState.addSelection({
        paragraphIndex: selection.paragraphIndex,
        text: selection.text,
        boundingRect: {
          top: selection.boundingRect.top,
          left: selection.boundingRect.left,
          width: selection.boundingRect.width,
          height: selection.boundingRect.height,
          pageNumber: selection.pageNumber,
        },
        pageNumber: selection.pageNumber,
      })
    },
    [selectionState],
  )

  // Retry placeholder preview generation (after error)
  // Re-applies the mapping plan first (deterministic, no LLM), then generates preview.
  const handleRetryPreview = useCallback(async () => {
    placeholderPreviewMutation.reset()
    try {
      await adapterApi.reapplyMappingPlan(sessionId)
    } catch {
      // Reapply failed — still try preview from existing DOCX
    }
    placeholderPreviewMutation.mutate(sessionId, {
      onSuccess: (data) => {
        setPlaceholderPdfJobId(data.pdfJobId)
        setPlaceholders(data.placeholders)
        setPlaceholderCount(data.placeholderCount)
      },
    })
  }, [sessionId, placeholderPreviewMutation])

  // Regenerate placeholder preview after corrections (Decision #8: clear selections)
  // Re-applies the mapping plan first (deterministic, no LLM), then generates preview.
  const handleRegeneratePreview = useCallback(async () => {
    selectionState.resetSelections()
    try {
      await adapterApi.reapplyMappingPlan(sessionId)
    } catch {
      // Reapply failed — still try preview from existing DOCX
    }
    placeholderPreviewMutation.mutate(sessionId, {
      onSuccess: (data) => {
        setPlaceholderPdfJobId(data.pdfJobId)
        setPlaceholders(data.placeholders)
        setPlaceholderCount(data.placeholderCount)
        setPreviewOutdated(false)
      },
    })
  }, [sessionId, placeholderPreviewMutation, selectionState])

  // KB badge animation trigger
  const triggerKbAnimation = useCallback(() => {
    setKbPersisted(true)
    setKbAnimating(true)
    const timer = setTimeout(() => setKbAnimating(false), 600)
    return () => clearTimeout(timer)
  }, [])
  void triggerKbAnimation // wired in download step

  // Jump to a placeholder's approximate page in the PDF
  const handleJumpToPlaceholder = useCallback(
    (paragraphIndex: number) => {
      // Find the placeholder text for this paragraph index and search for it in the PDF text layer
      const match = placeholders.find((p) => p.paragraphIndex === paragraphIndex)
      if (match) {
        setScrollTargetText(match.placeholderText)
      }
    },
    [placeholders],
  )

  const handleScrollComplete = useCallback(() => {
    setScrollTargetPage(null)
    setScrollTargetText(null)
  }, [])

  /**
   * Handle table-based mapping plan edits. Compares updated entries against
   * the original auto-map output, builds a corrections array, and fires off
   * a correction update to the backend KB (fire-and-forget).
   */
  const handleMappingPlanChange = useCallback(
    (updatedPlan: MappingPlan) => {
      const original = originalMappingPlanRef.current
      if (!original) {
        // No original to diff against -- just update state
        setMappingPlan(updatedPlan)
        onMappingUpdate(updatedPlan)
        setPreviewOutdated(true)
        return
      }

      // Build a lookup of original entries by sectionIndex
      const originalByIndex = new Map<number, MappingEntry>()
      for (const entry of original.entries) {
        originalByIndex.set(entry.sectionIndex, entry)
      }

      // Detect changed entries
      const corrections: Array<{
        sectionIndex: number
        oldGwField: string
        newGwField: string
        newMarkerType: string
        sectionText: string
      }> = []

      for (const updated of updatedPlan.entries) {
        const orig = originalByIndex.get(updated.sectionIndex)
        if (!orig) continue // new entry, no correction to track
        if (orig.gwField !== updated.gwField || orig.markerType !== updated.markerType) {
          corrections.push({
            sectionIndex: updated.sectionIndex,
            oldGwField: orig.gwField,
            newGwField: updated.gwField,
            newMarkerType: updated.markerType,
            sectionText: updated.sectionText,
          })
        }
      }

      // Update local state
      setMappingPlan(updatedPlan)
      onMappingUpdate(updatedPlan)
      setPreviewOutdated(true)

      // Fire-and-forget: send corrections to backend KB
      if (corrections.length > 0) {
        adapterApi.correctionUpdate(sessionId, corrections).catch((err) => {
          console.error('[StepVerify] KB correction update failed (non-blocking):', err)
        })
      }
    },
    [sessionId, onMappingUpdate],
  )

  return (
    <div className="space-y-4">
      {/* Toolbar: placeholder count, KB badge, Approve button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {placeholderCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {placeholderCount} placeholders
            </Badge>
          )}
          <PlaceholderNavigator
            placeholders={placeholders}
            isOpen={navigatorOpen}
            onToggle={() => setNavigatorOpen((prev) => !prev)}
            onJumpToPlaceholder={handleJumpToPlaceholder}
          />
          {previewOutdated && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegeneratePreview}
              disabled={placeholderPreviewMutation.isPending}
            >
              <RefreshCw className="h-3 w-3 mr-1" aria-hidden="true" />
              Refresh Preview
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* KB Badge */}
          <TooltipProvider>
            <TooltipUI>
              <TooltipTrigger asChild>
                <div
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground transition-transform ${
                    kbAnimating ? 'scale-125 text-green-600' : ''
                  }`}
                >
                  <Brain className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>KB</span>
                  {kbPersisted && (
                    <span className="text-green-600 font-medium">+1</span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                Mappings saved to knowledge base for future template analyses
              </TooltipContent>
            </TooltipUI>
          </TooltipProvider>
          <Button
            variant="gradient"
            size="sm"
            onClick={onApprove}
            disabled={!displayPdfUrl || isRegenerating || chat.isStreaming || isPreviewLoading}
          >
            Approve &amp; Continue
            <ArrowRight className="h-3 w-3 ml-1" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Main grid: PDF viewer + Chat panel */}
      <div className="grid gap-4 grid-cols-[1fr_320px]">
        {/* Left: Interactive PDF Viewer */}
        <Card className="overflow-hidden relative">
          <CardContent className="p-0">
            <InteractivePdfViewer
              url={displayPdfUrl}
              isLoading={isPreviewLoading}
              error={previewError}
              onTextSelected={handleTextSelected}
              selections={selectionState.selections}
              onAccept={selectionState.confirmSelection}
              onReject={selectionState.rejectSelection}
              onRemove={selectionState.removeSelection}
              isStreaming={chat.isStreaming || isRegenerating}
              mappedCount={placeholderCount}
              scrollTargetPage={scrollTargetPage}
              scrollTargetText={scrollTargetText}
              onScrollComplete={handleScrollComplete}
              className="min-h-[600px]"
            />
            {/* Error overlay with retry */}
            {placeholderPreviewMutation.isError && !displayPdfUrl && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
                <div className="flex flex-col items-center gap-3 rounded-lg bg-background px-6 py-4 shadow-md border max-w-sm text-center">
                  <p className="text-sm font-medium text-destructive">Failed to generate preview</p>
                  <p className="text-xs text-muted-foreground">
                    {(placeholderPreviewMutation.error as Error)?.message || 'Unknown error'}
                  </p>
                  <Button variant="outline" size="sm" onClick={handleRetryPreview}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                    Retry
                  </Button>
                </div>
              </div>
            )}
            {/* Regeneration spinner overlay */}
            {(isRegenerating || (chat.isStreaming && chat.latestCorrectionResult)) && (
              <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10">
                <div className="flex items-center gap-2 rounded-lg bg-background px-4 py-2 shadow-md border">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm text-muted-foreground">
                    {isRegenerating ? 'Regenerating placeholders...' : 'Processing corrections...'}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Chat Panel (always visible, Decision #12) */}
        <Card className="flex flex-col max-h-[700px]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Correction Chat</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col min-h-0">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-[200px]">
              {chat.messages.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">
                  Describe corrections, e.g. &apos;#1 should be {'{{'}title{'}}'}, #2 remove this&apos;
                </p>
              )}
              {chat.messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
              {chat.isStreaming && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <span className="inline-block w-1.5 h-4 bg-foreground/50 animate-pulse" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="flex items-end gap-2">
              <Textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe corrections... (Shift+Enter for newline)"
                disabled={chat.isStreaming || isRegenerating}
                className="flex-1 min-h-[40px] max-h-[120px] resize-none"
                rows={2}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSendMessage}
                disabled={chat.isStreaming || isRegenerating || !chatInput.trim()}
                aria-label="Send message"
                className="shrink-0 mb-0.5"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
