import { useState, useEffect, useCallback, useRef } from 'react'
import { Send, ArrowRight, Brain, RefreshCw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
import { InteractivePdfViewer, type TextSelectionPayload } from './InteractivePdfViewer'
import { PlaceholderNavigator } from './PlaceholderNavigator'
import type {
  TemplateType,
  TemplateLanguage,
  MappingPlan,
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

  // KB badge state
  const [kbPersisted, setKbPersisted] = useState(false)
  const [kbAnimating, setKbAnimating] = useState(false)

  // PlaceholderNavigator state
  const [navigatorOpen, setNavigatorOpen] = useState(false)
  const [scrollTargetPage, setScrollTargetPage] = useState<number | null>(null)

  // Poll placeholder PDF status
  const annotatedStatus = useAnnotatedPreviewStatus(sessionId, placeholderPdfJobId)
  const annotatedPdfUrl = annotatedStatus.data?.pdfUrl ?? null
  const isAnnotatedPdfReady = !!annotatedPdfUrl || annotatedStatus.data?.pdfStatus === 'completed'
  const isAnnotatedPdfFailed = annotatedStatus.data?.pdfStatus === 'failed'

  // Restore cached preview on page reload
  const cachedPreview = useCachedAnnotatedPreview(sessionId)

  // Determine the PDF URL to display
  const displayPdfUrl = annotatedPdfUrl
    ? (annotatedPdfUrl.startsWith('http') ? annotatedPdfUrl : `${API_BASE_URL}${annotatedPdfUrl}`)
    : cachedPreview.data?.pdfUrl
      ? (cachedPreview.data.pdfUrl.startsWith('http') ? cachedPreview.data.pdfUrl : `${API_BASE_URL}${cachedPreview.data.pdfUrl}`)
      : null

  const isPreviewLoading = placeholderPreviewMutation.isPending ||
    (!!placeholderPdfJobId && !isAnnotatedPdfReady && !isAnnotatedPdfFailed) ||
    isRegenerating

  // Auto-trigger placeholder preview on mount
  useEffect(() => {
    if (!hasTriggeredPreview.current && !placeholderPreviewMutation.isPending) {
      hasTriggeredPreview.current = true
      placeholderPreviewMutation.mutate(sessionId, {
        onSuccess: (data) => {
          setPlaceholderPdfJobId(data.pdfJobId)
          setPlaceholders(data.placeholders)
          setPlaceholderCount(data.placeholderCount)
        },
      })
    }
  }, [sessionId, placeholderPreviewMutation])

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
      chat.clearCorrectionState()
    }
  }, [chat.regenerationResult, selectionState, chat])

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

  // Regenerate placeholder preview after corrections (Decision #8: clear selections)
  const handleRegeneratePreview = useCallback(() => {
    selectionState.resetSelections()
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
      // Heuristic: estimate page from paragraph position relative to total placeholders
      const totalParagraphs = placeholders.length > 0
        ? Math.max(...placeholders.map((p) => p.paragraphIndex)) + 1
        : 1
      const totalPages = annotatedStatus.data?.pdfUrl ? 1 : 1 // unknown, default to page estimate
      // Simple heuristic: assume even distribution of paragraphs across pages
      // We use the PDF page count from the viewer if available, otherwise estimate
      const estimatedPages = Math.max(1, Math.ceil(totalParagraphs / 30))
      const estimatedPage = Math.max(1, Math.ceil((paragraphIndex / totalParagraphs) * estimatedPages))
      setScrollTargetPage(estimatedPage)
    },
    [placeholders, annotatedStatus.data?.pdfUrl],
  )

  const handleScrollComplete = useCallback(() => {
    setScrollTargetPage(null)
  }, [])

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
            disabled={!displayPdfUrl || isRegenerating}
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
              error={isAnnotatedPdfFailed ? 'Failed to generate placeholder preview' : undefined}
              onTextSelected={handleTextSelected}
              selections={selectionState.selections}
              isStreaming={chat.isStreaming || isRegenerating}
              mappedCount={placeholderCount}
              scrollTargetPage={scrollTargetPage}
              onScrollComplete={handleScrollComplete}
              className="min-h-[600px]"
            />
            {/* Regeneration spinner overlay */}
            {isRegenerating && (
              <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10">
                <div className="flex items-center gap-2 rounded-lg bg-background px-4 py-2 shadow-md border">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm text-muted-foreground">Regenerating...</span>
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
            <div className="flex items-center gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe corrections, e.g. '#1 should be {{title}}'"
                disabled={chat.isStreaming || isRegenerating}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSendMessage}
                disabled={chat.isStreaming || isRegenerating || !chatInput.trim()}
                aria-label="Send message"
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
