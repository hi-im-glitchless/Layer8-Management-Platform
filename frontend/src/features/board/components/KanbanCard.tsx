import { memo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { Pin } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from '@/components/ui/avatar'
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

/**
 * Display name for an assignment's pentester. Phase 08: the linked account's
 * user.displayName (the full "First Last" name) takes precedence over the
 * editable TeamMember alias (displayName), which in production often holds only
 * a first name and shadowed the full name. The alias is retained as the fallback
 * for backlog members (no linked user, e.g. "Futuro 1"), then username.
 */
function pentesterName(a: BoardCardAssignment): string {
  const tm = a.teamMember
  return tm?.user?.displayName || tm?.displayName || tm?.user?.username || ''
}

/**
 * Two-letter monogram (Phase 07): first initial of the first name + first
 * initial of the last name, uppercased. A single-token name/mononym/username
 * yields one initial; a missing/empty/whitespace-only name degrades to '?'.
 * Parses the display-name chain (no firstName/lastName field exists —
 * User.displayName is a single string, so we split on whitespace). Phase 08:
 * the linked account's user.displayName wins over the editable TeamMember alias
 * so a full "First Last" name yields two initials; the alias remains the
 * backlog fallback (no linked user), then username.
 */
function pentesterInitials(a: BoardCardAssignment): string {
  const tm = a.teamMember
  const name = (tm?.user?.displayName || tm?.displayName || tm?.user?.username || '?').trim()
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

/**
 * Fixed, white-text-legible avatar background palette (Phase 07). Mid-saturation
 * entries drawn from the schedule COLOR_PALETTE family but DEFINED LOCALLY here —
 * constants.ts is NOT imported or modified. Pale/pastel entries (Sky, Butter,
 * Sand, Peach, Seafoam) are deliberately excluded so white (#fff) monogram text
 * always has adequate contrast.
 */
const AVATAR_PALETTE = [
  '#3B5998', '#E07A5F', '#4A7C59', '#9B5094', '#2E8B8B', '#A0522D',
  '#8B7EC8', '#C76D8E', '#4DA6C9', '#B54555', '#6B8294', '#D97706',
] as const

/**
 * Deterministic account-derived background colour (Phase 07). Hashes the STABLE
 * teamMemberId cuid (NOT the display name) via a pure *31 + charCodeAt integer
 * hash and indexes AVATAR_PALETTE. The same teamMemberId always yields the same
 * colour on every render and reload; a display-name rename never changes it.
 */
function avatarBgColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

// ── Client-name colour helper (Phase 10) ───────────────────────────

/**
 * Readable dark fallback for the client-name text when the client's own colour
 * would be illegible on the white `bg-card` (or is missing/unparseable). Mirrors
 * the schedule's dark text token (#1a1a1a) WITHOUT importing the schedule —
 * getContrastColor is un-exported and solves the inverse problem (pick fg given a
 * bg), so the small luminance check is duplicated locally to keep the board
 * decoupled from the schedule feature.
 */
const CLIENT_NAME_DARK_FALLBACK = '#1a1a1a'

/**
 * Luminance threshold above which a client hex is treated as "too light" to read
 * as text on the white card. The luminance formula
 * `(0.299*r + 0.587*g + 0.114*b) / 255` mirrors the schedule's own threshold
 * convention; mid/dark client colours render as their own hex, pale colours fall
 * back to the dark token.
 */
const CLIENT_NAME_LIGHT_THRESHOLD = 0.7

/**
 * Resolve the client-name text colour from a stored client hex (Phase 10).
 * Returns the client's own hex for mid/dark colours; returns the readable dark
 * fallback when the hex is missing/empty/unparseable OR its relative luminance is
 * above the documented light threshold (illegible on the white `bg-card`). Pure
 * and total — never throws, never returns undefined/''.
 */
function resolveClientNameColor(hex: string | null | undefined): string {
  if (!hex) return CLIENT_NAME_DARK_FALLBACK
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return CLIENT_NAME_DARK_FALLBACK
  const int = parseInt(m[1], 16)
  const r = (int >> 16) & 0xff
  const g = (int >> 8) & 0xff
  const b = int & 0xff
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > CLIENT_NAME_LIGHT_THRESHOLD ? CLIENT_NAME_DARK_FALLBACK : hex
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

          {/* Row 2: client name (text) — Phase 10: bold + the client's own
              colour, with a local luminance guard that falls back to a readable
              dark colour when the client hex is too light for the white card. */}
          {card.project.client?.name && (
            <p
              className="text-xs font-bold leading-tight"
              style={{ color: resolveClientNameColor(card.project.client.color) }}
            >
              {card.project.client.name}
            </p>
          )}

          {/* Row 3: status badge alone, below the client name (Phase 04) */}
          {card.project.status && (
            <div className="flex items-center min-w-0">
              <StatusBadge status={card.project.status} />
            </div>
          )}

          {/* Row 4: checklist count (left) + pentester avatars (right) (Phase 04) */}
          {(() => {
            const pentesters = uniquePentesters(card.assignments)
            const hasChecklist = totalCount > 0
            if (!hasChecklist && pentesters.length === 0) return null
            return (
              <div className="flex items-center justify-between">
                {hasChecklist ? (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {checkedCount}/{totalCount}
                  </span>
                ) : (
                  <span />
                )}
                {pentesters.length > 0 && (
                  <AvatarGroup className="shrink-0">
                    {pentesters.slice(0, 3).map((a) => {
                      const name = pentesterName(a)
                      // Phase 07: board cards always show the initials+colour
                      // monogram — no avatarUrl read, no <AvatarImage>/<img>.
                      return (
                        <Avatar key={a.teamMemberId} size="default" title={name || undefined}>
                          <AvatarFallback style={{ backgroundColor: avatarBgColor(a.teamMemberId), color: '#fff' }}>
                            {pentesterInitials(a)}
                          </AvatarFallback>
                        </Avatar>
                      )
                    })}
                    {pentesters.length > 3 && (
                      <AvatarGroupCount>+{pentesters.length - 3}</AvatarGroupCount>
                    )}
                  </AvatarGroup>
                )}
              </div>
            )
          })()}
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
    // Phase 05-01: the card renders project.status (badge), project.color
    // (accent bar), and the client name — include them so a schedule status
    // edit (or color/client change) re-renders instead of being memoized stale.
    prev.card.project.status === next.card.project.status &&
    prev.card.project.color === next.card.project.color &&
    prev.card.project.client?.name === next.card.project.client?.name &&
    // Phase 10: guard the client colour so a live client-colour edit (React
    // Query refetch / socket invalidate) re-renders the card instead of staying
    // memoized stale.
    prev.card.project.client?.color === next.card.project.client?.color &&
    // Phase 07: avatarUrl is no longer rendered on board cards, so the
    // per-assignment fingerprint is keyed solely on the stable teamMemberId —
    // the comparator still re-renders when the set of pentesters changes.
    prev.card.assignments.map((a) => a.teamMemberId).join() ===
      next.card.assignments.map((a) => a.teamMemberId).join() &&
    prev.isDragOverlay === next.isDragOverlay &&
    prev.onCardClick === next.onCardClick,
)
