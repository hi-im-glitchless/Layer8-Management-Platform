import { useRef, useCallback, useMemo } from 'react'
import { PdfPreview } from '@/components/ui/pdf-preview'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
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
}

// Status-based badge ring colors (Decision #8)
const STATUS_RING_CLASSES: Record<SelectionStatus, string> = {
  pending: 'ring-2 ring-blue-500 bg-blue-50 text-blue-700',
  confirmed: 'ring-2 ring-green-500 bg-green-50 text-green-700',
  rejected: 'ring-2 ring-orange-500 bg-orange-50 text-orange-700',
}

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
 * Wraps PdfPreview with interactive text selection and numbered overlay badges.
 * Captures mouseup events on the pdfjs text layer and relays selection data upstream.
 */
export function InteractivePdfViewer({
  url,
  isLoading,
  error,
  onTextSelected,
  selections,
  className,
}: InteractivePdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const lastSelectionTimeRef = useRef<number>(0)

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

  // Memoize badge data to avoid re-computing on every render
  const badgeData = useMemo(
    () =>
      selections.map((sel) => ({
        id: sel.id,
        number: sel.selectionNumber,
        status: sel.status,
        text: truncateText(sel.text, 80),
        top: sel.boundingRect.top,
        left: sel.boundingRect.left + sel.boundingRect.width,
        ringClass: STATUS_RING_CLASSES[sel.status],
      })),
    [selections],
  )

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      onMouseUp={handleMouseUp}
    >
      {/* Toolbar slot -- will receive coverage counter in Plan 5 */}

      {/* PDF viewer */}
      <PdfPreview
        url={url}
        isLoading={isLoading}
        error={error}
        className="h-full"
      />

      {/* Selection overlay layer -- absolutely positioned badges */}
      {badgeData.length > 0 && (
        <TooltipProvider>
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            aria-hidden="true"
          >
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
          </div>
        </TooltipProvider>
      )}
    </div>
  )
}
