import { Skeleton } from '@/components/ui/skeleton'

interface StepPreviewProps {
  sessionId: string
  onSatisfied: () => void
  onReAdapt: () => void
}

/** Placeholder -- replaced in Task 4 */
export function StepPreview(_props: StepPreviewProps) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-48 w-full" />
    </div>
  )
}
