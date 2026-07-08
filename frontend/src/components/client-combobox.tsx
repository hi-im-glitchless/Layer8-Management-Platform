import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { sortClientsByName } from '@/lib/sort'

/**
 * Generic client option. Kept intentionally loose ({ id, name, color? }) so
 * both call sites work:
 *  - schedule (AssignmentModal): full Client rows, `color` present -> swatch shown
 *  - board (BoardFilters): derived { id, name } subset, no `color` -> no swatch
 * Do NOT tie this to the schedule `Client` type.
 */
export interface ClientComboboxOption {
  id: string
  name: string
  color?: string
}

interface ClientComboboxProps {
  clients: ClientComboboxOption[]
  value: string | null
  /** Called with the client id, or null when the pinned sentinel is chosen. */
  onChange: (id: string | null) => void
  /** Pinned, always-visible top option (e.g. "No client" / "All clients"). */
  sentinelLabel: string
  /** Search input placeholder. */
  placeholder?: string
  /** Extra classes for the trigger Button (preserve each site's footprint). */
  triggerClassName?: string
  disabled?: boolean
}

/**
 * Reusable searchable client combobox (Popover + Input + hand-rolled button
 * list — deliberately no cmdk dependency). Extracted from AssignmentModal's
 * ClientSelect so the schedule pickers and the board filter share one behavior.
 *
 * Behavior:
 *  - client list is sorted with sortClientsByName BEFORE filtering (pt-PT,
 *    case- & accent-insensitive)
 *  - case-insensitive substring search on name; clearing restores full list
 *  - the sentinel renders as a static pinned button ABOVE the list; it is never
 *    sorted among clients and never filtered away by search text
 *  - "No clients found" empty state when the filtered client list is empty
 *  - color swatch rendered only when the option has a `color`
 *  - search resets on selection and on close
 */
export function ClientCombobox({
  clients,
  value,
  onChange,
  sentinelLabel,
  placeholder = 'Search clients...',
  triggerClassName,
  disabled = false,
}: ClientComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = clients.find((c) => c.id === value)

  // Sort first, then filter — so the visible order is always alphabetical and
  // the search operates over the sorted list.
  const sorted = sortClientsByName(clients)
  const filtered = search
    ? sorted.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : sorted

  const handleOpenChange = (o: boolean) => {
    setOpen(o)
    if (o) {
      setTimeout(() => inputRef.current?.focus(), 0)
    } else {
      setSearch('')
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn('w-full justify-start font-normal', triggerClassName)}
        >
          {selected ? (
            <span className="flex items-center gap-2">
              {selected.color && (
                <span
                  className="w-3 h-3 rounded-sm shrink-0 inline-block"
                  style={{ backgroundColor: selected.color }}
                />
              )}
              {selected.name}
            </span>
          ) : (
            <span className="text-muted-foreground">{sentinelLabel}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="p-2 border-b">
          <Input
            ref={inputRef}
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
            autoFocus
          />
        </div>
        <div
          className="max-h-48 overflow-y-auto overscroll-contain p-1"
          onWheel={(e) => e.stopPropagation()}
        >
          {/* Pinned sentinel — always visible, never sorted or filtered. */}
          <button
            type="button"
            className={`w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent ${!value ? 'bg-accent' : ''}`}
            onClick={() => {
              onChange(null)
              setOpen(false)
              setSearch('')
            }}
          >
            {sentinelLabel}
          </button>
          {filtered.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent flex items-center gap-2 ${value === c.id ? 'bg-accent' : ''}`}
              onClick={() => {
                onChange(c.id)
                setOpen(false)
                setSearch('')
              }}
            >
              {c.color && (
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: c.color }}
                />
              )}
              {c.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">No clients found</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
