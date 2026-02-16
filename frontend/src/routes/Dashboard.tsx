import { useNavigate } from 'react-router-dom'
import { FileCode, FileText } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/hooks'
import { useActiveSession } from '@/features/adapter/hooks'
import { useActiveReportSession } from '@/features/executive-report/hooks'
import type { WizardStep } from '@/features/adapter/types'
import type { ReportWizardStep } from '@/features/executive-report/types'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

const adapterStepLabels: Record<WizardStep, string> = {
  upload: 'Uploading template',
  verify: 'Verifying mappings',
  preview: 'Previewing output',
  download: 'Ready to download',
}

const reportStepLabels: Record<ReportWizardStep, string> = {
  upload: 'Uploading report',
  'sanitize-review': 'Reviewing sanitization',
  generate: 'Generating report',
  review: 'Reviewing report',
  download: 'Ready to download',
}

export function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const name = user?.displayName || user?.username || ''

  const adapterQuery = useActiveSession()
  const reportQuery = useActiveReportSession()

  const adapterSession = adapterQuery.data?.session ?? null
  const reportSession = reportQuery.data?.session ?? null
  const isLoading = adapterQuery.isLoading || reportQuery.isLoading
  const hasAnySessions = adapterSession !== null || reportSession !== null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {name ? `${getGreeting()}, ${name}` : getGreeting()}
        </h1>
        <p className="text-muted-foreground mt-2">
          Your AI-powered security reporting hub
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card
          className="cursor-pointer border bg-card transition-colors hover:bg-accent/10"
          onClick={() => navigate('/template-adapter')}
        >
          <CardHeader className="flex flex-row items-center gap-3">
            <FileCode className="h-8 w-8 text-muted-foreground" />
            <div>
              <CardTitle>New Template Adaptation</CardTitle>
              <CardDescription>
                Upload and adapt a DOCX template with AI-powered placeholder mapping
              </CardDescription>
            </div>
          </CardHeader>
        </Card>

        <Card
          className="cursor-pointer border bg-card transition-colors hover:bg-accent/10"
          onClick={() => navigate('/executive-report')}
        >
          <CardHeader className="flex flex-row items-center gap-3">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <div>
              <CardTitle>New Executive Report</CardTitle>
              <CardDescription>
                Generate a professional executive report from your technical findings
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Recent Activity</h2>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="space-y-2 pt-6">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-2 pt-6">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          </div>
        ) : hasAnySessions ? (
          <div className="grid gap-4 md:grid-cols-2">
            {adapterSession && (
              <Card
                className="cursor-pointer border bg-card transition-colors hover:bg-accent/10"
                onClick={() => navigate('/template-adapter')}
              >
                <CardHeader className="flex flex-row items-center gap-3">
                  <FileCode className="h-6 w-6 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-base">
                      {adapterSession.templateFile.originalName}
                    </CardTitle>
                    <CardDescription>
                      {adapterStepLabels[adapterSession.currentStep]} &middot;{' '}
                      {formatDistanceToNow(new Date(adapterSession.updatedAt), { addSuffix: true })}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <span className="text-sm font-medium text-primary">Continue &rarr;</span>
                </CardContent>
              </Card>
            )}

            {reportSession && (
              <Card
                className="cursor-pointer border bg-card transition-colors hover:bg-accent/10"
                onClick={() => navigate('/executive-report')}
              >
                <CardHeader className="flex flex-row items-center gap-3">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-base">
                      {reportSession.uploadedFile.originalName}
                    </CardTitle>
                    <CardDescription>
                      {reportStepLabels[reportSession.currentStep]} &middot;{' '}
                      {formatDistanceToNow(new Date(reportSession.updatedAt), { addSuffix: true })}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <span className="text-sm font-medium text-primary">Continue &rarr;</span>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card className="border bg-card">
            <CardContent className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-lg font-medium text-muted-foreground">No active sessions</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Start a new template adaptation or executive report to see your activity here.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
