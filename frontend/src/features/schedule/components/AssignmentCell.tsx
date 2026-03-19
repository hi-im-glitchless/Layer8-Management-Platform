import { memo } from 'react'
import { Lock, Plus } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import type { Assignment, AssignmentStatus } from '../types'
import { ASSIGNMENT_STATUSES } from '../constants'

interface AssignmentCellProps {
  assignment: Assignment | undefined
  canEdit?: boolean
  onCellClick: () => void
  onLockToggle?: (e: React.MouseEvent) => void
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
  canEdit = true,
  onCellClick,
  onLockToggle,
}: AssignmentCellProps) {
  if (!assignment) {
    if (!canEdit) {
      return <div className="h-full min-h-[40px]" />
    }
    return (
      <div
        className="group h-full min-h-[40px] flex items-center justify-center cursor-pointer rounded-sm border border-transparent hover:border-border hover:bg-muted/50 transition-colors"
        onClick={onCellClick}
      >
        <Plus className="w-4 h-4 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors" />
      </div>
    )
  }

  const isLocked = assignment.isLocked
  const isSplit = assignment.splitProjectName && assignment.splitProjectColor
  const textColor = getContrastColor(assignment.projectColor)
  const isClickable = canEdit && !isLocked

  if (isSplit) {
    const splitTextColor = getContrastColor(assignment.splitProjectColor!)
    return (
      <div
        className={`h-full min-h-[40px] flex flex-row rounded-sm overflow-hidden ${isClickable ? 'cursor-pointer' : 'opacity-75 ring-1 ring-muted-foreground/30'}`}
        onClick={isClickable ? onCellClick : undefined}
      >
        <div
          className="flex-1 flex items-center px-1.5 min-w-0"
          style={{ backgroundColor: assignment.projectColor }}
        >
          <span className="text-xs font-medium truncate" style={{ color: textColor }}>
            {assignment.projectName}
          </span>
        </div>
        <div
          className="flex-1 flex items-center px-1.5 min-w-0"
          style={{ backgroundColor: assignment.splitProjectColor! }}
        >
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
      className={`group h-full min-h-[40px] flex items-center rounded-sm px-1.5 relative ${isClickable ? 'cursor-pointer' : !canEdit ? '' : 'opacity-75 ring-1 ring-muted-foreground/30'}`}
      style={{ backgroundColor: assignment.projectColor }}
      onClick={isClickable ? onCellClick : undefined}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`w-2 h-2 rounded-full shrink-0 mr-1.5 ${STATUS_DOT_COLORS[assignment.status]}`}
            />
          </TooltipTrigger>
          <TooltipContent side="top">
            {getStatusLabel(assignment.status)}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span className="text-xs font-medium truncate" style={{ color: textColor }}>
        {assignment.projectName}
      </span>
      {canEdit && (isLocked ? (
        <button
          className="ml-auto shrink-0 p-0.5 rounded hover:bg-black/10 transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            onLockToggle?.(e)
          }}
        >
          <Lock className="w-3 h-3" style={{ color: textColor }} />
        </button>
      ) : (
        <button
          className="ml-auto shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-black/10 transition-all"
          onClick={(e) => {
            e.stopPropagation()
            onLockToggle?.(e)
          }}
        >
          <Lock className="w-3 h-3" style={{ color: textColor }} />
        </button>
      ))}
      {!canEdit && isLocked && (
        <Lock className="ml-auto w-3 h-3 shrink-0" style={{ color: textColor }} />
      )}
    </div>
  )
})
