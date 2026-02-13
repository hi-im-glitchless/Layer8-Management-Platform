import { useState, useMemo } from 'react'
import { AlertCircle, ArrowUpDown } from 'lucide-react'
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
import type { MappingPlan, MappingEntry } from '../types'

interface MappingTableProps {
  mappingPlan: MappingPlan
}

type SortDirection = 'asc' | 'desc' | null

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

export function MappingTable({ mappingPlan }: MappingTableProps) {
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)

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
          {sortedEntries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No mappings found in this template.
              </TableCell>
            </TableRow>
          ) : (
            sortedEntries.map((entry: MappingEntry) => (
              <TableRow key={entry.sectionIndex}>
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
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
