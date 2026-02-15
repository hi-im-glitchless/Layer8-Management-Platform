import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Brain, RefreshCw, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
} from '../hooks'
import { adapterApi } from '../api'
import { InteractivePdfViewer, type TextSelectionPayload } from './InteractivePdfViewer'
import { PlaceholderNavigator } from './PlaceholderNavigator'
import { MappingTable } from './MappingTable'
import type {
  TemplateType,
  TemplateLanguage,
  MappingPlan,
  MappingEntry,
  PlaceholderInfo,
  SelectionEntry,
} from '../types'

interface StepVerifyProps {
  sessionId: string
  templateType: TemplateType
  language: TemplateLanguage
  initialMappingPlan: MappingPlan | null
  kbLockedCount?: number
  llmAnalyzedCount?: number
  onMappingUpdate: (plan: MappingPlan) => void
  onApprove: () => void
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function StepVerify({
  sessionId,
  templateType,
  language,
  initialMappingPlan,
  kbLockedCount,
  llmAnalyzedCount,
  onMappingUpdate,
  onApprove,
}: StepVerifyProps) {
  const [mappingPlan, setMappingPlan] = useState<MappingPlan | null>(initialMappingPlan)
  const [placeholderPdfJobId, setPlaceholderPdfJobId] = useState<string | null>(null)
  const [placeholders, setPlaceholders] = useState<PlaceholderInfo[]>([])
  const [placeholderCount, setPlaceholderCount] = useState(0)
  const [isDirty, setIsDirty] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)

  const placeholderPreviewMutation = usePlaceholderPreview()
  const hasTriggeredPreview = useRef(false)

  // Track the original mapping plan (from auto-map) to always diff against
  // the LLM's original output, not intermediate edits
  const originalMappingPlanRef = useRef<MappingPlan | null>(initialMappingPlan)

  // KB badge state
  const [kbPersisted, setKbPersisted] = useState(false)
  const [kbAnimating, setKbAnimating] = useState(false)

  // KB stats query for enhanced badge tooltip
  const kbStatsQuery = useQuery({
    queryKey: ['kb-stats', templateType],
    queryFn: () => adapterApi.kbStats(templateType),
    staleTime: 60_000,
    retry: false,
  })

  // PlaceholderNavigator state
  const [navigatorOpen, setNavigatorOpen] = useState(false)
  const [scrollTargetPage, setScrollTargetPage] = useState<number | null>(null)
  const [scrollTargetText, setScrollTargetText] = useState<string | null>(null)

  // Bidirectional sync state — use array index to avoid multi-highlight
  const [highlightedIdx, setHighlightedIdx] = useState<number | null>(null)
  const [newRowIndex, setNewRowIndex] = useState<number | null>(null)

  // Persistent visual selections on PDF
  const [selections, setSelections] = useState<SelectionEntry[]>([])
  const selectionCounterRef = useRef(0)

  // Restore cached preview on page reload
  const cachedPreview = useCachedAnnotatedPreview(sessionId)

  // Derive pdfJobId from either mutation result or cached wizard state
  const effectivePdfJobId = placeholderPdfJobId ?? cachedPreview.data?.pdfJobId ?? null

  // Poll placeholder PDF status
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

  // Loading state
  const isPreviewLoading = (placeholderPreviewMutation.isPending && !displayPdfUrl) ||
    (!!effectivePdfJobId && !isAnnotatedPdfReady && !isAnnotatedPdfFailed && !displayPdfUrl) ||
    isRegenerating

  // Error state
  const previewError = placeholderPreviewMutation.isError && !displayPdfUrl
    ? (placeholderPreviewMutation.error as Error)?.message || 'Failed to generate placeholder preview'
    : isAnnotatedPdfFailed && !displayPdfUrl
      ? 'Failed to convert placeholder preview to PDF'
      : undefined

  // Sync mapping plan when initialMappingPlan arrives after async refetch
  useEffect(() => {
    if (initialMappingPlan && !mappingPlan) {
      setMappingPlan(initialMappingPlan)
      originalMappingPlanRef.current = initialMappingPlan
    }
  }, [initialMappingPlan, mappingPlan])

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
  useEffect(() => {
    if (placeholders.length > 0) return
    const cached = cachedPreview.data
    if (cached?.placeholders?.length) {
      setPlaceholders(cached.placeholders)
      setPlaceholderCount(cached.placeholderCount)
    }
  }, [placeholders.length, cachedPreview.data])

