import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { AlertCircle, ArrowUpDown, Trash2, Plus } from 'lucide-react'
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
  onRowClick?: (entry: MappingEntry) => void
  /** Index of the currently highlighted row (for bidirectional sync) */
  highlightedIndex?: number | null
  /** Index of a newly added row that should start in edit mode */
  newRowIndex?: number | null
  /** Called after the new row has been initialized in edit mode */
  onNewRowHandled?: () => void
}

type SortDirection = 'asc' | 'desc' | null

/** Inline edit state for a row */
interface EditState {
  sectionIndex: number
  gwField: string
  markerType: string
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-green-600 dark:text-green-400'
  if (confidence >= 0.5) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function confidenceBg(confidence: number): string {
  if (confidence >= 0.8) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
  if (confidence >= 0.5) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
  return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
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
  highlightedIndex,
  newRowIndex,
  onNewRowHandled,
}: MappingTableProps) {
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const tableEndRef = useRef<HTMLDivElement>(null)

  const sortedEntries = useMemo(() => {
    const entries = [...mappingPlan.entries]
    if (sortDirection === 'asc') {
      entries.sort((a, b) => a.confidence - b.confidence)
    } else if (sortDirection === 'desc') {
      entries.sort((a, b) => b.confidence - a.confidence)
    }
    return entries
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
    const entry = mappingPlan.entries.find((e) => e.sectionIndex === newRowIndex)
    if (entry) {
      setEditState({
        sectionIndex: entry.sectionIndex,
        gwField: entry.gwField,
        markerType: entry.markerType,
      })
      // Scroll the new row into view
      tableEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    onNewRowHandled?.()
  }, [newRowIndex, mappingPlan.entries, onNewRowHandled])

  // Start inline edit for any row
  const handleStartEdit = useCallback((entry: MappingEntry) => {
    setEditState({
      sectionIndex: entry.sectionIndex,
      gwField: entry.gwField,
      markerType: entry.markerType,
    })
  }, [])

  // Confirm inline edit via GwFieldAutocomplete selection
  const handleAutocompleteChange = useCallback(
    (gwField: string, markerType: string, _jinja2: string) => {
      if (!editState || !onMappingPlanChange) return

      const updatedEntries = mappingPlan.entries.map((entry) => {
        if (entry.sectionIndex === editState.sectionIndex) {
          return {
            ...entry,
            gwField,
            markerType,
          }
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

      const updatedEntries = mappingPlan.entries.map((entry) => {
        if (entry.sectionIndex === editState.sectionIndex) {
          return {
            ...entry,
            gwField: raw,
          }
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

  // Delete a row
  const handleDeleteRow = useCallback(
    (sectionIndex: number) => {
      if (!onMappingPlanChange) return
      const updatedEntries = mappingPlan.entries.filter(
        (entry) => entry.sectionIndex !== sectionIndex,
      )
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

    onMappingPlanChange({
      ...mappingPlan,
      entries: [...mappingPlan.entries, newEntry],
    })

    // Auto-enter edit mode for the new row
    setEditState({
      sectionIndex: newIndex,
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
              className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 p-2 text-xs"
              role="alert"
            >
              <AlertCircle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span className="text-yellow-800 dark:text-yellow-200">{warning}</span>
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
            <TableHead className="w-20">Marker</TableHead>
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
            sortedEntries.map((entry: MappingEntry) => {
              const isEditing = editState?.sectionIndex === entry.sectionIndex
              const isHighlighted = highlightedIndex === entry.sectionIndex
              return (
                <TableRow
                  key={`entry-${entry.sectionIndex}`}
                  className={cn(
                    'cursor-pointer transition-colors',
                    isHighlighted && 'ring-1 ring-primary/50 bg-primary/5',
                    !isHighlighted && 'hover:bg-muted/50',
                  )}
                  onClick={() => {
                    if (!isEditing) onRowClick?.(entry)
                  }}
                  onDoubleClick={() => {
                    if (isEditable && !isEditing) handleStartEdit(entry)
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
                        className="text-xs bg-muted px-1.5 py-0.5 rounded hover:bg-muted/80 transition-colors cursor-pointer font-mono"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleStartEdit(entry)
                        }}
                      >
                        {entry.gwField || 'Click to set...'}
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
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-[9px] uppercase tracking-wider',
                        confidenceBg(entry.confidence),
                      )}
                    >
                      {entry.markerType}
                    </Badge>
                  </TableCell>
                  {isEditable && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteRow(entry.sectionIndex)}
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
