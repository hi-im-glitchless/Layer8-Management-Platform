import { Skeleton } from '@/components/ui/skeleton'

interface StepAdaptationProps {
  sessionId: string
  onComplete: () => void
  onGoBack: () => void
}

/** Placeholder -- replaced in Task 4 */
export function StepAdaptation(_props: StepAdaptationProps) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-48 w-full" />
    </div>
  )
}
