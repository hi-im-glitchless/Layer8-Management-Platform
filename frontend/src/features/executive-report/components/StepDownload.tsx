import { useState, useCallback, useMemo } from 'react'
import { CheckCircle, Download, FileText, Plus, BarChart3, Globe, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { reportApi } from '../api'
import type { ReportWizardState, EntityMapping } from '../types'

interface StepDownloadProps {
  sessionId: string
  wizardState: ReportWizardState | null
  onStartNew: () => void
}

/**
 * Build a placeholder -> originalValue lookup from entity mappings
 * for de-sanitization before PDF generation.
 */
function buildDesanitizeMap(mappings: EntityMapping[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const m of mappings) {
    if (m.placeholder && m.originalValue) {
      map[m.placeholder] = m.originalValue
    }
  }
  return map
}

/**
 * Apply de-sanitization to HTML: replace all placeholders with original values.
 */
function desanitizeHtml(html: string, desanitizeMap: Record<string, string>): string {
  let result = html
  for (const [placeholder, originalValue] of Object.entries(desanitizeMap)) {
    result = result.replaceAll(placeholder, originalValue)
  }
  return result
}

export function StepDownload({ sessionId, wizardState, onStartNew }: StepDownloadProps) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

  const entityMappings = wizardState?.entityMappings ?? []
  const desanitizeMap = useMemo(() => buildDesanitizeMap(entityMappings), [entityMappings])

  const handleDownloadPdf = useCallback(async () => {
    if (!wizardState?.generatedHtml) {
      toast.error('No report HTML available')
      return
    }

    setIsGeneratingPdf(true)

    try {
      const response = await reportApi.downloadPdf(sessionId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Download failed' }))
        throw new Error((errorData as { error?: string }).error || 'PDF download failed')
      }

      // Create blob and trigger download
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = wizardState?.metadata?.clientName
        ? `executive_report_${wizardState.metadata.clientName.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`
        : 'executive_report.pdf'
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success('PDF download started')
    } catch (err) {
      toast.error((err as Error).message || 'PDF generation failed')
    } finally {
      setIsGeneratingPdf(false)
    }
  }, [sessionId, wizardState])

  const fileName = wizardState?.uploadedFile?.originalName ?? 'Unknown'
  const language = wizardState?.detectedLanguage ?? 'Unknown'
  const riskScore = wizardState?.riskScore
  const findingsCount = wizardState?.findingsJson
    ? (Array.isArray(wizardState.findingsJson)
        ? wizardState.findingsJson.length
        : Object.keys(wizardState.findingsJson).length)
    : 0
  const chatIterations = wizardState?.chatIterationCount ?? 0

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
            Your executive report has been generated and is ready for download as PDF.
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

          {/* Download button */}
          <div className="flex flex-col items-center gap-3">
            <Button
              variant="gradient"
              size="lg"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf || !wizardState?.generatedHtml}
              className="min-w-[280px]"
            >
              {isGeneratingPdf ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-5 w-5 mr-2" aria-hidden="true" />
              )}
              {isGeneratingPdf ? 'Generating PDF...' : 'Download PDF'}
            </Button>

            <Button variant="outline" onClick={onStartNew} className="min-w-[280px]">
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              Generate Another Report
            </Button>
          </div>

          {/* Info text */}
          <div className="border-t pt-4 text-center">
            <p className="text-sm text-muted-foreground">
              The PDF is generated from the de-sanitized HTML with all real values restored.
              Charts are rendered via Chart.js during PDF conversion.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
