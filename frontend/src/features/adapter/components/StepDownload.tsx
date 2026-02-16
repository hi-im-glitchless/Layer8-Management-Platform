import { useCallback, useRef } from 'react'
import { CheckCircle, Download, Plus, FileText, ScrollText } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { adapterApi } from '../api'
import type { WizardState } from '../types'

interface StepDownloadProps {
  sessionId: string
  wizardState: WizardState | null
  onStartNew: () => void
}

export function StepDownload({ sessionId, wizardState, onStartNew }: StepDownloadProps) {
  const downloadLinkRef = useRef<HTMLAnchorElement>(null)

  const handleDownload = useCallback(() => {
    const url = adapterApi.downloadUrl(sessionId)
    // Create a temporary anchor to trigger browser download
    const link = document.createElement('a')
    link.href = url
    link.download = wizardState?.templateFile.originalName
      ? `adapted_${wizardState.templateFile.originalName}`
      : `adapted_template.docx`
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Download started')
  }, [sessionId, wizardState])

  const templateType = wizardState?.config.templateType ?? 'web'
  const language = wizardState?.config.language ?? 'en'
  const appliedCount = wizardState?.adaptation.appliedCount ?? 0
  const iterationCount = wizardState?.chat.iterationCount ?? 0

  const typeLabel =
    templateType === 'web'
      ? 'Web Application'
      : templateType === 'internal'
        ? 'Internal Network'
        : 'Mobile Application'

  const langLabel = language === 'pt-pt' ? 'Portuguese (PT-PT)' : 'English'

  return (
    <div className="space-y-6">
      {/* Success card */}
      <Card>
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15 mx-auto">
              <CheckCircle className="h-8 w-8 text-success" aria-hidden="true" />
            </div>
          </div>
          <CardTitle className="text-2xl">Template Adapted Successfully</CardTitle>
          <CardDescription>
            Your template has been adapted with Ghostwriter field mappings and is ready for download.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary badges */}
          <div className="flex flex-wrap justify-center gap-3">
            <Badge variant="secondary" className="text-sm py-1 px-3">
              <FileText className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              {typeLabel}
            </Badge>
            <Badge variant="secondary" className="text-sm py-1 px-3">
              {langLabel}
            </Badge>
            <Badge variant="secondary" className="text-sm py-1 px-3">
              {appliedCount} placeholder{appliedCount !== 1 ? 's' : ''}
            </Badge>
            {iterationCount > 0 && (
              <Badge variant="outline" className="text-sm py-1 px-3">
                {iterationCount} iteration{iterationCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>

          {/* Download button */}
          <div className="flex flex-col items-center gap-3">
            <Button
              variant="gradient"
              size="lg"
              onClick={handleDownload}
              className="min-w-[240px]"
            >
              <Download className="h-5 w-5 mr-2" aria-hidden="true" />
              Download Template
            </Button>

            {/* Hidden ref for programmatic download (fallback) */}
            <a ref={downloadLinkRef} className="hidden" aria-hidden="true" />

            <Button variant="outline" onClick={onStartNew} className="min-w-[240px]">
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              Start New Adaptation
            </Button>
          </div>

          {/* Info text */}
          <div className="border-t pt-4 space-y-3">
            <p className="text-sm text-muted-foreground text-center">
              Upload this template to Ghostwriter to generate reports automatically.
              The downloaded file contains Jinja2 placeholders that Ghostwriter will populate
              with real assessment data.
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/70">
              <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
              <span>This adaptation has been logged in the audit trail.</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
