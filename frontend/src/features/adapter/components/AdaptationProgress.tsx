import { Check, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AdaptationProgress as ProgressStep } from '../types'

const DEFAULT_STEPS: ProgressStep[] = [
  { step: 'instructions', status: 'pending', message: 'Generating insertion instructions...' },
  { step: 'validation', status: 'pending', message: 'Validating Jinja2 syntax...' },
  { step: 'application', status: 'pending', message: 'Applying placeholders to document...' },
  { step: 'verification', status: 'pending', message: 'Verifying output...' },
]

interface AdaptationProgressProps {
  /** Current phase of the adaptation pipeline */
  activePhase: 'idle' | 'running' | 'complete' | 'error'
  /** Which sub-step index is currently active (0-3) */
  activeStepIndex: number
  /** Error message if the pipeline failed */
  errorMessage?: string
  /** Retry callback */
  onRetry?: () => void
}

export function AdaptationProgressDisplay({
  activePhase,
  activeStepIndex,
  errorMessage,
  onRetry,
}: AdaptationProgressProps) {
  const steps = DEFAULT_STEPS.map((step, index) => {
    let status = step.status
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
                'text-sm',
                step.status === 'complete' && 'text-green-700 dark:text-green-300',
                step.status === 'active' && 'text-foreground font-medium',
                step.status === 'error' && 'text-destructive font-medium',
                step.status === 'pending' && 'text-muted-foreground',
              )}
            >
              {step.message}
            </span>
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
