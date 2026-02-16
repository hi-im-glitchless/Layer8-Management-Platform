import { useState, useCallback } from 'react'
import { Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ENTITY_TYPES, getEntityTypeLabel } from '../entityTypes'
import type { EntityMapping } from '../types'

interface EntityMappingTableProps {
  mappings: EntityMapping[]
  onEditType: (index: number, newType: string) => void
  onDelete: (index: number) => void
  onDeleteMany: (indices: number[]) => void
  isUpdating: boolean
}

/** Maximum characters to display for original value before truncation. */
const MAX_VALUE_LENGTH = 50

export function EntityMappingTable({
  mappings,
  onEditType,
  onDelete,
  onDeleteMany,
  isUpdating,
}: EntityMappingTableProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // Only one row at a time has the heavy Select dropdown mounted
  const [editingTypeIndex, setEditingTypeIndex] = useState<number | null>(null)

  const toggleOne = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === mappings.length
        ? new Set()
        : new Set(mappings.map((_, i) => i)),
    )
  }, [mappings.length])

  const handleDeleteSelected = useCallback(() => {
    const indices = Array.from(selected).sort((a, b) => b - a)
    onDeleteMany(indices)
    setSelected(new Set())
  }, [selected, onDeleteMany])

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

  const allChecked = selected.size === mappings.length

  return (
    <>
      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between px-2 py-1.5 mb-1 rounded-md bg-muted/50 text-xs">
          <span className="text-muted-foreground">
            {selected.size} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-destructive hover:text-destructive"
            onClick={handleDeleteSelected}
          >
            <Trash2 className="h-3 w-3 mr-1" aria-hidden="true" />
            Delete selected
          </Button>
        </div>
      )}

      <div className="overflow-y-auto max-h-[400px]">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-8 px-1">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={toggleAll}
                  aria-label="Select all mappings"
                />
              </TableHead>
              <TableHead className="text-xs">Value</TableHead>
              <TableHead className="text-xs w-[130px]">Type</TableHead>
              <TableHead className="text-xs w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.map((mapping, index) => {
              const isEditing = editingTypeIndex === index
              const needsTruncation = mapping.originalValue.length > MAX_VALUE_LENGTH
              const displayValue = needsTruncation
                ? mapping.originalValue.slice(0, MAX_VALUE_LENGTH) + '...'
                : mapping.originalValue

              return (
                <TableRow
                  key={`${mapping.originalValue}-${mapping.placeholder}`}
                  className={cn(
                    isUpdating && 'opacity-60 pointer-events-none',
                    selected.has(index) && 'bg-muted/30',
                  )}
                >
                  {/* Checkbox */}
                  <TableCell className="w-8 px-1">
                    <Checkbox
                      checked={selected.has(index)}
                      onCheckedChange={() => toggleOne(index)}
                      aria-label={`Select "${mapping.originalValue}"`}
                    />
                  </TableCell>

                  {/* Value */}
                  <TableCell className="text-xs max-w-0">
                    <div className="truncate font-mono" title={mapping.originalValue}>
                      {displayValue}
                      {mapping.isManual && (
                        <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 align-middle">
                          manual
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono truncate">
                      {mapping.placeholder}
                    </div>
                  </TableCell>

                  {/* Type — plain text until clicked, then Select */}
                  <TableCell className="w-[130px]">
                    {isEditing ? (
                      <Select
                        value={mapping.entityType}
                        onValueChange={(value) => {
                          onEditType(index, value)
                          setEditingTypeIndex(null)
                        }}
                        onOpenChange={(open) => {
                          if (!open) setEditingTypeIndex(null)
                        }}
                        defaultOpen
                      >
                        <SelectTrigger className="h-7 text-xs">
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
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-left w-full px-2 py-1 rounded hover:bg-muted/50 transition-colors truncate"
                        onClick={() => setEditingTypeIndex(index)}
                        title="Click to change type"
                      >
                        {getEntityTypeLabel(mapping.entityType)}
                      </button>
                    )}
                  </TableCell>

                  {/* Delete */}
                  <TableCell className="w-10 px-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(index)}
                      disabled={isUpdating}
                      title="Remove mapping"
                      aria-label={`Delete mapping for "${mapping.originalValue}"`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
