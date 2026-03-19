import { memo, useCallback } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Lock, Plus } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import type { Assignment, AssignmentStatus } from '../types'
import { ASSIGNMENT_STATUSES, STATUS_CYCLE } from '../constants'

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

const STATUS_DOT_COLORS: Record<AssignmentStatus, string> = {
  confirmed: 'bg-green-400',
  'needs-reqs': 'bg-yellow-400',
  placeholder: 'bg-gray-400',
}

function getStatusLabel(status: AssignmentStatus): string {
  return ASSIGNMENT_STATUSES.find((s) => s.value === status)?.label ?? status
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
        <Plus className="w-4 h-4 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors" />
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
                    // For split status cycling, we use a special convention: prefix with 'split:' to indicate it's the split half
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
    )
  }

  return (
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
  )
})
