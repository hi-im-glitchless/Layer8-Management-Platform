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
  useAddBacklogMember,
} from '../hooks'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { getWeeksInRange, getQuarterDateRange, formatWeekLabel, QUARTER_LABELS, toLocalDateString } from '../constants'
import { AvailabilityDots } from './AvailabilityDots'
import { AssignmentCell } from './AssignmentCell'
import { AssignmentModal } from './AssignmentModal'
import { NoMansLanding } from './NoMansLanding'
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
  const addBacklogMutation = useAddBacklogMember()

  const weeks = useMemo(() => {
    const { start, end } = getQuarterDateRange(year, quarter)
    return getWeeksInRange(start, end)
  }, [year, quarter])

  /** Split weeks into quarterly chunks for "All Year" vertical layout.
   *  Each week is assigned to exactly one quarter based on its Thursday's month
   *  (ISO week rule: the quarter that contains most of the week's days). */
  const quarterChunks = useMemo(() => {
    if (quarter !== null) return null
    const chunks: { label: string; weeks: Date[] }[] = [
      { label: QUARTER_LABELS[0], weeks: [] },
      { label: QUARTER_LABELS[1], weeks: [] },
      { label: QUARTER_LABELS[2], weeks: [] },
      { label: QUARTER_LABELS[3], weeks: [] },
    ]
    for (const week of weeks) {
      // Use Thursday of the week to determine quarter (ISO week rule)
      const thu = new Date(week)
      thu.setDate(thu.getDate() + 3)
      const month = thu.getMonth() // 0-11
      const q = Math.floor(month / 3) // 0-3
      chunks[q].weeks.push(week)
    }
    return chunks
  }, [weeks, quarter])

  const dateRange = useMemo(() => {
    if (weeks.length === 0) return { dateStart: '', dateEnd: '' }
    const first = weeks[0]
    const last = weeks[weeks.length - 1]
    const end = new Date(last)
    end.setDate(end.getDate() + 4)
    return {
      dateStart: toLocalDateString(first),
      dateEnd: toLocalDateString(end),
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
      const key = `${a.teamMemberId}-${toLocalDateString(weekDate)}`
      map.set(key, a)
    }
    return map
  }, [assignmentsQuery.data])

  const allMembers: TeamMember[] = teamMembersQuery.data?.teamMembers ?? []
  const teamMembers = useMemo(() => allMembers.filter((m) => !m.isBacklog), [allMembers])
  const backlogMembers = useMemo(() => allMembers.filter((m) => m.isBacklog), [allMembers])

  const absenceSet = useMemo(() => {
    const set = new Set<string>()
    for (const a of absences) {
      set.add(`${a.teamMemberId}-${toLocalDateString(new Date(a.date))}`)
    }
    return set
  }, [absences])

  const holidaySet = useMemo(() => {
    const set = new Set<string>()
    for (const h of holidays) {
      const date = new Date(year, h.month - 1, h.day)
      set.add(toLocalDateString(date))
    }
    return set
  }, [holidays, year])

  /** Map week-start ISO string -> list of holiday names that fall within that Mon-Fri */
  const holidaysByWeek = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const h of holidays) {
      const hDate = new Date(year, h.month - 1, h.day)
      const hDay = hDate.getDay()
      // Only consider weekdays (Mon=1..Fri=5)
      if (hDay === 0 || hDay === 6) continue
      // Find the Monday of this week
      const monday = new Date(hDate)
      monday.setDate(monday.getDate() - (hDay - 1))
      const key = toLocalDateString(monday)
      const list = map.get(key) ?? []
      list.push(h.name)
      map.set(key, list)
    }
    return map
  }, [holidays, year])

  const handleStatusCycle = useCallback((assignmentIdOrSplit: string, nextStatus: AssignmentStatus) => {
    const isSplit = assignmentIdOrSplit.startsWith('split:')
    const id = isSplit ? assignmentIdOrSplit.slice(6) : assignmentIdOrSplit
    const data = isSplit
      ? { splitProjectStatus: nextStatus }
      : { status: nextStatus }
    updateMutation.mutate({ id, data })
  }, [updateMutation])

  const isFullyAbsent = useCallback((teamMemberId: string, weekStart: Date): boolean => {
    for (let i = 0; i < 5; i++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      const dateKey = toLocalDateString(d)
      const hasAbsence = absenceSet.has(`${teamMemberId}-${dateKey}`)
      const hasHoliday = holidaySet.has(dateKey)
      if (!hasAbsence && !hasHoliday) return false
    }
    return true
  }, [absenceSet, holidaySet])

  const isLoading = teamMembersQuery.isLoading || assignmentsQuery.isLoading || absencesQuery.isLoading || holidaysQuery.isLoading

  const getAssignment = useCallback((teamMemberId: string, weekStart: Date): Assignment | undefined => {
    const key = `${teamMemberId}-${toLocalDateString(weekStart)}`
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
      weekStart: toLocalDateString(weekStart),
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

  const renderTable = (weekSlice: Date[]) => (
    <table className="border-collapse w-full table-fixed">
      <thead>
        <tr className="sticky top-0 z-30 bg-background">
          <th className="sticky left-0 z-40 bg-background border-b border-r border-border/50 px-3 py-2 text-left text-sm font-semibold w-[140px] min-w-[120px] max-w-[140px]">
            Team
          </th>
          {weekSlice.map((week) => {
            const weekKey = toLocalDateString(week)
            const weekHolidays = holidaysByWeek.get(weekKey)
            const hasHoliday = weekHolidays && weekHolidays.length > 0
            return (
              <th
                key={week.toISOString()}
                className={`border-b border-r border-border/50 px-1 py-2 text-center text-xs font-medium text-muted-foreground whitespace-nowrap min-w-[150px] overflow-hidden text-ellipsis${hasHoliday ? ' bg-red-50 dark:bg-red-950/20' : ''}`}
              >
                {hasHoliday ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>{formatWeekLabel(week)}</span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {weekHolidays!.join(', ')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  formatWeekLabel(week)
                )}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {teamMembers.map((member) => (
          <tr key={member.id} className="hover:bg-muted/30 transition-colors">
            <td className="sticky left-0 z-20 bg-background border-b border-r border-border/50 px-3 py-1.5 text-sm font-medium w-[140px] min-w-[120px] max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap">
              {member.user?.displayName || member.user?.username || member.displayName || 'Unknown'}
            </td>
            {weekSlice.map((week) => {
              const assignment = getAssignment(member.id, week)
              const fullyOut = isFullyAbsent(member.id, week)
              const weekStr = toLocalDateString(week)
              return (
                <td
                  key={week.toISOString()}
                  className={`border-b border-r border-border/50 p-0.5 min-w-[150px] h-[64px] align-top${fullyOut ? ' bg-muted' : ''}`}
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
                        onStatusCycle={canEdit && assignment ? handleStatusCycle : undefined}
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
        <NoMansLanding
          backlogMembers={backlogMembers}
          weekSlice={weekSlice}
          year={year}
          canEdit={canEdit}
          absences={absences}
          holidays={holidays}
          holidaysByWeek={holidaysByWeek}
          getAssignment={getAssignment}
          isFullyAbsent={isFullyAbsent}
          onCellClick={handleCellClick}
          onCellHover={handleCellHover}
          onLockToggle={handleLockToggle}
          onStatusCycle={handleStatusCycle}
          onAddRow={() => addBacklogMutation.mutate()}
        />
      </tbody>
    </table>
  )

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {quarterChunks ? (
          /* All Year: 4 stacked quarter tables with vertical scroll */
          <div className="overflow-y-auto max-h-[calc(100vh-220px)]">
            {quarterChunks.map((chunk, idx) => (
              <div key={chunk.label}>
                {idx > 0 && (
                  <div className="bg-muted/60 border-y border-border/50 px-4 py-1.5 text-xs font-semibold text-muted-foreground tracking-wide">
                    {chunk.label}
                  </div>
                )}
                {idx === 0 && (
                  <div className="bg-muted/60 border-b border-border/50 px-4 py-1.5 text-xs font-semibold text-muted-foreground tracking-wide">
                    {chunk.label}
                  </div>
                )}
                <div className="overflow-x-auto">
                  {renderTable(chunk.weeks)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Single quarter: one table with horizontal scroll if needed */
          <div className="overflow-auto max-h-[calc(100vh-220px)] rounded-md">
            {renderTable(weeks)}
          </div>
        )}
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
