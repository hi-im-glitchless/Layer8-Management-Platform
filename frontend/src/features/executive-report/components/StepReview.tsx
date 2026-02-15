import { useState, useCallback, useEffect } from 'react'
import { Loader2, CheckCircle, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PdfPreview } from '@/components/ui/pdf-preview'
import { useReportPreviewStatus, useReportSession } from '../hooks'
import { reportApi } from '../api'
import { ReportChatPanel } from './ReportChatPanel'

interface StepReviewProps {
  sessionId: string
  onSatisfied: () => void
  onRegenerate: () => void
}

export function StepReview({ sessionId, onSatisfied, onRegenerate }: StepReviewProps) {
  const previewQuery = useReportPreviewStatus(sessionId)
  const sessionQuery = useReportSession(sessionId)
  const [isRegenerating, setIsRegenerating] = useState(false)

  const status = previewQuery.data?.status
  const pdfUrl = previewQuery.data?.pdfUrl
  const previewError = previewQuery.data?.error

  const fullPdfUrl = pdfUrl ? reportApi.pdfDownloadUrl(pdfUrl) : null
  const isConverting = status === 'queued' || status === 'active'
  const isCompleted = status === 'completed' && !!pdfUrl
  const isFailed = status === 'failed'

  const chatIterationCount = sessionQuery.data?.chatIterationCount ?? 0

  // When a section_update arrives, trigger PDF re-poll by showing
  // regenerating state and invalidating the preview query
  const handleSectionUpdate = useCallback(
    (_sectionKey: string, _text: string) => {
      setIsRegenerating(true)
      // Refetch session to get the new pdfJobId
      sessionQuery.refetch()
      // Refetch preview status to start polling the new PDF job
      previewQuery.refetch()
    },
    [sessionQuery, previewQuery],
  )

  // Clear regenerating overlay once PDF is completed
  useEffect(() => {
    if (isRegenerating && isCompleted) {
      setIsRegenerating(false)
    }
  }, [isRegenerating, isCompleted])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Review Executive Report</CardTitle>
          <CardDescription>
            Preview the generated report. Use the chat panel to request corrections
            to specific sections, or regenerate the entire report.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Split layout: PDF (left/top 60%) + Chat (right/bottom 40%) */}
          <div className="flex flex-col lg:flex-row gap-6">
            {/* PDF Preview Panel */}
            <div className="flex-[3] min-w-0">
              {/* PDF conversion in progress */}
              {(isConverting || isRegenerating) && (
                <div className="relative">
                  {isRegenerating && isCompleted && fullPdfUrl && (
                    <div className="absolute inset-0 z-10 bg-background/60 backdrop-blur-sm flex items-center justify-center rounded-lg">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <p className="text-sm font-medium text-muted-foreground">Regenerating PDF...</p>
                      </div>
                    </div>
                  )}
                  {isRegenerating && isCompleted && fullPdfUrl ? (
                    <PdfPreview
                      url={fullPdfUrl}
                      className="min-h-[600px]"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-4 py-12">
                      <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                      <div className="text-center">
                        <p className="text-sm font-medium">Converting report to PDF...</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          This may take 30-60 seconds for large reports.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* PDF conversion failed */}
              {isFailed && !isRegenerating && (
                <div className="flex flex-col items-center gap-4 py-12">
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
                    <p className="text-sm text-destructive font-medium">PDF conversion failed</p>
                    {previewError && (
                      <p className="text-xs text-muted-foreground mt-2">{previewError}</p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => previewQuery.refetch()}
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                      Retry
                    </Button>
                  </div>
                </div>
              )}

              {/* No PDF yet (waiting for initial data) */}
              {!pdfUrl && !isConverting && !isFailed && !isRegenerating && previewQuery.isLoading && (
                <div className="space-y-4">
                  <Skeleton className="h-[500px] w-full rounded-lg" />
                </div>
              )}

              {/* PDF Preview */}
              {isCompleted && !isRegenerating && fullPdfUrl && (
                <PdfPreview
                  url={fullPdfUrl}
                  className="min-h-[600px]"
                />
              )}
            </div>

            {/* Chat Panel */}
            <div className="flex-[2] min-w-0 lg:min-w-[320px]">
              <ReportChatPanel
                sessionId={sessionId}
                iterationCount={chatIterationCount}
                onSectionUpdate={handleSectionUpdate}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={onRegenerate}
        >
          <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
          Regenerate
        </Button>
        <Button
          variant="gradient"
          onClick={onSatisfied}
          disabled={!isCompleted || isRegenerating}
          className="min-w-[180px]"
        >
          <CheckCircle className="h-4 w-4 mr-2" aria-hidden="true" />
          Satisfied -- Continue
        </Button>
      </div>
    </div>
  )
}
