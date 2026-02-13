import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Send, ArrowRight, RefreshCw, Eye, Table2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PdfPreview } from '@/components/ui/pdf-preview'
import {
  useAnalyzeTemplate,
  useAnalyzeFromSession,
  useAdapterChat,
  useWizardSession,
  useAnnotatedPreview,
  useAnnotatedPreviewStatus,
  useCachedAnnotatedPreview,
  useUpdateMapping,
} from '../hooks'
import { adapterApi } from '../api'
import { MappingTable } from './MappingTable'
import { AnalysisProgressDisplay } from './AnalysisProgress'
import type {
  TemplateType,
  TemplateLanguage,
  MappingPlan,
  TooltipEntry,
  UnmappedParagraph,
  GapSummary,
} from '../types'

interface StepAnalysisProps {
  sessionId: string
  file: File | null
  templateType: TemplateType
  language: TemplateLanguage
  initialMappingPlan: MappingPlan | null
  onMappingUpdate: (plan: MappingPlan) => void
  onProceed: () => void
}

/** Format seconds as "Xm Ys" or "Xs" */
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

export function StepAnalysis({
  sessionId,
  file,
  templateType,
  language,
  initialMappingPlan,
  onMappingUpdate,
  onProceed,
}: StepAnalysisProps) {
  const [mappingPlan, setMappingPlan] = useState<MappingPlan | null>(initialMappingPlan)
  const [chatInput, setChatInput] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [analysisStep, setAnalysisStep] = useState(0)
  const [previewOutdated, setPreviewOutdated] = useState(false)
  const [tooltipData, setTooltipData] = useState<TooltipEntry[]>([])
  const [unmappedParagraphs, setUnmappedParagraphs] = useState<UnmappedParagraph[]>([])
  const [gapSummary, setGapSummary] = useState<GapSummary | null>(null)
  const [annotatedPdfJobId, setAnnotatedPdfJobId] = useState<string | null>(null)

  const analyzeMutation = useAnalyzeTemplate()
  const analyzeFromSessionMutation = useAnalyzeFromSession()
  const annotatedPreviewMutation = useAnnotatedPreview()
  const updateMappingMutation = useUpdateMapping()
  const chat = useAdapterChat(sessionId)
  const hasTriggeredAnalysis = useRef(false)
  const hasTriggeredPreview = useRef(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  // Note: analysisStartRef removed — start time now persisted in sessionStorage

  // Poll annotated preview PDF status
  const annotatedStatus = useAnnotatedPreviewStatus(sessionId, annotatedPdfJobId)
  const annotatedPdfUrl = annotatedStatus.data?.pdfUrl ?? null
  const isAnnotatedPdfReady = !!annotatedPdfUrl || annotatedStatus.data?.pdfStatus === 'completed'
  const isAnnotatedPdfFailed = annotatedStatus.data?.pdfStatus === 'failed'

  // Restore cached annotated preview on page reload
  const cachedPreview = useCachedAnnotatedPreview(sessionId)

  // The active mutation (either file-based or session-based)
  const isAnalyzing = analyzeMutation.isPending || analyzeFromSessionMutation.isPending
  const analyzeError = analyzeMutation.error || analyzeFromSessionMutation.error
  const isError = analyzeMutation.isError || analyzeFromSessionMutation.isError

  // Persist analysis start time in sessionStorage so elapsed survives
  // tab switches, component remounts, and page refreshes.
  const storageKey = `adapter-analysis-start-${sessionId}`

  const getStoredStart = useCallback((): number | null => {
    const raw = sessionStorage.getItem(storageKey)
    return raw ? Number(raw) : null
  }, [storageKey])

  const setStoredStart = useCallback((ts: number) => {
    sessionStorage.setItem(storageKey, String(ts))
  }, [storageKey])

  const clearStoredStart = useCallback(() => {
    sessionStorage.removeItem(storageKey)
  }, [storageKey])

  // Elapsed timer while analyzing -- uses wall-clock time persisted in sessionStorage,
  // so switching browser tabs or refreshing doesn't reset progress.
  useEffect(() => {
    if (mappingPlan) {
      clearStoredStart()
      return
    }
    if (!isAnalyzing) {
      // Not analyzing but no mapping plan -- check if we have a stored start
      // (analysis might be running server-side after a refresh)
      const stored = getStoredStart()
      if (stored) {
        setElapsed(Math.floor((Date.now() - stored) / 1000))
      }
      return
    }
    // Currently analyzing -- ensure we have a start time
    let start = getStoredStart()
    if (!start) {
      start = Date.now()
      setStoredStart(start)
    }
    const tick = () => {
      const s = getStoredStart() ?? Date.now()
      setElapsed(Math.floor((Date.now() - s) / 1000))
    }
    tick() // immediate first tick
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [isAnalyzing, mappingPlan, getStoredStart, setStoredStart, clearStoredStart])

  // Progress step estimation based on elapsed time
  // The LLM streaming is the bulk of the work (30-120s for large templates)
  useEffect(() => {
    if (!isAnalyzing || mappingPlan) return
    if (elapsed >= 90) setAnalysisStep(2)        // ~90s+: likely validating
    else if (elapsed >= 3) setAnalysisStep(1)    // ~3-90s: LLM analyzing (bulk of time)
    else setAnalysisStep(0)                       // 0-3s: preparing prompt
  }, [elapsed, isAnalyzing, mappingPlan])

  // Poll session as fallback -- if the HTTP response is lost (e.g. timeout),
  // the server-side session still has the mapping plan from the completed analysis.
  // Start polling after 30s, check every 10s.
  const sessionPoll = useWizardSession(
    isAnalyzing && !mappingPlan && elapsed >= 30 ? sessionId : null,
  )

  useEffect(() => {
    if (!isAnalyzing || mappingPlan) return
    if (elapsed >= 30 && elapsed % 10 === 0 && sessionPoll.data?.analysis?.mappingPlan) {
      const serverPlan = sessionPoll.data.analysis.mappingPlan as unknown as MappingPlan
      if (serverPlan?.entries?.length) {
        setMappingPlan(serverPlan)
        onMappingUpdate(serverPlan)
        toast.success('Template analysis complete')
      }
    }
  }, [elapsed, isAnalyzing, mappingPlan, sessionPoll.data, onMappingUpdate])

  // Also refetch session poll periodically
  useEffect(() => {
    if (!isAnalyzing || mappingPlan || elapsed < 30) return
    if (elapsed % 10 === 0) {
      sessionPoll.refetch()
    }
  }, [elapsed, isAnalyzing, mappingPlan, sessionPoll])

  // Auto-trigger analysis on mount if no mapping plan yet
  useEffect(() => {
    if (!mappingPlan && !hasTriggeredAnalysis.current && !isAnalyzing) {
      hasTriggeredAnalysis.current = true

      if (file) {
        // File available (same session) -- use multipart upload
        analyzeMutation.mutate(
          { file, templateType, language },
          {
            onSuccess: (data) => {
              setMappingPlan(data.mappingPlan)
              onMappingUpdate(data.mappingPlan)
              toast.success('Template analysis complete')
            },
          },
        )
      } else if (sessionId) {
        // No file (page refresh) -- check session first before re-triggering analysis.
        // The previous analysis might still be completing server-side.
        // Poll session to see if result is already available.
        adapterApi.getSession(sessionId).then((session) => {
          const existingPlan = session?.analysis?.mappingPlan as unknown as MappingPlan | null
          if (existingPlan?.entries?.length) {
            // Analysis already completed server-side — use the result
            setMappingPlan(existingPlan)
            onMappingUpdate(existingPlan)
          } else {
            // No result yet — trigger session-based analysis
            analyzeFromSessionMutation.mutate(sessionId, {
              onSuccess: (data) => {
                setMappingPlan(data.mappingPlan)
                onMappingUpdate(data.mappingPlan)
                toast.success('Template analysis complete')
              },
            })
          }
        }).catch(() => {
          // Session fetch failed — trigger analysis anyway
          analyzeFromSessionMutation.mutate(sessionId, {
            onSuccess: (data) => {
              setMappingPlan(data.mappingPlan)
              onMappingUpdate(data.mappingPlan)
              toast.success('Template analysis complete')
            },
          })
        })
      }
    }
  }, [mappingPlan, file, sessionId, templateType, language, analyzeMutation, analyzeFromSessionMutation, isAnalyzing, onMappingUpdate])

  // Auto-trigger annotated preview after mapping plan is received
  useEffect(() => {
    if (mappingPlan && !hasTriggeredPreview.current && !annotatedPreviewMutation.isPending) {
      hasTriggeredPreview.current = true
      annotatedPreviewMutation.mutate(sessionId, {
        onSuccess: (data) => {
          setAnnotatedPdfJobId(data.pdfJobId)
          setTooltipData(data.tooltipData)
          setUnmappedParagraphs(data.unmappedParagraphs)
          setGapSummary(data.gapSummary)
          setPreviewOutdated(false)
        },
      })
    }
  }, [mappingPlan, sessionId, annotatedPreviewMutation])

  // Restore cached annotated preview on page reload
  useEffect(() => {
    if (cachedPreview.data && !annotatedPdfJobId) {
      const cached = cachedPreview.data
      if (cached.pdfUrl) {
        // We have a cached PDF -- no need to regenerate
        setTooltipData(cached.tooltipData)
        setUnmappedParagraphs(cached.unmappedParagraphs)
        if (cached.gapSummary) setGapSummary(cached.gapSummary)
      }
    }
  }, [cachedPreview.data, annotatedPdfJobId])

  // Watch for mapping updates from chat
  useEffect(() => {
    if (chat.latestMappingUpdate) {
      setMappingPlan(chat.latestMappingUpdate)
      onMappingUpdate(chat.latestMappingUpdate)
      setPreviewOutdated(true)
    }
  }, [chat.latestMappingUpdate, onMappingUpdate])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [chat.messages])

  const handleSendMessage = useCallback(() => {
    const trimmed = chatInput.trim()
    if (!trimmed) return
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

  const handleReAnalyze = useCallback(() => {
    hasTriggeredAnalysis.current = true
    setStoredStart(Date.now())
    setElapsed(0)
    setAnalysisStep(0)
    if (file) {
      analyzeMutation.mutate(
        { file, templateType, language },
        {
          onSuccess: (data) => {
            setMappingPlan(data.mappingPlan)
            onMappingUpdate(data.mappingPlan)
            toast.success('Re-analysis complete')
            // Reset preview state for regeneration
            hasTriggeredPreview.current = false
            setPreviewOutdated(true)
          },
        },
      )
    } else if (sessionId) {
      analyzeFromSessionMutation.mutate(sessionId, {
        onSuccess: (data) => {
          setMappingPlan(data.mappingPlan)
          onMappingUpdate(data.mappingPlan)
          toast.success('Re-analysis complete')
          hasTriggeredPreview.current = false
          setPreviewOutdated(true)
        },
      })
    }
  }, [file, sessionId, templateType, language, analyzeMutation, analyzeFromSessionMutation, onMappingUpdate])

  const handleRegeneratePreview = useCallback(() => {
    annotatedPreviewMutation.mutate(sessionId, {
      onSuccess: (data) => {
        setAnnotatedPdfJobId(data.pdfJobId)
        setTooltipData(data.tooltipData)
        setUnmappedParagraphs(data.unmappedParagraphs)
        setGapSummary(data.gapSummary)
        setPreviewOutdated(false)
      },
    })
  }, [sessionId, annotatedPreviewMutation])

  // Optimistic mapping plan update with backend sync.
  // Compares the new plan against the previous to derive editedEntries / addedEntries,
  // then POSTs to /api/adapter/update-mapping. Reverts on failure.
  const handleMappingPlanChange = useCallback((updatedPlan: MappingPlan) => {
    if (!mappingPlan) return
    const previousPlan = mappingPlan

    // Optimistically apply the update
    setMappingPlan(updatedPlan)
    onMappingUpdate(updatedPlan)
    setPreviewOutdated(true)

    // Derive what changed: edited entries vs added entries
    const previousIndices = new Set(previousPlan.entries.map((e) => e.sectionIndex))
    const editedEntries: Array<{ sectionIndex: number; gwField: string; markerType: string }> = []
    const addedEntries: Array<{ paragraphIndex: number; gwField: string; markerType: string }> = []

    for (const entry of updatedPlan.entries) {
      if (previousIndices.has(entry.sectionIndex)) {
        // Check if it was actually edited
        const prev = previousPlan.entries.find((e) => e.sectionIndex === entry.sectionIndex)
        if (prev && (prev.gwField !== entry.gwField || prev.markerType !== entry.markerType)) {
          editedEntries.push({
            sectionIndex: entry.sectionIndex,
            gwField: entry.gwField,
            markerType: entry.markerType,
          })
        }
      } else {
        // New entry (added via inline edit or paragraph picker)
        addedEntries.push({
          paragraphIndex: entry.sectionIndex,
          gwField: entry.gwField,
          markerType: entry.markerType,
        })
      }
    }

    // Only call backend if there are actual changes
    if (editedEntries.length > 0 || addedEntries.length > 0) {
      updateMappingMutation.mutate(
        {
          sessionId,
          updates: {
            ...(editedEntries.length > 0 ? { editedEntries } : {}),
            ...(addedEntries.length > 0 ? { addedEntries } : {}),
          },
        },
        {
          onSuccess: (data) => {
            // Use the server's authoritative mapping plan
            setMappingPlan(data.mappingPlan)
            onMappingUpdate(data.mappingPlan)
          },
          onError: () => {
            // Revert to previous plan on failure
            setMappingPlan(previousPlan)
            onMappingUpdate(previousPlan)
            setPreviewOutdated(false)
            toast.error('Failed to save mapping changes. Reverted.')
          },
        },
      )

      // Remove added paragraphs from unmapped list
      if (addedEntries.length > 0) {
        const addedIndices = new Set(addedEntries.map((a) => a.paragraphIndex))
        setUnmappedParagraphs((prev) =>
          prev.filter((p) => !addedIndices.has(p.paragraphIndex))
        )
      }
    }
  }, [mappingPlan, sessionId, onMappingUpdate, updateMappingMutation])

  // Determine the annotated PDF URL to display
  const displayPdfUrl = annotatedPdfUrl ?? cachedPreview.data?.pdfUrl ?? null
  const isPreviewLoading = annotatedPreviewMutation.isPending ||
    (!!annotatedPdfJobId && !isAnnotatedPdfReady && !isAnnotatedPdfFailed)

  // Compute gap entries from tooltip data
  const gapEntries = tooltipData.filter((t) => t.status === 'gap')

  // Loading state
  if (isAnalyzing && !mappingPlan) {
    return (
      <Card>
        <CardContent className="py-8">
          <h3 className="text-sm font-medium text-center mb-6">Analyzing template structure</h3>
          <AnalysisProgressDisplay
            activePhase="running"
            activeStepIndex={analysisStep}
            elapsed={elapsed}
          />
        </CardContent>
      </Card>
    )
  }

  // Error state (no mapping plan loaded)
  if (isError && !mappingPlan) {
    return (
      <Card>
        <CardContent className="py-8">
          <h3 className="text-sm font-medium text-center mb-6">Analysis failed</h3>
          <AnalysisProgressDisplay
            activePhase="error"
            activeStepIndex={analysisStep}
            elapsed={elapsed}
            errorMessage={(analyzeError as Error)?.message || 'Unknown error'}
            onRetry={handleReAnalyze}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* Left: Tabbed View (Preview + Mappings) */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Mapping Plan</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReAnalyze}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" aria-hidden="true" />
              )}
              Re-analyze
            </Button>
            <Button variant="gradient" size="sm" onClick={onProceed} disabled={!mappingPlan}>
              Proceed
              <ArrowRight className="h-3 w-3 ml-1" aria-hidden="true" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="preview">
            <TabsList>
              <TabsTrigger value="preview">
                <Eye className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                Preview
                {previewOutdated && (
                  <span className="ml-1.5 h-2 w-2 rounded-full bg-yellow-500" title="Preview outdated" />
                )}
              </TabsTrigger>
              <TabsTrigger value="mappings">
                <Table2 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                Mappings
              </TabsTrigger>
            </TabsList>

            {/* Preview Tab */}
            <TabsContent value="preview">
              <div className="space-y-4">
                {/* Coverage Summary */}
                {gapSummary && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">
                        {gapSummary.mappedFieldCount}/{gapSummary.expectedFieldCount} fields mapped
                        <span className="text-muted-foreground ml-1">
                          ({gapSummary.coveragePercent}% coverage)
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-[10px]">
                        Mapped
                      </Badge>
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-[10px]">
                        Gap
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Annotated PDF */}
                <PdfPreview
                  url={displayPdfUrl}
                  isLoading={isPreviewLoading}
                  error={isAnnotatedPdfFailed ? 'Failed to generate annotated preview' : undefined}
                  className="min-h-[500px]"
                />

                {/* Regenerate Preview Button */}
                {mappingPlan && (
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRegeneratePreview}
                      disabled={annotatedPreviewMutation.isPending}
                    >
                      {annotatedPreviewMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" aria-hidden="true" />
                      ) : (
                        <RefreshCw className="h-3 w-3 mr-1" aria-hidden="true" />
                      )}
                      Regenerate Preview
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Mappings Tab */}
            <TabsContent value="mappings">
              {mappingPlan ? (
                <MappingTable
                  mappingPlan={mappingPlan}
                  gaps={gapEntries}
                  unmappedParagraphs={unmappedParagraphs}
                  isEditable={true}
                  onMappingPlanChange={handleMappingPlanChange}
                />
              ) : (
                <p className="text-sm text-muted-foreground">No mapping data available.</p>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Right: Chat Panel */}
      <Card className="flex flex-col max-h-[700px]">
        <CardHeader>
          <CardTitle className="text-base">Refinement Chat</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-[200px]">
            {chat.messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">
                Ask the AI to adjust mappings, add fields, or change confidence thresholds.
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
              placeholder="Refine the mapping..."
              disabled={chat.isStreaming}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSendMessage}
              disabled={chat.isStreaming || !chatInput.trim()}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
