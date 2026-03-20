import type { DashboardProject } from '@/features/dashboard/types'
import { format, addDays, parseISO } from 'date-fns'

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  confirmed: {
    label: 'Confirmed',
    className: 'bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30',
  },
  'needs-reqs': {
    label: 'Needs Reqs',
    className: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
  },
  placeholder: {
    label: 'Placeholder',
    className: 'bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30',
  },
}

interface ProjectCardProps {
  project: DashboardProject
  variant: 'current' | 'next'
}

export function ProjectCard({ project, variant }: ProjectCardProps) {
  // End date shows Friday of the last week (weekStart + 4 days)
  const endFriday = addDays(parseISO(project.endDate), 4)
  const startMonday = parseISO(project.startDate)
  const badge = STATUS_BADGE[project.status] ?? STATUS_BADGE.placeholder

  return (
    <div className="flex overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
      {/* Color accent bar */}
      <div
        className="w-1 shrink-0"
        style={{ backgroundColor: project.projectColor }}
      />

      <div className="flex flex-1 flex-col gap-2 p-4">
        {/* Header: project name + client + status */}
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold leading-tight">
              {project.projectName}
            </h3>
            <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded-full border ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          {project.clientName && (
            <p className="text-sm text-muted-foreground">{project.clientName}</p>
          )}
        </div>

        {/* Tags as blue pills */}
        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/20 text-blue-400 dark:bg-blue-400/20 dark:text-blue-300 border border-blue-500/30"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer: variant-specific info */}
        <div className="mt-auto pt-1 text-sm text-muted-foreground">
          {variant === 'current' ? (
            <div className="flex flex-col gap-0.5">
              <p>
                {format(startMonday, 'dd MMM')} &rarr;{' '}
                <span className="font-medium text-foreground">{format(endFriday, 'dd MMM')}</span>
              </p>
              <p>
                Duration: <span className="font-medium text-foreground">{project.durationWeeks} week{project.durationWeeks !== 1 ? 's' : ''}</span>
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <p>
                {format(startMonday, 'dd MMM')} &rarr;{' '}
                <span className="font-medium text-foreground">{format(endFriday, 'dd MMM')}</span>
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
