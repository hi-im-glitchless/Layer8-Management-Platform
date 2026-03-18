import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Trash2 } from 'lucide-react'
import { ColorPalette } from './ColorPalette'
import { useUpsertAssignment, useDeleteAssignment, useSearchProjectColors } from '../hooks'
import { ASSIGNMENT_STATUSES, COLOR_PALETTE } from '../constants'
import { CreateAssignmentSchema } from '../types'
import type { Assignment, AssignmentStatus, ProjectColor } from '../types'

interface AssignmentModalProps {
  open: boolean
  onClose: () => void
  teamMemberId: string
  weekStart: string
  assignment: Assignment | undefined
}

export function AssignmentModal({ open, onClose, teamMemberId, weekStart, assignment }: AssignmentModalProps) {
  const isEdit = !!assignment

  const [projectName, setProjectName] = useState('')
  const [projectColor, setProjectColor] = useState(COLOR_PALETTE[0].hex)
  const [status, setStatus] = useState<AssignmentStatus>('placeholder')
  const [isSplit, setIsSplit] = useState(false)
  const [splitProjectName, setSplitProjectName] = useState('')
  const [splitProjectColor, setSplitProjectColor] = useState(COLOR_PALETTE[1].hex)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  const upsertMutation = useUpsertAssignment()
  const deleteMutation = useDeleteAssignment()
  const projectColorsQuery = useSearchProjectColors(projectName)
  const suggestions: ProjectColor[] = projectColorsQuery.data?.projectColors ?? []

  useEffect(() => {
    if (open) {
      if (assignment) {
        setProjectName(assignment.projectName)
        setProjectColor(assignment.projectColor)
        setStatus(assignment.status)
        setIsSplit(!!assignment.splitProjectName)
        setSplitProjectName(assignment.splitProjectName ?? '')
        setSplitProjectColor(assignment.splitProjectColor ?? COLOR_PALETTE[1].hex)
      } else {
        setProjectName('')
        setProjectColor(COLOR_PALETTE[0].hex)
        setStatus('placeholder')
        setIsSplit(false)
        setSplitProjectName('')
        setSplitProjectColor(COLOR_PALETTE[1].hex)
      }
      setError(null)
      setShowSuggestions(false)
    }
  }, [open, assignment])

  const handleSuggestionSelect = (suggestion: ProjectColor) => {
    setProjectName(suggestion.name)
    setProjectColor(suggestion.color)
    setShowSuggestions(false)
  }

  const handleSave = () => {
    const data = {
      teamMemberId,
      projectName: projectName.trim(),
      projectColor,
      status,
      weekStart,
      splitProjectName: isSplit && splitProjectName.trim() ? splitProjectName.trim() : null,
      splitProjectColor: isSplit && splitProjectName.trim() ? splitProjectColor : null,
    }

    const result = CreateAssignmentSchema.safeParse(data)
    if (!result.success) {
      const firstError = result.error.issues[0]
      setError(firstError?.message ?? 'Invalid form data')
      return
    }

    setError(null)
    upsertMutation.mutate(result.data, {
      onSuccess: () => onClose(),
    })
  }

  const handleDelete = () => {
    if (!assignment) return
    deleteMutation.mutate(assignment.id, {
      onSuccess: () => onClose(),
    })
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Assignment' : 'New Assignment'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the assignment details.' : 'Create a new assignment for this week.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Project Name with Autocomplete */}
          <div className="space-y-2">
            <Label htmlFor="projectName">Project Name</Label>
            <div className="relative">
              <Input
                ref={inputRef}
                id="projectName"
                value={projectName}
                onChange={(e) => {
                  setProjectName(e.target.value)
                  setShowSuggestions(e.target.value.length > 0)
                }}
                onFocus={() => {
                  if (projectName.length > 0) setShowSuggestions(true)
                }}
                onBlur={() => {
                  // Delay to allow click on suggestion
                  setTimeout(() => setShowSuggestions(false), 200)
                }}
                placeholder="Enter project name..."
              />
              {showSuggestions && suggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute top-full left-0 right-0 z-50 mt-1 max-h-[160px] overflow-auto rounded-md border bg-popover p-1 shadow-md"
                >
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSuggestionSelect(s)}
                    >
                      <div
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="truncate">{s.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {s.usageCount}x
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Color Palette */}
          <div className="space-y-2">
            <Label>Color</Label>
            <ColorPalette selectedColor={projectColor} onColorSelect={setProjectColor} />
          </div>

          {/* Status Selector */}
          <div className="space-y-2">
            <Label>Status</Label>
            <div className="flex gap-2">
              {ASSIGNMENT_STATUSES.map((s) => (
                <Button
                  key={s.value}
                  type="button"
                  variant={status === s.value ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setStatus(s.value)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Split Cell Toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="splitToggle"
              checked={isSplit}
              onCheckedChange={(checked) => setIsSplit(checked === true)}
            />
            <Label htmlFor="splitToggle" className="text-sm font-normal cursor-pointer">
              Split with second project
            </Label>
          </div>

          {/* Split Project Fields */}
          {isSplit && (
            <div className="space-y-3 pl-6 border-l-2 border-border">
              <div className="space-y-2">
                <Label htmlFor="splitProjectName">Second Project Name</Label>
                <Input
                  id="splitProjectName"
                  value={splitProjectName}
                  onChange={(e) => setSplitProjectName(e.target.value)}
                  placeholder="Enter second project name..."
                />
              </div>
              <div className="space-y-2">
                <Label>Second Project Color</Label>
                <ColorPalette
                  selectedColor={splitProjectColor}
                  onColorSelect={setSplitProjectColor}
                />
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          {isEdit && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="mr-auto"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={upsertMutation.isPending}
          >
            {upsertMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
