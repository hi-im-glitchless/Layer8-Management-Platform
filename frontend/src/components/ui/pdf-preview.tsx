import { useState, useCallback, useEffect, useRef, useMemo, useId } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  AlertCircle,
  RefreshCw,
  Maximize,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
}: PdfPreviewProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [scale, setScale] = useState(0) // 0 = fit width
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pageInputValue, setPageInputValue] = useState('1')
  const [pageLoading, setPageLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const prevBtnRef = useRef<HTMLButtonElement>(null)
  const nextBtnRef = useRef<HTMLButtonElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  const instanceId = useId()
  const pageInputId = `${instanceId}-page-input`
  const pageStatusId = `${instanceId}-page-status`
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
      setPageNumber(1)
      setPageInputValue('1')
      setLoadError(null)
      onPageChange?.(1, pages)
    },
    [onPageChange],
  )

  const onDocumentLoadError = useCallback((error: Error) => {
    setLoadError(error.message || 'Failed to load PDF')
  }, [])

  const onPageLoadSuccess = useCallback(() => {
    setPageLoading(false)
  }, [])

  const goToPage = useCallback(
    (page: number) => {
      const clamped = Math.max(1, Math.min(numPages, page))
      setPageNumber(clamped)
      setPageInputValue(String(clamped))
      setPageLoading(true)
      onPageChange?.(clamped, numPages)
    },
    [numPages, onPageChange],
  )

  const prevPage = useCallback(() => {
    goToPage(pageNumber - 1)
    // Keep focus on nav controls after page change
    prevBtnRef.current?.focus()
  }, [goToPage, pageNumber])

  const nextPage = useCallback(() => {
    goToPage(pageNumber + 1)
    nextBtnRef.current?.focus()
  }, [goToPage, pageNumber])

  const handlePageInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPageInputValue(e.target.value)
    },
    [],
  )

  const handlePageInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        const val = parseInt(pageInputValue, 10)
        if (!isNaN(val)) {
          goToPage(val)
        }
      }
    },
    [pageInputValue, goToPage],
  )

  const handlePageInputBlur = useCallback(() => {
    const val = parseInt(pageInputValue, 10)
    if (!isNaN(val)) {
      goToPage(val)
    } else {
      setPageInputValue(String(pageNumber))
    }
  }, [pageInputValue, goToPage, pageNumber])

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
    setPageNumber(1)
    setPageInputValue('1')
  }, [])

  // Scoped keyboard navigation -- only active when focus is within the viewer
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if focus is on an input element
      const activeEl = document.activeElement
      const isInputFocused =
        activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement
      if (isInputFocused) return

      // Only handle if focus is within our component
      if (!viewer.contains(activeEl)) return

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          goToPage(pageNumber - 1)
          break
        case 'ArrowRight':
          e.preventDefault()
          goToPage(pageNumber + 1)
          break
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
  }, [goToPage, pageNumber, zoomIn, zoomOut])

  // Compute page width for fit-width mode
  const pageWidth = scale === 0 && containerWidth > 0 ? containerWidth - 32 : undefined
  const pageScale = scale === 0 ? undefined : scale
  const displayZoom = scale === 0 ? 'Fit' : `${Math.round(scale * 100)}%`

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
        aria-label="PDF navigation and zoom controls"
      >
        {/* Page navigation group */}
        <div className="flex items-center gap-1" role="group" aria-label="Page navigation">
          <Button
            ref={prevBtnRef}
            variant="ghost"
            size="icon"
            onClick={prevPage}
            disabled={pageNumber <= 1}
            aria-label="Previous page"
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>

          <div className="flex items-center gap-1 text-sm">
            <label htmlFor={pageInputId} className="sr-only">
              Page number
            </label>
            <Input
              id={pageInputId}
              type="number"
              min={1}
              max={numPages || 1}
              value={pageInputValue}
              onChange={handlePageInputChange}
              onKeyDown={handlePageInputKeyDown}
              onBlur={handlePageInputBlur}
              className="h-7 w-14 text-center text-xs"
              aria-label={`Page number, ${pageNumber} of ${numPages}`}
            />
            <span
              id={pageStatusId}
              aria-live="polite"
              aria-atomic="true"
              className="text-muted-foreground whitespace-nowrap"
            >
              of {numPages}
            </span>
          </div>

          <Button
            ref={nextBtnRef}
            variant="ghost"
            size="icon"
            onClick={nextPage}
            disabled={pageNumber >= numPages}
            aria-label="Next page"
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/* Separator (decorative) */}
        <div className="h-6 w-px bg-border mx-1" aria-hidden="true" />

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

      {/* PDF render area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto flex justify-center bg-muted/10 min-h-[400px]"
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
          <div className="p-4 relative">
            {pageLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <Skeleton className="h-[400px] w-full max-w-md" />
              </div>
            )}
            <Page
              pageNumber={pageNumber}
              width={pageWidth}
              scale={pageScale}
              onLoadSuccess={onPageLoadSuccess}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="shadow-lg motion-reduce:transition-none"
            />
          </div>
        </Document>
      </div>

      {/* Screen reader only: page change announcement */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        Page {pageNumber} of {numPages}
      </div>
    </div>
  )
}
