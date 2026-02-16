import { Check, X, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { SelectionEntry } from '../types'

interface MappingOverlayCardProps {
  selection: SelectionEntry
  onAccept: (id: string) => void
  onReject: (id: string) => void
  style?: React.CSSProperties
}

/**
 * Truncate rationale text to roughly 2 lines (approx 100 chars).
 */
function truncateRationale(text: string | undefined, maxLen = 100): string {
  if (!text) return ''
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '...'
}

/**
 * Format confidence as a percentage string.
 */
function formatConfidence(confidence: number | null): string {
  if (confidence === null) return '--'
  return `${Math.round(confidence * 100)}%`
}

/**
 * Visual state configuration keyed by selection status.
 * Decision #8: blue=pending, green=confirmed, orange=rejected.
 */
const STATE_STYLES = {
  pending: {
    card: 'border-info/60 bg-info/5',
    headerBadge: 'bg-info/15 text-info border-info/40',
    markerBadge: 'bg-info/15 text-info border-info/40',
  },
  confirmed: {
    card: 'border-success/60 bg-success/5',
    headerBadge: 'bg-success/15 text-success border-success/40',
    markerBadge: 'bg-success/15 text-success border-success/40',
  },
  rejected: {
    card: 'border-warning/60 bg-warning/5',
    headerBadge: 'bg-warning/15 text-warning border-warning/40',
    markerBadge: 'bg-warning/15 text-warning border-warning/40',
  },
} as const

/**
 * Compact overlay card for a resolved selection mapping.
 * Shows gwField, markerType, confidence, rationale, and accept/reject actions.
 * Visual state matches Decision #8 color scheme.
 */
export function MappingOverlayCard({
  selection,
  onAccept,
  onReject,
  style,
}: MappingOverlayCardProps) {
  const { id, selectionNumber, status, gwField, markerType, confidence } = selection
  const stateStyle = STATE_STYLES[status]

  // Rationale comes from the selection_mapping SSE event -- stored externally.
  // For the card display we use the gwField/markerType/confidence that are on the entry.
  // Rationale is not stored on SelectionEntry, so we show a placeholder if needed.

  return (
    <div
      data-testid="mapping-overlay-card"
      data-status={status}
      className={cn(
        'max-w-64 rounded-lg border shadow-md backdrop-blur-sm',
        'py-1.5 px-2 text-xs',
        'animate-in fade-in-0 zoom-in-95 duration-200',
        stateStyle.card,
      )}
      style={style}
    >
      {/* Header: badge number + gwField */}
      <div className="flex items-center gap-1.5 mb-1">
        <Badge
          variant="outline"
          className={cn('text-[10px] px-1.5 py-0 font-bold', stateStyle.headerBadge)}
        >
          #{selectionNumber}
        </Badge>
        <span className="font-semibold text-xs truncate" title={gwField ?? ''}>
          {gwField ?? 'unresolved'}
        </span>

        {/* Status icon for confirmed/rejected (no action buttons) */}
        {status === 'confirmed' && (
          <CheckCircle
            data-testid="confirmed-icon"
            className="ml-auto h-3.5 w-3.5 text-success shrink-0"
          />
        )}
        {status === 'rejected' && (
          <AlertCircle
            data-testid="rejected-icon"
            className="ml-auto h-3.5 w-3.5 text-warning shrink-0"
          />
        )}
      </div>

      {/* Body: markerType badge + confidence */}
      <div className="flex items-center gap-1.5 mb-1">
        {markerType && (
          <Badge
            variant="outline"
            className={cn('text-[10px] px-1 py-0', stateStyle.markerBadge)}
          >
            {markerType}
          </Badge>
        )}
        <span className="text-muted-foreground ml-auto tabular-nums">
          {formatConfidence(confidence)}
        </span>
      </div>

      {/* Footer: rationale (2-line truncation) */}
      {gwField && (
        <p
          data-testid="rationale-text"
          className="text-muted-foreground leading-tight line-clamp-2 mb-1"
          title={truncateRationale(undefined, 500)}
        >
          {truncateRationale(gwField ? `Mapped to ${gwField}` : undefined)}
        </p>
      )}

      {/* Action buttons -- only for pending+resolved state */}
      {status === 'pending' && gwField && (
        <div className="flex items-center gap-1 pt-0.5 border-t border-current/10">
          <Button
            data-testid="accept-button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-success hover:bg-success/15"
            onClick={() => onAccept(id)}
          >
            <Check className="h-3 w-3 mr-0.5" />
            Accept
          </Button>
          <Button
            data-testid="reject-button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-warning hover:bg-warning/15"
            onClick={() => onReject(id)}
          >
            <X className="h-3 w-3 mr-0.5" />
            Reject
          </Button>
        </div>
      )}
    </div>
  )
}
