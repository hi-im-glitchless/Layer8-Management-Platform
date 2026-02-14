import { useState, useCallback, useEffect, useRef, useMemo, useId, type ReactNode } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import {
  ZoomIn,
  ZoomOut,
  AlertCircle,
  RefreshCw,
  Maximize,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// Configure pdf.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

interface PdfPreviewProps {
  url: string | null
  isLoading?: boolean
  error?: string
  className?: string
  onPageChange?: (page: number, totalPages: number) => void
  /** Content rendered inside the scroll area (for overlays that scroll with PDF) */
  overlay?: ReactNode
  /** Callback ref exposing the scroll container element */
  scrollRef?: (el: HTMLDivElement | null) => void
  /** Texts to highlight on the PDF text layer (mapped placeholders / selections) */
  highlightTexts?: string[]
}

const ZOOM_STEP = 0.25
const MIN_ZOOM = 0.25
const MAX_ZOOM = 3.0

export function PdfPreview({
  url,
  isLoading = false,
  error: externalError,
  className,
  onPageChange,
  overlay,
  scrollRef,
  highlightTexts,
}: PdfPreviewProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [scale, setScale] = useState(0) // 0 = fit width
  const [loadError, setLoadError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const combinedScrollRef = useCallback(
    (el: HTMLDivElement | null) => {
      containerRef.current = el
      scrollRef?.(el)
    },
    [scrollRef],
  )
  const viewerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  const instanceId = useId()
  const zoomStatusId = `${instanceId}-zoom-status`

  const displayError = externalError || loadError

  // Memoize the file prop for react-pdf (it uses reference equality)
  const file = useMemo(() => (url ? { url, withCredentials: true } : null), [url])

  // Observe container width for fit-width mode
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const onDocumentLoadSuccess = useCallback(
    ({ numPages: pages }: { numPages: number }) => {
      setNumPages(pages)
      setLoadError(null)
      onPageChange?.(1, pages)
    },
    [onPageChange],
  )

  const onDocumentLoadError = useCallback((error: Error) => {
    setLoadError(error.message || 'Failed to load PDF')
  }, [])

  const zoomIn = useCallback(() => {
    setScale((prev) => {
      const current = prev === 0 ? 1 : prev
      return Math.min(MAX_ZOOM, current + ZOOM_STEP)
    })
  }, [])

  const zoomOut = useCallback(() => {
    setScale((prev) => {
      const current = prev === 0 ? 1 : prev
      return Math.max(MIN_ZOOM, current - ZOOM_STEP)
    })
  }, [])

  const fitWidth = useCallback(() => {
    setScale(0)
  }, [])

  const handleRetry = useCallback(() => {
    setLoadError(null)
    setNumPages(0)
  }, [])

  // Scoped keyboard shortcuts -- only active when focus is within the viewer
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      const isInputFocused =
        activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement
      if (isInputFocused) return
      if (!viewer.contains(activeEl)) return

      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault()
          zoomIn()
          break
        case '-':
          e.preventDefault()
          zoomOut()
          break
      }
    }

    viewer.addEventListener('keydown', handleKeyDown)
    return () => viewer.removeEventListener('keydown', handleKeyDown)
  }, [zoomIn, zoomOut])

  // Highlight matched text spans on the PDF text layer
  useEffect(() => {
    const el = containerRef.current
    if (!el || !highlightTexts?.length) return
    const timer = setTimeout(() => {
      el.querySelectorAll('.mapped-highlight').forEach((span) => {
        span.classList.remove('mapped-highlight')
      })
      const needles = highlightTexts.filter((t) => t.length >= 4).map((t) => t.toLowerCase().trim())
      if (needles.length === 0) return
      const spans = el.querySelectorAll('.react-pdf__Page__textContent span')
      spans.forEach((span) => {
        const text = (span.textContent || '').toLowerCase().trim()
        if (!text || text.length < 3) return
        for (const needle of needles) {
          if (text.includes(needle) || (needle.includes(text) && text.length > needle.length * 0.6)) {
            ;(span as HTMLElement).classList.add('mapped-highlight')
            break
          }
        }
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [highlightTexts, numPages, scale])

  // Compute page width for fit-width mode
  const pageWidth = scale === 0 && containerWidth > 0 ? containerWidth - 32 : undefined
  const pageScale = scale === 0 ? undefined : scale
  const displayZoom = scale === 0 ? 'Fit' : `${Math.round(scale * 100)}%`

  // Build array of page numbers for continuous scroll
  const pageNumbers = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages])

  // Loading state (no URL yet)
  if (isLoading && !url) {
    return (
      <div
        className={cn('flex flex-col rounded-lg border bg-card', className)}
        role="region"
        aria-label="PDF preview"
        aria-busy="true"
      >
        <div className="p-4 border-b">
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="space-y-4 w-full max-w-md">
            <Skeleton className="h-[400px] w-full" />
            <Skeleton className="h-4 w-3/4 mx-auto" />
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (displayError && !url) {
    return (
      <div
        className={cn('flex flex-col rounded-lg border bg-card', className)}
        role="region"
        aria-label="PDF preview"
      >
        <div
          className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center"
          role="alert"
        >
          <AlertCircle className="h-12 w-12 text-destructive" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-destructive">Failed to load PDF</p>
            <p className="text-xs text-muted-foreground mt-1">{displayError}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRetry}>
            <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  // No URL provided
  if (!url) {
    return (
      <div
        className={cn('flex flex-col rounded-lg border bg-card', className)}
        role="region"
        aria-label="PDF preview"
      >
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <p className="text-sm text-muted-foreground">No PDF to display</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={viewerRef}
      className={cn('flex flex-col rounded-lg border bg-card overflow-hidden', className)}
      role="region"
      aria-label="PDF preview"
      aria-roledescription="PDF document viewer"
      tabIndex={-1}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 flex-wrap"
        role="toolbar"
        aria-label="PDF zoom controls"
      >
        {/* Page count */}
        {numPages > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {numPages} {numPages === 1 ? 'page' : 'pages'}
          </span>
        )}

        <div className="flex-1" />

        {/* Zoom controls group */}
        <div className="flex items-center gap-1" role="group" aria-label="Zoom controls">
          <Button
            variant="ghost"
            size="icon"
            onClick={zoomOut}
            disabled={scale !== 0 && scale <= MIN_ZOOM}
            aria-label="Zoom out"
            className="h-8 w-8"
          >
            <ZoomOut className="h-4 w-4" aria-hidden="true" />
          </Button>

          <span
            id={zoomStatusId}
            className="text-xs text-muted-foreground w-12 text-center tabular-nums"
            aria-live="polite"
            aria-atomic="true"
          >
            {displayZoom}
          </span>

          <Button
            variant="ghost"
            size="icon"
            onClick={zoomIn}
            disabled={scale >= MAX_ZOOM}
            aria-label="Zoom in"
            className="h-8 w-8"
          >
            <ZoomIn className="h-4 w-4" aria-hidden="true" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={fitWidth}
            aria-label="Fit to width"
            className="h-8 w-8"
            title="Fit to width"
          >
            <Maximize className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* PDF render area -- continuous scroll of all pages */}
      <div
        ref={combinedScrollRef}
        className="flex-1 overflow-auto bg-muted/10 min-h-[400px] max-h-[80vh] relative"
      >
        <Document
          file={file}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={
            <div className="flex items-center justify-center p-8" aria-label="Loading PDF">
              <div className="space-y-4 w-full max-w-md">
                <Skeleton className="h-[400px] w-full" />
              </div>
            </div>
          }
          error={
            <div
              className="flex flex-col items-center justify-center gap-4 p-8 text-center"
              role="alert"
            >
              <AlertCircle className="h-12 w-12 text-destructive" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-destructive">Failed to load PDF</p>
                <p className="text-xs text-muted-foreground mt-1">{loadError}</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleRetry}>
                <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
                Retry
              </Button>
            </div>
          }
        >
          <div className="flex flex-col items-center gap-4 p-4">
            {pageNumbers.map((pageNum) => (
              <Page
                key={pageNum}
                pageNumber={pageNum}
                width={pageWidth}
                scale={pageScale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="shadow-lg motion-reduce:transition-none"
              />
            ))}
          </div>
        </Document>
        {overlay}
      </div>

      {/* Screen reader only: page count announcement */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {numPages} pages loaded
      </div>
    </div>
  )
}
