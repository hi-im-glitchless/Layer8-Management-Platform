import { memo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Pin } from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback, AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar'
import type { BoardCard, BoardCardAssignment } from '../types'

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

// ── Pentester avatar helpers (Phase 04) ─────────────────────────────

/**
 * Deduplicate a card's assignments by teamMemberId so a pentester with both a
 * primary and a split assignment on the same card renders exactly one avatar.
 * Keeps the first teamMember object seen for each id.
 */
function uniquePentesters(assignments: BoardCardAssignment[]): BoardCardAssignment[] {
  const seen = new Map<string, BoardCardAssignment>()
  for (const a of assignments) {
    if (!seen.has(a.teamMemberId)) seen.set(a.teamMemberId, a)
  }
  return Array.from(seen.values())
}

/** Display name for an assignment's pentester (schedule fallback chain). */
function pentesterName(a: BoardCardAssignment): string {
  const tm = a.teamMember
  return tm?.displayName || tm?.user?.displayName || tm?.user?.username || ''
}

/** Single uppercased initial — EXACT schedule fallback (never the opaque cuid). */
function pentesterInitial(a: BoardCardAssignment): string {
  const tm = a.teamMember
  return (tm?.displayName || tm?.user?.displayName || tm?.user?.username || '?')
    .charAt(0)
    .toUpperCase()
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
          style={{ backgroundColor: card.project.color }}
        />

        {/* Content */}
        <div className="flex-1 p-3 space-y-1.5">
          {/* Row 1: project name + pin */}
          <div className="flex items-start justify-between gap-1">
            <p className="text-sm font-semibold leading-tight line-clamp-2">
              {card.project.name || '(No project)'}
            </p>
            {card.stageLockedBy && card.stageLockedBy !== 'auto' && (
              <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
          </div>

          {/* Row 2: client name (text) + pentester avatars (Phase 04) */}
          {(card.project.client?.name || card.assignments.length > 0) && (
            <div className="text-xs text-muted-foreground space-y-0.5">
              {card.project.client?.name && <p>{card.project.client.name}</p>}
              {(() => {
                const pentesters = uniquePentesters(card.assignments)
                if (pentesters.length === 0) return null
                return (
                  <AvatarGroup>
                    {pentesters.slice(0, 3).map((a) => {
                      const name = pentesterName(a)
                      const avatarUrl = a.teamMember?.user?.avatarUrl ?? null
                      return (
                        <Avatar key={a.teamMemberId} size="sm" title={name || undefined}>
                          {avatarUrl ? <AvatarImage src={avatarUrl} alt={name || ''} /> : null}
                          <AvatarFallback>{pentesterInitial(a)}</AvatarFallback>
                        </Avatar>
                      )
                    })}
                    {pentesters.length > 3 && (
                      <AvatarGroupCount>+{pentesters.length - 3}</AvatarGroupCount>
                    )}
                  </AvatarGroup>
                )
              })()}
            </div>
          )}

          {/* Row 3: checklist progress + status badge */}
          {(totalCount > 0 || card.project.status) && (
            <div className="flex items-center justify-between">
              {totalCount > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {checkedCount}/{totalCount}
                </span>
              ) : (
                <span />
              )}
              <StatusBadge status={card.project.status} />
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
    prev.card.project.name === next.card.project.name &&
    prev.card.assignments.map((a) => a.teamMemberId + '|' + (a.teamMember?.user?.avatarUrl ?? '')).join() ===
      next.card.assignments.map((a) => a.teamMemberId + '|' + (a.teamMember?.user?.avatarUrl ?? '')).join() &&
    prev.isDragOverlay === next.isDragOverlay &&
    prev.onCardClick === next.onCardClick,
)
