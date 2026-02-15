import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ReportWizardState } from '../types'

interface StepDownloadProps {
  sessionId: string
  wizardState: ReportWizardState | null
  onStartNew: () => void
}

/**
 * Stub component -- will be fully implemented in Task 5.
 */
export function StepDownload({ sessionId: _sessionId, wizardState: _wizardState, onStartNew: _onStartNew }: StepDownloadProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Download Report</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Loading download...</p>
      </CardContent>
    </Card>
  )
}
