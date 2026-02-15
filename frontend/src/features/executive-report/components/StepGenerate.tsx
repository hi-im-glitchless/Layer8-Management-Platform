import { useEffect, useCallback, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AnalysisProgressDisplay, type StepDef } from '@/features/adapter/components/AnalysisProgress'
import { useReportGeneration } from '../hooks'

/** Report generation pipeline stages matching backend SSE stage events */
const GENERATION_STEPS: StepDef[] = [
  { step: 'extracting', message: 'Extracting findings from report...' },
  { step: 'computing', message: 'Computing risk metrics...' },
  { step: 'generating_charts', message: 'Generating charts...' },
  { step: 'narrative', message: 'Writing executive narrative...' },
  { step: 'building_report', message: 'Building report document...' },
  { step: 'converting_pdf', message: 'Converting to PDF...' },
]

/** SSE stage name to step index mapping */
const STAGE_TO_INDEX: Record<string, number> = {
  extracting: 0,
  computing: 1,
  generating_charts: 2,
  narrative: 3,
  building_report: 4,
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
}

export function StepGenerate({ sessionId, onComplete }: StepGenerateProps) {
  const generation = useReportGeneration(sessionId)
  const [elapsed, setElapsed] = useState(0)
  const [hasStarted, setHasStarted] = useState(false)

  // Auto-start generation when step mounts
  useEffect(() => {
    if (!hasStarted && !generation.isGenerating && !generation.isDone && !generation.error) {
      setHasStarted(true)
      generation.startGeneration()
    }
  }, [hasStarted, generation])

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generating Executive Report</CardTitle>
        <CardDescription>
          The system is extracting findings, computing metrics, generating charts, and writing the executive narrative.
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
