import { useRef, useCallback, useMemo, useState, useEffect } from 'react'
import { CheckCheck } from 'lucide-react'
import { PdfPreview } from '@/components/ui/pdf-preview'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { MappingOverlayCard } from './MappingOverlayCard'
import type { SelectionEntry, SelectionStatus } from '../types'

/** Payload emitted when the user selects text on the PDF */
export interface TextSelectionPayload {
  text: string
  pageNumber: number
  boundingRect: DOMRect
  paragraphIndex: number
}

interface InteractivePdfViewerProps {
  url: string | null
  isLoading?: boolean
  error?: string
  onTextSelected: (selection: TextSelectionPayload) => void
  selections: SelectionEntry[]
  className?: string
  /** Called when user accepts a resolved mapping */
  onAccept?: (id: string) => void
  /** Called when user rejects a resolved mapping */
  onReject?: (id: string) => void
  /** Called when user clicks Confirm All */
  onConfirmAll?: () => void
  /** Whether the chat SSE stream is active (disables Confirm All) */
  isStreaming?: boolean
  /** Mapped field count for coverage display (Plan 05 stub) */
  mappedCount?: number
}

// Status-based badge ring colors (Decision #8)
const STATUS_RING_CLASSES: Record<SelectionStatus, string> = {
  pending: 'ring-2 ring-blue-500 bg-blue-50 text-blue-700',
  confirmed: 'ring-2 ring-green-500 bg-green-50 text-green-700',
  rejected: 'ring-2 ring-orange-500 bg-orange-50 text-orange-700',
}

/** Overlay card width in pixels, used for overflow detection */
const OVERLAY_CARD_WIDTH = 256

/**
 * Check whether a DOM node is inside the given container element.
 */
function isNodeInsideContainer(node: Node, container: HTMLElement): boolean {
  let current: Node | null = node
  while (current) {
    if (current === container) return true
    current = current.parentNode
  }
  return false
}

/**
 * Walk up from a node to find the closest ancestor matching a selector.
 */
function closestElement(node: Node, selector: string): HTMLElement | null {
  let current: Node | null = node
  while (current) {
    if (current instanceof HTMLElement && current.matches(selector)) {
      return current
    }
    current = current.parentNode
  }
  return null
}

/**
 * Estimate paragraph index by counting the position of the closest
 * text-layer span among its siblings.
 */
function estimateParagraphIndex(node: Node): number {
  const span = closestElement(node, 'span[role="presentation"]')
  if (!span || !span.parentElement) return 0
  const siblings = Array.from(span.parentElement.children)
  return siblings.indexOf(span)
}

/**
 * Truncate text for tooltip display.
 */
function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '...'
}

/**
 * Compute overlay card position relative to container.
 * Default: right of badge. If that would overflow container width, flip to left.
 */
function computeOverlayPosition(
  rect: { top: number; left: number; width: number },
  containerWidth: number,
  scrollLeft: number,
): { top: number; left: number } {
  const badgeRight = rect.left + rect.width + 12 // 12px gap right of selection end
  const wouldOverflow = badgeRight - scrollLeft + OVERLAY_CARD_WIDTH > containerWidth

  return {
    top: rect.top - 4, // slight upward offset to align with selection
    left: wouldOverflow
      ? Math.max(0, rect.left - OVERLAY_CARD_WIDTH - 12) // flip to left
      : badgeRight,
  }
}

/**
 * Wraps PdfPreview with interactive text selection, numbered overlay badges,
 * and MappingOverlayCards for resolved selections.
 */
