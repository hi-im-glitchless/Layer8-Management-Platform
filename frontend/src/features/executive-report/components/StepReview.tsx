import { Loader2, CheckCircle, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PdfPreview } from '@/components/ui/pdf-preview'
import { useReportPreviewStatus } from '../hooks'
import { reportApi } from '../api'

interface StepReviewProps {
  sessionId: string
  onSatisfied: () => void
  onRegenerate: () => void
}

export function StepReview({ sessionId, onSatisfied, onRegenerate }: StepReviewProps) {
  const previewQuery = useReportPreviewStatus(sessionId)

  const status = previewQuery.data?.status
  const pdfUrl = previewQuery.data?.pdfUrl
  const previewError = previewQuery.data?.error

  const fullPdfUrl = pdfUrl ? reportApi.pdfDownloadUrl(pdfUrl) : null
  const isConverting = status === 'queued' || status === 'active'
  const isCompleted = status === 'completed' && !!pdfUrl
  const isFailed = status === 'failed'

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Review Executive Report</CardTitle>
          <CardDescription>
            Preview the generated report. Use the chat panel (coming soon) to request corrections,
            or regenerate the entire report.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* PDF conversion in progress */}
          {isConverting && (
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

          {/* PDF conversion failed */}
          {isFailed && (
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
          {!pdfUrl && !isConverting && !isFailed && previewQuery.isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-[500px] w-full rounded-lg" />
            </div>
          )}

          {/* PDF Preview */}
          {isCompleted && fullPdfUrl && (
            <PdfPreview
              url={fullPdfUrl}
              className="min-h-[600px]"
            />
          )}

          {/* Chat placeholder for 06-E */}
          {isCompleted && (
            <div className="rounded-lg border border-dashed border-muted-foreground/30 p-4 text-center">
              <p className="text-sm text-muted-foreground">
                Chat corrections panel will be available in a future update.
              </p>
            </div>
          )}
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
          disabled={!isCompleted}
          className="min-w-[180px]"
        >
          <CheckCircle className="h-4 w-4 mr-2" aria-hidden="true" />
          Satisfied -- Continue
        </Button>
      </div>
    </div>
  )
}
