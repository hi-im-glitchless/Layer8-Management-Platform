import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
  useDeleteAssignment,
  useAddBacklogMember,
  useDeleteBacklogMember,
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
  side?: 'left' | 'right'
}

interface ClipboardAssignment {
  projectName: string
  projectColor: string
  status: AssignmentStatus
  clientId?: string | null
  tags?: string[]
}

function splitCellKey(key: string): [string, string] {
  const weekStart = key.slice(-10)
  const teamMemberId = key.slice(0, -11)
  return [teamMemberId, weekStart]
}

export function ScheduleGrid({ year, quarter }: ScheduleGridProps) {
  const queryClient = useQueryClient()
  const { hasRole } = useAuth()
  const canEdit = hasRole('PM')

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
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())
  const isDragSelectingRef = useRef(false)
  const wasDragSelectingRef = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const swapMutation = useSwapAssignments()
  const updateMutation = useUpdateAssignment()
  const upsertMutation = useUpsertAssignment()
  const deleteMutation = useDeleteAssignment()
  const addBacklogMutation = useAddBacklogMember()
  const deleteBacklogMutation = useDeleteBacklogMember()

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
    // After a drag-select, the browser fires a click event — ignore it
    if (wasDragSelectingRef.current) {
      wasDragSelectingRef.current = false
      return
    }
    if (e?.ctrlKey || e?.metaKey) {
      const key = `${teamMemberId}-${toLocalDateString(weekStart)}`
      setSelectedCells(prev => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
      return
    }
    if (selectedCells.size > 0) {
      setSelectedCells(new Set())
    }
    if (!canEdit) return
    setModalState({
      open: true,
      teamMemberId,
      weekStart: toLocalDateString(weekStart),
      assignment,
    })
  }, [canEdit, selectedCells])

  const toggleLockMutation = useToggleLock()

  const handleLockToggle = useCallback((assignmentId: string) => {
    toggleLockMutation.mutate(assignmentId)
  }, [toggleLockMutation])

  const handleModalClose = useCallback(() => {
    setModalState((prev) => ({ ...prev, open: false }))
  }, [])

  // ── Drag-and-drop handlers ──────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    if (isDragSelectingRef.current) return
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
    if (!sourceData.assignment) return

    if (targetData.assignment?.isLocked) {
      toast.error('Cannot drop onto a locked cell')
      return
    }

    const srcAssignment = sourceData.assignment
    const srcSide = sourceData.side
    const tgtAssignment = targetData.assignment
    const tgtSide = targetData.side
    const isSrcSplit = !!(srcAssignment.splitProjectName && srcAssignment.splitProjectColor)

    // Helper: extract project data from one side of an assignment
    const getProjectFromSide = (a: Assignment, side?: 'left' | 'right') => {
      if (side === 'right' && a.splitProjectName) {
        return {
          projectName: a.splitProjectName,
          projectColor: a.splitProjectColor!,
          status: (a.splitProjectStatus as AssignmentStatus) ?? 'placeholder',
          clientId: a.splitClientId ?? null,
          tags: a.splitTags,
        }
      }
      return {
        projectName: a.projectName,
        projectColor: a.projectColor,
        status: a.status,
        clientId: a.clientId ?? null,
        tags: a.tags,
      }
    }

    // Case 1: Dragging from a split cell
    if (isSrcSplit && srcSide) {
      const draggedProject = getProjectFromSide(srcAssignment, srcSide)

      // Remove the dragged side from the source split
      if (srcSide === 'left') {
        // Promote right to primary, clear split
        updateMutation.mutate({
          id: srcAssignment.id,
          data: {
            projectName: srcAssignment.splitProjectName!,
            projectColor: srcAssignment.splitProjectColor!,
            status: (srcAssignment.splitProjectStatus as AssignmentStatus) ?? 'placeholder',
            clientId: srcAssignment.splitClientId ?? null,
            tags: typeof srcAssignment.splitTags === 'string' ? JSON.parse(srcAssignment.splitTags || '[]') : (srcAssignment.splitTags ?? []),
            splitProjectName: null,
            splitProjectColor: null,
            splitProjectStatus: null,
          },
        })
      } else {
        // Clear split fields, keep primary
        updateMutation.mutate({
          id: srcAssignment.id,
          data: {
            splitProjectName: null,
            splitProjectColor: null,
            splitProjectStatus: null,
          },
        })
      }

      // Place the dragged project in the target
      const parsedTags = typeof draggedProject.tags === 'string'
        ? JSON.parse(draggedProject.tags || '[]')
        : (draggedProject.tags ?? [])

      if (tgtAssignment && tgtSide) {
        // Dropping onto a side of another split — replace that side
        if (tgtSide === 'left') {
          updateMutation.mutate({
            id: tgtAssignment.id,
            data: {
              projectName: draggedProject.projectName,
              projectColor: draggedProject.projectColor,
              status: draggedProject.status,
              clientId: draggedProject.clientId,
              tags: parsedTags,
            },
          })
        } else {
          updateMutation.mutate({
            id: tgtAssignment.id,
            data: {
              splitProjectName: draggedProject.projectName,
              splitProjectColor: draggedProject.projectColor,
              splitProjectStatus: draggedProject.status,
            },
          })
        }
      } else if (!tgtAssignment) {
        // Dropping onto empty cell
        upsertMutation.mutate({
          teamMemberId: targetData.teamMemberId,
          weekStart: targetData.weekStart,
          projectName: draggedProject.projectName,
          projectColor: draggedProject.projectColor,
          status: draggedProject.status,
          clientId: draggedProject.clientId,
          tags: parsedTags,
        })
      } else {
        // Dropping onto a non-split cell — swap the whole thing
        swapMutation.mutate({
          idA: srcAssignment.id,
          idB: tgtAssignment.id,
        })
      }
      return
    }

    // Case 2: Dragging a non-split onto a split cell side
    if (tgtAssignment && tgtSide) {
      const isTgtSplit = !!(tgtAssignment.splitProjectName && tgtAssignment.splitProjectColor)
      if (isTgtSplit) {
        const replacedProject = getProjectFromSide(tgtAssignment, tgtSide)

        // Replace the target side with the source project
        if (tgtSide === 'left') {
          updateMutation.mutate({
            id: tgtAssignment.id,
            data: {
              projectName: srcAssignment.projectName,
              projectColor: srcAssignment.projectColor,
              status: srcAssignment.status,
              clientId: srcAssignment.clientId ?? null,
              tags: typeof srcAssignment.tags === 'string' ? JSON.parse(srcAssignment.tags || '[]') : (srcAssignment.tags ?? []),
            },
          })
        } else {
          updateMutation.mutate({
            id: tgtAssignment.id,
            data: {
              splitProjectName: srcAssignment.projectName,
              splitProjectColor: srcAssignment.projectColor,
              splitProjectStatus: srcAssignment.status,
            },
          })
        }

        // Put the replaced project back in the source cell
        const parsedReplacedTags = typeof replacedProject.tags === 'string'
          ? JSON.parse(replacedProject.tags || '[]')
          : (replacedProject.tags ?? [])
        updateMutation.mutate({
          id: srcAssignment.id,
          data: {
            projectName: replacedProject.projectName,
            projectColor: replacedProject.projectColor,
            status: replacedProject.status,
            clientId: replacedProject.clientId,
            tags: parsedReplacedTags,
          },
        })
        return
      }
    }

    // Case 3: Normal (non-split) drag
    if (tgtAssignment) {
      swapMutation.mutate({
        idA: srcAssignment.id,
        idB: tgtAssignment.id,
      })
    } else {
      updateMutation.mutate({
        id: srcAssignment.id,
        data: {
          teamMemberId: targetData.teamMemberId,
          weekStart: targetData.weekStart,
        },
      })
    }
  }, [swapMutation, updateMutation, upsertMutation])

  // ── Paste helper (called from keydown Ctrl+V) ──────────────────

  const handleBulkPaste = useCallback(async (parsed: ClipboardAssignment) => {
    const cells = Array.from(selectedCells)
    const promises: Promise<unknown>[] = []
    let pastedCount = 0
    let skippedLocked = 0

    for (const key of cells) {
      const existing = assignmentMap.get(key)
      if (existing?.isLocked) {
        skippedLocked++
        continue
      }
      const [teamMemberId, weekStart] = splitCellKey(key)
      promises.push(
        upsertMutation.mutateAsync({
          teamMemberId,
          weekStart,
          projectName: parsed.projectName,
          projectColor: parsed.projectColor,
          status: parsed.status,
          clientId: parsed.clientId ?? null,
          tags: parsed.tags ?? [],
        })
      )
      pastedCount++
    }

    await Promise.all(promises)
    await queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments'] })

    if (pastedCount > 0) toast.success(`Pasted to ${pastedCount} cell${pastedCount > 1 ? 's' : ''}`)
    if (skippedLocked > 0) toast.warning(`Skipped ${skippedLocked} locked cell${skippedLocked > 1 ? 's' : ''}`)

    setSelectedCells(new Set())
  }, [selectedCells, assignmentMap, upsertMutation, queryClient])

  const handleSinglePaste = useCallback(async (parsed: ClipboardAssignment) => {
    const cell = hoveredCellRef.current
    if (!cell) return

    const existing = assignmentMap.get(`${cell.teamMemberId}-${cell.weekStart}`)
    if (existing?.isLocked) {
      toast.error('Cannot paste onto a locked cell')
      return
    }

    await upsertMutation.mutateAsync({
      teamMemberId: cell.teamMemberId,
      weekStart: cell.weekStart,
      projectName: parsed.projectName,
      projectColor: parsed.projectColor,
      status: parsed.status,
      clientId: parsed.clientId ?? null,
      tags: parsed.tags ?? [],
    })
    await queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments'] })
    toast.success('Assignment pasted')
  }, [assignmentMap, upsertMutation, queryClient])

  const handleCellHover = useCallback((teamMemberId: string, weekStart: string) => {
    hoveredCellRef.current = { teamMemberId, weekStart }
  }, [])

  // ── Drag-selection handlers ─────────────────────────────────────

  const handleCellMouseDown = useCallback((teamMemberId: string, weekStr: string, e: React.MouseEvent) => {
    if (e.button !== 0) return
    if (e.ctrlKey || e.metaKey) return
    isDragSelectingRef.current = true
    setSelectedCells(new Set([`${teamMemberId}-${weekStr}`]))
    e.preventDefault()
  }, [])

  const handleCellDragEnter = useCallback((teamMemberId: string, weekStr: string) => {
    if (!isDragSelectingRef.current) return
    setSelectedCells(prev => new Set([...prev, `${teamMemberId}-${weekStr}`]))
  }, [])

  useEffect(() => {
    const handleMouseUp = () => {
      if (isDragSelectingRef.current) {
        wasDragSelectingRef.current = true
        isDragSelectingRef.current = false
      }
    }
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [])

  const bulkDelete = useCallback(async () => {
    const cells = Array.from(selectedCells)
    const promises: Promise<unknown>[] = []
    let deletedCount = 0
    let skippedLocked = 0

    for (const key of cells) {
      const assignment = assignmentMap.get(key)
      if (!assignment) continue
      if (assignment.isLocked) {
        skippedLocked++
        continue
      }
      promises.push(deleteMutation.mutateAsync(assignment.id))
      deletedCount++
    }

    await Promise.all(promises)
    await queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments'] })

    if (deletedCount > 0) toast.success(`Deleted ${deletedCount} assignment${deletedCount > 1 ? 's' : ''}`)
    if (skippedLocked > 0) toast.warning(`Skipped ${skippedLocked} locked cell${skippedLocked > 1 ? 's' : ''}`)

    setSelectedCells(new Set())
  }, [selectedCells, assignmentMap, deleteMutation, queryClient])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedCells.size > 0) {
        setSelectedCells(new Set())
        return
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCells.size > 0) {
        e.preventDefault()
        if (!canEdit) return
        bulkDelete()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedCells.size === 1) {
        const key = Array.from(selectedCells)[0]
        const assignment = assignmentMap.get(key)
        if (assignment) {
          e.preventDefault()
          const data: ClipboardAssignment = {
            projectName: assignment.projectName,
            projectColor: assignment.projectColor,
            status: assignment.status,
            clientId: assignment.clientId ?? null,
            tags: assignment.tags ?? [],
          }
          navigator.clipboard.writeText(JSON.stringify(data))
          toast.success('Assignment copied')
        }
      }

      // Ctrl+V paste — handle here instead of paste event to avoid stale closure issues
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && canEdit) {
        e.preventDefault()
        navigator.clipboard.readText().then(async (text) => {
          if (!text) return
          let parsed: ClipboardAssignment
          try {
            parsed = JSON.parse(text) as ClipboardAssignment
            if (!parsed.projectName || !parsed.projectColor || !parsed.status) {
              toast.error('Invalid clipboard content')
              return
            }
          } catch {
            toast.error('Invalid clipboard content')
            return
          }

          if (selectedCells.size > 0) {
            await handleBulkPaste(parsed)
          } else {
            await handleSinglePaste(parsed)
          }
        }).catch(() => {
          toast.error('Cannot read clipboard — check browser permissions')
        })
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedCells, canEdit, bulkDelete, assignmentMap, handleBulkPaste, handleSinglePaste])

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

  const renderTable = (weekSlice: Date[]) => {
    // Pre-compute month transition indices for thicker left borders
    const monthTransitions = new Set<number>()
    for (let i = 1; i < weekSlice.length; i++) {
      if (weekSlice[i].getMonth() !== weekSlice[i - 1].getMonth()) {
        monthTransitions.add(i)
      }
    }

    // Find the current week index
    const today = new Date()
    const todayMonday = new Date(today)
    const dayOfWeek = todayMonday.getDay()
    todayMonday.setDate(todayMonday.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    todayMonday.setHours(0, 0, 0, 0)
    const todayKey = toLocalDateString(todayMonday)
    const currentWeekIdx = weekSlice.findIndex((w) => toLocalDateString(w) === todayKey)

    return (
    <table className="border-collapse w-full table-fixed">
      <thead>
        <tr className="sticky top-0 z-30 bg-slate-300 dark:bg-slate-900">
          <th className="sticky left-0 z-40 bg-slate-300 dark:bg-slate-900 border-b-2 border-r-2 border-slate-400 dark:border-slate-600 px-3 py-2.5 text-left text-sm font-semibold w-[140px] min-w-[120px] max-w-[140px]">
            Team
          </th>
          {weekSlice.map((week, colIdx) => {
            const weekKey = toLocalDateString(week)
            const weekHolidays = holidaysByWeek.get(weekKey)
            const hasHoliday = weekHolidays && weekHolidays.length > 0
            const isMonthTransition = monthTransitions.has(colIdx)
            const isCurrentWeek = colIdx === currentWeekIdx
            return (
              <th
                key={week.toISOString()}
                className={`border-b-2 border-r border-slate-400 dark:border-slate-600 px-1 py-2.5 text-center text-xs font-medium whitespace-nowrap min-w-[150px] overflow-hidden text-ellipsis${isCurrentWeek ? ' bg-blue-500 dark:bg-blue-700 text-white font-bold ring-1 ring-blue-600 dark:ring-blue-500' : ' text-muted-foreground'}${isMonthTransition ? ' border-l-2 border-l-slate-400 dark:border-l-slate-500' : ''}`}
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
        {teamMembers.map((member, rowIdx) => {
          const isEvenRow = rowIdx % 2 === 0
          const rowBg = isEvenRow ? 'bg-slate-100 dark:bg-slate-800/50' : 'bg-slate-50 dark:bg-slate-900/50'
          return (
          <tr key={member.id} className={`transition-colors hover:bg-blue-50/50 dark:hover:bg-blue-900/20 ${rowBg}`}>
            <td className={`sticky left-0 z-20 ${rowBg} border-b border-r-2 border-slate-400 dark:border-slate-600 px-3 py-1.5 text-sm font-medium w-[140px] min-w-[120px] max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap`}>
              <div className="flex items-center gap-1.5">
                {member.user?.avatarUrl ? (
                  <img src={member.user.avatarUrl} alt="" className="w-9 h-9 rounded-full shrink-0 object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full shrink-0 bg-slate-300 dark:bg-slate-600 flex items-center justify-center text-sm font-semibold text-slate-600 dark:text-slate-300">
                    {(member.displayName || member.user?.displayName || member.user?.username || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="truncate">{member.displayName || member.user?.displayName || member.user?.username || 'Unknown'}</span>
              </div>
            </td>
            {weekSlice.map((week, colIdx) => {
              const assignment = getAssignment(member.id, week)
              const fullyOut = isFullyAbsent(member.id, week)
              const weekStr = toLocalDateString(week)
              const isMonthTransition = monthTransitions.has(colIdx)
              const isCurrentWeek = colIdx === currentWeekIdx
              return (
                <td
                  key={week.toISOString()}
                  className={`border-b border-r border-slate-300 dark:border-slate-700 p-0.5 min-w-[150px] h-[64px] align-top${fullyOut ? ' bg-muted' : isCurrentWeek ? ' bg-blue-100/70 dark:bg-blue-950/40' : ''}${isMonthTransition ? ' border-l-2 border-l-slate-400 dark:border-l-slate-500' : ''}`}
                  onMouseEnter={() => { handleCellHover(member.id, weekStr); handleCellDragEnter(member.id, weekStr) }}
                  onMouseDown={(e) => handleCellMouseDown(member.id, weekStr, e)}
                  onClick={(e) => {
                    // Handle Ctrl+Click on td (outer cell area) for selection
                    if (e.ctrlKey || e.metaKey) {
                      e.stopPropagation()
                      handleCellClick(member.id, week, assignment, e)
                    }
                  }}
                >
                  {fullyOut ? (
                    <div className="h-full flex flex-col items-center justify-center bg-rose-900/80 dark:bg-rose-950/80 rounded-sm gap-0.5">
                      <span className="text-xs font-semibold text-white">OUT</span>
                      <AvailabilityDots
                        weekStart={week}
                        teamMemberId={member.id}
                        absences={absences}
                        holidays={holidays}
                        year={year}
                      />
                    </div>
                  ) : (
                    <>
                      <AssignmentCell
                        assignment={assignment}
                        teamMemberId={member.id}
                        weekStart={weekStr}
                        canEdit={canEdit}
                        isDragOverlay={false}
                        isSelected={selectedCells.has(`${member.id}-${weekStr}`)}
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
        )})}
        <NoMansLanding
          backlogMembers={backlogMembers}
          weekSlice={weekSlice}
          year={year}
          canEdit={canEdit}
          absences={absences}
          holidays={holidays}
          holidaysByWeek={holidaysByWeek}
          selectedCells={selectedCells}
          getAssignment={getAssignment}
          isFullyAbsent={isFullyAbsent}
          onCellClick={handleCellClick}
          onCellHover={handleCellHover}
          onCellMouseDown={handleCellMouseDown}
          onCellDragEnter={handleCellDragEnter}
          onLockToggle={handleLockToggle}
          onStatusCycle={handleStatusCycle}
          onAddRow={() => addBacklogMutation.mutate()}
          onDeleteRow={(id) => deleteBacklogMutation.mutate(id)}
        />
      </tbody>
    </table>
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
        {quarterChunks ? (
          /* All Year: 4 stacked quarter tables with vertical scroll */
          <div className="overflow-y-auto max-h-[calc(100vh-220px)]">
            {quarterChunks.map((chunk, idx) => (
              <div key={chunk.label}>
                {idx > 0 && (
                  <div className="bg-slate-300 dark:bg-slate-800 border-y border-slate-400 dark:border-slate-600 px-4 py-2 text-xs font-bold text-foreground tracking-wide">
                    {chunk.label}
                  </div>
                )}
                {idx === 0 && (
                  <div className="bg-slate-300 dark:bg-slate-800 border-b border-slate-400 dark:border-slate-600 px-4 py-2 text-xs font-bold text-foreground tracking-wide">
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
          {activeDragId && activeDragData?.assignment ? (() => {
            const a = activeDragData.assignment!
            // When dragging the right side of a split, show split project in overlay
            const overlayAssignment = activeDragData.side === 'right' && a.splitProjectName
              ? { ...a, projectName: a.splitProjectName, projectColor: a.splitProjectColor!, status: (a.splitProjectStatus ?? 'placeholder') as AssignmentStatus, client: a.splitClient ?? null, splitProjectName: null, splitProjectColor: null }
              : a
            return (
              <AssignmentCell
                assignment={overlayAssignment}
                teamMemberId={activeDragData.teamMemberId}
                weekStart={activeDragData.weekStart}
                canEdit={canEdit}
                isDragOverlay={true}
                onCellClick={() => {}}
              />
            )
          })() : null}
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