export function InteractivePdfViewer({
  url,
  isLoading,
  error,
  onTextSelected,
  selections,
  className,
  onAccept,
  onReject,
  onConfirmAll,
  isStreaming,
  mappedCount: _mappedCount,
}: InteractivePdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const lastSelectionTimeRef = useRef<number>(0)
  const [scrollOffset, setScrollOffset] = useState({ top: 0, left: 0 })
  const [containerWidth, setContainerWidth] = useState(0)

  // Track scroll offset for overlay positioning
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateScroll = () => {
      setScrollOffset({ top: container.scrollTop, left: container.scrollLeft })
    }
    const updateWidth = () => {
      setContainerWidth(container.clientWidth)
    }

    updateScroll()
    updateWidth()

    container.addEventListener('scroll', updateScroll, { passive: true })
    const resizeObserver = new ResizeObserver(updateWidth)
    resizeObserver.observe(container)

    return () => {
      container.removeEventListener('scroll', updateScroll)
      resizeObserver.disconnect()
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    // Debounce: 100ms cooldown between captures
    const now = Date.now()
    if (now - lastSelectionTimeRef.current < 100) return
    lastSelectionTimeRef.current = now

    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return

    const text = selection.toString().trim()
    if (!text) return

    const container = containerRef.current
    if (!container) return

    // Verify selection is within this pdf viewer container
    const anchorNode = selection.anchorNode
    const focusNode = selection.focusNode
    if (!anchorNode || !focusNode) return
    if (!isNodeInsideContainer(anchorNode, container) || !isNodeInsideContainer(focusNode, container)) return

    // Extract bounding rect
    const range = selection.getRangeAt(0)
    const absoluteRect = range.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    // Convert to coordinates relative to the container
    const relativeRect = new DOMRect(
      absoluteRect.left - containerRect.left + container.scrollLeft,
      absoluteRect.top - containerRect.top + container.scrollTop,
      absoluteRect.width,
      absoluteRect.height,
    )

    // Determine page number from closest .react-pdf__Page ancestor
    const pageEl = closestElement(anchorNode, '.react-pdf__Page')
    const pageNumber = pageEl
      ? parseInt(pageEl.getAttribute('data-page-number') ?? '1', 10)
      : 1

    // Estimate paragraph index from text layer span position
    const paragraphIndex = estimateParagraphIndex(anchorNode)

    // Emit selection payload
    onTextSelected({
      text,
      pageNumber,
      boundingRect: relativeRect,
      paragraphIndex,
    })

    // Clear the browser selection after capture
    selection.removeAllRanges()
  }, [onTextSelected])

  // Partition selections: resolved (have gwField) get overlay cards, unresolved get badges
  const { badgeSelections, overlaySelections } = useMemo(() => {
    const badges: SelectionEntry[] = []
    const overlays: SelectionEntry[] = []
    for (const sel of selections) {
      if (sel.gwField) {
        overlays.push(sel)
      } else {
        badges.push(sel)
      }
    }
    return { badgeSelections: badges, overlaySelections: overlays }
  }, [selections])

  // Memoize badge data for unresolved selections
  const badgeData = useMemo(
    () =>
      badgeSelections.map((sel) => ({
        id: sel.id,
        number: sel.selectionNumber,
        status: sel.status,
        text: truncateText(sel.text, 80),
        top: sel.boundingRect.top,
        left: sel.boundingRect.left + sel.boundingRect.width,
        ringClass: STATUS_RING_CLASSES[sel.status],
      })),
    [badgeSelections],
  )

  // Count resolved but unconfirmed selections (pending status with gwField set)
  const unconfirmedResolvedCount = useMemo(
    () => selections.filter((s) => s.gwField && s.status === 'pending').length,
    [selections],
  )

  const handleAccept = useCallback(
    (id: string) => onAccept?.(id),
    [onAccept],
  )

  const handleReject = useCallback(
    (id: string) => onReject?.(id),
    [onReject],
  )

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-auto', className)}
      onMouseUp={handleMouseUp}
    >
      {/* Toolbar: Confirm All button */}
      {unconfirmedResolvedCount > 0 && (
        <div className="sticky top-0 z-10 flex items-center justify-end px-3 py-1.5 bg-background/80 backdrop-blur-sm border-b">
          <Button
            variant="outline"
            size="sm"
            className="text-green-700 border-green-300 hover:bg-green-50 hover:text-green-800"
            disabled={isStreaming}
            onClick={onConfirmAll}
          >
            <CheckCheck className="h-4 w-4 mr-1" />
            Confirm All ({unconfirmedResolvedCount})
          </Button>
        </div>
      )}

      {/* PDF viewer */}
      <PdfPreview
        url={url}
        isLoading={isLoading}
        error={error}
        className="h-full"
      />

      {/* Selection overlay layer */}
      {(badgeData.length > 0 || overlaySelections.length > 0) && (
        <TooltipProvider>
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            aria-hidden="true"
          >
            {/* Unresolved selections: numbered badges */}
            {badgeData.map((badge) => (
              <Tooltip key={badge.id}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      'pointer-events-auto absolute rounded-full text-[10px] font-bold',
                      'w-5 h-5 flex items-center justify-center cursor-default',
                      'shadow-sm transition-colors',
                      badge.ringClass,
                    )}
                    style={{
                      top: badge.top,
                      left: badge.left,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    {badge.number}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={4}>
                  <span className="max-w-[240px] block break-words">
                    #{badge.number}: {badge.text}
                  </span>
                </TooltipContent>
              </Tooltip>
            ))}

            {/* Resolved selections: MappingOverlayCards */}
            {overlaySelections.map((sel) => {
              const pos = computeOverlayPosition(
                {
                  top: sel.boundingRect.top,
                  left: sel.boundingRect.left,
                  width: sel.boundingRect.width,
                },
                containerWidth,
                scrollOffset.left,
              )
              return (
                <div
                  key={sel.id}
                  className="pointer-events-auto absolute"
                  style={{ top: pos.top, left: pos.left }}
                >
                  <MappingOverlayCard
                    selection={sel}
                    onAccept={handleAccept}
                    onReject={handleReject}
                  />
                </div>
              )
            })}
          </div>
        </TooltipProvider>
      )}
    </div>
  )
}
