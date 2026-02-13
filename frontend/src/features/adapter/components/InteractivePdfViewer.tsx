import { useRef, useCallback } from 'react'
import { PdfPreview } from '@/components/ui/pdf-preview'
import { cn } from '@/lib/utils'
import type { SelectionEntry } from '../types'

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
 * Wraps PdfPreview with interactive text selection and numbered overlay badges.
 * Captures mouseup events on the pdfjs text layer and relays selection data upstream.
 */
export function InteractivePdfViewer({
  url,
  isLoading,
  error,
  onTextSelected,
  selections: _selections,
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

      {/* Selection overlay layer -- populated in Task 5 */}
    </div>
  )
}
