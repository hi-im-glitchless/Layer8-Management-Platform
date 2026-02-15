import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface StepGenerateProps {
  sessionId: string
  onComplete: () => void
}

/**
 * Stub component -- will be fully implemented in Task 5.
 */
export function StepGenerate({ sessionId: _sessionId, onComplete: _onComplete }: StepGenerateProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate Report</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Loading generation...</p>
      </CardContent>
    </Card>
  )
}
