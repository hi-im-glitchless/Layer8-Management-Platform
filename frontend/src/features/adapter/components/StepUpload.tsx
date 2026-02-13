import { Skeleton } from '@/components/ui/skeleton'

interface StepUploadProps {
  onSessionCreate: (sessionId: string) => void
  onFileReady: (file: File) => void
}

/** Placeholder -- replaced in Task 3 */
export function StepUpload(_props: StepUploadProps) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32 w-full" />
    </div>
  )
}
