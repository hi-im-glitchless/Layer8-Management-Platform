import { useEffect, useRef, useCallback, useState } from 'react'
import { ArrowRight, ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useApplyInstructions } from '../hooks'
import { AdaptationProgressDisplay } from './AdaptationProgress'

interface StepAdaptationProps {
  sessionId: string
  onComplete: () => void
  onGoBack: () => void
}

export function StepAdaptation({ sessionId, onComplete, onGoBack }: StepAdaptationProps) {
  const applyMutation = useApplyInstructions()
  const hasTriggered = useRef(false)
  const [progressStep, setProgressStep] = useState(0)

  // Auto-trigger adaptation on mount
  useEffect(() => {
    if (!hasTriggered.current && !applyMutation.isPending && !applyMutation.isSuccess) {
      hasTriggered.current = true

      // Simulate progress phases while mutation runs
      setProgressStep(0)
      const t1 = setTimeout(() => setProgressStep(1), 1500)
      const t2 = setTimeout(() => setProgressStep(2), 3500)
      const t3 = setTimeout(() => setProgressStep(3), 5000)

      applyMutation.mutate(sessionId, {
        onSuccess: () => {
          toast.success('Template adaptation complete')
        },
      })

      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
        clearTimeout(t3)
      }
    }
  }, [sessionId, applyMutation])

  const handleRetry = useCallback(() => {
    hasTriggered.current = false
    setProgressStep(0)
    applyMutation.reset()
  }, [applyMutation])

  const phase = applyMutation.isPending
    ? 'running'
    : applyMutation.isSuccess
      ? 'complete'
      : applyMutation.isError
        ? 'error'
        : 'idle'

  const data = applyMutation.data

  return (
    <div className="space-y-6">
      {/* Progress display */}
      <Card>
        <CardHeader>
          <CardTitle>Adapting Template</CardTitle>
          <CardDescription>
            Applying Ghostwriter field mappings to your document.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdaptationProgressDisplay
            activePhase={phase}
            activeStepIndex={progressStep}
            errorMessage={applyMutation.isError ? (applyMutation.error as Error).message : undefined}
            onRetry={handleRetry}
          />
        </CardContent>
      </Card>

      {/* Completion summary */}
      {applyMutation.isSuccess && data && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" aria-hidden="true" />
              Adaptation Complete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Badge variant="secondary" className="text-sm">
                {data.appliedCount} placeholder{data.appliedCount !== 1 ? 's' : ''} applied
              </Badge>
              {data.skippedCount > 0 && (
                <Badge variant="outline" className="text-sm">
                  {data.skippedCount} skipped
                </Badge>
              )}
            </div>

            {/* Warnings */}
            {data.warnings && data.warnings.length > 0 && (
              <div className="space-y-2">
                {data.warnings.map((warning, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-sm text-yellow-700 dark:text-yellow-300"
                  >
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <Button variant="gradient" onClick={onComplete}>
                Preview
                <ArrowRight className="h-4 w-4 ml-1" aria-hidden="true" />
              </Button>
              <Button variant="outline" onClick={onGoBack}>
                <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
                Modify Mapping
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
