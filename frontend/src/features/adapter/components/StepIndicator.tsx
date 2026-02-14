import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WizardStep } from '../types'

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'verify', label: 'Verify Placeholders' },
  { key: 'preview', label: 'Preview' },
  { key: 'download', label: 'Download' },
]

const STEP_ORDER: Record<WizardStep, number> = {
  upload: 0,
  verify: 1,
  preview: 2,
  download: 3,
}

interface StepIndicatorProps {
  currentStep: WizardStep
  onStepClick?: (step: WizardStep) => void
}

export function StepIndicator({ currentStep, onStepClick }: StepIndicatorProps) {
  const currentIndex = STEP_ORDER[currentStep]

  return (
    <nav aria-label="Wizard progress" className="w-full">
      <ol className="flex items-center gap-0">
        {STEPS.map((step, index) => {
          const isComplete = index < currentIndex
          const isActive = index === currentIndex
          const isPending = index > currentIndex
          const canClick = isComplete && onStepClick

          return (
            <li
              key={step.key}
              className={cn('flex items-center flex-1', index < STEPS.length - 1 && 'gap-0')}
            >
              {/* Step circle + label */}
              <button
                type="button"
                onClick={() => canClick && onStepClick(step.key)}
                disabled={!canClick}
                className={cn(
                  'flex flex-col items-center gap-1.5 group',
                  canClick && 'cursor-pointer',
                  !canClick && 'cursor-default',
                )}
                aria-current={isActive ? 'step' : undefined}
                aria-label={`Step ${index + 1}: ${step.label}${isComplete ? ' (completed)' : isActive ? ' (current)' : ''}`}
              >
                {/* Circle */}
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                    isComplete &&
                      'border-primary bg-primary text-primary-foreground',
                    isActive &&
                      'border-primary bg-background text-primary ring-2 ring-primary/20',
                    isPending &&
                      'border-muted-foreground/30 bg-background text-muted-foreground/50',
                    canClick && 'group-hover:bg-primary/90 group-hover:text-primary-foreground',
                  )}
                >
                  {isComplete ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>

                {/* Label */}
                <span
                  className={cn(
                    'text-xs font-medium transition-colors whitespace-nowrap',
                    isComplete && 'text-primary',
                    isActive && 'text-foreground',
                    isPending && 'text-muted-foreground/50',
                  )}
                >
                  {step.label}
                </span>
              </button>

              {/* Connector line */}
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 flex-1 mx-2 mt-[-1.25rem] transition-colors',
                    index < currentIndex ? 'bg-primary' : 'bg-muted-foreground/20',
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export { STEP_ORDER, STEPS }
