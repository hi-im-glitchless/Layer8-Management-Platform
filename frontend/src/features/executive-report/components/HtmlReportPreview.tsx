import { useRef, useEffect, useCallback } from 'react'
import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TextSelectionData {
  text: string
  range: { start: number; end: number }
  position: { x: number; y: number }
}

interface HtmlReportPreviewProps {
  html: string
  className?: string
  onTextSelection?: (selection: TextSelectionData) => void
}

/**
 * Sandboxed iframe-based HTML report preview.
 * Uses srcdoc for CSS isolation from the app UI.
 * sandbox="allow-scripts" enables Chart.js execution.
 * Injects a postMessage script for text selection communication.
 */
export function HtmlReportPreview({
  html,
  className,
  onTextSelection,
}: HtmlReportPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Build srcdoc with injected selection script
  const srcdoc = buildSrcdoc(html, !!onTextSelection)

  // Listen for postMessage from iframe
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (!onTextSelection) return
      if (!iframeRef.current) return

      // Validate the message comes from our iframe
      if (event.source !== iframeRef.current.contentWindow) return

      const data = event.data
      if (data?.type !== 'text-selection') return

      const text = typeof data.text === 'string' ? data.text.trim() : ''
      if (!text || text.length === 0 || text.length > 200) return

      // Translate iframe-relative coordinates to page coordinates
      const iframeRect = iframeRef.current.getBoundingClientRect()
      const x = iframeRect.left + (data.x ?? 0)
      const y = iframeRect.top + (data.y ?? 0)

      onTextSelection({
        text,
        range: { start: data.start ?? 0, end: data.end ?? 0 },
        position: { x, y },
      })
    },
    [onTextSelection],
  )

  useEffect(() => {
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [handleMessage])

  // Auto-resize iframe to content height
  const handleLoad = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe?.contentDocument?.body) return

    const resizeObserver = new ResizeObserver(() => {
      const contentHeight = iframe.contentDocument?.documentElement?.scrollHeight
      if (contentHeight && contentHeight > 0) {
        iframe.style.height = `${Math.max(contentHeight + 32, 600)}px`
      }
    })

    resizeObserver.observe(iframe.contentDocument.body)

    // Initial sizing
    const initialHeight = iframe.contentDocument.documentElement.scrollHeight
    if (initialHeight > 0) {
      iframe.style.height = `${Math.max(initialHeight + 32, 600)}px`
    }

    return () => resizeObserver.disconnect()
  }, [])

  if (!html) {
    return (
      <div
        className={cn(
          'w-full border rounded-lg flex flex-col items-center justify-center text-muted-foreground',
          'min-h-[600px] bg-muted/10',
          className,
        )}
      >
        <FileText className="h-12 w-12 mb-3 opacity-40" aria-hidden="true" />
        <p className="text-sm">No HTML content to preview.</p>
        <p className="text-xs mt-1 text-muted-foreground/70">
          Upload a DOCX report to see the sanitized HTML preview.
        </p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={cn('w-full', className)}>
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        sandbox="allow-scripts"
        title="Report HTML Preview"
        className="w-full border rounded-lg bg-white"
        style={{ minHeight: 600, height: 600 }}
        onLoad={handleLoad}
      />
    </div>
  )
}

/**
 * Build the srcdoc HTML string with optional selection script injection.
 * If the source HTML already has a <head>, the script is injected there.
 * Otherwise, wraps content in a basic HTML document.
 */
function buildSrcdoc(html: string, enableSelection: boolean): string {
  const selectionScript = enableSelection
    ? `<script>
document.addEventListener('mouseup', function(e) {
  var sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return;
  var text = sel.toString().trim();
  if (!text) return;
  var range = sel.getRangeAt(0);
  var rect = range.getBoundingClientRect();
  parent.postMessage({
    type: 'text-selection',
    text: text,
    x: rect.left + rect.width / 2,
    y: rect.bottom + 4,
    start: 0,
    end: text.length
  }, '*');
});
</script>`
    : ''

  // If html already contains a </head>, inject script before it
  if (html.includes('</head>')) {
    return html.replace('</head>', `${selectionScript}</head>`)
  }

  // If html already contains <html, inject script in a head block
  if (html.includes('<html')) {
    return html.replace(/<html([^>]*)>/, `<html$1><head>${selectionScript}</head>`)
  }

  // Wrap bare HTML in a document
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; line-height: 1.6; color: #1a1a1a; }
    [data-entity] { background: #fef3c7; border-radius: 2px; padding: 0 2px; }
  </style>
  ${selectionScript}
</head>
<body>${html}</body>
</html>`
}
