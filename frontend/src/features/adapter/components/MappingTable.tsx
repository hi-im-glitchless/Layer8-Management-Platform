import { useState, useMemo, useCallback } from 'react'
import { AlertCircle, ArrowUpDown, Check, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { ParagraphPicker } from './ParagraphPicker'
import type { MappingPlan, MappingEntry, TooltipEntry, UnmappedParagraph } from '../types'

interface MappingTableProps {
  mappingPlan: MappingPlan
  /** Gap entries from annotation analysis (displayed as yellow rows) */
  gaps?: TooltipEntry[]
  /** Unmapped paragraphs available for manual addition */
  unmappedParagraphs?: UnmappedParagraph[]
  /** Enable inline editing for gap rows */
  isEditable?: boolean
  /** Called when mapping plan changes via inline edit or added entry */
  onMappingPlanChange?: (updatedPlan: MappingPlan) => void
}

type SortDirection = 'asc' | 'desc' | null

/** Inline edit state for a gap row */
interface EditState {
  paragraphIndex: number
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
  gaps = [],
  unmappedParagraphs = [],
  isEditable = false,
  onMappingPlanChange,
}: MappingTableProps) {
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)
  const [editState, setEditState] = useState<EditState | null>(null)

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

  // Start inline edit for a gap row
  const handleStartEdit = useCallback((gap: TooltipEntry) => {
    setEditState({
      paragraphIndex: gap.paragraphIndex,
      gwField: gap.gwField,
      markerType: gap.markerType,
    })
  }, [])

  // Confirm inline edit
  const handleConfirmEdit = useCallback(() => {
    if (!editState || !editState.gwField.trim() || !onMappingPlanChange) return

    // Find the matching entry in the mapping plan by sectionIndex
    const updatedEntries = mappingPlan.entries.map((entry) => {
      if (entry.sectionIndex === editState.paragraphIndex) {
        return {
          ...entry,
          gwField: editState.gwField.trim(),
          markerType: editState.markerType,
        }
      }
      return entry
    })

    // If the entry doesn't exist yet (it's a pure gap), add it
    const exists = mappingPlan.entries.some((e) => e.sectionIndex === editState.paragraphIndex)
    if (!exists) {
      // Find the gap entry for section text
      const gapEntry = gaps.find((g) => g.paragraphIndex === editState.paragraphIndex)
      updatedEntries.push({
        sectionIndex: editState.paragraphIndex,
        sectionText: gapEntry?.sectionText ?? '',
        gwField: editState.gwField.trim(),
        placeholderTemplate: '',
        confidence: 0,
        markerType: editState.markerType,
        rationale: 'Manually corrected gap',
      })
    }

    onMappingPlanChange({
      ...mappingPlan,
      entries: updatedEntries,
    })

    setEditState(null)
  }, [editState, mappingPlan, gaps, onMappingPlanChange])

  // Cancel inline edit
  const handleCancelEdit = useCallback(() => {
    setEditState(null)
  }, [])

  // Handle adding a new entry from paragraph picker
  const handleAddEntry = useCallback((paragraphIndex: number, gwField: string, markerType: string) => {
    if (!onMappingPlanChange) return

    const paragraph = unmappedParagraphs.find((p) => p.paragraphIndex === paragraphIndex)
    const newEntry: MappingEntry = {
      sectionIndex: paragraphIndex,
      sectionText: paragraph?.text ?? '',
      gwField,
      placeholderTemplate: '',
      confidence: 0,
      markerType,
      rationale: 'Manually added missing section',
    }

    onMappingPlanChange({
      ...mappingPlan,
      entries: [...mappingPlan.entries, newEntry],
    })
  }, [mappingPlan, unmappedParagraphs, onMappingPlanChange])

  // Get gap entries that aren't already in the mapping plan
  const pureGaps = useMemo(() => {
    const mappedIndices = new Set(mappingPlan.entries.map((e) => e.sectionIndex))
    return gaps.filter((g) => !mappedIndices.has(g.paragraphIndex))
  }, [gaps, mappingPlan.entries])

  // Remaining unmapped paragraphs (exclude those already added to mapping plan)
  const remainingUnmapped = useMemo(() => {
    const mappedIndices = new Set(mappingPlan.entries.map((e) => e.sectionIndex))
    return unmappedParagraphs.filter((p) => !mappedIndices.has(p.paragraphIndex))
  }, [unmappedParagraphs, mappingPlan.entries])

  return (
    <div className="space-y-4">
      {/* Warnings */}
      {mappingPlan.warnings.length > 0 && (
        <div className="space-y-2">
          {mappingPlan.warnings.map((warning, index) => (
            <div
              key={index}
              className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 p-3 text-sm"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span className="text-yellow-800 dark:text-yellow-200">{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>{mappingPlan.entries.length} mapping{mappingPlan.entries.length !== 1 ? 's' : ''} found</span>
        {pureGaps.length > 0 && (
          <>
            <span className="text-muted-foreground/30">|</span>
            <span className="text-yellow-600 dark:text-yellow-400">
              {pureGaps.length} gap{pureGaps.length !== 1 ? 's' : ''} detected
            </span>
          </>
        )}
        <span className="text-muted-foreground/30">|</span>
        <span>Type: {mappingPlan.templateType}</span>
        <span className="text-muted-foreground/30">|</span>
        <span>Language: {mappingPlan.language === 'pt-pt' ? 'Portuguese (PT-PT)' : 'English'}</span>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">#</TableHead>
            <TableHead className="min-w-[200px]">Section Text</TableHead>
            <TableHead className="min-w-[140px]">GW Field</TableHead>
            <TableHead className="w-28">
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 font-medium text-muted-foreground hover:text-foreground"
                onClick={toggleSort}
              >
                Confidence
                <ArrowUpDown className="h-3 w-3 ml-1" aria-hidden="true" />
              </Button>
            </TableHead>
            <TableHead className="w-24">Marker</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedEntries.length === 0 && pureGaps.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No mappings found in this template.
              </TableCell>
            </TableRow>
          ) : (
            <>
              {/* Mapped entries */}
              {sortedEntries.map((entry: MappingEntry) => (
                <TableRow key={`mapped-${entry.sectionIndex}`}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {entry.sectionIndex}
                  </TableCell>
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-sm cursor-help">
                          {truncateText(entry.sectionText, 60)}
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
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {entry.gwField}
                    </code>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'text-sm font-medium tabular-nums',
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
                        'text-[10px] uppercase tracking-wider',
                        confidenceBg(entry.confidence),
                      )}
                    >
                      {entry.markerType}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}

              {/* Gap entries (yellow rows) */}
              {pureGaps.map((gap) => {
                const isEditing = editState?.paragraphIndex === gap.paragraphIndex
                return (
                  <TableRow
                    key={`gap-${gap.paragraphIndex}`}
                    className="bg-yellow-50/50 dark:bg-yellow-900/10"
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {gap.paragraphIndex}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-[10px] shrink-0"
                        >
                          Gap
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {truncateText(gap.sectionText, 50)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {isEditable && isEditing ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editState.gwField}
                            onChange={(e) =>
                              setEditState((prev) =>
                                prev ? { ...prev, gwField: e.target.value } : null
                              )
                            }
                            className="h-7 text-xs w-28"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleConfirmEdit()
                              if (e.key === 'Escape') handleCancelEdit()
                            }}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={handleConfirmEdit}
                            disabled={!editState.gwField.trim()}
                            aria-label="Confirm edit"
                          >
                            <Check className="h-3 w-3 text-green-600" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={handleCancelEdit}
                            aria-label="Cancel edit"
                          >
                            <X className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                          </Button>
                        </div>
                      ) : isEditable ? (
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer bg-muted/50 hover:bg-muted px-1.5 py-0.5 rounded transition-colors"
                          onClick={() => handleStartEdit(gap)}
                        >
                          {gap.gwField || 'Click to set field...'}
                        </button>
                      ) : (
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                          {gap.gwField || '(unmapped)'}
                        </code>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">--</span>
                    </TableCell>
                    <TableCell>
                      {isEditable && isEditing ? (
                        <Select
                          value={editState.markerType}
                          onValueChange={(value) =>
                            setEditState((prev) =>
                              prev ? { ...prev, markerType: value } : null
                            )
                          }
                        >
                          <SelectTrigger className="h-7 text-[10px] w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">text</SelectItem>
                            <SelectItem value="paragraph_rt">paragraph_rt</SelectItem>
                            <SelectItem value="run_rt">run_rt</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-[10px] uppercase tracking-wider"
                        >
                          {gap.markerType}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </>
          )}
        </TableBody>
      </Table>

      {/* Paragraph Picker for adding missing sections */}
      {isEditable && (
        <ParagraphPicker
          unmappedParagraphs={remainingUnmapped}
          onAddEntry={handleAddEntry}
        />
      )}
    </div>
  )
}