  /**
   * Handle table-based mapping plan edits. Compares updated entries against
   * the original auto-map output, builds a corrections array, and fires off
   * a correction update to the backend KB (fire-and-forget).
   */
  const handleMappingPlanChange = useCallback(
    (updatedPlan: MappingPlan) => {
      const original = originalMappingPlanRef.current
      if (!original) {
        setMappingPlan(updatedPlan)
        onMappingUpdate(updatedPlan)
        setIsDirty(true)
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
        if (!orig) continue
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

      // Detect removed entries and sync PDF selections
      const prevIndices = new Set(mappingPlan?.entries.map((e) => e.sectionIndex) ?? [])
      const newIndices = new Set(updatedPlan.entries.map((e) => e.sectionIndex))
      const removedIndices = [...prevIndices].filter((idx) => !newIndices.has(idx))

      if (removedIndices.length > 0) {
        const removedSet = new Set(removedIndices)
        setSelections((prev) => {
          const filtered = prev.filter((s) => !removedSet.has(s.paragraphIndex))
          // Renumber sequentially
          selectionCounterRef.current = filtered.length
          return filtered.map((s, i) => ({ ...s, selectionNumber: i + 1 }))
        })
      }

      // Update local state
      setMappingPlan(updatedPlan)
      onMappingUpdate(updatedPlan)
      setIsDirty(true)

      // Fire-and-forget: send corrections to backend KB
      if (corrections.length > 0) {
        adapterApi.correctionUpdate(sessionId, corrections).catch((err) => {
          console.error('[StepVerify] KB correction update failed (non-blocking):', err)
        })
      }
    },
    [sessionId, onMappingUpdate, mappingPlan],
  )

  // Handle text selection from InteractivePdfViewer -- add new row to mapping table
  const handleTextSelected = useCallback(
    (selection: TextSelectionPayload) => {
      if (!mappingPlan) return

      const newEntry: MappingEntry = {
        sectionIndex: selection.paragraphIndex,
        sectionText: selection.text,
        gwField: '',
        placeholderTemplate: '',
        confidence: 0,
        markerType: 'text',
        rationale: 'Added via PDF selection',
      }

      // Deduplicate: if this sectionIndex already exists, highlight instead
      const existingIdx = mappingPlan.entries.findIndex(
        (e) => e.sectionIndex === selection.paragraphIndex,
      )
      if (existingIdx >= 0) {
        toast.info(`Paragraph #${selection.paragraphIndex} is already in the mapping table`)
        setHighlightedIdx(existingIdx)
        return
      }

      const updatedPlan: MappingPlan = {
        ...mappingPlan,
        entries: [...mappingPlan.entries, newEntry],
      }

      setMappingPlan(updatedPlan)
      onMappingUpdate(updatedPlan)
      setIsDirty(true)
      setNewRowIndex(selection.paragraphIndex)

      // Persist visual selection on PDF (green = confirmed)
      selectionCounterRef.current += 1
      const selEntry: SelectionEntry = {
        id: crypto.randomUUID(),
        selectionNumber: selectionCounterRef.current,
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
        status: 'confirmed',
        gwField: null,
        markerType: null,
        confidence: null,
      }
      setSelections((prev) => [...prev, selEntry])

      toast.success(`#${selection.paragraphIndex} added to mapping table`)
    },
    [mappingPlan, onMappingUpdate],
  )

  // Retry placeholder preview generation (after error)
  const handleRetryPreview = useCallback(async () => {
    placeholderPreviewMutation.reset()
    try {
      await adapterApi.reapplyMappingPlan(sessionId)
    } catch {
      // Reapply failed -- still try preview from existing DOCX
    }
    placeholderPreviewMutation.mutate(sessionId, {
      onSuccess: (data) => {
        setPlaceholderPdfJobId(data.pdfJobId)
        setPlaceholders(data.placeholders)
        setPlaceholderCount(data.placeholderCount)
      },
    })
  }, [sessionId, placeholderPreviewMutation])

  // Regenerate: save mapping plan to backend, re-apply DOCX, generate new PDF
  const handleRegeneratePreview = useCallback(async () => {
    if (!mappingPlan) return
    setIsRegenerating(true)
    // Clear visual selections since PDF content will change
    setSelections([])
    try {
      // 1. Send the full current mapping plan to the backend
      //    (avoids broken diff logic when entries share sectionIndex)
      await adapterApi.updateMapping({
        sessionId,
        updates: { fullPlan: mappingPlan.entries },
      })

      // 2. Re-apply DOCX with the updated mapping plan
      await adapterApi.reapplyMappingPlan(sessionId)
    } catch (err) {
      console.error('[StepVerify] Regenerate save/reapply failed:', err)
      toast.error('Failed to save mappings -- please try again')
      setIsRegenerating(false)
      return
    }

    // 3. Generate new placeholder PDF
    placeholderPreviewMutation.mutate(sessionId, {
      onSuccess: (data) => {
        setPlaceholderPdfJobId(data.pdfJobId)
        setPlaceholders(data.placeholders)
        setPlaceholderCount(data.placeholderCount)
        setIsDirty(false)
        setIsRegenerating(false)
        toast.success('Placeholders updated -- review the changes')
      },
      onError: () => {
        setIsRegenerating(false)
        toast.error('Failed to generate preview')
      },
    })
  }, [sessionId, mappingPlan, placeholderPreviewMutation])

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

  // Table row click -> scroll PDF to corresponding placeholder
  const handleRowClick = useCallback(
    (entry: MappingEntry, entryIdx: number) => {
      setHighlightedIdx(entryIdx)
      const match = placeholders.find((p) => p.paragraphIndex === entry.sectionIndex)
      if (match) {
        setScrollTargetText(match.placeholderText)
      }
      // Clear highlight after a brief moment
      setTimeout(() => setHighlightedIdx(null), 2000)
    },
    [placeholders],
  )

  const handleNewRowHandled = useCallback(() => {
    setNewRowIndex(null)
  }, [])

  return (
    <div className="space-y-4">
      {/* Toolbar: placeholder count, KB badge, Regenerate, Approve */}
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
          {isDirty && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegeneratePreview}
              disabled={isRegenerating}
            >
              <RefreshCw className="h-3 w-3 mr-1" aria-hidden="true" />
              Regenerate
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
              <TooltipContent className="max-w-xs">
                {kbStatsQuery.data ? (
                  <div className="space-y-1 text-xs">
                    <p className="font-medium">Knowledge Base ({templateType})</p>
                    <p>{kbStatsQuery.data.totalMappings} mappings, avg confidence {kbStatsQuery.data.avgConfidence}</p>
                    {kbStatsQuery.data.blueprintCount > 0 && (
                      <p>{kbStatsQuery.data.blueprintCount} blueprints, {kbStatsQuery.data.styleHintCount} style hints</p>
                    )}
                  </div>
                ) : (
                  <span>Mappings saved to knowledge base for future template analyses</span>
                )}
              </TooltipContent>
            </TooltipUI>
          </TooltipProvider>
          <Button
            variant="gradient"
            size="sm"
            onClick={onApprove}
            disabled={!displayPdfUrl || isRegenerating || isPreviewLoading}
          >
            Approve &amp; Continue
            <ArrowRight className="h-3 w-3 ml-1" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Main grid: PDF viewer + Mapping Table */}
      <div className="grid gap-4 grid-cols-[1fr_minmax(420px,1fr)]">
        {/* Left: Interactive PDF Viewer */}
        <Card className="overflow-hidden relative">
          <CardContent className="p-0">
            <InteractivePdfViewer
              url={displayPdfUrl}
              isLoading={isPreviewLoading}
              error={previewError}
              onTextSelected={handleTextSelected}
              selections={selections}
              isStreaming={isRegenerating}
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
            {isRegenerating && (
              <div className="absolute inset-0 bg-background/60 flex items-center justify-center z-10">
                <div className="flex items-center gap-2 rounded-lg bg-background px-4 py-2 shadow-md border">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm text-muted-foreground">
                    Regenerating placeholders...
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Editable Mapping Table */}
        <Card className="flex flex-col max-h-[700px]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Mapping Table</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto min-h-0 pt-0">
            {mappingPlan ? (
              <MappingTable
                mappingPlan={mappingPlan}
                isEditable={true}
                onMappingPlanChange={handleMappingPlanChange}
                onRowClick={handleRowClick}
                highlightedIdx={highlightedIdx}
                newRowIndex={newRowIndex}
                onNewRowHandled={handleNewRowHandled}
              />
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">
                No mapping plan available. Run analysis first.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
