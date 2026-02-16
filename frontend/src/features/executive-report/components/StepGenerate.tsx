import { useEffect, useCallback, useState } from 'react'
import { RefreshCw, AlertTriangle, ArrowLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AnalysisProgressDisplay, type StepDef } from '@/features/adapter/components/AnalysisProgress'
import { useReportGeneration, useReportSession } from '../hooks'

/** Report generation pipeline stages matching backend SSE stage events */
const GENERATION_STEPS: StepDef[] = [
  { step: 'extracting', message: 'Extracting findings from report...' },
  { step: 'computing', message: 'Computing risk metrics...' },
  { step: 'chart_data', message: 'Preparing chart data...' },
  { step: 'narrative', message: 'Generating HTML report sections...' },
  { step: 'assembling_html', message: 'Assembling HTML report...' },
  { step: 'converting_pdf', message: 'Converting to PDF...' },
]

/** SSE stage name to step index mapping */
const STAGE_TO_INDEX: Record<string, number> = {
  extracting: 0,
  computing: 1,
  chart_data: 2,
  narrative: 3,
  assembling_html: 4,
  converting_pdf: 5,
}

/** Estimated percentage for each generation step */
const GENERATION_PERCENT: Record<number, number> = {
  0: 10,
  1: 30,
  2: 45,
  3: 70,
  4: 85,
  5: 95,
}

interface StepGenerateProps {
  sessionId: string
  onComplete: () => void
  onGoBack?: () => void
}

export function StepGenerate({ sessionId, onComplete, onGoBack }: StepGenerateProps) {
  const generation = useReportGeneration(sessionId)
  const sessionQuery = useReportSession(sessionId)
  const [elapsed, setElapsed] = useState(0)
  const [hasStarted, setHasStarted] = useState(false)
  const [warningsDismissed, setWarningsDismissed] = useState(false)

  const warnings = sessionQuery.data?.warnings ?? []
  const hasWarnings = warnings.length > 0 && !warningsDismissed

  // Auto-start generation when step mounts (only if no warnings or warnings dismissed)
  useEffect(() => {
    if (!hasStarted && !generation.isGenerating && !generation.isDone && !generation.error && !hasWarnings) {
      setHasStarted(true)
      generation.startGeneration()
    }
  }, [hasStarted, generation, hasWarnings])

  // Elapsed timer while generating
  useEffect(() => {
    if (!generation.isGenerating) return
    const start = Date.now()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [generation.isGenerating])

  // Auto-advance when done
  useEffect(() => {
    if (generation.isDone && !generation.error) {
      // Small delay so user can see the completion state
      const timer = setTimeout(() => {
        onComplete()
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [generation.isDone, generation.error, onComplete])

  const handleRetry = useCallback(() => {
    setElapsed(0)
    generation.startGeneration()
  }, [generation])

  const handleContinueWithWarnings = useCallback(() => {
    setWarningsDismissed(true)
    setHasStarted(true)
    generation.startGeneration()
  }, [generation])

  // Map SSE stage to step index
  const activeStepIndex = generation.currentStage
    ? (STAGE_TO_INDEX[generation.currentStage] ?? 0)
    : 0

  // Determine phase
  const phase: 'idle' | 'running' | 'complete' | 'error' = generation.error
    ? 'error'
    : generation.isDone
      ? 'complete'
      : generation.isGenerating
        ? 'running'
        : 'idle'

  // Show warning gate before generation starts
  if (hasWarnings && !hasStarted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Review Warnings Before Generation</CardTitle>
          <CardDescription>
            The extraction step produced warnings. You can continue with generation
            or go back to review and fix the input.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {warnings.map((warning, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-900/10 p-3"
              >
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <span className="text-sm text-amber-700 dark:text-amber-300">
                  {warning.replace(/^[a-z_]+:\s*/, '')}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            {onGoBack && (
              <Button variant="outline" onClick={onGoBack}>
                <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
                Go Back & Review
              </Button>
            )}
            <Button
              variant="gradient"
              onClick={handleContinueWithWarnings}
              className="ml-auto"
            >
              Continue with Warnings
              <ChevronRight className="h-4 w-4 ml-2" aria-hidden="true" />
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generating Executive Report</CardTitle>
        <CardDescription>
          The system is extracting findings, computing metrics, preparing chart data, and generating the HTML report.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <AnalysisProgressDisplay
          activePhase={phase}
          activeStepIndex={activeStepIndex}
          elapsed={elapsed}
          errorMessage={generation.error ?? undefined}
          onRetry={handleRetry}
          steps={GENERATION_STEPS}
          stepPercent={GENERATION_PERCENT}
        />

        {/* Retry button for error state */}
        {generation.error && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              disabled={generation.isGenerating}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Retry Generation
            </Button>
          </div>
        )}

        {/* Narrative text preview (streamed deltas) */}
        {generation.narrativeText && (
          <div className="border-t pt-4">
            <h4 className="text-xs font-semibold text-muted-foreground mb-2">
              Narrative Preview (streaming)
            </h4>
            <div className="rounded-lg border bg-muted/10 p-4 max-h-[200px] overflow-y-auto">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {generation.narrativeText}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
