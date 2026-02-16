import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  Loader2,
  AlertTriangle,
  CheckCircle,
  Info,
  AlertCircle,
  PanelRightOpen,
  PanelRightClose,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { HtmlReportPreview } from './HtmlReportPreview'
import { EntityMappingTable } from './EntityMappingTable'
import { EntityPopover } from './EntityPopover'
import { MetadataEditor } from './MetadataEditor'
import {
  useUpdateEntityMappings,
  useApproveSanitization,
  useUpdateMetadata,
  useReportSession,
} from '../hooks'
import type { ReportWizardState, ReportMetadata, EntityMapping } from '../types'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface StepSanitizeReviewProps {
  sessionId: string
  wizardState: ReportWizardState | null
  onApprove: () => void
}

export function StepSanitizeReview({
  sessionId,
  wizardState: initialState,
  onApprove,
}: StepSanitizeReviewProps) {
  // Refetch session to get latest state
  const sessionQuery = useReportSession(sessionId)
  const state = sessionQuery.data ?? initialState

  const entityMappingsMutation = useUpdateEntityMappings()
  const approveMutation = useApproveSanitization()
  const metadataMutation = useUpdateMetadata()

  // Layout state
  const [showMappingTable, setShowMappingTable] = useState(false)
  const [showMetadata, setShowMetadata] = useState(false)

  // Entity popover state
  const [selectedText, setSelectedText] = useState<string | null>(null)
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // Local state for optimistic updates
  const [localMappings, setLocalMappings] = useState<EntityMapping[]>(
    state?.entityMappings ?? [],
  )
  const [localHtml, setLocalHtml] = useState<string>(state?.sanitizedHtml ?? '')
  const [localMetadata, setLocalMetadata] = useState<ReportMetadata>(
    state?.metadata ?? {
      clientName: '',
      projectCode: '',
      startDate: '',
      endDate: '',
      scopeSummary: '',
    },
  )

  // Track the LLM-extracted metadata (read-only reference)
  const extractedMetadataRef = useRef<ReportMetadata>(localMetadata)

  // When true, user has unsaved manual mappings — don't let server sync overwrite them
  const pendingMappingsRef = useRef(false)

  // Sync from server when session query updates
  useEffect(() => {
    if (state?.entityMappings && !pendingMappingsRef.current) {
      setLocalMappings(state.entityMappings)
    }
    if (state?.sanitizedHtml) {
      setLocalHtml(state.sanitizedHtml)
    }
    if (state?.metadata) {
      setLocalMetadata(state.metadata)
      if (!extractedMetadataRef.current.clientName && state.metadata.clientName) {
        extractedMetadataRef.current = { ...state.metadata }
      }
    }
  }, [state])

  // Existing mapped values for duplicate check
  const existingValues = useMemo(
    () => localMappings.map((m) => m.originalValue),
    [localMappings],
  )

  // Metadata debounce timer
  const metadataTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMetadataChange = useCallback(
    (metadata: ReportMetadata) => {
      setLocalMetadata(metadata)
      if (metadataTimerRef.current) {
        clearTimeout(metadataTimerRef.current)
      }
      metadataTimerRef.current = setTimeout(() => {
        metadataMutation.mutate({ sessionId, metadata })
      }, 1000)
    },
    [sessionId, metadataMutation],
  )

  // Text selection from iframe
  const handleTextSelection = useCallback(
    (selection: { text: string; position: { x: number; y: number } }) => {
      setSelectedText(selection.text)
      setPopoverPosition(selection.position)
    },
    [],
  )

  // Add mapping from popover — local only, no backend call.
  // User batches multiple mappings, then clicks Re-sanitize to apply all.
  const handleAddMapping = useCallback(
    (text: string, entityType: string) => {
      // Check if this value is already mapped (case-insensitive for robustness)
      const existing = localMappings.find(
        (m) => m.originalValue.toLowerCase() === text.toLowerCase(),
      )

      if (existing) {
        toast.info(`"${text}" is already mapped as ${existing.placeholder}`)
        setSelectedText(null)
        return
      }

      // Compute next placeholder index: count unique values for this entity type
      const uniqueOfType = new Set(
        localMappings.filter((m) => m.entityType === entityType).map((m) => m.originalValue),
      ).size
      const placeholder = `[${entityType}_${uniqueOfType + 1}]`

      const newMapping: EntityMapping = {
        originalValue: text,
        placeholder,
        entityType,
        isManual: true,
      }
      setLocalMappings((prev) => [...prev, newMapping])
      setSelectedText(null)
      pendingMappingsRef.current = true

      toast.success(`Added "${text}" → ${placeholder}. Click Re-sanitize to apply.`)

      // Auto-show mapping table when first mapping is added manually
      if (!showMappingTable) {
        setShowMappingTable(true)
      }
    },
    [localMappings, showMappingTable],
  )

  // Edit entity type in table — local only, applied on Re-sanitize
  const handleEditType = useCallback(
    (index: number, newType: string) => {
      setLocalMappings((prev) =>
        prev.map((m, i) => (i === index ? { ...m, entityType: newType } : m)),
      )
      pendingMappingsRef.current = true
    },
    [],
  )

  // Delete mapping from table — local only, applied on Re-sanitize
  const handleDelete = useCallback(
    (index: number) => {
      setLocalMappings((prev) => prev.filter((_, i) => i !== index))
      pendingMappingsRef.current = true
    },
    [],
  )

  // Dismiss popover
  const handleDismissPopover = useCallback(() => {
    setSelectedText(null)
  }, [])

  // Re-sanitize: full server pipeline — re-runs Presidio + applies all mappings
  const handleResanitize = useCallback(() => {
    entityMappingsMutation.mutate(
      { sessionId, mappings: localMappings },
      {
        onSuccess: (data) => {
          pendingMappingsRef.current = false
          setLocalMappings(data.entityMappings)
          setLocalHtml(data.sanitizedHtml)
          sessionQuery.refetch()
          toast.success(
            `Document re-sanitized — ${data.entityMappings.length} entities applied`,
          )
        },
        onError: () => {
          toast.error('Failed to re-sanitize document')
        },
      },
    )
  }, [sessionId, localMappings, entityMappingsMutation, sessionQuery])

  // Approve sanitization
  const handleApprove = useCallback(() => {
    approveMutation.mutate(sessionId, {
      onSuccess: () => {
        toast.success('Sanitization approved -- extracting findings')
        onApprove()
      },
    })
  }, [sessionId, approveMutation, onApprove])

  // Cleanup metadata debounce on unmount
  useEffect(() => {
    return () => {
      if (metadataTimerRef.current) {
        clearTimeout(metadataTimerRef.current)
      }
    }
  }, [])

  const isLoading = sessionQuery.isLoading && !initialState
  const isApproving = approveMutation.isPending
  const isUpdatingMappings = entityMappingsMutation.isPending

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Top bar: toggle + entity count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Sanitization Review</h2>
          {localMappings.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {localMappings.length} {localMappings.length === 1 ? 'entity' : 'entities'}
            </Badge>
          )}
          {isUpdatingMappings && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Updating...
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleResanitize}
            disabled={isUpdatingMappings}
            className="text-xs"
          >
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isUpdatingMappings && 'animate-spin')} aria-hidden="true" />
            Re-sanitize
          </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowMappingTable(!showMappingTable)}
          className="text-xs"
        >
          {showMappingTable ? (
            <>
              <PanelRightClose className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Hide Mapping Table
            </>
          ) : (
            <>
              <PanelRightOpen className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Show Mapping Table
            </>
          )}
        </Button>
        </div>
      </div>

      {/* HTML preview (always full width) */}
      <HtmlReportPreview
        html={localHtml}
        onTextSelection={handleTextSelection}
      />

      {/* Mapping table (below preview, collapsible) */}
      {showMappingTable && (
        <Card>
          <CardContent className="p-3">
            <EntityMappingTable
              mappings={localMappings}
              onEditType={handleEditType}
              onDelete={handleDelete}
              isUpdating={isUpdatingMappings}
            />
          </CardContent>
        </Card>
      )}

      {/* Entity popover for text selection */}
      {selectedText && (
        <EntityPopover
          selectedText={selectedText}
          position={popoverPosition}
          onAddMapping={handleAddMapping}
          onDismiss={handleDismissPopover}
          existingValues={existingValues}
        />
      )}

      {/* Collapsible metadata accordion */}
      <div className="border rounded-lg">
        <button
          type="button"
          onClick={() => setShowMetadata(!showMetadata)}
          className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-muted/30 transition-colors rounded-lg"
        >
          <span className="text-sm font-semibold">Report Metadata</span>
          {showMetadata ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </button>
        {showMetadata && (
          <div className="px-4 pb-4 border-t">
            <p className="text-xs text-muted-foreground mt-3 mb-3">
              Confirm or correct the metadata extracted from your report.
              Sanitized placeholders (e.g., [PERSON_1]) should be replaced with real values.
            </p>
            <MetadataEditor
              extractedMetadata={extractedMetadataRef.current}
              metadata={localMetadata}
              onMetadataChange={handleMetadataChange}
              disabled={isApproving}
            />
          </div>
        )}
      </div>

      {/* Warnings banner */}
      {state?.warnings && state.warnings.length > 0 && (
        <div className="space-y-3">
          {state.warnings.map((warning, i) => {
            const isError = warning.includes('few_findings') || warning.includes('short_report')
            const isInfo = warning.includes('incomplete_metadata')

            if (isError) {
              return (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10 p-3">
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <span className="text-sm text-red-700 dark:text-red-300">{warning.replace(/^[a-z_]+:\s*/, '')}</span>
                </div>
              )
            }

            if (isInfo) {
              return (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/10 p-3">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <span className="text-sm text-blue-700 dark:text-blue-300">{warning.replace(/^[a-z_]+:\s*/, '')}</span>
                </div>
              )
            }

            return (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-900/10 p-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <span className="text-sm text-amber-700 dark:text-amber-300">{warning.replace(/^[a-z_]+:\s*/, '')}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Approve button */}
      <div className="flex justify-end">
        <Button
          variant="gradient"
          onClick={handleApprove}
          disabled={isApproving}
          className="min-w-[200px]"
        >
          {isApproving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
              Approving...
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4 mr-2" aria-hidden="true" />
              Approve & Generate
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
