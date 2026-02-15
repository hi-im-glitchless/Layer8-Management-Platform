import { useCallback } from 'react'
import { CheckCircle, Download, FileText, Plus, BarChart3, Globe } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { reportApi } from '../api'
import type { ReportWizardState } from '../types'

interface StepDownloadProps {
  sessionId: string
  wizardState: ReportWizardState | null
  onStartNew: () => void
}

export function StepDownload({ sessionId, wizardState, onStartNew }: StepDownloadProps) {
  const handleDownloadDocx = useCallback(() => {
    const url = reportApi.downloadUrl(sessionId)
    const link = document.createElement('a')
    link.href = url
    link.download = wizardState?.metadata?.clientName
      ? `executive_report_${wizardState.metadata.clientName.replace(/[^a-zA-Z0-9-_]/g, '_')}.docx`
      : 'executive_report.docx'
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('DOCX download started')
  }, [sessionId, wizardState])

  const handleDownloadPdf = useCallback(() => {
    if (!wizardState?.reportPdfUrl) return
    const url = reportApi.pdfDownloadUrl(wizardState.reportPdfUrl)
    const link = document.createElement('a')
    link.href = url
    link.download = wizardState?.metadata?.clientName
      ? `executive_report_${wizardState.metadata.clientName.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`
      : 'executive_report.pdf'
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('PDF download started')
  }, [wizardState])

  const fileName = wizardState?.uploadedFile?.originalName ?? 'Unknown'
  const language = wizardState?.detectedLanguage ?? 'Unknown'
  const riskScore = wizardState?.riskScore
  const findingsCount = wizardState?.findingsJson
    ? (Array.isArray(wizardState.findingsJson)
        ? wizardState.findingsJson.length
        : Object.keys(wizardState.findingsJson).length)
    : 0
  const chatIterations = wizardState?.chatIterationCount ?? 0
  const hasPdf = !!wizardState?.reportPdfUrl

  const langLabel = language === 'pt' || language === 'pt-pt'
    ? 'Portuguese (PT-PT)'
    : language === 'en'
      ? 'English'
      : language

  return (
    <div className="space-y-6">
      {/* Success card */}
      <Card>
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 mx-auto">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" aria-hidden="true" />
            </div>
          </div>
          <CardTitle className="text-2xl">Executive Report Ready</CardTitle>
          <CardDescription>
            Your executive report has been generated and is ready for download.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary card */}
          <div className="rounded-lg border bg-muted/10 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
              <span className="font-medium">Source:</span>
              <span className="text-muted-foreground truncate">{fileName}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <Badge variant="secondary" className="text-sm py-1 px-3">
                <Globe className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                {langLabel}
              </Badge>
              {riskScore !== null && riskScore !== undefined && (
                <Badge variant="secondary" className="text-sm py-1 px-3">
                  <BarChart3 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  Risk Score: {riskScore}
                </Badge>
              )}
              {findingsCount > 0 && (
                <Badge variant="secondary" className="text-sm py-1 px-3">
                  {findingsCount} finding{findingsCount !== 1 ? 's' : ''}
                </Badge>
              )}
              {chatIterations > 0 && (
                <Badge variant="outline" className="text-sm py-1 px-3">
                  {chatIterations} correction{chatIterations !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>

          {/* Download buttons */}
          <div className="flex flex-col items-center gap-3">
            <Button
              variant="gradient"
              size="lg"
              onClick={handleDownloadDocx}
              className="min-w-[280px]"
            >
              <Download className="h-5 w-5 mr-2" aria-hidden="true" />
              Download DOCX
            </Button>

            {hasPdf && (
              <Button
                variant="outline"
                size="lg"
                onClick={handleDownloadPdf}
                className="min-w-[280px]"
              >
                <Download className="h-5 w-5 mr-2" aria-hidden="true" />
                Download PDF
              </Button>
            )}

            <Button variant="outline" onClick={onStartNew} className="min-w-[280px]">
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              Generate Another Report
            </Button>
          </div>

          {/* Info text */}
          <div className="border-t pt-4 text-center">
            <p className="text-sm text-muted-foreground">
              The DOCX file is editable in Microsoft Word or LibreOffice. The PDF is ready for
              client delivery. All sensitive data has been de-sanitized in the final output.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
