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
  isSelected?: boolean
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

/** Parse tags safely — handles both string (JSON from SQLite) and array */
function parseTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags
  if (typeof tags === 'string') {
    try { const parsed = JSON.parse(tags); return Array.isArray(parsed) ? parsed : [] }
    catch { return [] }
  }
  return []
}

function ProjectTooltipBlock({ client, name, status, tags }: { client?: string; name: string; status: AssignmentStatus; tags: string[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      {client && (
        <span className="text-[10px] text-muted-foreground">{client}</span>
      )}
      <span className="text-xs font-semibold">{name}</span>
      <StatusBadge status={status} />
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {tags.map((tag: string) => (
            <span key={tag} className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/20 text-blue-400 dark:bg-blue-400/20 dark:text-blue-300 border border-blue-500/30">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function RichTooltipContent({ assignment }: { assignment: Assignment }) {
  const isSplit = assignment.splitProjectName && assignment.splitProjectColor
  const tags = parseTags(assignment.tags)

  if (isSplit) {
    const splitTags = parseTags(assignment.splitTags)
    return (
      <div className="flex gap-3 py-1">
        <div className="max-w-[180px]">
          <ProjectTooltipBlock
            client={assignment.client?.name}
            name={assignment.projectName}
            status={assignment.status}
            tags={tags}
          />
        </div>
        <div className="w-px bg-border/40 shrink-0" />
        <div className="max-w-[180px]">
          <ProjectTooltipBlock
            client={assignment.splitClient?.name}
            name={assignment.splitProjectName!}
            status={(assignment.splitProjectStatus as AssignmentStatus) ?? 'placeholder'}
            tags={splitTags}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 py-1 max-w-[220px]">
      <ProjectTooltipBlock
        client={assignment.client?.name}
        name={assignment.projectName}
        status={assignment.status}
        tags={tags}
      />
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

/** A single draggable+droppable half of a split cell */
function SplitHalf({
  assignment,
  cellId,
  teamMemberId,
  weekStart,
  side,
  bgColor,
  label,
  status,
  canEdit,
  isLocked,
  onStatusClick,
}: {
  assignment: Assignment
  cellId: string
  teamMemberId: string
  weekStart: string
  side: 'left' | 'right'
  bgColor: string
  label: string
  status: AssignmentStatus
  canEdit: boolean
  isLocked: boolean
  onStatusClick?: (e: React.MouseEvent) => void
}) {
  const halfId = `${cellId}:${side}`
  const isDraggable = canEdit && !isLocked

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: halfId,
    disabled: !isDraggable,
    data: { assignment, teamMemberId, weekStart, side },
  })

  const {
    setNodeRef: setDropRef,
    isOver,
  } = useDroppable({
    id: halfId,
    data: { assignment, teamMemberId, weekStart, side },
  })

  const setRefs = (el: HTMLDivElement | null) => {
    setDragRef(el)
    setDropRef(el)
  }

  const textColor = getContrastColor(bgColor)

  return (
    <div
      ref={setRefs}
      {...attributes}
      {...listeners}
      className={`flex-1 flex items-center px-1.5 min-w-0 ${
        isDragging ? 'opacity-40' : ''
      } ${isOver ? 'ring-2 ring-primary ring-inset' : ''}`}
      style={{ backgroundColor: bgColor }}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`w-5 h-3 rounded-sm shrink-0 mr-1 ${STATUS_DOT_COLORS[status]} ${isDraggable ? 'hover:scale-110 cursor-pointer transition-transform' : ''}`}
              onClick={isDraggable ? onStatusClick : undefined}
            />
          </TooltipTrigger>
          <TooltipContent side="top">
            {isDraggable ? 'Click to cycle status' : getStatusLabel(status)}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span className="text-xs font-medium truncate" style={{ color: textColor }}>
        {label}
      </span>
    </div>
  )
}

/** Split cell wrapper — renders two SplitHalf components side by side */
function SplitCell({
  assignment,
  cellId,
  teamMemberId,
  weekStart,
  canEdit,
  isClickable,
  isLocked,
  isSelected,
  onCellClick,
  onStatusCycle,
  handleStatusClick,
}: {
  assignment: Assignment
  cellId: string
  teamMemberId: string
  weekStart: string
  canEdit: boolean
  isClickable: boolean
  isLocked: boolean
  isSelected: boolean
  onCellClick: (e?: React.MouseEvent) => void
  onStatusCycle?: (assignmentId: string, nextStatus: AssignmentStatus) => void
  handleStatusClick: (e: React.MouseEvent, status: AssignmentStatus, assignmentId: string) => void
}) {
  const leftLabel = assignment.client
    ? `${assignment.client.name} - ${assignment.projectName}`
    : assignment.projectName
  const splitStatus = (assignment.splitProjectStatus as AssignmentStatus) ?? 'placeholder'

  return (
    <TooltipProvider delayDuration={1000}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`h-full min-h-[40px] flex flex-row rounded-sm overflow-hidden relative ${
              isClickable ? 'cursor-pointer' : 'opacity-75 ring-1 ring-muted-foreground/30'
            }`}
            onClick={isClickable ? (e) => onCellClick(e) : undefined}
          >
            <SplitHalf
              assignment={assignment}
              cellId={cellId}
              teamMemberId={teamMemberId}
              weekStart={weekStart}
              side="left"
              bgColor={assignment.projectColor}
              label={leftLabel}
              status={assignment.status}
              canEdit={canEdit}
              isLocked={isLocked}
              onStatusClick={(e) => handleStatusClick(e, assignment.status, assignment.id)}
            />
            <SplitHalf
              assignment={assignment}
              cellId={cellId}
              teamMemberId={teamMemberId}
              weekStart={weekStart}
              side="right"
              bgColor={assignment.splitProjectColor!}
              label={assignment.splitProjectName!}
              status={splitStatus}
              canEdit={canEdit}
              isLocked={isLocked}
              onStatusClick={(e) => {
                e.stopPropagation()
                if (!onStatusCycle) return
                const currentIdx = STATUS_CYCLE.indexOf(splitStatus)
                const nextIdx = (currentIdx + 1) % STATUS_CYCLE.length
                onStatusCycle(`split:${assignment.id}`, STATUS_CYCLE[nextIdx])
              }}
            />
            {isLocked && (
              <div className="absolute top-0.5 right-0.5">
                <Lock className="w-3 h-3 text-muted-foreground" />
              </div>
            )}
            {isSelected && (
              <div className="absolute inset-0 bg-blue-500/25 ring-2 ring-blue-500 ring-inset rounded-sm pointer-events-none z-10" />
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

export const AssignmentCell = memo(function AssignmentCell({
  assignment,
  teamMemberId,
  weekStart,
  canEdit = true,
  isDragOverlay = false,
  isSelected = false,
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
          className="h-full min-h-[40px] relative"
        >
          {isSelected && (
            <div className="absolute inset-0 bg-blue-500/25 ring-2 ring-blue-500 ring-inset rounded-sm pointer-events-none z-10" />
          )}
        </div>
      )
    }
    return (
      <div
        ref={isDragOverlay ? undefined : setDropRef}
        className={`group h-full min-h-[40px] flex items-center justify-center cursor-pointer rounded-sm border transition-colors relative ${
          isDropTarget
            ? 'border-primary bg-primary/10'
            : 'border-transparent hover:border-border hover:bg-muted/50'
        }`}
        onClick={(e) => onCellClick(e)}
      >
        <Plus className="w-4 h-4 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors" />
        {isSelected && (
          <div className="absolute inset-0 bg-blue-500/25 ring-2 ring-blue-500 ring-inset rounded-sm pointer-events-none z-10" />
        )}
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
          {assignment.client ? `${assignment.client.name} - ${assignment.projectName}` : assignment.projectName}
        </span>
      </div>
    )
  }

  if (isSplit) {
    return (
      <SplitCell
        assignment={assignment}
        cellId={cellId}
        teamMemberId={teamMemberId}
        weekStart={weekStart}
        canEdit={canEdit}
        isClickable={isClickable}
        isLocked={isLocked}
        isSelected={isSelected}
        onCellClick={onCellClick}
        onStatusCycle={onStatusCycle}
        handleStatusClick={handleStatusClick}
      />
    )
  }

  return (
    <TooltipProvider delayDuration={1000}>
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
                {assignment.client ? `${assignment.client.name} - ${assignment.projectName}` : assignment.projectName}
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
            {isSelected && (
              <div className="absolute inset-0 bg-blue-500/25 ring-2 ring-blue-500 ring-inset rounded-sm pointer-events-none z-10" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-popover text-popover-foreground border shadow-md p-2">
          <RichTooltipContent assignment={assignment} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
})
