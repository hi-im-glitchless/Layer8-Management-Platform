import { useState, useCallback, useEffect, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { ENTITY_TYPES, DEFAULT_ENTITY_TYPE, getEntityTypeLabel } from '../entityTypes'

interface EntityPopoverProps {
  selectedText: string
  position: { x: number; y: number }
  onAddMapping: (text: string, entityType: string) => void
  onDismiss: () => void
  /** Already-mapped original values, used for duplicate checking. */
  existingValues?: string[]
}

/** Maximum characters to display for selected text. */
const MAX_DISPLAY_LENGTH = 60

/**
 * Floating popover that appears on text selection in the HTML preview iframe.
 * Provides entity type dropdown and "Add Mapping" button for creating new mappings.
 */
export function EntityPopover({
  selectedText,
  position,
  onAddMapping,
  onDismiss,
  existingValues = [],
}: EntityPopoverProps) {
  const [entityType, setEntityType] = useState(DEFAULT_ENTITY_TYPE)
  const popoverRef = useRef<HTMLDivElement>(null)

  const isDuplicate = existingValues.some(
    (v) => v.toLowerCase() === selectedText.toLowerCase(),
  )
  const isTooLong = selectedText.length > 200
  const isTooShort = selectedText.length < 1
  const isInvalid = isDuplicate || isTooLong || isTooShort

  const displayText =
    selectedText.length > MAX_DISPLAY_LENGTH
      ? selectedText.slice(0, MAX_DISPLAY_LENGTH) + '...'
      : selectedText

  const handleAdd = useCallback(() => {
    if (isInvalid) return
    onAddMapping(selectedText, entityType)
  }, [selectedText, entityType, isInvalid, onAddMapping])

  // Dismiss on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onDismiss])

  // Dismiss on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onDismiss()
      }
    }
    // Delay attaching to avoid the triggering click dismissing immediately
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClickOutside)
    }, 100)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onDismiss])

  // Calculate position to keep popover within viewport
  const popoverStyle = usePositionClamp(position)

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Add entity mapping"
      className={cn(
        'fixed z-50 w-72 rounded-lg border bg-popover p-3 shadow-lg',
        'text-popover-foreground',
        'animate-in fade-in-0 zoom-in-95',
      )}
      style={popoverStyle}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground">Add Entity Mapping</p>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Selected text preview */}
      <div className="rounded-md bg-muted/50 px-2 py-1.5 mb-3">
        <p className="text-xs font-mono break-all leading-relaxed">
          &ldquo;{displayText}&rdquo;
        </p>
      </div>

      {/* Validation messages */}
      {isDuplicate && (
        <p className="text-xs text-destructive mb-2">
          This text is already mapped.
        </p>
      )}
      {isTooLong && (
        <p className="text-xs text-destructive mb-2">
          Selected text exceeds 200 characters.
        </p>
      )}

      {/* Entity type selector */}
      <div className="mb-3">
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          Entity Type
        </label>
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue>{getEntityTypeLabel(entityType)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value} className="text-xs">
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Add button */}
      <Button
        size="sm"
        className="w-full text-xs"
        onClick={handleAdd}
        disabled={isInvalid}
      >
        <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
        Add Mapping
      </Button>
    </div>
  )
}

/**
 * Compute clamped position to prevent the popover from overflowing viewport edges.
 */
function usePositionClamp(position: { x: number; y: number }): React.CSSProperties {
  const POPOVER_WIDTH = 288 // w-72 = 18rem = 288px
  const POPOVER_HEIGHT_ESTIMATE = 220
  const MARGIN = 8

  let left = position.x - POPOVER_WIDTH / 2
  let top = position.y + MARGIN

  // Clamp horizontal
  if (left < MARGIN) left = MARGIN
  if (typeof window !== 'undefined' && left + POPOVER_WIDTH > window.innerWidth - MARGIN) {
    left = window.innerWidth - POPOVER_WIDTH - MARGIN
  }

  // Flip above if overflowing bottom
  if (typeof window !== 'undefined' && top + POPOVER_HEIGHT_ESTIMATE > window.innerHeight - MARGIN) {
    top = position.y - POPOVER_HEIGHT_ESTIMATE - MARGIN
  }

  return {
    left: Math.max(left, MARGIN),
    top: Math.max(top, MARGIN),
  }
}
