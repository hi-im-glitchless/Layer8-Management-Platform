import { Check, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface StepDef {
  step: string
  message: string
}

const DEFAULT_STEPS: StepDef[] = [
  { step: 'prompt', message: 'Preparing analysis prompt...' },
  { step: 'llm', message: 'LLM analyzing template structure...' },
  { step: 'validation', message: 'Validating mapping plan...' },
]

/** Estimated percentage for each step while running */
const DEFAULT_STEP_PERCENT: Record<number, number> = {
  0: 5,   // building prompt (fast, ~2s)
  1: 40,  // LLM generating analysis (30-120s, bulk of time)
  2: 85,  // validating result
}

/** Format seconds as "Xm Ys" or "Xs" */
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

interface AnalysisProgressProps {
  activePhase: 'idle' | 'running' | 'complete' | 'error'
  activeStepIndex: number
  elapsed: number
  errorMessage?: string
  onRetry?: () => void
  /** Custom step definitions (defaults to analysis steps) */
  steps?: StepDef[]
  /** Custom step percent mapping (defaults to analysis percentages) */
  stepPercent?: Record<number, number>
}

export function AnalysisProgressDisplay({
  activePhase,
  activeStepIndex,
  elapsed,
  errorMessage,
  onRetry,
  steps: customSteps,
  stepPercent: customStepPercent,
}: AnalysisProgressProps) {
  const stepDefs = customSteps ?? DEFAULT_STEPS
  const percentMap = customStepPercent ?? DEFAULT_STEP_PERCENT

  const overallPercent =
    activePhase === 'complete'
      ? 100
      : activePhase === 'running'
        ? percentMap[activeStepIndex] ?? 0
        : 0

  const steps = stepDefs.map((step, index) => {
    let status: 'pending' | 'active' | 'complete' | 'error' = 'pending'
    if (activePhase === 'complete') {
      status = 'complete'
    } else if (activePhase === 'error' && index === activeStepIndex) {
      status = 'error'
    } else if (activePhase === 'running' || activePhase === 'error') {
      if (index < activeStepIndex) status = 'complete'
      else if (index === activeStepIndex && activePhase !== 'error') status = 'active'
    }
    return { ...step, status }
  })

  return (
    <div className="space-y-4">
      {/* Overall progress bar */}
      {activePhase === 'running' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="tabular-nums">{overallPercent}%</span>
            <span className="tabular-nums">Elapsed: {formatElapsed(elapsed)}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
              style={{ width: `${overallPercent}%` }}
            />
          </div>
          {elapsed >= 60 && (
            <p className="text-xs text-muted-foreground text-center">
              Large templates can take 2-3 minutes.
            </p>
          )}
        </div>
      )}

      <ol className="space-y-3" aria-label="Analysis progress">
        {steps.map((step, index) => (
          <li
            key={step.step}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors',
              step.status === 'complete' && 'border-success/30 bg-success/5',
              step.status === 'active' && 'border-primary bg-primary/5',
              step.status === 'error' && 'border-destructive bg-destructive/5',
              step.status === 'pending' && 'border-muted bg-muted/20 opacity-60',
            )}
          >
            {/* Status icon */}
            <div className="flex-shrink-0">
              {step.status === 'complete' && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success text-success-foreground">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </div>
              )}
              {step.status === 'active' && (
                <div className="flex h-6 w-6 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
                </div>
              )}
              {step.status === 'error' && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-white">
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                </div>
              )}
              {step.status === 'pending' && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-muted-foreground/30 text-muted-foreground/50">
                  <span className="text-xs font-medium">{index + 1}</span>
                </div>
              )}
            </div>

            {/* Label */}
            <span
              className={cn(
                'flex-1 text-sm',
                step.status === 'complete' && 'text-success',
                step.status === 'active' && 'text-foreground font-medium',
                step.status === 'error' && 'text-destructive font-medium',
                step.status === 'pending' && 'text-muted-foreground',
              )}
            >
              {step.message}
            </span>

            {/* Per-step percentage */}
            {step.status === 'active' && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {percentMap[index] ?? 0}%
              </span>
            )}
            {step.status === 'complete' && activePhase !== 'complete' && (
              <span className="text-xs text-success tabular-nums">
                done
              </span>
            )}
          </li>
        ))}
      </ol>

      {/* Error details + retry */}
      {activePhase === 'error' && errorMessage && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{errorMessage}</p>
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
