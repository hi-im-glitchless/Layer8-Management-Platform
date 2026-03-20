import { memo, useCallback } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Lock, Plus } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import type { Assignment, AssignmentStatus } from '../types'
import { ASSIGNMENT_STATUSES, STATUS_CYCLE, STATUS_DOT_COLORS } from '../constants'

interface AssignmentCellProps {
  assignment: Assignment | undefined
  teamMemberId: string
  weekStart: string
  canEdit?: boolean
  isDragOverlay?: boolean
  onCellClick: (e?: React.MouseEvent) => void
  onLockToggle?: (e: React.MouseEvent) => void
  onStatusCycle?: (assignmentId: string, nextStatus: AssignmentStatus) => void
}

function getStatusLabel(status: AssignmentStatus): string {
  return ASSIGNMENT_STATUSES.find((s) => s.value === status)?.label ?? status
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  'needs-reqs': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  placeholder: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

function StatusBadge({ status }: { status: AssignmentStatus }) {
  return (
    <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_BADGE_CLASSES[status] ?? STATUS_BADGE_CLASSES.placeholder}`}>
      {getStatusLabel(status)}
    </span>
  )
}

function RichTooltipContent({ assignment }: { assignment: Assignment }) {
  const isSplit = assignment.splitProjectName && assignment.splitProjectColor
  return (
    <div className="flex flex-col gap-2 py-1 max-w-[220px]">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold">{assignment.projectName}</span>
        <StatusBadge status={assignment.status} />
      </div>
      {isSplit && (
        <div className="flex flex-col gap-0.5 border-t border-border/30 pt-1.5">
          <span className="text-xs font-semibold">{assignment.splitProjectName}</span>
          <StatusBadge status={(assignment.splitProjectStatus as AssignmentStatus) ?? 'placeholder'} />
        </div>
      )}
    </div>
  )
}

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#1a1a1a' : '#ffffff'
}

export const AssignmentCell = memo(function AssignmentCell({
  assignment,
  teamMemberId,
  weekStart,
  canEdit = true,
  isDragOverlay = false,
  onCellClick,
  onLockToggle,
  onStatusCycle,
}: AssignmentCellProps) {
  const cellId = `${teamMemberId}-${weekStart}`

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: cellId,
    disabled: isDragOverlay || !canEdit || !assignment || assignment.isLocked,
    data: { assignment, teamMemberId, weekStart },
  })

  const {
    setNodeRef: setDropRef,
    isOver,
  } = useDroppable({
    id: cellId,
    disabled: isDragOverlay,
    data: { assignment, teamMemberId, weekStart },
  })

  const setRefs = (el: HTMLDivElement | null) => {
    if (!isDragOverlay) {
      setDragRef(el)
      setDropRef(el)
    }
  }

  const handleStatusClick = useCallback((e: React.MouseEvent, status: AssignmentStatus, assignmentId: string) => {
    e.stopPropagation()
    if (!onStatusCycle) return
    const currentIdx = STATUS_CYCLE.indexOf(status)
    const nextIdx = (currentIdx + 1) % STATUS_CYCLE.length
    onStatusCycle(assignmentId, STATUS_CYCLE[nextIdx])
  }, [onStatusCycle])

  if (!assignment) {
    const isDropTarget = isOver && !isDragOverlay
    if (!canEdit && !isDropTarget) {
      return (
        <div
          ref={isDragOverlay ? undefined : setDropRef}
          className="h-full min-h-[40px]"
        />
      )
    }
    return (
      <div
        ref={isDragOverlay ? undefined : setDropRef}
        className={`group h-full min-h-[40px] flex items-center justify-center cursor-pointer rounded-sm border transition-colors ${
          isDropTarget
            ? 'border-primary bg-primary/10'
            : 'border-transparent hover:border-border hover:bg-muted/50'
        }`}
        onClick={(e) => onCellClick(e)}
      >
        <Plus className="w-4 h-4 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors" />
      </div>
    )
  }

  const isLocked = assignment.isLocked
  const isSplit = assignment.splitProjectName && assignment.splitProjectColor
  const textColor = getContrastColor(assignment.projectColor)
  const isClickable = canEdit && !isLocked
  const isDropTarget = isOver && !isDragOverlay

  if (isDragOverlay) {
    return (
      <div
        className="h-[40px] w-[90px] flex items-center rounded-sm px-1.5 opacity-80 shadow-lg"
        style={{ backgroundColor: assignment.projectColor }}
      >
        <span className="text-xs font-medium truncate" style={{ color: textColor }}>
          {assignment.projectName}
        </span>
      </div>
    )
  }

  if (isSplit) {
    const splitTextColor = getContrastColor(assignment.splitProjectColor!)
    return (
      <TooltipProvider delayDuration={2000}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              ref={setRefs}
              {...attributes}
              {...listeners}
              className={`h-full min-h-[40px] flex flex-row rounded-sm overflow-hidden ${
                isClickable ? 'cursor-pointer' : 'opacity-75 ring-1 ring-muted-foreground/30'
              } ${isDragging ? 'opacity-40' : ''} ${
                isDropTarget ? 'ring-2 ring-primary' : ''
              } ${isLocked && isDropTarget ? 'cursor-not-allowed' : ''}`}
              onClick={isClickable ? (e) => onCellClick(e) : undefined}
            >
              <div
                className="flex-1 flex items-center px-1.5 min-w-0"
                style={{ backgroundColor: assignment.projectColor }}
              >
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`w-5 h-3 rounded-sm shrink-0 mr-1 ${STATUS_DOT_COLORS[assignment.status]} ${isClickable ? 'hover:scale-110 cursor-pointer transition-transform' : ''}`}
                        onClick={isClickable ? (e) => handleStatusClick(e, assignment.status, assignment.id) : undefined}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {isClickable ? 'Click to cycle status' : getStatusLabel(assignment.status)}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span className="text-xs font-medium truncate" style={{ color: textColor }}>
                  {assignment.projectName}
                </span>
              </div>
              <div
                className="flex-1 flex items-center px-1.5 min-w-0"
                style={{ backgroundColor: assignment.splitProjectColor! }}
              >
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={`w-5 h-3 rounded-sm shrink-0 mr-1 ${STATUS_DOT_COLORS[(assignment.splitProjectStatus as AssignmentStatus) ?? 'placeholder']} ${isClickable ? 'hover:scale-110 cursor-pointer transition-transform' : ''}`}
                        onClick={isClickable ? (e) => {
                          e.stopPropagation()
                          if (!onStatusCycle) return
                          const splitStatus = (assignment.splitProjectStatus as AssignmentStatus) ?? 'placeholder'
                          const currentIdx = STATUS_CYCLE.indexOf(splitStatus)
                          const nextIdx = (currentIdx + 1) % STATUS_CYCLE.length
                          onStatusCycle(`split:${assignment.id}`, STATUS_CYCLE[nextIdx])
                        } : undefined}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {isClickable ? 'Click to cycle status' : getStatusLabel((assignment.splitProjectStatus as AssignmentStatus) ?? 'placeholder')}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span className="text-xs font-medium truncate" style={{ color: splitTextColor }}>
                  {assignment.splitProjectName}
                </span>
              </div>
              {isLocked && (
                <div className="absolute top-0.5 right-0.5">
                  <Lock className="w-3 h-3 text-muted-foreground" />
                </div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-popover text-popover-foreground border shadow-md p-2">
            <RichTooltipContent assignment={assignment} />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider delayDuration={2000}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            ref={setRefs}
            {...attributes}
            {...listeners}
            className={`group h-full min-h-[40px] flex flex-col justify-between rounded-sm px-1.5 py-1 relative ${
              isClickable ? 'cursor-pointer' : !canEdit ? '' : 'opacity-75 ring-1 ring-muted-foreground/30'
            } ${isDragging ? 'opacity-40' : ''} ${
              isDropTarget && !isLocked ? 'ring-2 ring-primary' : ''
            } ${isDropTarget && isLocked ? 'ring-2 ring-destructive cursor-not-allowed' : ''}`}
            style={{ backgroundColor: assignment.projectColor }}
            onClick={isClickable ? (e) => onCellClick(e) : undefined}
          >
            <div className="flex items-start justify-between gap-0.5">
              <span className="text-xs font-medium leading-tight line-clamp-2" style={{ color: textColor }}>
                {assignment.projectName}
              </span>
              {canEdit && (isLocked ? (
                <button
                  className="shrink-0 p-0.5 rounded hover:bg-black/10 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    onLockToggle?.(e)
                  }}
                >
                  <Lock className="w-3 h-3" style={{ color: textColor }} />
                </button>
              ) : (
                <button
                  className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-black/10 transition-all"
                  onClick={(e) => {
                    e.stopPropagation()
                    onLockToggle?.(e)
                  }}
                >
                  <Lock className="w-3 h-3" style={{ color: textColor }} />
                </button>
              ))}
              {!canEdit && isLocked && (
                <Lock className="w-3 h-3 shrink-0" style={{ color: textColor }} />
              )}
            </div>
            <div className="flex items-center">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={`w-5 h-3 rounded-sm shrink-0 ${STATUS_DOT_COLORS[assignment.status]} ${isClickable ? 'hover:scale-110 cursor-pointer transition-transform' : ''}`}
                      onClick={isClickable ? (e) => handleStatusClick(e, assignment.status, assignment.id) : undefined}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {isClickable ? 'Click to cycle status' : getStatusLabel(assignment.status)}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-popover text-popover-foreground border shadow-md p-2">
          <RichTooltipContent assignment={assignment} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
})
