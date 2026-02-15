import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface StepReviewProps {
  sessionId: string
  onSatisfied: () => void
  onRegenerate: () => void
}

/**
 * Stub component -- will be fully implemented in Task 5.
 */
export function StepReview({ sessionId: _sessionId, onSatisfied: _onSatisfied, onRegenerate: _onRegenerate }: StepReviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review Report</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Loading review...</p>
      </CardContent>
    </Card>
  )
}
