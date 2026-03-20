import { useMemo } from 'react'
import { Calendar } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/hooks'
import { useMyAssignments } from '@/features/schedule/hooks'
import { buildProjectTimeline, getCurrentProject, getNextProject } from '@/features/dashboard/utils'
import { ProjectCard } from '@/features/dashboard/components/ProjectCard'
import { NoScheduleState } from '@/features/dashboard/components/NoScheduleState'
import { ApiError } from '@/lib/api'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function Dashboard() {
  const { user } = useAuth()
  const name = user?.displayName || user?.username || ''

  // Schedule data
  const currentYear = new Date().getFullYear()
  const assignmentsQuery = useMyAssignments(currentYear)

  const is404 =
    assignmentsQuery.error instanceof ApiError &&
    assignmentsQuery.error.status === 404

  const { currentProject, nextProject } = useMemo(() => {
    const assignments = assignmentsQuery.data?.assignments ?? []
    if (assignments.length === 0) return { currentProject: null, nextProject: null }
    const timeline = buildProjectTimeline(assignments)
    return {
      currentProject: getCurrentProject(timeline),
      nextProject: getNextProject(timeline),
    }
  }, [assignmentsQuery.data])

  const hasAssignments = (assignmentsQuery.data?.assignments?.length ?? 0) > 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {name ? `${getGreeting()}, ${name}` : getGreeting()}
        </h1>
      </div>

      {/* Template Adaptation and Executive Report action cards — hidden for now
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
      */}

      {/* Schedule Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-xl font-semibold tracking-tight">Your Schedule</h2>
        </div>

        {assignmentsQuery.isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
        ) : is404 ? (
          <NoScheduleState />
        ) : !hasAssignments ? (
          <div className="flex flex-col items-center justify-center rounded-lg border bg-card px-6 py-8 text-center">
            <Calendar className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No upcoming projects</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Current Project
              </p>
              {currentProject ? (
                <ProjectCard project={currentProject} variant="current" />
              ) : (
                <div className="flex items-center justify-center rounded-lg border bg-card px-6 py-8 text-center">
                  <p className="text-sm text-muted-foreground">No project this week</p>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Next Project
              </p>
              {nextProject ? (
                <ProjectCard project={nextProject} variant="next" />
              ) : (
                <div className="flex items-center justify-center rounded-lg border bg-card px-6 py-8 text-center">
                  <p className="text-sm text-muted-foreground">No upcoming projects</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Recent Activity — hidden for now
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
              <Inbox className="mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-lg font-medium text-muted-foreground">No active sessions</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Start a new template adaptation or executive report to see your activity here.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
      */}
    </div>
  )
}
