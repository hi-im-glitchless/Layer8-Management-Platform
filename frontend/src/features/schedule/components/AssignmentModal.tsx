import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Trash2 } from 'lucide-react'
import { ColorPalette } from './ColorPalette'
import { useUpsertAssignment, useDeleteAssignment, useSearchProjectColors, useClients } from '../hooks'
import { ASSIGNMENT_STATUSES, COLOR_PALETTE } from '../constants'
import { CreateAssignmentSchema, PREDEFINED_TAGS } from '../types'
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
  const [splitProjectStatus, setSplitProjectStatus] = useState<AssignmentStatus>('placeholder')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  const upsertMutation = useUpsertAssignment()
  const deleteMutation = useDeleteAssignment()
  const projectColorsQuery = useSearchProjectColors(projectName)
  const suggestions: ProjectColor[] = projectColorsQuery.data?.projectColors ?? []
  const clientsQuery = useClients()
  const clients = clientsQuery.data?.clients ?? []

  useEffect(() => {
    if (open) {
      if (assignment) {
        setProjectName(assignment.projectName)
        setProjectColor(assignment.projectColor)
        setStatus(assignment.status)
        setIsSplit(!!assignment.splitProjectName)
        setSplitProjectName(assignment.splitProjectName ?? '')
        setSplitProjectColor(assignment.splitProjectColor ?? COLOR_PALETTE[1].hex)
        setSplitProjectStatus(assignment.splitProjectStatus ?? 'placeholder')
        setClientId(assignment.clientId ?? null)
        setSelectedTags(assignment.tags ?? [])
      } else {
        setProjectName('')
        setProjectColor(COLOR_PALETTE[0].hex)
        setStatus('placeholder')
        setIsSplit(false)
        setSplitProjectName('')
        setSplitProjectColor(COLOR_PALETTE[1].hex)
        setSplitProjectStatus('placeholder')
        setClientId(null)
        setSelectedTags([])
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

  const handleClientChange = (value: string) => {
    if (value === '__none__') {
      setClientId(null)
      return
    }
    setClientId(value)
    const selected = clients.find((c) => c.id === value)
    if (selected) {
      setProjectColor(selected.color)
    }
  }

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
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
      splitProjectStatus: isSplit && splitProjectName.trim() ? splitProjectStatus : null,
      clientId: clientId || null,
      tags: selectedTags,
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
          {/* Client Selection */}
          <div className="space-y-2">
            <Label>Client</Label>
            <Select value={clientId ?? '__none__'} onValueChange={handleClientChange}>
              <SelectTrigger>
                <SelectValue placeholder="No client">
                  {clientId ? (
                    <span className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-sm shrink-0 inline-block"
                        style={{ backgroundColor: clients.find((c) => c.id === clientId)?.color }}
                      />
                      {clients.find((c) => c.id === clientId)?.name}
                    </span>
                  ) : (
                    'No client'
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No client</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-sm shrink-0 inline-block"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {PREDEFINED_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-transparent text-muted-foreground border-border hover:border-primary/50'
                  }`}
                >
                  {tag}
                </button>
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
              <div className="space-y-2">
                <Label>Status: {splitProjectName.trim() || 'Second Project'}</Label>
                <div className="flex gap-2">
                  {ASSIGNMENT_STATUSES.map((s) => (
                    <Button
                      key={s.value}
                      type="button"
                      variant={splitProjectStatus === s.value ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => setSplitProjectStatus(s.value)}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
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
