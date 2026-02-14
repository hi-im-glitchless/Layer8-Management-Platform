import { useState, useCallback, lazy, Suspense } from 'react'
import { Loader2, ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useWizardSession, useResetSession } from '../hooks'
import { StepIndicator, STEP_ORDER } from './StepIndicator'
import type { WizardStep, MappingPlan } from '../types'

// Lazy load step components to reduce initial bundle
const StepUpload = lazy(() =>
  import('./StepUpload').then((m) => ({ default: m.StepUpload })),
)
const StepVerify = lazy(() =>
  import('./StepVerify').then((m) => ({ default: m.StepVerify })),
)
const StepPreview = lazy(() =>
  import('./StepPreview').then((m) => ({ default: m.StepPreview })),
)
const StepDownload = lazy(() =>
  import('./StepDownload').then((m) => ({ default: m.StepDownload })),
)

const STEP_SEQUENCE: WizardStep[] = ['upload', 'verify', 'preview', 'download']

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
  // Also used to immediately advance after upload (before session query loads)
  const [overrideStep, setOverrideStep] = useState<WizardStep | null>(null)

  // Track whether we just created this session from upload. When true, skip the
  // loading guard so StepUpload stays mounted and shows auto-map progress.
  const [freshUpload, setFreshUpload] = useState(false)

  // Set the session ID after upload. Do NOT advance step here --
  // the Upload step handles auto-map internally and calls onAutoMapComplete on completion.
  const handleSessionCreate = useCallback(
    (id: string) => {
      setFreshUpload(true)
      onSessionCreate(id)
    },
    [onSessionCreate],
  )

  // Local state to carry mapping and file between steps client-side
  const [localMappingPlan, setLocalMappingPlan] = useState<MappingPlan | null>(null)
  const [localFile, setLocalFile] = useState<File | null>(null)

  // Determine effective current step.
  // The server step may lag behind the frontend (e.g., during analysis the backend
  // step is still 'upload' until the LLM completes). Derive a minimum step from
  // session data so the wizard never regresses on component remount or tab refocus.
  const serverStep = sessionQuery.data?.currentStep
  const sessionData = sessionQuery.data

  // Infer the minimum step from what the session already has
  let inferredMinStep: WizardStep = 'upload'
  if (sessionData) {
    // Auto-map completed: has mapping plan AND applied placeholders
    if (sessionData.adaptation?.appliedCount > 0 && sessionData.analysis?.mappingPlan) {
      inferredMinStep = 'verify'
    }
    if (sessionData.preview?.pdfJobId || sessionData.preview?.pdfUrl) inferredMinStep = 'preview'
  }

  // Pick the highest step among override, server, and inferred minimum
  const candidates = [overrideStep, serverStep, inferredMinStep].filter(Boolean) as WizardStep[]
  const effectiveStep: WizardStep = candidates.reduce((best, step) =>
    STEP_ORDER[step] > STEP_ORDER[best] ? step : best,
    'upload' as WizardStep,
  )
  const currentStepIndex = STEP_ORDER[effectiveStep]

  // The furthest step the server has reached (limit for forward navigation)
  const maxReachableIndex = Math.max(
    serverStep ? STEP_ORDER[serverStep] : 0,
    STEP_ORDER[inferredMinStep],
  )

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

  // Called by StepUpload after auto-map completes successfully.
  // Sets the session (if not already set) and advances to 'verify'.
  const handleAutoMapComplete = useCallback(
    (id: string) => {
      setFreshUpload(false)
      onSessionCreate(id)
      advanceToStep('verify')
    },
    [onSessionCreate, advanceToStep],
  )

  const resetMutation = useResetSession()

  const handleNewSession = useCallback(() => {
    setOverrideStep(null)
    setLocalMappingPlan(null)
    setLocalFile(null)
    setFreshUpload(false)
    onSessionClear()
  }, [onSessionClear])

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
          <p className="text-destructive font-medium">Failed to load wizard session</p>
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

  // Loading session -- skip when we just uploaded (StepUpload shows its own progress)
  if (sessionId && sessionQuery.isLoading && !freshUpload) {
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
            sessionId={sessionId}
            onSessionCreate={handleSessionCreate}
            onAutoMapComplete={handleAutoMapComplete}
            onFileReady={setLocalFile}
          />
        )
      case 'verify':
        return (
          <StepVerify
            sessionId={sessionId!}
            templateType={sessionQuery.data?.config.templateType ?? 'web'}
            language={sessionQuery.data?.config.language ?? 'en'}
            initialMappingPlan={localMappingPlan ?? sessionQuery.data?.analysis.mappingPlan ?? null}
            onMappingUpdate={setLocalMappingPlan}
            onApprove={() => advanceToStep('preview')}
          />
        )
      case 'preview':
        return (
          <StepPreview
            sessionId={sessionId!}
            onSatisfied={() => advanceToStep('download')}
            onReAdapt={() => setOverrideStep('verify')}
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
          <div className="flex items-center gap-2">
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
