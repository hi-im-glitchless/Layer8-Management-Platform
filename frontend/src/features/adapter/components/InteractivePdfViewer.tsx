import { useRef } from 'react'
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
 * Wraps PdfPreview with interactive text selection and numbered overlay badges.
 * Captures mouseup events on the pdfjs text layer and relays selection data upstream.
 */
export function InteractivePdfViewer({
  url,
  isLoading,
  error,
  onTextSelected: _onTextSelected,
  selections: _selections,
  className,
}: InteractivePdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={containerRef} className={cn('relative', className)}>
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
