import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/hooks'
import {
  useTeamMembers,
  useAssignments,
  useAbsences,
  useHolidays,
  useToggleLock,
  useSwapAssignments,
  useUpdateAssignment,
  useUpsertAssignment,
} from '../hooks'
import { getWeeksInRange, getQuarterDateRange, formatWeekLabel } from '../constants'
import { AvailabilityDots } from './AvailabilityDots'
import { AssignmentCell } from './AssignmentCell'
import { AssignmentModal } from './AssignmentModal'
import type { Assignment, Absence, Holiday, TeamMember, AssignmentStatus } from '../types'

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

interface DragData {
  assignment: Assignment | undefined
  teamMemberId: string
  weekStart: string
}

interface ClipboardAssignment {
  projectName: string
  projectColor: string
  status: AssignmentStatus
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

  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [activeDragData, setActiveDragData] = useState<DragData | null>(null)
  const hoveredCellRef = useRef<{ teamMemberId: string; weekStart: string } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const swapMutation = useSwapAssignments()
  const updateMutation = useUpdateAssignment()
  const upsertMutation = useUpsertAssignment()

  const weeks = useMemo(() => {
    const { start, end } = getQuarterDateRange(year, quarter)
    return getWeeksInRange(start, end)
  }, [year, quarter])

  const dateRange = useMemo(() => {
    if (weeks.length === 0) return { dateStart: '', dateEnd: '' }
    const first = weeks[0]
    const last = weeks[weeks.length - 1]
    const end = new Date(last)
    end.setDate(end.getDate() + 4)
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

  const handleCellClick = useCallback((teamMemberId: string, weekStart: Date, assignment: Assignment | undefined, e?: React.MouseEvent) => {
    if (e?.ctrlKey || e?.metaKey) {
      if (!assignment) return
      const data: ClipboardAssignment = {
        projectName: assignment.projectName,
        projectColor: assignment.projectColor,
        status: assignment.status,
      }
      navigator.clipboard.writeText(JSON.stringify(data)).then(() => {
        toast.success('Assignment copied')
      })
      return
    }
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

  // ── Drag-and-drop handlers ──────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined
    setActiveDragId(event.active.id as string)
    setActiveDragData(data ?? null)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null)
    setActiveDragData(null)

    const { active, over } = event
    if (!over || active.id === over.id) return

    const sourceData = active.data.current as DragData | undefined
    const targetData = over.data.current as DragData | undefined
    if (!sourceData || !targetData) return

    if (targetData.assignment?.isLocked) {
      toast.error('Cannot drop onto a locked cell')
      return
    }

    if (sourceData.assignment && targetData.assignment) {
      swapMutation.mutate({
        idA: sourceData.assignment.id,
        idB: targetData.assignment.id,
      })
    } else if (sourceData.assignment && !targetData.assignment) {
      updateMutation.mutate({
        id: sourceData.assignment.id,
        data: {
          teamMemberId: targetData.teamMemberId,
          weekStart: targetData.weekStart,
        },
      })
    }
  }, [swapMutation, updateMutation])

  // ── Paste handler ───────────────────────────────────────────────

  useEffect(() => {
    if (!canEdit) return

    const handlePaste = async (e: ClipboardEvent) => {
      const cell = hoveredCellRef.current
      if (!cell) return

      const existing = assignmentMap.get(`${cell.teamMemberId}-${cell.weekStart}`)
      if (existing?.isLocked) {
        toast.error('Cannot paste onto a locked cell')
        return
      }

      const text = e.clipboardData?.getData('text/plain')
      if (!text) return

      try {
        const parsed = JSON.parse(text) as ClipboardAssignment
        if (!parsed.projectName || !parsed.projectColor || !parsed.status) {
          toast.error('Invalid clipboard content')
          return
        }
        upsertMutation.mutate({
          teamMemberId: cell.teamMemberId,
          weekStart: cell.weekStart,
          projectName: parsed.projectName,
          projectColor: parsed.projectColor,
          status: parsed.status,
        })
        toast.success('Assignment pasted')
      } catch {
        toast.error('Invalid clipboard content')
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [canEdit, assignmentMap, upsertMutation])

  const handleCellHover = useCallback((teamMemberId: string, weekStart: string) => {
    hoveredCellRef.current = { teamMemberId, weekStart }
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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
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
                    const weekStr = week.toISOString().split('T')[0]
                    return (
                      <td
                        key={week.toISOString()}
                        className={`border border-border p-1 min-w-[100px] h-[56px] align-top${fullyOut ? ' bg-muted' : ''}`}
                        onMouseEnter={() => handleCellHover(member.id, weekStr)}
                      >
                        {fullyOut ? (
                          <div className="h-full flex items-center justify-center">
                            <span className="text-xs font-semibold text-muted-foreground">OUT</span>
                          </div>
                        ) : (
                          <>
                            <AssignmentCell
                              assignment={assignment}
                              teamMemberId={member.id}
                              weekStart={weekStr}
                              canEdit={canEdit}
                              isDragOverlay={false}
                              onCellClick={(e) => handleCellClick(member.id, week, assignment, e)}
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
        <DragOverlay>
          {activeDragId && activeDragData?.assignment ? (
            <AssignmentCell
              assignment={activeDragData.assignment}
              teamMemberId={activeDragData.teamMemberId}
              weekStart={activeDragData.weekStart}
              canEdit={canEdit}
              isDragOverlay={true}
              onCellClick={() => {}}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
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
