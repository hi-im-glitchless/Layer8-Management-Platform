import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { PanelRightOpen, PanelRightClose, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useDocumentStructure } from '../hooks'
import type { ParagraphInfo } from '../types'

interface StructureBrowserProps {
  sessionId: string
  isOpen: boolean
  onToggle: () => void
  onSelectParagraph: (paragraphIndex: number, text: string) => void
}

function getParagraphLabel(paragraph: ParagraphInfo): {
  text: string
  isMuted: boolean
} {
  if (paragraph.isEmpty) {
    if (paragraph.text.length === 0) {
      return {
        text: paragraph.styleName
          ? `[Empty paragraph] (${paragraph.styleName})`
          : '[Empty paragraph]',
        isMuted: true,
      }
    }
    return {
      text: paragraph.styleName
        ? `[Whitespace] (${paragraph.styleName})`
        : '[Whitespace]',
      isMuted: true,
    }
  }
  return { text: paragraph.text, isMuted: false }
}

export function StructureBrowser({
  sessionId,
  isOpen,
  onToggle,
  onSelectParagraph,
}: StructureBrowserProps) {
  const { data, isLoading, isError } = useDocumentStructure(sessionId)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Keyboard: Escape closes sidebar
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onToggle()
      }
    },
    [isOpen, onToggle],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Focus search input when sidebar opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      // Small delay to let the animation start
      const timer = setTimeout(() => searchInputRef.current?.focus(), 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  const filteredParagraphs = useMemo(() => {
    if (!data?.paragraphs) return []
    if (!searchQuery.trim()) return data.paragraphs

    const query = searchQuery.toLowerCase()
    return data.paragraphs.filter((p) => {
      const label = getParagraphLabel(p)
      return (
        label.text.toLowerCase().includes(query) ||
        String(p.paragraphIndex).includes(query) ||
        (p.styleName && p.styleName.toLowerCase().includes(query))
      )
    })
  }, [data?.paragraphs, searchQuery])

  return (
    <>
      {/* Toggle button -- always visible in toolbar area */}
      <Button
        variant="outline"
        size="sm"
        onClick={onToggle}
        className="gap-1.5"
        title={isOpen ? 'Close structure browser' : 'Open structure browser'}
      >
        {isOpen ? (
          <PanelRightClose className="h-4 w-4" aria-hidden="true" />
        ) : (
          <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
        )}
        <span className="hidden sm:inline text-xs">Structure</span>
      </Button>

      {/* Sidebar overlay */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-background border-l shadow-lg z-40 flex flex-col transition-transform duration-200 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="complementary"
        aria-label="Document structure browser"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">Document Structure</h3>
            {data && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {data.totalCount}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="h-7 w-7 p-0"
            aria-label="Close structure browser"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={searchInputRef}
              placeholder="Search paragraphs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {data && searchQuery && (
            <p className="text-[10px] text-muted-foreground mt-1.5">
              {filteredParagraphs.length} of {data.totalCount} paragraphs
              {data.emptyCount > 0 && ` (${data.emptyCount} empty)`}
            </p>
          )}
        </div>

        {/* Paragraph list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="p-3 space-y-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-4 w-8 shrink-0" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          )}

          {isError && (
            <div className="p-6 text-center">
              <p className="text-xs text-destructive">
                Failed to load document structure.
              </p>
            </div>
          )}

          {data && filteredParagraphs.length === 0 && (
            <div className="p-6 text-center">
              <p className="text-xs text-muted-foreground">
                {searchQuery ? 'No paragraphs match your search.' : 'No paragraphs found.'}
              </p>
            </div>
          )}

          {data &&
            filteredParagraphs.map((paragraph) => {
              const label = getParagraphLabel(paragraph)
              return (
                <button
                  key={paragraph.paragraphIndex}
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors border-b last:border-b-0 flex items-start gap-2"
                  onClick={() =>
                    onSelectParagraph(paragraph.paragraphIndex, paragraph.text)
                  }
                >
                  {/* Index badge */}
                  <span className="font-mono text-[10px] text-muted-foreground bg-muted rounded px-1 py-0.5 shrink-0 min-w-[2rem] text-center">
                    #{paragraph.paragraphIndex}
                  </span>

                  {/* Content area */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {/* Heading level indicator */}
                      {paragraph.headingLevel !== null && (
                        <span className="text-[10px] font-semibold text-info shrink-0">
                          H{paragraph.headingLevel}
                        </span>
                      )}

                      {/* Paragraph text */}
                      <span
                        className={`truncate ${
                          label.isMuted
                            ? 'italic text-muted-foreground'
                            : ''
                        }`}
                      >
                        {label.text}
                      </span>
                    </div>

                    {/* Style name for non-empty paragraphs */}
                    {!paragraph.isEmpty && paragraph.styleName && (
                      <span className="text-[10px] text-muted-foreground block mt-0.5">
                        {paragraph.styleName}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
        </div>

        {/* Footer summary */}
        {data && (
          <div className="px-3 py-2 border-t text-[10px] text-muted-foreground shrink-0">
            {data.totalCount} paragraphs total, {data.emptyCount} empty
          </div>
        )}
      </div>
    </>
  )
}
