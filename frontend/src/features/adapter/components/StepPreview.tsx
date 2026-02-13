import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader2, ArrowRight, ArrowLeft, RefreshCw } from 'lucide-react'
import type { MappingPlan } from '../types'
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

  const handleMappingUpdate = useCallback((_plan: MappingPlan) => {
    setHasMappingUpdate(true)
  }, [])

  const handleReApply = useCallback(() => {
    setHasMappingUpdate(false)
    onReAdapt()
  }, [onReAdapt])

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
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground mt-4">
                Converting to PDF...
                {previewStatus.data?.progress
                  ? ` ${Math.round(previewStatus.data.progress)}%`
                  : ''}
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
