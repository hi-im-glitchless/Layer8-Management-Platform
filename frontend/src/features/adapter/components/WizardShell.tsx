import { useState, useCallback, lazy, Suspense } from 'react'
import { Loader2, ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useWizardSession } from '../hooks'
import { StepIndicator, STEP_ORDER } from './StepIndicator'
import type { WizardStep, MappingPlan } from '../types'

// Lazy load step components to reduce initial bundle
const StepUpload = lazy(() =>
  import('./StepUpload').then((m) => ({ default: m.StepUpload })),
)
const StepAnalysis = lazy(() =>
  import('./StepAnalysis').then((m) => ({ default: m.StepAnalysis })),
)
const StepAdaptation = lazy(() =>
  import('./StepAdaptation').then((m) => ({ default: m.StepAdaptation })),
)
const StepPreview = lazy(() =>
  import('./StepPreview').then((m) => ({ default: m.StepPreview })),
)
const StepDownload = lazy(() =>
  import('./StepDownload').then((m) => ({ default: m.StepDownload })),
)

const STEP_SEQUENCE: WizardStep[] = ['upload', 'analysis', 'adaptation', 'preview', 'download']

function StepFallback() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

interface WizardShellProps {
  sessionId: string | null
  onSessionCreate: (id: string) => void
  onSessionClear: () => void
}

export function WizardShell({ sessionId, onSessionCreate, onSessionClear }: WizardShellProps) {
  // Fetch session state from server when we have a sessionId
  const sessionQuery = useWizardSession(sessionId)

  // Local step override for back navigation (avoids re-running backend ops)
  const [overrideStep, setOverrideStep] = useState<WizardStep | null>(null)

  // Local state to carry mapping and file between steps client-side
  const [localMappingPlan, setLocalMappingPlan] = useState<MappingPlan | null>(null)
  const [localFile, setLocalFile] = useState<File | null>(null)

  // Determine effective current step
  const serverStep = sessionQuery.data?.currentStep
  const effectiveStep: WizardStep = overrideStep ?? serverStep ?? 'upload'
  const currentStepIndex = STEP_ORDER[effectiveStep]

  // The furthest step the server has reached (limit for forward navigation)
  const maxReachableIndex = serverStep ? STEP_ORDER[serverStep] : 0

  const handleStepClick = useCallback(
    (step: WizardStep) => {
      const targetIndex = STEP_ORDER[step]
      // Only allow navigating back to completed steps
      if (targetIndex < currentStepIndex) {
        setOverrideStep(step)
      }
    },
    [currentStepIndex],
  )

  const goBack = useCallback(() => {
    if (currentStepIndex > 0) {
      setOverrideStep(STEP_SEQUENCE[currentStepIndex - 1])
    }
  }, [currentStepIndex])

  const goForward = useCallback(() => {
    if (currentStepIndex < maxReachableIndex) {
      setOverrideStep(STEP_SEQUENCE[currentStepIndex + 1])
    }
  }, [currentStepIndex, maxReachableIndex])

  const advanceToStep = useCallback(
    (step: WizardStep) => {
      setOverrideStep(null) // Clear override so server step takes effect
      // Invalidate session query to refetch latest server state
      sessionQuery.refetch()
      // If the desired step is beyond current override, navigate there
      setOverrideStep(step)
    },
    [sessionQuery],
  )

  const handleNewSession = useCallback(() => {
    setOverrideStep(null)
    setLocalMappingPlan(null)
    setLocalFile(null)
    onSessionClear()
  }, [onSessionClear])

  // Error state
  if (sessionId && sessionQuery.isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-destructive font-medium">Failed to load wizard session</p>
          <p className="text-sm text-muted-foreground mt-2">
            {(sessionQuery.error as Error)?.message || 'Unknown error'}
          </p>
          <Button variant="outline" className="mt-4" onClick={() => sessionQuery.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Loading session
  if (sessionId && sessionQuery.isLoading) {
    return (
      <div className="space-y-6">
        <StepIndicator currentStep="upload" />
        <StepFallback />
      </div>
    )
  }

  const renderStep = () => {
    switch (effectiveStep) {
      case 'upload':
        return (
          <StepUpload
            onSessionCreate={onSessionCreate}
            onFileReady={setLocalFile}
          />
        )
      case 'analysis':
        return (
          <StepAnalysis
            sessionId={sessionId!}
            file={localFile}
            templateType={sessionQuery.data?.config.templateType ?? 'web'}
            language={sessionQuery.data?.config.language ?? 'en'}
            initialMappingPlan={localMappingPlan ?? sessionQuery.data?.analysis.mappingPlan ?? null}
            onMappingUpdate={setLocalMappingPlan}
            onProceed={() => advanceToStep('adaptation')}
          />
        )
      case 'adaptation':
        return (
          <StepAdaptation
            sessionId={sessionId!}
            onComplete={() => advanceToStep('preview')}
            onGoBack={() => setOverrideStep('analysis')}
          />
        )
      case 'preview':
        return (
          <StepPreview
            sessionId={sessionId!}
            onSatisfied={() => advanceToStep('download')}
            onReAdapt={() => setOverrideStep('adaptation')}
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
      <StepIndicator currentStep={effectiveStep} onStepClick={handleStepClick} />

      {/* Step content */}
      <Suspense fallback={<StepFallback />}>{renderStep()}</Suspense>

      {/* Navigation buttons */}
      {effectiveStep !== 'upload' && effectiveStep !== 'download' && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goBack}
            disabled={currentStepIndex === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
            Back
          </Button>
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
