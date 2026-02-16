import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { MapPin, X, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { PlaceholderInfo } from '../types'

interface PlaceholderNavigatorProps {
  placeholders: PlaceholderInfo[]
  isOpen: boolean
  onToggle: () => void
  onJumpToPlaceholder: (paragraphIndex: number) => void
}

/**
 * Extract the field name from a placeholder expression.
 * e.g. "{{ client.short_name }}" -> "client.short_name"
 */
function extractFieldName(placeholderText: string): string {
  const match = placeholderText.match(/\{\{[\s-]*(.+?)[\s-]*\}\}/)
  return match ? match[1].trim() : placeholderText
}

export function PlaceholderNavigator({
  placeholders,
  isOpen,
  onToggle,
  onJumpToPlaceholder,
}: PlaceholderNavigatorProps) {
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
      const timer = setTimeout(() => searchInputRef.current?.focus(), 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  const filteredPlaceholders = useMemo(() => {
    if (!searchQuery.trim()) return placeholders

    const query = searchQuery.toLowerCase()
    return placeholders.filter((p) => {
      const fieldName = extractFieldName(p.placeholderText)
      return (
        fieldName.toLowerCase().includes(query) ||
        p.placeholderText.toLowerCase().includes(query) ||
        p.gwField.toLowerCase().includes(query) ||
        String(p.paragraphIndex).includes(query)
      )
    })
  }, [placeholders, searchQuery])

  return (
    <>
      {/* Toggle button -- always visible in toolbar area */}
      <Button
        variant="outline"
        size="sm"
        onClick={onToggle}
        className="gap-1.5"
        title={isOpen ? 'Close placeholder navigator' : 'Open placeholder navigator'}
      >
        <MapPin className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline text-xs">Placeholders</span>
      </Button>

      {/* Sidebar overlay */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-background border-l shadow-lg z-40 flex flex-col transition-transform duration-200 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="complementary"
        aria-label="Placeholder navigator"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">Placeholders</h3>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {placeholders.length}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="h-7 w-7 p-0"
            aria-label="Close placeholder navigator"
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
              placeholder="Search placeholders..."
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
          {searchQuery && (
            <p className="text-[10px] text-muted-foreground mt-1.5">
              {filteredPlaceholders.length} of {placeholders.length} placeholders
            </p>
          )}
        </div>

        {/* Placeholder list */}
        <div className="flex-1 overflow-y-auto">
          {placeholders.length === 0 && (
            <div className="p-6 text-center">
              <p className="text-xs text-muted-foreground">
                No placeholders found.
              </p>
            </div>
          )}

          {placeholders.length > 0 && filteredPlaceholders.length === 0 && (
            <div className="p-6 text-center">
              <p className="text-xs text-muted-foreground">
                No placeholders match your search.
              </p>
            </div>
          )}

          {filteredPlaceholders.map((placeholder, idx) => {
            const fieldName = extractFieldName(placeholder.placeholderText)
            return (
              <button
                key={`${placeholder.paragraphIndex}-${idx}`}
                type="button"
                className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors border-b last:border-b-0 flex items-start gap-2"
                onClick={() => onJumpToPlaceholder(placeholder.paragraphIndex)}
              >
                {/* Index badge */}
                <span className="font-mono text-[10px] text-muted-foreground bg-muted rounded px-1 py-0.5 shrink-0 min-w-[2rem] text-center">
                  #{placeholder.paragraphIndex}
                </span>

                {/* Content area */}
                <div className="flex-1 min-w-0">
                  {/* Placeholder expression */}
                  <span className="font-mono text-[11px] text-info block truncate">
                    {placeholder.placeholderText}
                  </span>

                  {/* Field name */}
                  <span className="text-[10px] text-muted-foreground block mt-0.5 truncate">
                    {fieldName}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer summary */}
        <div className="px-3 py-2 border-t text-[10px] text-muted-foreground shrink-0">
          {placeholders.length} placeholder{placeholders.length !== 1 ? 's' : ''} total
        </div>
      </div>
    </>
  )
}
