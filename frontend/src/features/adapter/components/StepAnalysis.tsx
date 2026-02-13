import { Skeleton } from '@/components/ui/skeleton'
import type { TemplateType, TemplateLanguage, MappingPlan } from '../types'

interface StepAnalysisProps {
  sessionId: string
  file: File | null
  templateType: TemplateType
  language: TemplateLanguage
  initialMappingPlan: MappingPlan | null
  onMappingUpdate: (plan: MappingPlan) => void
  onProceed: () => void
}

/** Placeholder -- replaced in Task 3 */
export function StepAnalysis(_props: StepAnalysisProps) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
