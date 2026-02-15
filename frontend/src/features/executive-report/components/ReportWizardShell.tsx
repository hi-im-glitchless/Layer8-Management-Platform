import { useState, useCallback, lazy, Suspense } from 'react'
import { Loader2, ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useReportSession, useResetReportSession } from '../hooks'
import { ReportStepIndicator, REPORT_STEP_ORDER } from './ReportStepIndicator'
import type { ReportWizardStep } from '../types'

// Lazy load step components to reduce initial bundle
const StepUpload = lazy(() =>
  import('./StepUpload').then((m) => ({ default: m.StepUpload })),
)
const StepSanitizeReview = lazy(() =>
  import('./StepSanitizeReview').then((m) => ({ default: m.StepSanitizeReview })),
)
const StepGenerate = lazy(() =>
  import('./StepGenerate').then((m) => ({ default: m.StepGenerate })),
)
const StepReview = lazy(() =>
  import('./StepReview').then((m) => ({ default: m.StepReview })),
)
const StepDownload = lazy(() =>
  import('./StepDownload').then((m) => ({ default: m.StepDownload })),
)

const STEP_SEQUENCE: ReportWizardStep[] = [
  'upload',
  'sanitize-review',
  'generate',
  'review',
  'download',
]

function StepFallback() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

interface ReportWizardShellProps {
  sessionId: string | null
  onSessionCreate: (id: string) => void
  onSessionClear: () => void
}

