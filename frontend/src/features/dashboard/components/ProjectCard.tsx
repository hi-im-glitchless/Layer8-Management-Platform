import { Badge } from '@/components/ui/badge'
import type { DashboardProject } from '@/features/dashboard/types'
import { format, addDays, parseISO } from 'date-fns'

interface ProjectCardProps {
  project: DashboardProject
  variant: 'current' | 'next'
}

export function ProjectCard({ project, variant }: ProjectCardProps) {
  // End date shows Friday of the last week (weekStart + 4 days)
  const endFriday = addDays(parseISO(project.endDate), 4)
  const startMonday = parseISO(project.startDate)

  return (
    <div className="flex overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
      {/* Color accent bar */}
      <div
        className="w-1 shrink-0"
        style={{ backgroundColor: project.projectColor }}
      />

      <div className="flex flex-1 flex-col gap-2 p-4">
        {/* Header: project name + client */}
        <div>
          <h3 className="text-lg font-semibold leading-tight">
            {project.projectName}
          </h3>
          {project.clientName && (
            <p className="text-sm text-muted-foreground">{project.clientName}</p>
          )}
        </div>

        {/* Tags */}
        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {project.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Footer: variant-specific info */}
        <div className="mt-auto pt-1 text-sm text-muted-foreground">
          {variant === 'current' ? (
            <p>
              Ends: <span className="font-medium text-foreground">{format(endFriday, 'dd MMM yyyy')}</span>
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              <p>
                Starts: <span className="font-medium text-foreground">{format(startMonday, 'dd MMM yyyy')}</span>
              </p>
              <p>
                Duration: <span className="font-medium text-foreground">{project.durationWeeks} week{project.durationWeeks !== 1 ? 's' : ''}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
