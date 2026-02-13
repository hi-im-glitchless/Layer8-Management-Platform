import { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileUpload } from '@/components/ui/file-upload'
import { PdfPreview } from '@/components/ui/pdf-preview'
import { useUploadDocument, usePdfJobStatus } from '@/features/documents/hooks'
import { documentsApi } from '@/features/documents/api'
import { FileText, Loader2, CheckCircle, XCircle } from 'lucide-react'

type ConversionStage = 'idle' | 'uploading' | 'converting' | 'ready' | 'error'

function stageLabel(stage: ConversionStage): string {
  switch (stage) {
    case 'idle':
      return 'Waiting for file'
    case 'uploading':
      return 'Uploading...'
    case 'converting':
      return 'Converting to PDF...'
    case 'ready':
      return 'Ready'
    case 'error':
      return 'Error'
  }
}

function StageBadge({ stage }: { stage: ConversionStage }) {
  const variant =
    stage === 'ready'
      ? 'default'
      : stage === 'error'
        ? 'destructive'
        : 'secondary'

  const Icon =
    stage === 'ready'
      ? CheckCircle
      : stage === 'error'
        ? XCircle
        : stage === 'idle'
          ? FileText
          : Loader2

  return (
    <Badge variant={variant} className="gap-1.5">
      <Icon
        className={`h-3 w-3 ${stage === 'uploading' || stage === 'converting' ? 'animate-spin' : ''}`}
      />
      {stageLabel(stage)}
    </Badge>
  )
}

export function Documents() {
  const [jobId, setJobId] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [stage, setStage] = useState<ConversionStage>('idle')
  const [uploadError, setUploadError] = useState<string | undefined>()

  const uploadMutation = useUploadDocument()

  const jobQuery = usePdfJobStatus(jobId)

  // Derive PDF URL from job status when completed
  const jobStatus = jobQuery.data?.status
  const jobPdfUrl = jobQuery.data?.pdfUrl

  // React to job status changes
  if (jobStatus === 'completed' && jobPdfUrl && stage === 'converting') {
    const fullUrl = documentsApi.downloadUrl(jobPdfUrl.replace('/api/documents/download/', ''))
    setPdfUrl(fullUrl)
    setStage('ready')
  } else if (jobStatus === 'failed' && stage === 'converting') {
    setStage('error')
    setUploadError(jobQuery.data?.error || 'PDF conversion failed')
  }

  const handleFileSelect = useCallback(
    (file: File) => {
      setStage('uploading')
      setUploadError(undefined)
      setPdfUrl(null)
      setJobId(null)

      uploadMutation.mutate(file, {
        onSuccess: (data) => {
          // The upload endpoint returns { jobId, status }
          const responseJobId = (data as unknown as { jobId: string }).jobId
          if (responseJobId) {
            setJobId(responseJobId)
            setStage('converting')
          } else {
            setStage('error')
            setUploadError('No job ID returned from upload')
          }
        },
        onError: (error) => {
          setStage('error')
          setUploadError(error.message)
        },
      })
    },
    [uploadMutation],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
          <p className="text-muted-foreground mt-2">
            Upload DOCX files and preview converted PDFs.
          </p>
        </div>
        <StageBadge stage={stage} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upload panel */}
        <Card>
          <CardHeader>
            <CardTitle>Upload Document</CardTitle>
            <CardDescription>
              Drop a .docx file to upload and convert to PDF
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileUpload
              onFileSelect={handleFileSelect}
              accept=".docx"
              maxSizeMB={50}
              isUploading={stage === 'uploading'}
              progress={stage === 'uploading' ? 50 : 0}
              error={uploadError}
              disabled={stage === 'uploading' || stage === 'converting'}
            />

            {/* Job progress detail */}
            {stage === 'converting' && jobQuery.data && (
              <div className="mt-4 text-sm text-muted-foreground">
                <p>
                  Status: <span className="font-medium">{jobQuery.data.status}</span>
                  {jobQuery.data.progress !== undefined && (
                    <> &mdash; {Math.round(jobQuery.data.progress)}%</>
                  )}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* PDF Preview panel */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>PDF Preview</CardTitle>
            <CardDescription>
              {stage === 'ready'
                ? 'Converted PDF ready for viewing'
                : 'Upload a DOCX file to see the PDF preview'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-0">
            <PdfPreview
              url={pdfUrl}
              isLoading={stage === 'converting'}
              error={stage === 'error' ? uploadError : undefined}
              className="h-[500px]"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
