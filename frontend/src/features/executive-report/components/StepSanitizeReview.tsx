import { useState, useCallback, useRef, useEffect } from 'react'
import { Loader2, AlertTriangle, CheckCircle, Info, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SanitizationDiffView } from './SanitizationDiffView'
import { MetadataEditor } from './MetadataEditor'
import { DenyListEditor } from './DenyListEditor'
import {
  useUpdateDenyList,
  useApproveSanitization,
  useUpdateMetadata,
  useReportSession,
} from '../hooks'
import type { ReportWizardState, ReportMetadata, SanitizedParagraph } from '../types'

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
  // Refetch session to get latest state (may have updated deny list)
  const sessionQuery = useReportSession(sessionId)
  const state = sessionQuery.data ?? initialState

  const denyListMutation = useUpdateDenyList()
  const approveMutation = useApproveSanitization()
  const metadataMutation = useUpdateMetadata()

  // Local overrides for paragraphs and deny list (updated optimistically)
  const [localParagraphs, setLocalParagraphs] = useState<SanitizedParagraph[]>(
    state?.sanitizedParagraphs ?? [],
  )
  const [localDenyTerms, setLocalDenyTerms] = useState<string[]>(
    state?.denyListTerms ?? [],
  )
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

  // Sync from server when session query updates
  useEffect(() => {
    if (state?.sanitizedParagraphs) {
      setLocalParagraphs(state.sanitizedParagraphs)
    }
    if (state?.denyListTerms) {
      setLocalDenyTerms(state.denyListTerms)
    }
    if (state?.metadata) {
      setLocalMetadata(state.metadata)
      // Only set extracted ref once (first load)
      if (!extractedMetadataRef.current.clientName && state.metadata.clientName) {
        extractedMetadataRef.current = { ...state.metadata }
      }
    }
  }, [state])

  // Metadata debounce timer
  const metadataTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMetadataChange = useCallback(
    (metadata: ReportMetadata) => {
      setLocalMetadata(metadata)

      // Debounce server update
      if (metadataTimerRef.current) {
        clearTimeout(metadataTimerRef.current)
      }
      metadataTimerRef.current = setTimeout(() => {
        metadataMutation.mutate({ sessionId, metadata })
      }, 1000)
    },
    [sessionId, metadataMutation],
  )

  const handleAddDenyTerm = useCallback(
    (term: string) => {
      // Optimistic update
      setLocalDenyTerms((prev) => [...prev, term])

      denyListMutation.mutate(
        { sessionId, terms: [term], action: 'add' },
        {
          onSuccess: () => {
            sessionQuery.refetch()
          },
          onError: () => {
            // Rollback
            setLocalDenyTerms((prev) => prev.filter((t) => t !== term))
          },
        },
      )
    },
    [sessionId, denyListMutation, sessionQuery],
  )

  const handleRemoveDenyTerm = useCallback(
    (term: string) => {
      // Optimistic update
      setLocalDenyTerms((prev) => prev.filter((t) => t !== term))

      denyListMutation.mutate(
        { sessionId, terms: [term], action: 'remove' },
        {
          onSuccess: () => {
            sessionQuery.refetch()
          },
          onError: () => {
            // Rollback
            setLocalDenyTerms((prev) => [...prev, term])
          },
        },
      )
    },
    [sessionId, denyListMutation, sessionQuery],
  )

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
  const isDenyListUpdating = denyListMutation.isPending

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
    <div className="space-y-6">
      {/* Sanitization diff view */}
      <Card>
        <CardHeader>
          <CardTitle>Sanitization Review</CardTitle>
          <CardDescription>
            Review the sanitized version of your report. Entity replacements are highlighted.
            Add deny list terms to catch additional sensitive data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <SanitizationDiffView paragraphs={localParagraphs} />

          {/* Deny list editor */}
          <div className="border-t pt-4">
            <DenyListEditor
              terms={localDenyTerms}
              onAdd={handleAddDenyTerm}
              onRemove={handleRemoveDenyTerm}
              isLoading={isDenyListUpdating}
            />
          </div>
        </CardContent>
      </Card>

      {/* Metadata editor */}
      <Card>
        <CardHeader>
          <CardTitle>Report Metadata</CardTitle>
          <CardDescription>
            Confirm or correct the metadata extracted from your report.
            Sanitized placeholders (e.g., [PERSON_1]) should be replaced with real values.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MetadataEditor
            extractedMetadata={extractedMetadataRef.current}
            metadata={localMetadata}
            onMetadataChange={handleMetadataChange}
            disabled={isApproving}
          />
        </CardContent>
      </Card>

      {/* Warnings banner -- categorized by severity */}
      {state?.warnings && state.warnings.length > 0 && (
        <div className="space-y-3">
          {state.warnings.map((warning, i) => {
            // Categorize warning: error (few_findings, short_report), caution (missing_cvss, unclear_severity), info (incomplete_metadata)
            const isError = warning.includes('few_findings') || warning.includes('short_report')
            const isInfo = warning.includes('incomplete_metadata')
            // Default to caution (yellow) for missing_cvss, unclear_severity, and others

            if (isError) {
              return (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10 p-3">
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <span className="text-sm text-red-700 dark:text-red-300">{warning.replace(/^[a-z_]+:\s*/, '')}</span>
                  </div>
                </div>
              )
            }

            if (isInfo) {
              return (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/10 p-3">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <div>
                    <span className="text-sm text-blue-700 dark:text-blue-300">{warning.replace(/^[a-z_]+:\s*/, '')}</span>
                  </div>
                </div>
              )
            }

            // Caution (default)
            return (
              <div key={i} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-900/10 p-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div>
                  <span className="text-sm text-amber-700 dark:text-amber-300">{warning.replace(/^[a-z_]+:\s*/, '')}</span>
                </div>
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
