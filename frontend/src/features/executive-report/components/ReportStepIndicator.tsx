import { Check, FileUp, Shield, Sparkles, Eye, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReportWizardStep } from '../types'

const STEPS: { key: ReportWizardStep; label: string; icon: typeof FileUp }[] = [
  { key: 'upload', label: 'Upload', icon: FileUp },
  { key: 'sanitize-review', label: 'Sanitize & Review', icon: Shield },
  { key: 'generate', label: 'Generate', icon: Sparkles },
  { key: 'review', label: 'Review', icon: Eye },
  { key: 'download', label: 'Download', icon: Download },
]

export const REPORT_STEP_ORDER: Record<ReportWizardStep, number> = {
  'upload': 0,
  'sanitize-review': 1,
  'generate': 2,
  'review': 3,
  'download': 4,
}

interface ReportStepIndicatorProps {
  currentStep: ReportWizardStep
  onStepClick?: (step: ReportWizardStep) => void
}

export function ReportStepIndicator({ currentStep, onStepClick }: ReportStepIndicatorProps) {
  const currentIndex = REPORT_STEP_ORDER[currentStep]

  return (
    <nav aria-label="Report wizard progress" className="w-full">
      <ol className="flex items-center gap-0">
        {STEPS.map((step, index) => {
          const isComplete = index < currentIndex
          const isActive = index === currentIndex
          const isPending = index > currentIndex
          const canClick = isComplete && onStepClick
          const Icon = step.icon

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
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
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
