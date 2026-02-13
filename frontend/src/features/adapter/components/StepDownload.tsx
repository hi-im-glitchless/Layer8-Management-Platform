import { Skeleton } from '@/components/ui/skeleton'
import type { WizardState } from '../types'

interface StepDownloadProps {
  sessionId: string
  wizardState: WizardState | null
  onStartNew: () => void
}

/** Placeholder -- replaced in Task 5 */
export function StepDownload(_props: StepDownloadProps) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-48 w-full" />
    </div>
  )
}
