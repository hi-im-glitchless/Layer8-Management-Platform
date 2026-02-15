import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ReportWizardState } from '../types'

interface StepSanitizeReviewProps {
  sessionId: string
  wizardState: ReportWizardState | null
  onApprove: () => void
}

/**
 * Stub component -- will be fully implemented in Task 4.
 */
export function StepSanitizeReview({ sessionId: _sessionId, wizardState: _wizardState, onApprove: _onApprove }: StepSanitizeReviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sanitize & Review</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Loading sanitization review...</p>
      </CardContent>
    </Card>
  )
}
