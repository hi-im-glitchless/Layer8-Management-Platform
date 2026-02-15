import { useState, useEffect, useCallback } from 'react'
import { Loader2, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileUpload } from '@/components/ui/file-upload'
import { AnalysisProgressDisplay, type StepDef } from '@/features/adapter/components/AnalysisProgress'
import { useUploadReport, useSanitizeReport } from '../hooks'

/** Upload + sanitization pipeline step definitions */
const UPLOAD_PIPELINE_STEPS: StepDef[] = [
  { step: 'uploading', message: 'Uploading report...' },
  { step: 'detecting', message: 'Detecting language...' },
  { step: 'sanitizing', message: 'Sanitizing paragraphs...' },
  { step: 'extracting', message: 'Extracting findings...' },
]

/** Estimated percentage for each pipeline step */
const UPLOAD_PIPELINE_PERCENT: Record<number, number> = {
  0: 5,
  1: 15,
  2: 50,
  3: 80,
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface StepUploadProps {
  sessionId?: string | null
  onSessionCreate: (sessionId: string) => void
  onPipelineComplete: (sessionId: string) => void
}

export function StepUpload({ onSessionCreate, onPipelineComplete }: StepUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // Pipeline progress state
  const [pipelineSessionId, setPipelineSessionId] = useState<string | null>(null)
  const [pipelineStep, setPipelineStep] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  const uploadMutation = useUploadReport()
  const sanitizeMutation = useSanitizeReport()

  const isUploading = uploadMutation.isPending
  const isSanitizing = sanitizeMutation.isPending
  const isPipelineRunning = isUploading || isSanitizing

  // Elapsed timer while pipeline is running
  useEffect(() => {
    if (!isPipelineRunning) return
    const start = Date.now()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [isPipelineRunning])

  // Step estimation based on elapsed time
  useEffect(() => {
    if (!isPipelineRunning) return
    if (isSanitizing) {
      if (elapsed >= 10) setPipelineStep(3)
      else setPipelineStep(2)
    } else if (isUploading) {
      if (elapsed >= 2) setPipelineStep(1)
      else setPipelineStep(0)
    }
  }, [elapsed, isPipelineRunning, isUploading, isSanitizing])

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file)
  }, [])

  const handleUpload = useCallback(() => {
    if (!selectedFile) return

    setPipelineStep(0)
    setElapsed(0)

    uploadMutation.mutate(selectedFile, {
      onSuccess: (data) => {
        toast.success('Report uploaded successfully')
        onSessionCreate(data.sessionId)
        setPipelineSessionId(data.sessionId)

        // Auto-trigger sanitization
        setPipelineStep(2)
        sanitizeMutation.mutate(data.sessionId, {
          onSuccess: () => {
            toast.success('Report sanitized successfully')
            onPipelineComplete(data.sessionId)
          },
        })
      },
    })
  }, [selectedFile, uploadMutation, sanitizeMutation, onSessionCreate, onPipelineComplete])

  const handleRetry = useCallback(() => {
    if (!pipelineSessionId) return
    setPipelineStep(2)
    setElapsed(0)
    sanitizeMutation.mutate(pipelineSessionId, {
      onSuccess: () => {
        toast.success('Report sanitized successfully')
        onPipelineComplete(pipelineSessionId)
      },
    })
  }, [pipelineSessionId, sanitizeMutation, onPipelineComplete])

  // Pipeline phase for progress display
  const pipelinePhase: 'idle' | 'running' | 'complete' | 'error' =
    uploadMutation.isError || sanitizeMutation.isError
      ? 'error'
      : sanitizeMutation.isSuccess
        ? 'complete'
        : isPipelineRunning
          ? 'running'
          : 'idle'

  const pipelineError =
    uploadMutation.isError
      ? (uploadMutation.error as Error)?.message || 'Upload failed'
      : sanitizeMutation.isError
        ? (sanitizeMutation.error as Error)?.message || 'Sanitization failed'
        : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Technical Report</CardTitle>
        <CardDescription>
          Upload a DOCX pentest technical report. Language is automatically detected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* File upload */}
        {!isPipelineRunning && pipelinePhase !== 'complete' && (
          <>
            <FileUpload
              onFileSelect={handleFileSelect}
              accept=".docx"
              maxSizeMB={50}
              isUploading={isUploading}
              disabled={isPipelineRunning}
              error={
                uploadMutation.isError
                  ? (uploadMutation.error as Error).message
                  : undefined
              }
            />

            {/* Selected file info */}
            {selectedFile && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">{selectedFile.name}</span>
                <span className="text-xs">({formatFileSize(selectedFile.size)})</span>
              </div>
            )}

            {/* Upload button */}
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || isPipelineRunning}
              className="w-full sm:w-auto"
              variant="gradient"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                  Uploading...
                </>
              ) : (
                'Upload & Sanitize'
              )}
            </Button>
          </>
        )}

        {/* Pipeline progress */}
        {(isPipelineRunning || pipelinePhase === 'error' || pipelinePhase === 'complete') && (
          <div className="pt-2">
            {selectedFile && (
              <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
                <FileText className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">{selectedFile.name}</span>
                <span className="text-xs">({formatFileSize(selectedFile.size)})</span>
              </div>
            )}
            <h3 className="text-sm font-medium text-center mb-4">
              {pipelinePhase === 'error'
                ? 'Pipeline failed'
                : pipelinePhase === 'complete'
                  ? 'Processing complete'
                  : 'Processing report'}
            </h3>
            <AnalysisProgressDisplay
              activePhase={pipelinePhase}
              activeStepIndex={pipelineStep}
              elapsed={elapsed}
              errorMessage={pipelineError}
              onRetry={handleRetry}
              steps={UPLOAD_PIPELINE_STEPS}
              stepPercent={UPLOAD_PIPELINE_PERCENT}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