export function ReportWizardShell({
  sessionId,
  onSessionCreate,
  onSessionClear,
}: ReportWizardShellProps) {
  const sessionQuery = useReportSession(sessionId)

  // Local step override for back navigation
  const [overrideStep, setOverrideStep] = useState<ReportWizardStep | null>(null)

  // Track whether we just created this session from upload
  const [freshUpload, setFreshUpload] = useState(false)

  const handleSessionCreate = useCallback(
    (id: string) => {
      setFreshUpload(true)
      onSessionCreate(id)
    },
    [onSessionCreate],
  )

  // Determine effective current step
  const serverStep = sessionQuery.data?.currentStep
  const sessionData = sessionQuery.data

  // Infer the minimum step from what the session already has
  let inferredMinStep: ReportWizardStep = 'upload'
  if (sessionData) {
    if (sessionData.sanitizedParagraphs?.length > 0) {
      inferredMinStep = 'sanitize-review'
    }
    if (sessionData.findingsJson) {
      inferredMinStep = 'generate'
    }
    if (sessionData.reportPdfJobId || sessionData.reportPdfUrl) {
      inferredMinStep = 'review'
    }
    if (sessionData.currentStep === 'download') {
      inferredMinStep = 'download'
    }
  }

  // Pick the highest step among override, server, and inferred minimum
  const candidates = [overrideStep, serverStep, inferredMinStep].filter(Boolean) as ReportWizardStep[]
  const effectiveStep: ReportWizardStep = candidates.reduce(
    (best, step) =>
      REPORT_STEP_ORDER[step] > REPORT_STEP_ORDER[best] ? step : best,
    'upload' as ReportWizardStep,
  )
  const currentStepIndex = REPORT_STEP_ORDER[effectiveStep]

  // The furthest step the server has reached
  const maxReachableIndex = Math.max(
    serverStep ? REPORT_STEP_ORDER[serverStep] : 0,
    REPORT_STEP_ORDER[inferredMinStep],
  )

  const handleStepClick = useCallback(
    (step: ReportWizardStep) => {
      const targetIndex = REPORT_STEP_ORDER[step]
      // Allow clicking only if going backward within navigable range
      if (targetIndex < currentStepIndex && targetIndex >= minNavigableIndex) {
        setOverrideStep(step)
      }
    },
    [currentStepIndex, minNavigableIndex],
  )

  // Step regression prevention: after generation, can't go back past sanitize-review
  const minNavigableIndex = sessionData?.narrativeSections
    ? REPORT_STEP_ORDER['sanitize-review']
    : 0

  const goBack = useCallback(() => {
    const targetIndex = currentStepIndex - 1
    if (targetIndex >= minNavigableIndex) {
      setOverrideStep(STEP_SEQUENCE[targetIndex])
    }
  }, [currentStepIndex, minNavigableIndex])

  const goForward = useCallback(() => {
    if (currentStepIndex < maxReachableIndex) {
      setOverrideStep(STEP_SEQUENCE[currentStepIndex + 1])
    }
  }, [currentStepIndex, maxReachableIndex])

  const advanceToStep = useCallback(
    (step: ReportWizardStep) => {
      setOverrideStep(null)
      sessionQuery.refetch()
      setOverrideStep(step)
    },
    [sessionQuery],
  )

  // Called by StepUpload after upload + sanitization completes
  const handlePipelineComplete = useCallback(
    (id: string) => {
      setFreshUpload(false)
      onSessionCreate(id)
      advanceToStep('sanitize-review')
    },
    [onSessionCreate, advanceToStep],
  )

  const resetMutation = useResetReportSession()

  const handleNewSession = useCallback(() => {
    if (sessionId) {
      resetMutation.mutate(sessionId)
    }
    setOverrideStep(null)
    setFreshUpload(false)
    onSessionClear()
  }, [sessionId, resetMutation, onSessionClear])

  const handleReset = useCallback(() => {
    if (!sessionId) return
    resetMutation.mutate(sessionId, {
      onSuccess: () => {
        toast.success('Session cleared')
        handleNewSession()
      },
    })
  }, [sessionId, resetMutation, handleNewSession])

  // Error state
  if (sessionId && sessionQuery.isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-destructive font-medium">Failed to load report session</p>
          <p className="text-sm text-muted-foreground mt-2">
            {(sessionQuery.error as Error)?.message || 'Unknown error'}
          </p>
          <div className="flex gap-2 justify-center mt-4">
            <Button variant="outline" onClick={() => sessionQuery.refetch()}>
              Retry
            </Button>
            <Button variant="outline" onClick={handleNewSession}>
              Start New
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Loading session -- skip when we just uploaded
  if (sessionId && sessionQuery.isLoading && !freshUpload) {
    return (
      <div className="space-y-6">
        <ReportStepIndicator currentStep="upload" />
        <StepFallback />
      </div>
    )
  }

  const renderStep = () => {
    switch (effectiveStep) {
      case 'upload':
        return (
          <StepUpload
            sessionId={sessionId}
            onSessionCreate={handleSessionCreate}
            onPipelineComplete={handlePipelineComplete}
          />
        )
      case 'sanitize-review':
        return (
          <StepSanitizeReview
            sessionId={sessionId!}
            wizardState={sessionQuery.data ?? null}
            onApprove={() => advanceToStep('generate')}
          />
        )
      case 'generate':
        return (
          <StepGenerate
            sessionId={sessionId!}
            onComplete={() => advanceToStep('review')}
            onGoBack={() => setOverrideStep('sanitize-review')}
          />
        )
      case 'review':
        return (
          <StepReview
            sessionId={sessionId!}
            onSatisfied={() => advanceToStep('download')}
            onRegenerate={() => setOverrideStep('generate')}
          />
        )
      case 'download':
        return (
          <StepDownload
            sessionId={sessionId!}
            wizardState={sessionQuery.data ?? null}
            onStartNew={handleNewSession}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <ReportStepIndicator currentStep={effectiveStep} onStepClick={handleStepClick} />

      {/* Step content */}
      <Suspense fallback={<StepFallback />}>{renderStep()}</Suspense>

      {/* Navigation buttons */}
      {effectiveStep !== 'upload' && effectiveStep !== 'download' && (
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={goBack}
              disabled={currentStepIndex <= minNavigableIndex}
            >
              <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
              Back
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={resetMutation.isPending}
              className="text-muted-foreground hover:text-destructive"
            >
              <RotateCcw className="h-4 w-4 mr-1" aria-hidden="true" />
              Start Over
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={goForward}
            disabled={currentStepIndex >= maxReachableIndex}
          >
            Forward
            <ArrowRight className="h-4 w-4 ml-1" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  )
}
