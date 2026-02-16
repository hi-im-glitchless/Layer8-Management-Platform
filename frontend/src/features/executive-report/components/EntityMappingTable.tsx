import { Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ENTITY_TYPES, getEntityTypeLabel } from '../entityTypes'
import type { EntityMapping } from '../types'

interface EntityMappingTableProps {
  mappings: EntityMapping[]
  onEditType: (index: number, newType: string) => void
  onDelete: (index: number) => void
  isUpdating: boolean
}

/** Maximum characters to display for original value before truncation. */
const MAX_VALUE_LENGTH = 40

/**
 * 4-column entity mapping table replacing both SanitizationDiffView and DenyListEditor.
 * Columns: Original Value | Placeholder | Entity Type | Actions
 */
export function EntityMappingTable({
  mappings,
  onEditType,
  onDelete,
  isUpdating,
}: EntityMappingTableProps) {
  if (mappings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <UserPlus className="h-8 w-8 mb-3 opacity-40" aria-hidden="true" />
        <p className="text-sm font-medium">No entities detected.</p>
        <p className="text-xs mt-1 text-muted-foreground/70">
          Select text in the preview to add mappings.
        </p>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="overflow-auto max-h-[calc(100vh-280px)]">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="text-xs w-[35%]">Original Value</TableHead>
              <TableHead className="text-xs w-[20%]">Placeholder</TableHead>
              <TableHead className="text-xs w-[30%]">Entity Type</TableHead>
              <TableHead className="text-xs w-[15%] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.map((mapping, index) => (
              <EntityRow
                key={`${mapping.originalValue}-${mapping.placeholder}`}
                mapping={mapping}
                index={index}
                onEditType={onEditType}
                onDelete={onDelete}
                isUpdating={isUpdating}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  )
}

function EntityRow({
  mapping,
  index,
  onEditType,
  onDelete,
  isUpdating,
}: {
  mapping: EntityMapping
  index: number
  onEditType: (index: number, newType: string) => void
  onDelete: (index: number) => void
  isUpdating: boolean
}) {
  const needsTruncation = mapping.originalValue.length > MAX_VALUE_LENGTH
  const displayValue = needsTruncation
    ? mapping.originalValue.slice(0, MAX_VALUE_LENGTH) + '...'
    : mapping.originalValue

  return (
    <TableRow className={cn(isUpdating && 'opacity-60 pointer-events-none')}>
      {/* Original Value */}
      <TableCell className="text-xs font-mono">
        {needsTruncation ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help">{displayValue}</span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[300px] break-all">
              {mapping.originalValue}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span>{displayValue}</span>
        )}
        {mapping.isManual && (
          <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">
            manual
          </Badge>
        )}
      </TableCell>

      {/* Placeholder */}
      <TableCell className="text-xs font-mono text-muted-foreground">
        {mapping.placeholder}
      </TableCell>

      {/* Entity Type */}
      <TableCell>
        <Select
          value={mapping.entityType}
          onValueChange={(value) => onEditType(index, value)}
          disabled={isUpdating}
        >
          <SelectTrigger className="h-7 text-xs w-full">
            <SelectValue>{getEntityTypeLabel(mapping.entityType)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value} className="text-xs">
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>

      {/* Actions */}
      <TableCell className="text-right">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(index)}
              disabled={isUpdating}
              aria-label={`Delete mapping for "${mapping.originalValue}"`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove mapping and restore original text</TooltipContent>
        </Tooltip>
      </TableCell>
    </TableRow>
  )
}
