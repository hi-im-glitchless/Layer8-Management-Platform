import { memo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Pin } from 'lucide-react'
import type { BoardCard } from '../types'

// ── Status badge styling ────────────────────────────────────────────

const STATUS_BADGE_CLASSES: Record<string, string> = {
  confirmed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  'needs-reqs': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  placeholder: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

function StatusBadge({ status }: { status: string | undefined }) {
  if (!status) return null
  const label = status === 'needs-reqs' ? 'Needs Reqs' : status.charAt(0).toUpperCase() + status.slice(1)
  return (
    <span
      className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_BADGE_CLASSES[status] ?? STATUS_BADGE_CLASSES.placeholder}`}
    >
      {label}
    </span>
  )
}

// ── Card lookup helper ──────────────────────────────────────────────

export function findCardById(cards: BoardCard[], id: string): BoardCard | undefined {
  return cards.find((c) => c.id === id)
}

// ── KanbanCard component ────────────────────────────────────────────

interface Props {
  card: BoardCard
  isDragOverlay?: boolean
  onCardClick?: (cardId: string) => void
}

export const KanbanCard = memo(
  function KanbanCard({ card, isDragOverlay = false, onCardClick }: Props) {
    const {
      attributes,
      listeners,
      setNodeRef,
      isDragging,
    } = useDraggable({
      id: card.id,
      data: { cardId: card.id, sourceStage: card.stage },
      disabled: isDragOverlay,
    })

    const checkedCount = card.checklist.filter((i) => i.checked).length
    const totalCount = card.checklist.length

    const overlayClasses = isDragOverlay
      ? 'rotate-2 shadow-xl opacity-90 scale-105'
      : ''

    const cursorClass = isDragOverlay
      ? ''
      : isDragging
        ? 'cursor-grabbing'
        : 'cursor-grab'

    return (
      <div
        ref={isDragOverlay ? undefined : setNodeRef}
        {...(isDragOverlay ? {} : attributes)}
        {...(isDragOverlay ? {} : listeners)}
        className={`flex overflow-hidden rounded-lg border bg-card shadow-sm ${cursorClass} ${overlayClasses} ${
          isDragging && !isDragOverlay ? 'opacity-40' : ''
        }`}
        onClick={
          onCardClick && !isDragOverlay
            ? () => onCardClick(card.id)
            : undefined
        }
      >
        {/* Color accent bar */}
        <div
          className="w-1 shrink-0"
          style={{ backgroundColor: card.assignment?.projectColor }}
        />

        {/* Content */}
        <div className="flex-1 p-3 space-y-1.5">
          {/* Row 1: project name + pin */}
          <div className="flex items-start justify-between gap-1">
            <p className="text-sm font-semibold leading-tight line-clamp-2">
              {card.assignment?.projectName ?? '(No project)'}
            </p>
            {card.stageLockedBy && card.stageLockedBy !== 'auto' && (
              <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
          </div>

          {/* Row 2: client name (not in current types but guard for future) */}

          {/* Row 3: checklist progress + status badge */}
          {(totalCount > 0 || card.assignment?.status) && (
            <div className="flex items-center justify-between">
              {totalCount > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {checkedCount}/{totalCount}
                </span>
              ) : (
                <span />
              )}
              <StatusBadge status={card.assignment?.status} />
            </div>
          )}
        </div>
      </div>
    )
  },
  (prev, next) =>
    prev.card.id === next.card.id &&
    prev.card.stage === next.card.stage &&
    prev.card.checklist === next.card.checklist &&
    prev.card.stageLockedBy === next.card.stageLockedBy &&
    prev.card.assignment?.projectName === next.card.assignment?.projectName &&
    prev.isDragOverlay === next.isDragOverlay &&
    prev.onCardClick === next.onCardClick,
)
