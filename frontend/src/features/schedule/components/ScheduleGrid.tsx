import { useMemo, useState, useCallback } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/hooks'
import { useTeamMembers, useAssignments, useAbsences, useHolidays, useToggleLock } from '../hooks'
import { getWeeksInRange, getQuarterDateRange, formatWeekLabel } from '../constants'
import { AvailabilityDots } from './AvailabilityDots'
import { AssignmentCell } from './AssignmentCell'
import { AssignmentModal } from './AssignmentModal'
import type { Assignment, Absence, Holiday, TeamMember } from '../types'

interface ScheduleGridProps {
  year: number
  quarter: number | null
}

interface ModalState {
  open: boolean
  teamMemberId: string
  weekStart: string
  assignment: Assignment | undefined
}

export function ScheduleGrid({ year, quarter }: ScheduleGridProps) {
  const { hasRole } = useAuth()
  const canEdit = hasRole('MANAGER')

  const teamMembersQuery = useTeamMembers()
  const assignmentsQuery = useAssignments(year, quarter ?? undefined)
  const holidaysQuery = useHolidays()

  const [modalState, setModalState] = useState<ModalState>({
    open: false,
    teamMemberId: '',
    weekStart: '',
    assignment: undefined,
  })

  const weeks = useMemo(() => {
    const { start, end } = getQuarterDateRange(year, quarter)
    return getWeeksInRange(start, end)
  }, [year, quarter])

  const dateRange = useMemo(() => {
    if (weeks.length === 0) return { dateStart: '', dateEnd: '' }
    const first = weeks[0]
    const last = weeks[weeks.length - 1]
    const end = new Date(last)
    end.setDate(end.getDate() + 4) // Friday of last week
    return {
      dateStart: first.toISOString().split('T')[0],
      dateEnd: end.toISOString().split('T')[0],
    }
  }, [weeks])

  const absencesQuery = useAbsences(dateRange)
  const absences: Absence[] = absencesQuery.data?.absences ?? []
  const holidays: Holiday[] = holidaysQuery.data?.holidays ?? []

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

  const absenceSet = useMemo(() => {
    const set = new Set<string>()
    for (const a of absences) {
      set.add(`${a.teamMemberId}-${new Date(a.date).toISOString().split('T')[0]}`)
    }
    return set
  }, [absences])

  const holidaySet = useMemo(() => {
    const set = new Set<string>()
    for (const h of holidays) {
      const date = new Date(year, h.month - 1, h.day)
      set.add(date.toISOString().split('T')[0])
    }
    return set
  }, [holidays, year])

  const isFullyAbsent = useCallback((teamMemberId: string, weekStart: Date): boolean => {
    for (let i = 0; i < 5; i++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      const dateKey = d.toISOString().split('T')[0]
      const hasAbsence = absenceSet.has(`${teamMemberId}-${dateKey}`)
      const hasHoliday = holidaySet.has(dateKey)
      if (!hasAbsence && !hasHoliday) return false
    }
    return true
  }, [absenceSet, holidaySet])

  const isLoading = teamMembersQuery.isLoading || assignmentsQuery.isLoading || absencesQuery.isLoading || holidaysQuery.isLoading

  const getAssignment = useCallback((teamMemberId: string, weekStart: Date): Assignment | undefined => {
    const key = `${teamMemberId}-${weekStart.toISOString().split('T')[0]}`
    return assignmentMap.get(key)
  }, [assignmentMap])

  const handleCellClick = useCallback((teamMemberId: string, weekStart: Date, assignment: Assignment | undefined) => {
    if (!canEdit) return
    setModalState({
      open: true,
      teamMemberId,
      weekStart: weekStart.toISOString().split('T')[0],
      assignment,
    })
  }, [canEdit])

  const toggleLockMutation = useToggleLock()

  const handleLockToggle = useCallback((assignmentId: string) => {
    toggleLockMutation.mutate(assignmentId)
  }, [toggleLockMutation])

  const handleModalClose = useCallback(() => {
    setModalState((prev) => ({ ...prev, open: false }))
  }, [])

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

  return (
    <>
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
                {weeks.map((week) => {
                  const assignment = getAssignment(member.id, week)
                  const fullyOut = isFullyAbsent(member.id, week)
                  return (
                    <td
                      key={week.toISOString()}
                      className={`border border-border p-1 min-w-[100px] h-[56px] align-top${fullyOut ? ' bg-muted' : ''}`}
                    >
                      {fullyOut ? (
                        <div className="h-full flex items-center justify-center">
                          <span className="text-xs font-semibold text-muted-foreground">OUT</span>
                        </div>
                      ) : (
                        <>
                          <AssignmentCell
                            assignment={assignment}
                            canEdit={canEdit}
                            onCellClick={() => handleCellClick(member.id, week, assignment)}
                            onLockToggle={assignment ? () => handleLockToggle(assignment.id) : undefined}
                          />
                          <AvailabilityDots
                            weekStart={week}
                            teamMemberId={member.id}
                            absences={absences}
                            holidays={holidays}
                            year={year}
                          />
                        </>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AssignmentModal
        open={modalState.open}
        onClose={handleModalClose}
        teamMemberId={modalState.teamMemberId}
        weekStart={modalState.weekStart}
        assignment={modalState.assignment}
      />
    </>
  )
}
