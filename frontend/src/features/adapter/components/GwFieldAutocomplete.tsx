import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// GW Field Data (mirrors Python FIELD_MARKER_MAP from adapter.py)
// ---------------------------------------------------------------------------

export interface GwFieldOption {
  gwField: string
  markerType: string
  description: string
  jinja2Template: string
}

/**
 * Generate the correct Jinja2 template syntax for a given field and marker type.
 */
function buildJinja2Template(gwField: string, markerType: string): string {
  switch (markerType) {
    case 'paragraph_rt':
      return `{{p ${gwField} }}`
    case 'run_rt':
      return `{{r ${gwField} }}`
    case 'table_row_loop':
      return `{%tr for item in ${gwField} %}`
    case 'control_flow':
      return `{% if ${gwField} %}`
    default: // 'text'
      return `{{ ${gwField} }}`
  }
}

/**
 * Derive a human-readable description from a GW field name.
 */
function deriveDescription(gwField: string): string {
  return gwField
    .replace(/\[.*?\]/g, '')
    .replace(/[._]/g, ' ')
    .replace(/\brt\b/, '(rich text)')
    .trim()
}

/**
 * GW field options derived from the backend FIELD_MARKER_MAP constant.
 * Each entry carries the gwField, markerType, description, and auto-generated Jinja2 template.
 */
export const GW_FIELD_OPTIONS: GwFieldOption[] = [
  // Simple text fields
  { gwField: 'client.short_name', markerType: 'text' },
  { gwField: 'project.start_date', markerType: 'text' },
  { gwField: 'project.end_date', markerType: 'text' },
  { gwField: 'report_date', markerType: 'text' },
  { gwField: 'team[0].name', markerType: 'text' },
  { gwField: 'team[0].email', markerType: 'text' },
  { gwField: 'finding.title', markerType: 'text' },
  { gwField: "finding['title']", markerType: 'text' },
  { gwField: 'totals.findings', markerType: 'text' },
  { gwField: 'item.scope', markerType: 'text' },
  { gwField: 'finding.classification_rt', markerType: 'text' },
  { gwField: 'finding.affected_entities_rt', markerType: 'text' },
  { gwField: 'finding.cvss_vector_link_rt', markerType: 'text' },
  // Rich text paragraph fields
  { gwField: 'finding.description_rt', markerType: 'paragraph_rt' },
  { gwField: 'finding.impact_rt', markerType: 'paragraph_rt' },
  { gwField: 'finding.recommendation_rt', markerType: 'paragraph_rt' },
  { gwField: 'finding.replication_steps_rt', markerType: 'paragraph_rt' },
  // Rich text run fields
  { gwField: 'finding.severity_rt', markerType: 'run_rt' },
  // Loop counter expressions
  { gwField: "'%02d' % loop.index", markerType: 'text' },
  { gwField: '"%02d"|format(ns.counter + 1)', markerType: 'text' },
  { gwField: '"%02d"|format(ns1.counter)', markerType: 'text' },
  // Namespace operations
  { gwField: 'ns.counter', markerType: 'text' },
  { gwField: 'ns1.counter', markerType: 'text' },
].map((entry) => ({
  ...entry,
  description: deriveDescription(entry.gwField),
  jinja2Template: buildJinja2Template(entry.gwField, entry.markerType),
}))

// ---------------------------------------------------------------------------
// Fuzzy Match
// ---------------------------------------------------------------------------

/**
 * Simple fuzzy match: check if all characters of the query appear in order in the target.
 * Returns true if query is a subsequence of target (case-insensitive).
 */
function fuzzyMatch(target: string, query: string): boolean {
  const lower = target.toLowerCase()
  const q = query.toLowerCase()
  let ti = 0
  for (let qi = 0; qi < q.length; qi++) {
    const idx = lower.indexOf(q[qi], ti)
    if (idx === -1) return false
    ti = idx + 1
  }
  return true
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface GwFieldAutocompleteProps {
  value: string
  onChange: (gwField: string, markerType: string, jinja2: string) => void
  onRawInput?: (raw: string) => void
  placeholder?: string
  autoFocus?: boolean
}

/**
 * Autocomplete/typeahead for GW field selection.
 * Filters known fields by fuzzy match, auto-generates Jinja2 syntax on selection.
 * Raw input (Enter with no dropdown match) falls through to onRawInput.
 */
export function GwFieldAutocomplete({
  value,
  onChange,
  onRawInput,
  placeholder = 'Search GW fields...',
  autoFocus = false,
}: GwFieldAutocompleteProps) {
  const [inputText, setInputText] = useState(value)
  const [isOpen, setIsOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Sync external value changes
  useEffect(() => {
    setInputText(value)
  }, [value])

  const filtered = useMemo(() => {
    if (!inputText.trim()) return GW_FIELD_OPTIONS
    return GW_FIELD_OPTIONS.filter(
      (opt) =>
        fuzzyMatch(opt.gwField, inputText) ||
        fuzzyMatch(opt.description, inputText),
    )
  }, [inputText])

  // Clamp highlight index when filtered list shrinks
  useEffect(() => {
    if (highlightIndex >= filtered.length) {
      setHighlightIndex(Math.max(0, filtered.length - 1))
    }
  }, [filtered.length, highlightIndex])

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return
    const item = listRef.current.children[highlightIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex])

  const handleSelect = useCallback(
    (option: GwFieldOption) => {
      setInputText(option.gwField)
      setIsOpen(false)
      onChange(option.gwField, option.markerType, option.jinja2Template)
    },
    [onChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen && e.key !== 'Escape') {
        // Open on any typing
        if (e.key.length === 1 || e.key === 'ArrowDown') {
          setIsOpen(true)
        }
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (isOpen && filtered.length > 0) {
            handleSelect(filtered[highlightIndex])
          } else if (inputText.trim() && onRawInput) {
            onRawInput(inputText.trim())
            setIsOpen(false)
          }
          break
        case 'Escape':
          e.preventDefault()
          setIsOpen(false)
          break
        case 'Tab':
          setIsOpen(false)
          break
      }
    },
    [isOpen, filtered, highlightIndex, handleSelect, inputText, onRawInput],
  )

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value)
    setHighlightIndex(0)
    if (!isOpen) setIsOpen(true)
  }, [isOpen])

  const handleFocus = useCallback(() => {
    setIsOpen(true)
  }, [])

  return (
    <Popover open={isOpen && filtered.length > 0} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Input
          ref={inputRef}
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="h-7 text-xs w-full"
          autoComplete="off"
        />
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 max-h-60 overflow-hidden"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div ref={listRef} className="overflow-y-auto max-h-60" role="listbox">
          {filtered.map((option, index) => (
            <button
              key={option.gwField}
              type="button"
              role="option"
              aria-selected={index === highlightIndex}
              className={cn(
                'w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between gap-2',
                'hover:bg-accent',
                index === highlightIndex && 'bg-accent',
              )}
              onMouseDown={(e) => {
                e.preventDefault() // prevent input blur
                handleSelect(option)
              }}
              onMouseEnter={() => setHighlightIndex(index)}
            >
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-xs truncate">{option.gwField}</span>
                <span className="text-[10px] text-muted-foreground truncate">
                  {option.jinja2Template}
                </span>
              </div>
              <Badge
                variant="secondary"
                className="text-[9px] px-1 py-0 shrink-0 uppercase tracking-wider"
              >
                {option.markerType}
              </Badge>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
