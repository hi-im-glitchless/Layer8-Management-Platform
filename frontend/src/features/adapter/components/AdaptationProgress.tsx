import { Check, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface StepDef {
  step: string
  message: string
}

const STEPS: StepDef[] = [
  { step: 'instructions', message: 'Generating insertion instructions...' },
  { step: 'validation', message: 'Validating Jinja2 syntax...' },
  { step: 'application', message: 'Applying placeholders to document...' },
  { step: 'verification', message: 'Verifying output...' },
]

/** Estimated percentage for each step while running */
const STEP_PERCENT: Record<number, number> = {
  0: 15,  // building prompt
  1: 55,  // LLM generating instructions (bulk of time)
  2: 80,  // applying to DOCX
  3: 95,  // verifying
}

/** Format seconds as "Xm Ys" or "Xs" */
function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

interface AdaptationProgressProps {
  activePhase: 'idle' | 'running' | 'complete' | 'error'
  activeStepIndex: number
  elapsed: number
  errorMessage?: string
  onRetry?: () => void
}

export function AdaptationProgressDisplay({
  activePhase,
  activeStepIndex,
  elapsed,
  errorMessage,
  onRetry,
}: AdaptationProgressProps) {
  const overallPercent =
    activePhase === 'complete'
      ? 100
      : activePhase === 'running'
        ? STEP_PERCENT[activeStepIndex] ?? 0
        : 0

  const steps = STEPS.map((step, index) => {
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

      <ol className="space-y-3" aria-label="Adaptation progress">
        {steps.map((step, index) => (
          <li
            key={step.step}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors',
              step.status === 'complete' && 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/10',
              step.status === 'active' && 'border-primary bg-primary/5',
              step.status === 'error' && 'border-destructive bg-destructive/5',
              step.status === 'pending' && 'border-muted bg-muted/20 opacity-60',
            )}
          >
            {/* Status icon */}
            <div className="flex-shrink-0">
              {step.status === 'complete' && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-white">
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
                step.status === 'complete' && 'text-green-700 dark:text-green-300',
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
                {STEP_PERCENT[index] ?? 0}%
              </span>
            )}
            {step.status === 'complete' && activePhase !== 'complete' && (
              <span className="text-xs text-green-600 dark:text-green-400 tabular-nums">
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
