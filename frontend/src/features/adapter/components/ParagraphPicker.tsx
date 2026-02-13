import { useState, useMemo } from 'react'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { UnmappedParagraph } from '../types'

interface ParagraphPickerProps {
  unmappedParagraphs: UnmappedParagraph[]
  onAddEntry: (paragraphIndex: number, gwField: string, markerType: string) => void
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

export function ParagraphPicker({ unmappedParagraphs, onAddEntry }: ParagraphPickerProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedParagraph, setSelectedParagraph] = useState<UnmappedParagraph | null>(null)
  const [gwField, setGwField] = useState('')
  const [markerType, setMarkerType] = useState('text')

  const filteredParagraphs = useMemo(() => {
    if (!searchQuery.trim()) return unmappedParagraphs
    const query = searchQuery.toLowerCase()
    return unmappedParagraphs.filter((p) =>
      p.text.toLowerCase().includes(query)
    )
  }, [unmappedParagraphs, searchQuery])

  const handleSelectParagraph = (paragraph: UnmappedParagraph) => {
    setSelectedParagraph(paragraph)
  }

  const handleConfirm = () => {
    if (!selectedParagraph || !gwField.trim()) return
    onAddEntry(selectedParagraph.paragraphIndex, gwField.trim(), markerType)
    // Reset state
    setSelectedParagraph(null)
    setGwField('')
    setMarkerType('text')
    setSearchQuery('')
    setOpen(false)
  }

  const handleCancel = () => {
    setSelectedParagraph(null)
    setGwField('')
    setMarkerType('text')
    setSearchQuery('')
  }

  if (unmappedParagraphs.length === 0) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="mt-3">
          <Plus className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
          Add Missing Section
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0">
        {!selectedParagraph ? (
          /* Step 1: Search and select a paragraph */
          <div className="flex flex-col">
            <div className="p-3 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <Input
                  placeholder="Search paragraphs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {filteredParagraphs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  No unmapped paragraphs found.
                </p>
              ) : (
                filteredParagraphs.map((paragraph) => (
                  <button
                    key={paragraph.paragraphIndex}
                    type="button"
                    className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors border-b last:border-b-0"
                    onClick={() => handleSelectParagraph(paragraph)}
                  >
                    <span className="font-mono text-muted-foreground mr-2">
                      #{paragraph.paragraphIndex}
                    </span>
                    {paragraph.headingLevel !== null && (
                      <span className="text-[10px] text-muted-foreground mr-1.5">
                        H{paragraph.headingLevel}
                      </span>
                    )}
                    <span>{truncateText(paragraph.text, 80)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          /* Step 2: Enter GW field and marker type */
          <div className="p-3 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Selected paragraph:</p>
              <p className="text-xs bg-muted rounded px-2 py-1.5">
                <span className="font-mono text-muted-foreground mr-1">
                  #{selectedParagraph.paragraphIndex}
                </span>
                {truncateText(selectedParagraph.text, 60)}
              </p>
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block">GW Field</label>
              <Input
                value={gwField}
                onChange={(e) => setGwField(e.target.value)}
                placeholder="e.g. executive_summary"
                className="h-8 text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && gwField.trim()) {
                    handleConfirm()
                  }
                }}
              />
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block">Marker Type</label>
              <Select value={markerType} onValueChange={setMarkerType}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">text</SelectItem>
                  <SelectItem value="paragraph_rt">paragraph_rt</SelectItem>
                  <SelectItem value="run_rt">run_rt</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={handleCancel}
              >
                Back
              </Button>
              <Button
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={handleConfirm}
                disabled={!gwField.trim()}
              >
                Add
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
