import { useRef, useEffect, useCallback, useMemo } from 'react'
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

  // Force iframe remount when content changes (browsers don't always re-render srcDoc updates)
  const iframeKey = useMemo(() => {
    let hash = 0
    for (let i = 0; i < Math.min(srcdoc.length, 500); i++) {
      hash = ((hash << 5) - hash + srcdoc.charCodeAt(i)) | 0
    }
    return `preview-${srcdoc.length}-${hash}`
  }, [srcdoc])

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
        key={iframeKey}
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

  // Wrap bare HTML in a document with comprehensive styling for mammoth output
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: 'Segoe UI', Calibri, Arial, sans-serif;
      padding: 32px 40px;
      line-height: 1.7;
      color: #1a1a1a;
      max-width: 900px;
      margin: 0 auto;
      font-size: 14px;
    }

    /* Headings */
    h1 { font-size: 1.8em; font-weight: 700; margin: 1.4em 0 0.6em; color: #111; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.3em; }
    h2 { font-size: 1.45em; font-weight: 600; margin: 1.3em 0 0.5em; color: #1a1a1a; }
    h3 { font-size: 1.2em; font-weight: 600; margin: 1.2em 0 0.4em; color: #333; }
    h4 { font-size: 1.05em; font-weight: 600; margin: 1em 0 0.3em; color: #444; }
    h5, h6 { font-size: 1em; font-weight: 600; margin: 0.8em 0 0.3em; color: #555; }

    /* Title / subtitle from DOCX */
    h1.doc-title { font-size: 2em; text-align: center; border-bottom: none; margin-bottom: 0.2em; }
    h2.doc-subtitle { font-size: 1.3em; text-align: center; color: #666; font-weight: 400; margin-top: 0; }

    /* Paragraphs */
    p { margin: 0.5em 0; }

    /* Tables */
    table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.92em; }
    th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 600; color: #374151; }
    tr:nth-child(even) { background: #f9fafb; }
    tr:hover { background: #f0f1f3; }

    /* Lists */
    ul, ol { margin: 0.5em 0 0.5em 1.5em; padding: 0; }
    li { margin: 0.25em 0; }
    ul > li { list-style-type: disc; }
    ol > li { list-style-type: decimal; }

    /* Blockquotes */
    blockquote { border-left: 4px solid #d1d5db; margin: 1em 0; padding: 0.5em 1em; color: #4b5563; background: #f9fafb; }
    blockquote.intense { border-left-color: #3b82f6; background: #eff6ff; }

    /* Inline styles */
    strong, b { font-weight: 600; }
    em, i { font-style: italic; }

    /* TOC entries */
    .toc-heading { color: #374151; }
    .toc-entry { color: #6b7280; padding-left: 0.5em; }
    .toc-level-2 { padding-left: 1.5em; }
    .toc-level-3 { padding-left: 2.5em; }

    /* Images placeholder text */
    p:has(> img), img { display: none; }

    /* Entity highlights */
    .entity { background: #fef3c7; border-radius: 2px; padding: 0 2px; cursor: default; }
    .entity-person { background: #dbeafe; }
    .entity-ip-address, .entity-ip { background: #fce7f3; }
    .entity-location { background: #d1fae5; }
    .entity-organization, .entity-org { background: #ede9fe; }
    .entity-date-time, .entity-date { background: #fef9c3; }
    .entity-phone-number, .entity-phone { background: #ffedd5; }
    .entity-email-address, .entity-email { background: #cffafe; }
    .entity-url { background: #e0e7ff; }
    [data-entity] { border-radius: 2px; padding: 0 2px; }

    /* Horizontal rules */
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5em 0; }

    /* Code blocks (rare in DOCX but possible) */
    pre, code { font-family: 'Consolas', 'Courier New', monospace; font-size: 0.9em; background: #f3f4f6; border-radius: 3px; }
    pre { padding: 12px 16px; overflow-x: auto; }
    code { padding: 1px 4px; }
  </style>
  ${selectionScript}
</head>
<body>${html}</body>
</html>`
}
