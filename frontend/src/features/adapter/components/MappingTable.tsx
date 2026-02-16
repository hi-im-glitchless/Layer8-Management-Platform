import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { AlertCircle, ArrowUpDown, Trash2, Plus, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { GwFieldAutocomplete } from './GwFieldAutocomplete'
import type { MappingPlan, MappingEntry } from '../types'

interface MappingTableProps {
  mappingPlan: MappingPlan
  /** Enable inline editing for all rows */
  isEditable?: boolean
  /** Called when mapping plan changes via inline edit, delete, or added entry */
  onMappingPlanChange?: (updatedPlan: MappingPlan) => void
  /** Called when a row is clicked (for bidirectional table-PDF sync) */
  onRowClick?: (entry: MappingEntry, entryIdx: number) => void
  /** Array index of the currently highlighted row (for bidirectional sync) */
  highlightedIdx?: number | null
  /** Index of a newly added row that should start in edit mode */
  newRowIndex?: number | null
  /** Called after the new row has been initialized in edit mode */
  onNewRowHandled?: () => void
}

type SortDirection = 'asc' | 'desc' | null

/** Inline edit state for a row — keyed by array index, not sectionIndex */
interface EditState {
  entryIdx: number
  gwField: string
  markerType: string
}

/** Entry augmented with its original array position */
interface TaggedEntry extends MappingEntry {
  _idx: number
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-success'
  if (confidence >= 0.5) return 'text-warning'
  return 'text-destructive'
}

function confidenceBg(confidence: number): string {
  if (confidence >= 0.8) return 'bg-success/15 text-success'
  if (confidence >= 0.5) return 'bg-warning/15 text-warning'
  return 'bg-destructive/15 text-destructive'
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

export function MappingTable({
  mappingPlan,
  isEditable = false,
  onMappingPlanChange,
  onRowClick,
  highlightedIdx,
  newRowIndex,
  onNewRowHandled,
}: MappingTableProps) {
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const tableEndRef = useRef<HTMLDivElement>(null)

  // Tag each entry with its original array index, then sort
  const sortedEntries = useMemo(() => {
    const tagged: TaggedEntry[] = mappingPlan.entries.map((e, i) => ({ ...e, _idx: i }))
    if (sortDirection === 'asc') {
      tagged.sort((a, b) => a.confidence - b.confidence)
    } else if (sortDirection === 'desc') {
      tagged.sort((a, b) => b.confidence - a.confidence)
    }
    return tagged
  }, [mappingPlan.entries, sortDirection])

  const toggleSort = () => {
    setSortDirection((prev) => {
      if (prev === null) return 'desc'
      if (prev === 'desc') return 'asc'
      return null
    })
  }

  // Auto-enter edit mode for newly added rows from PDF selection
  useEffect(() => {
    if (newRowIndex == null) return
    const entryIdx = mappingPlan.entries.findIndex((e) => e.sectionIndex === newRowIndex)
    if (entryIdx >= 0) {
      const entry = mappingPlan.entries[entryIdx]
      setEditState({
        entryIdx,
        gwField: entry.gwField,
        markerType: entry.markerType,
      })
      // Scroll the new row into view
      tableEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    onNewRowHandled?.()
  }, [newRowIndex, mappingPlan.entries, onNewRowHandled])

  // Start inline edit for a specific row by its array index
  const handleStartEdit = useCallback((entry: MappingEntry, entryIdx: number) => {
    setEditState({
      entryIdx,
      gwField: entry.gwField,
      markerType: entry.markerType,
    })
  }, [])

  // Confirm inline edit via GwFieldAutocomplete selection
  const handleAutocompleteChange = useCallback(
    (gwField: string, markerType: string, _jinja2: string) => {
      if (!editState || !onMappingPlanChange) return

      const updatedEntries = mappingPlan.entries.map((entry, i) => {
        if (i === editState.entryIdx) {
          return { ...entry, gwField, markerType }
        }
        return entry
      })

      onMappingPlanChange({
        ...mappingPlan,
        entries: updatedEntries,
      })

      setEditState(null)
    },
    [editState, mappingPlan, onMappingPlanChange],
  )

  // Handle raw input (arbitrary Jinja2 expression)
  const handleRawInput = useCallback(
    (raw: string) => {
      if (!editState || !onMappingPlanChange) return

      const updatedEntries = mappingPlan.entries.map((entry, i) => {
        if (i === editState.entryIdx) {
          return { ...entry, gwField: raw }
        }
        return entry
      })

      onMappingPlanChange({
        ...mappingPlan,
        entries: updatedEntries,
      })

      setEditState(null)
    },
    [editState, mappingPlan, onMappingPlanChange],
  )

  // Cancel inline edit
  const handleCancelEdit = useCallback(() => {
    setEditState(null)
  }, [])

  // Delete a row by its array index
  const handleDeleteRow = useCallback(
    (entryIdx: number) => {
      if (!onMappingPlanChange) return
      const updatedEntries = mappingPlan.entries.filter((_, i) => i !== entryIdx)
      onMappingPlanChange({
        ...mappingPlan,
        entries: updatedEntries,
      })
    },
    [mappingPlan, onMappingPlanChange],
  )

  // Add a blank row
  const handleAddBlankRow = useCallback(() => {
    if (!onMappingPlanChange) return
    // Determine a new sectionIndex (max + 1)
    const maxIndex = mappingPlan.entries.reduce(
      (max, e) => Math.max(max, e.sectionIndex),
      -1,
    )
    const newIndex = maxIndex + 1
    const newEntry: MappingEntry = {
      sectionIndex: newIndex,
      sectionText: '',
      gwField: '',
      placeholderTemplate: '',
      confidence: 0,
      markerType: 'text',
      rationale: 'Manually added',
    }

    const newEntries = [...mappingPlan.entries, newEntry]
    onMappingPlanChange({
      ...mappingPlan,
      entries: newEntries,
    })

    // Auto-enter edit mode for the new (last) entry
    setEditState({
      entryIdx: newEntries.length - 1,
      gwField: '',
      markerType: 'text',
    })

    // Scroll to the new row
    setTimeout(() => {
      tableEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }, [mappingPlan, onMappingPlanChange])

  return (
    <div className="space-y-3">
      {/* Warnings */}
      {mappingPlan.warnings.length > 0 && (
        <div className="space-y-2">
          {mappingPlan.warnings.map((warning, index) => (
            <div
              key={index}
              className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs"
              role="alert"
            >
              <AlertCircle className="h-3.5 w-3.5 text-warning mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span className="text-warning">{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{mappingPlan.entries.length} mapping{mappingPlan.entries.length !== 1 ? 's' : ''}</span>
        <span className="text-muted-foreground/30">|</span>
        <span>{mappingPlan.templateType}</span>
        <span className="text-muted-foreground/30">|</span>
        <span>{mappingPlan.language === 'pt-pt' ? 'PT-PT' : 'EN'}</span>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead className="min-w-[120px]">Document Text</TableHead>
            <TableHead className="min-w-[120px]">GW Field</TableHead>
            <TableHead className="w-20">
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 font-medium text-muted-foreground hover:text-foreground text-xs"
                onClick={toggleSort}
              >
                Conf.
                <ArrowUpDown className="h-3 w-3 ml-0.5" aria-hidden="true" />
              </Button>
            </TableHead>
            <TableHead className="w-24">Marker</TableHead>
            {isEditable && <TableHead className="w-10">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedEntries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={isEditable ? 6 : 5} className="text-center text-muted-foreground py-6 text-xs">
                No mappings found. Highlight text on the PDF to add entries.
              </TableCell>
            </TableRow>
          ) : (
            sortedEntries.map((entry: TaggedEntry) => {
              const isEditing = editState?.entryIdx === entry._idx
              const isHighlighted = highlightedIdx === entry._idx
              return (
                <TableRow
                  key={`entry-${entry._idx}`}
                  tabIndex={0}
                  className={cn(
                    'cursor-pointer transition-all duration-300',
                    isHighlighted && 'ring-2 ring-primary/60 bg-primary/5 animate-pulse',
                    !isHighlighted && entry.source === 'kb' && 'bg-muted/20 opacity-75',
                    !isHighlighted && entry.source !== 'kb' && 'hover:bg-muted/50',
                  )}
                  onClick={() => {
                    if (!isEditing) onRowClick?.(entry, entry._idx)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isEditing) {
                      onRowClick?.(entry, entry._idx)
                    }
                  }}
                  onDoubleClick={() => {
                    if (isEditable && !isEditing) handleStartEdit(entry, entry._idx)
                  }}
                >
                  <TableCell className="font-mono text-[10px] text-muted-foreground">
                    {entry.sectionIndex}
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs cursor-help">
                          {truncateText(entry.sectionText, 40)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-md">
                        <p className="text-xs">{entry.sectionText}</p>
                        {entry.rationale && (
                          <p className="text-xs text-muted-foreground mt-1 italic">
                            {entry.rationale}
                          </p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {isEditable && isEditing ? (
                      <GwFieldAutocomplete
                        value={editState.gwField}
                        onChange={handleAutocompleteChange}
                        onRawInput={handleRawInput}
                        autoFocus
                      />
                    ) : isEditable ? (
                      <button
                        type="button"
                        className="group/edit inline-flex items-center gap-1 text-xs border border-dashed border-muted-foreground/30 bg-muted/50 px-1.5 py-0.5 rounded hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer font-mono"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleStartEdit(entry, entry._idx)
                        }}
                      >
                        <span className="truncate max-w-[140px]">{entry.gwField || 'Click to set...'}</span>
                        <Pencil className="h-2.5 w-2.5 text-muted-foreground/50 group-hover/edit:text-primary shrink-0" aria-hidden="true" />
                      </button>
                    ) : (
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {entry.gwField}
                      </code>
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'text-xs font-medium tabular-nums',
                        confidenceColor(entry.confidence),
                      )}
                    >
                      {(entry.confidence * 100).toFixed(0)}%
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-[9px] uppercase tracking-wider',
                          confidenceBg(entry.confidence),
                        )}
                      >
                        {entry.markerType}
                      </Badge>
                      {entry.source === 'kb' && (
                        <Badge
                          variant="outline"
                          className="text-[8px] uppercase tracking-wider border-border text-muted-foreground px-1 py-0"
                        >
                          KB
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  {isEditable && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteRow(entry._idx)}
                            aria-label="Remove mapping"
                          >
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Remove mapping (original text restored on regeneration)
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>

      {/* Escape hint when editing */}
      {editState && (
        <p className="text-[10px] text-muted-foreground text-center">
          Select from dropdown or press Enter for raw input. Escape to cancel.
        </p>
      )}

      {/* Add Row button */}
      {isEditable && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={handleAddBlankRow}
        >
          <Plus className="h-3 w-3 mr-1" aria-hidden="true" />
          Add Row
        </Button>
      )}

      {/* Scroll anchor for auto-scroll-to-end */}
      <div ref={tableEndRef} />

      {/* Escape handler for active edit */}
      {editState && (
        <div
          className="hidden"
          onKeyDown={(e) => {
            if (e.key === 'Escape') handleCancelEdit()
          }}
        />
      )}
    </div>
  )
}
