import { useState, useEffect, useCallback } from 'react'
import { Loader2, FileText, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FileUpload } from '@/components/ui/file-upload'
import { useUploadTemplate, useAutoMap, useWizardSession } from '../hooks'
import { AnalysisProgressDisplay } from './AnalysisProgress'
import type { TemplateType, TemplateLanguage } from '../types'

/** Auto-map progress step definitions */
const AUTO_MAP_STEPS = [
  { step: 'analyze', message: 'Analyzing template structure...' },
  { step: 'mapping', message: 'LLM mapping placeholders...' },
  { step: 'applying', message: 'Applying placeholders to document...' },
  { step: 'preview', message: 'Generating placeholder preview...' },
]

/** Estimated percentage for each auto-map step */
const AUTO_MAP_PERCENT: Record<number, number> = {
  0: 5,   // analyzing structure (fast)
  1: 35,  // LLM mapping (bulk of time)
  2: 70,  // applying placeholders
  3: 90,  // generating preview
}

interface StepUploadProps {
  onSessionCreate: (sessionId: string) => void
  onAutoMapComplete?: (sessionId: string) => void
  onFileReady: (file: File) => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Format seconds as "Xm Ys" or "Xs" */
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

export function StepUpload({ onSessionCreate, onAutoMapComplete, onFileReady }: StepUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [templateType, setTemplateType] = useState<TemplateType | ''>('')
  const [language, setLanguage] = useState<TemplateLanguage | ''>('')
  const [validationError, setValidationError] = useState<string | null>(null)

  // Auto-map progress state
  const [autoMapSessionId, setAutoMapSessionId] = useState<string | null>(null)
  const [autoMapStep, setAutoMapStep] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  const uploadMutation = useUploadTemplate()
  const autoMapMutation = useAutoMap()

  // sessionStorage key for elapsed time persistence
  const storageKey = autoMapSessionId ? `adapter-automap-start-${autoMapSessionId}` : null

  const getStoredStart = useCallback((): number | null => {
    if (!storageKey) return null
    const raw = sessionStorage.getItem(storageKey)
    return raw ? Number(raw) : null
  }, [storageKey])

  const setStoredStart = useCallback((ts: number) => {
    if (storageKey) sessionStorage.setItem(storageKey, String(ts))
  }, [storageKey])

  const clearStoredStart = useCallback(() => {
    if (storageKey) sessionStorage.removeItem(storageKey)
  }, [storageKey])

  // Elapsed timer while auto-mapping -- persisted in sessionStorage
  useEffect(() => {
    if (!autoMapMutation.isPending) {
      // Not running -- if we completed, clear stored start
      if (autoMapMutation.isSuccess || autoMapMutation.isError) {
        clearStoredStart()
      }
      return
    }
    // Currently running -- ensure we have a start time
    let start = getStoredStart()
    if (!start) {
      start = Date.now()
      setStoredStart(start)
    }
    const tick = () => {
      const s = getStoredStart() ?? Date.now()
      setElapsed(Math.floor((Date.now() - s) / 1000))
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [autoMapMutation.isPending, autoMapMutation.isSuccess, autoMapMutation.isError, getStoredStart, setStoredStart, clearStoredStart])

  // Progress step estimation based on elapsed time
  useEffect(() => {
    if (!autoMapMutation.isPending) return
    if (elapsed >= 90) setAutoMapStep(3)       // ~90s+: generating preview
    else if (elapsed >= 45) setAutoMapStep(2)  // ~45-90s: applying placeholders
    else if (elapsed >= 3) setAutoMapStep(1)   // ~3-45s: LLM mapping (bulk of time)
    else setAutoMapStep(0)                      // 0-3s: analyzing structure
  }, [elapsed, autoMapMutation.isPending])

  // Poll session as fallback -- if auto-map takes >60s, check session every 10s
  const sessionPoll = useWizardSession(
    autoMapMutation.isPending && elapsed >= 60 ? autoMapSessionId : null,
  )

  useEffect(() => {
    if (!autoMapMutation.isPending || !autoMapSessionId || elapsed < 60) return
    if (elapsed % 10 === 0 && sessionPoll.data?.adaptation?.appliedCount) {
      // Server-side auto-map completed -- advance
      clearStoredStart()
      toast.success('Template auto-mapped successfully')
      if (onAutoMapComplete) {
        onAutoMapComplete(autoMapSessionId)
      }
    }
  }, [elapsed, autoMapMutation.isPending, autoMapSessionId, sessionPoll.data, onAutoMapComplete, clearStoredStart])

  // Also trigger session poll refetch periodically
  useEffect(() => {
    if (!autoMapMutation.isPending || !autoMapSessionId || elapsed < 60) return
    if (elapsed % 10 === 0) {
      sessionPoll.refetch()
    }
  }, [elapsed, autoMapMutation.isPending, autoMapSessionId, sessionPoll])

  const handleFileSelect = useCallback(
    (file: File) => {
      setSelectedFile(file)
      setValidationError(null)
      onFileReady(file)
    },
    [onFileReady],
  )

  const handleUploadAndAutoMap = useCallback(() => {
    // Zod-style validation
    if (!selectedFile) {
      setValidationError('Please select a DOCX file')
      return
    }
    if (!templateType) {
      setValidationError('Please select a template type')
      return
    }
    if (!language) {
      setValidationError('Please select a language')
      return
    }

    setValidationError(null)

    uploadMutation.mutate(
      { file: selectedFile, templateType, language },
      {
        onSuccess: (data) => {
          toast.success('Template uploaded successfully')
          onSessionCreate(data.sessionId)
          // Immediately trigger auto-map
          setAutoMapSessionId(data.sessionId)
          setStoredStart(Date.now())
          setElapsed(0)
          setAutoMapStep(0)
          autoMapMutation.mutate(data.sessionId, {
            onSuccess: () => {
              clearStoredStart()
              toast.success('Template auto-mapped successfully')
              if (onAutoMapComplete) {
                onAutoMapComplete(data.sessionId)
              }
            },
          })
        },
      },
    )
  }, [selectedFile, templateType, language, uploadMutation, onSessionCreate, autoMapMutation, onAutoMapComplete, setStoredStart, clearStoredStart])

  const handleRetryAutoMap = useCallback(() => {
    if (!autoMapSessionId) return
    setStoredStart(Date.now())
    setElapsed(0)
    setAutoMapStep(0)
    autoMapMutation.mutate(autoMapSessionId, {
      onSuccess: () => {
        clearStoredStart()
        toast.success('Template auto-mapped successfully')
        if (onAutoMapComplete) {
          onAutoMapComplete(autoMapSessionId)
        }
      },
    })
  }, [autoMapSessionId, autoMapMutation, onAutoMapComplete, setStoredStart, clearStoredStart])

  const isUploading = uploadMutation.isPending
  const isAutoMapping = autoMapMutation.isPending
  const isDisabled = isUploading || isAutoMapping

  // Auto-map phase for progress display
  const autoMapPhase: 'idle' | 'running' | 'complete' | 'error' = autoMapMutation.isError
    ? 'error'
    : autoMapMutation.isSuccess
      ? 'complete'
      : isAutoMapping
        ? 'running'
        : 'idle'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Template</CardTitle>
        <CardDescription>
          Select your DOCX template file and configure the template type and language.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* File upload */}
        <div>
          <FileUpload
            onFileSelect={handleFileSelect}
            accept=".docx"
            maxSizeMB={50}
            isUploading={isUploading}
            disabled={isDisabled}
            error={
              uploadMutation.isError
                ? (uploadMutation.error as Error).message
                : undefined
            }
          />

          {/* Selected file info */}
          {selectedFile && !isUploading && !isAutoMapping && (
            <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
              <FileText className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">{selectedFile.name}</span>
              <span className="text-xs">({formatFileSize(selectedFile.size)})</span>
            </div>
          )}
        </div>

        {/* Configuration row */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Template type */}
          <div className="space-y-2">
            <Label htmlFor="template-type">Template Type</Label>
            <Select
              value={templateType}
              onValueChange={(val) => setTemplateType(val as TemplateType)}
              disabled={isDisabled}
            >
              <SelectTrigger id="template-type">
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="web">Web Application</SelectItem>
                <SelectItem value="internal">Internal Network</SelectItem>
                <SelectItem value="mobile">Mobile Application</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Language */}
          <div className="space-y-2">
            <Label htmlFor="template-language">Language</Label>
            <Select
              value={language}
              onValueChange={(val) => setLanguage(val as TemplateLanguage)}
              disabled={isDisabled}
            >
              <SelectTrigger id="template-language">
                <SelectValue placeholder="Select language..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="pt-pt">Portuguese (PT-PT)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Validation error */}
        {validationError && (
          <p className="text-sm text-destructive" role="alert">
            {validationError}
          </p>
        )}

        {/* Submit button -- hidden during auto-map */}
        {!isAutoMapping && autoMapPhase !== 'error' && (
          <Button
            onClick={handleUploadAndAutoMap}
            disabled={isDisabled || !selectedFile}
            className="w-full sm:w-auto"
            variant="gradient"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                Uploading...
              </>
            ) : (
              'Upload & Analyze'
            )}
          </Button>
        )}

        {/* Auto-map progress (shown inline after upload succeeds) */}
        {(isAutoMapping || autoMapPhase === 'error' || autoMapPhase === 'complete') && (
          <div className="pt-2">
            {selectedFile && (
              <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
                <FileText className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">{selectedFile.name}</span>
                <span className="text-xs">({formatFileSize(selectedFile.size)})</span>
              </div>
            )}
            <h3 className="text-sm font-medium text-center mb-4">
              {autoMapPhase === 'error'
                ? 'Auto-mapping failed'
                : autoMapPhase === 'complete'
                  ? 'Auto-mapping complete'
                  : 'Auto-mapping template'}
            </h3>
            {autoMapPhase === 'error' && (
              <div className="flex justify-center mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetryAutoMap}
                  disabled={autoMapMutation.isPending}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  Retry Auto-map
                </Button>
              </div>
            )}
            <AnalysisProgressDisplay
              activePhase={autoMapPhase}
              activeStepIndex={autoMapStep}
              elapsed={elapsed}
              errorMessage={
                autoMapMutation.isError
                  ? (autoMapMutation.error as Error)?.message || 'Unknown error'
                  : undefined
              }
              onRetry={handleRetryAutoMap}
              steps={AUTO_MAP_STEPS}
              stepPercent={AUTO_MAP_PERCENT}
            />
            {isAutoMapping && elapsed >= 60 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Large templates can take 2-3 minutes. Elapsed: {formatElapsed(elapsed)}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
