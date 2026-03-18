import { useMemo } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { useTeamMembers, useAssignments } from '../hooks'
import { getWeeksInRange, getQuarterDateRange, formatWeekLabel } from '../constants'
import type { Assignment, TeamMember } from '../types'

interface ScheduleGridProps {
  year: number
  quarter: number | null
}

interface GridCellProps {
  assignment: Assignment | undefined
  onClick: () => void
}

function GridCell({ assignment, onClick }: GridCellProps) {
  if (!assignment) {
    return (
      <td
        className="border border-border p-1 min-w-[100px] h-[48px] cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onClick}
      />
    )
  }

  return (
    <td
      className="border border-border p-1 min-w-[100px] h-[48px] cursor-pointer transition-colors"
      style={{ backgroundColor: assignment.projectColor }}
      onClick={onClick}
    >
      <span className="text-xs font-medium text-white truncate block px-1">
        {assignment.projectName}
      </span>
    </td>
  )
}

export function ScheduleGrid({ year, quarter }: ScheduleGridProps) {
  const teamMembersQuery = useTeamMembers()
  const assignmentsQuery = useAssignments(year, quarter ?? undefined)

  const weeks = useMemo(() => {
    const { start, end } = getQuarterDateRange(year, quarter)
    return getWeeksInRange(start, end)
  }, [year, quarter])

  const assignmentMap = useMemo(() => {
    const assignments = assignmentsQuery.data?.assignments ?? []
    const map = new Map<string, Assignment>()
    for (const a of assignments) {
      const weekDate = new Date(a.weekStart)
      const key = `${a.teamMemberId}-${weekDate.toISOString().split('T')[0]}`
      map.set(key, a)
    }
    return map
  }, [assignmentsQuery.data])

  const teamMembers: TeamMember[] = teamMembersQuery.data?.teamMembers ?? []

  const isLoading = teamMembersQuery.isLoading || assignmentsQuery.isLoading

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    )
  }

  if (teamMembers.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        No team members found. Add team members to see the schedule grid.
      </div>
    )
  }

  const getAssignment = (teamMemberId: string, weekStart: Date): Assignment | undefined => {
    const key = `${teamMemberId}-${weekStart.toISOString().split('T')[0]}`
    return assignmentMap.get(key)
  }

  return (
    <div className="overflow-auto max-h-[calc(100vh-220px)] border border-border rounded-md">
      <table className="border-collapse w-full">
        <thead>
          <tr className="sticky top-0 z-20 bg-background">
            <th className="sticky left-0 z-30 bg-background border border-border px-3 py-2 text-left text-sm font-semibold min-w-[160px]">
              Team
            </th>
            {weeks.map((week) => (
              <th
                key={week.toISOString()}
                className="border border-border px-2 py-2 text-center text-xs font-medium text-muted-foreground whitespace-nowrap min-w-[100px]"
              >
                {formatWeekLabel(week)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teamMembers.map((member) => (
            <tr key={member.id} className="hover:bg-muted/30">
              <td className="sticky left-0 z-10 bg-background border border-border px-3 py-2 text-sm font-medium whitespace-nowrap min-w-[160px]">
                {member.user.displayName || member.user.username}
              </td>
              {weeks.map((week) => (
                <GridCell
                  key={week.toISOString()}
                  assignment={getAssignment(member.id, week)}
                  onClick={() => {
                    // Future: open assignment edit modal
                  }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
