import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader2, ArrowRight, ArrowLeft, RefreshCw, Clock } from 'lucide-react'
import { toast } from 'sonner'
import type { MappingPlan } from '../types'

/** Format seconds as "Xm Ys" or "Xs" */
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PdfPreview } from '@/components/ui/pdf-preview'
import { useRequestPreview, usePreviewStatus, useWizardSession } from '../hooks'
import { ChatPanel } from './ChatPanel'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

interface StepPreviewProps {
  sessionId: string
  onSatisfied: () => void
  onReAdapt: () => void
}

export function StepPreview({ sessionId, onSatisfied, onReAdapt }: StepPreviewProps) {
  const previewMutation = useRequestPreview()
  const hasTriggered = useRef(false)
  const [pdfJobId, setPdfJobId] = useState<string | null>(null)
  const [hasMappingUpdate, setHasMappingUpdate] = useState(false)

  const previewStatus = usePreviewStatus(pdfJobId ? sessionId : null)
  const sessionQuery = useWizardSession(sessionId)

  // Auto-trigger preview on mount
  useEffect(() => {
    if (!hasTriggered.current && !previewMutation.isPending && !previewMutation.isSuccess) {
      hasTriggered.current = true
      previewMutation.mutate(sessionId, {
        onSuccess: (data) => {
          setPdfJobId(data.pdfJobId)
        },
      })
    }
  }, [sessionId, previewMutation])

  // Build PDF URL when conversion completes
  const pdfUrl =
    previewStatus.data?.status === 'completed' && previewStatus.data?.pdfUrl
      ? `${API_BASE_URL}${previewStatus.data.pdfUrl}`
      : null

  const isGenerating =
    previewMutation.isPending ||
    (previewStatus.data?.status === 'queued' || previewStatus.data?.status === 'active')

  // Elapsed timer while generating
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!isGenerating || pdfUrl) return
    setElapsed(0)
    const interval = setInterval(() => setElapsed((prev) => prev + 1), 1000)
    return () => clearInterval(interval)
  }, [isGenerating, pdfUrl])

  // Session polling fallback — detect server-side completion if HTTP response lost
  const sessionPoll = useWizardSession(
    previewMutation.isPending && elapsed >= 15 ? sessionId : null,
  )

  useEffect(() => {
    if (!previewMutation.isPending || elapsed < 15) return
    if (elapsed % 8 === 0) {
      sessionPoll.refetch()
    }
  }, [elapsed, previewMutation.isPending, sessionPoll])

  useEffect(() => {
    if (!previewMutation.isPending) return
    if (sessionPoll.data?.currentStep === 'preview' && sessionPoll.data?.preview?.pdfJobId) {
      // Server finished rendering — mutation response was lost
      setPdfJobId(sessionPoll.data.preview.pdfJobId)
      toast.success('Preview generated')
    }
  }, [previewMutation.isPending, sessionPoll.data])

  const handleMappingUpdate = useCallback((_plan: MappingPlan) => {
    setHasMappingUpdate(true)
  }, [])

  const handleReApply = useCallback(() => {
    setHasMappingUpdate(false)
    onReAdapt()
  }, [onReAdapt])

  // Compute progress percentage based on phase
  const progressPercent = previewStatus.data?.progress
    ? Math.round(previewStatus.data.progress)
    : previewMutation.isPending
      ? Math.min(10 + elapsed * 2, 45) // slowly fill to 45% during rendering
      : Math.min(50 + elapsed, 90)     // 50-90% during PDF conversion

  // Error state
  if (previewMutation.isError) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-destructive font-medium">Preview generation failed</p>
          <p className="text-sm text-muted-foreground mt-2">
            {(previewMutation.error as Error).message}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              hasTriggered.current = false
              previewMutation.reset()
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const iterationCount = sessionQuery.data?.chat.iterationCount ?? 0

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      {/* Left: PDF Preview */}
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>Template Preview</CardTitle>
          <CardDescription>
            {isGenerating
              ? 'Generating PDF preview...'
              : pdfUrl
                ? 'Review the adapted template below.'
                : 'Waiting for preview...'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 min-h-0">
          {isGenerating && !pdfUrl ? (
            <div className="flex flex-col items-center justify-center py-16 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                {previewMutation.isPending
                  ? 'Rendering template with report data...'
                  : 'Converting to PDF...'}
              </p>
              {/* Progress bar */}
              <div className="w-48 space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="tabular-nums">{progressPercent}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground tabular-nums flex items-center gap-1.5">
                <Clock className="h-3 w-3" aria-hidden="true" />
                Elapsed: {formatElapsed(elapsed)}
              </p>
            </div>
          ) : (
            <PdfPreview
              url={pdfUrl}
              isLoading={isGenerating}
              error={
                previewStatus.data?.status === 'failed'
                  ? previewStatus.data?.error || 'PDF conversion failed'
                  : undefined
              }
              className="h-[500px]"
            />
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 mt-4">
            <Button variant="gradient" onClick={onSatisfied} disabled={!pdfUrl}>
              Satisfied
              <ArrowRight className="h-4 w-4 ml-1" aria-hidden="true" />
            </Button>
            <Button variant="outline" onClick={onReAdapt}>
              <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
              Re-adapt
            </Button>
            {hasMappingUpdate && (
              <Button variant="secondary" onClick={handleReApply}>
                <RefreshCw className="h-4 w-4 mr-1" aria-hidden="true" />
                Re-apply Changes
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Right: Chat Panel */}
      <div className="max-h-[700px]">
        <ChatPanel
          sessionId={sessionId}
          onMappingUpdate={handleMappingUpdate}
          iterationCount={iterationCount}
        />
      </div>
    </div>
  )
}
