import { useState, useCallback } from 'react'
import { Plus, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface DenyListEditorProps {
  /** Current deny list terms */
  terms: string[]
  /** Called when user adds a term */
  onAdd: (term: string) => void
  /** Called when user removes a term */
  onRemove: (term: string) => void
  /** Loading state during re-sanitization */
  isLoading?: boolean
  disabled?: boolean
}

export function DenyListEditor({
  terms,
  onAdd,
  onRemove,
  isLoading = false,
  disabled = false,
}: DenyListEditorProps) {
  const [inputValue, setInputValue] = useState('')

  const handleAdd = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    if (terms.includes(trimmed)) return
    onAdd(trimmed)
    setInputValue('')
  }, [inputValue, terms, onAdd])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleAdd()
      }
    },
    [handleAdd],
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Deny List</h3>
        {isLoading && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            Re-sanitizing...
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Add custom sensitive terms that Presidio cannot auto-detect (project codenames, client names, tool names).
        Terms are applied immediately and trigger re-sanitization.
      </p>

      {/* Input + Add button */}
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter sensitive term..."
          disabled={disabled || isLoading}
          className="text-sm"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={disabled || isLoading || !inputValue.trim()}
        >
          <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
          Add
        </Button>
      </div>

      {/* Term chips */}
      {terms.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {terms.map((term) => (
            <Badge
              key={term}
              variant="secondary"
              className="text-sm py-1 px-2 gap-1"
            >
              {term}
              <button
                type="button"
                onClick={() => onRemove(term)}
                disabled={disabled || isLoading}
                className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5 transition-colors"
                aria-label={`Remove "${term}"`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {terms.length === 0 && (
        <p className="text-xs text-muted-foreground/70 italic">
          No deny list terms added. Sanitization uses only automatic NER detection.
        </p>
      )}
    </div>
  )
}
