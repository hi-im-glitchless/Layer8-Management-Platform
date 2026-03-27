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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Trash2 } from 'lucide-react'
import { ColorPalette } from './ColorPalette'
import { useUpsertAssignment, useDeleteAssignment, useClients } from '../hooks'
import { ASSIGNMENT_STATUSES, COLOR_PALETTE } from '../constants'
import { CreateAssignmentSchema, PREDEFINED_TAGS } from '../types'
import type { Assignment, AssignmentStatus, Client } from '../types'

interface AssignmentModalProps {
  open: boolean
  onClose: () => void
  teamMemberId: string
  weekStart: string
  assignment: Assignment | undefined
}

function ClientSelect({
  clientId,
  clients,
  onChange,
}: {
  clientId: string | null
  clients: Client[]
  onChange: (value: string | null, client?: Client) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = clients.find((c) => c.id === clientId)
  const filtered = search
    ? clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : clients

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setTimeout(() => inputRef.current?.focus(), 0) }}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start font-normal">
          {selected ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm shrink-0 inline-block" style={{ backgroundColor: selected.color }} />
              {selected.name}
            </span>
          ) : (
            <span className="text-muted-foreground">No client</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="p-2 border-b">
          <Input
            ref={inputRef}
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
            autoFocus
          />
        </div>
        <div className="max-h-48 overflow-y-auto overscroll-contain p-1" onWheel={(e) => e.stopPropagation()}>
          <button
            className={`w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent ${!clientId ? 'bg-accent' : ''}`}
            onClick={() => { onChange(null); setOpen(false); setSearch('') }}
          >
            No client
          </button>
          {filtered.map((c) => (
            <button
              key={c.id}
              className={`w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent flex items-center gap-2 ${clientId === c.id ? 'bg-accent' : ''}`}
              onClick={() => { onChange(c.id, c); setOpen(false); setSearch('') }}
            >
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
              {c.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">No clients found</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TagSelector({
  selectedTags,
  onToggle,
}: {
  selectedTags: string[]
  onToggle: (tag: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PREDEFINED_TAGS.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onToggle(tag)}
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
  )
}

function parseTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags
  if (typeof tags === 'string') {
    try { const parsed = JSON.parse(tags); return Array.isArray(parsed) ? parsed : [] }
    catch { return [] }
  }
  return []
}

export function AssignmentModal({ open, onClose, teamMemberId, weekStart, assignment }: AssignmentModalProps) {
  const isEdit = !!assignment

  const [projectName, setProjectName] = useState('')
  const [projectColor, setProjectColor] = useState<string>(COLOR_PALETTE[0].hex)
  const [status, setStatus] = useState<AssignmentStatus>('placeholder')
  const [isSplit, setIsSplit] = useState(false)
  const [splitProjectName, setSplitProjectName] = useState('')
  const [splitProjectColor, setSplitProjectColor] = useState<string>(COLOR_PALETTE[1].hex)
  const [splitProjectStatus, setSplitProjectStatus] = useState<AssignmentStatus>('placeholder')
  const [splitClientId, setSplitClientId] = useState<string | null>(null)
  const [splitSelectedTags, setSplitSelectedTags] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const upsertMutation = useUpsertAssignment()
  const deleteMutation = useDeleteAssignment()
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
        setSplitClientId(assignment.splitClientId ?? null)
        setSplitSelectedTags(parseTags(assignment.splitTags))
        setClientId(assignment.clientId ?? null)
        setSelectedTags(parseTags(assignment.tags))
      } else {
        setProjectName('')
        setProjectColor(COLOR_PALETTE[0].hex)
        setStatus('placeholder')
        setIsSplit(false)
        setSplitProjectName('')
        setSplitProjectColor(COLOR_PALETTE[1].hex)
        setSplitProjectStatus('placeholder')
        setSplitClientId(null)
        setSplitSelectedTags([])
        setClientId(null)
        setSelectedTags([])
      }
      setError(null)
    }
  }, [open, assignment])

  const handleClientChange = (value: string | null, client?: Client) => {
    setClientId(value)
    if (client) {
      setProjectColor(client.color)
    }
  }

  const handleSplitClientChange = (value: string | null, client?: Client) => {
    setSplitClientId(value)
    if (client) {
      setSplitProjectColor(client.color)
    }
  }

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const toggleSplitTag = (tag: string) => {
    setSplitSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  const handleSave = () => {
    const hasSplit = isSplit && splitProjectName.trim()
    const data = {
      teamMemberId,
      projectName: projectName.trim(),
      projectColor,
      status,
      weekStart,
      splitProjectName: hasSplit ? splitProjectName.trim() : null,
      splitProjectColor: hasSplit ? splitProjectColor : null,
      splitProjectStatus: hasSplit ? splitProjectStatus : null,
      splitClientId: hasSplit ? (splitClientId || null) : null,
      splitTags: hasSplit ? splitSelectedTags : [],
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
      <DialogContent className={isSplit ? 'sm:max-w-[760px]' : 'sm:max-w-[440px]'}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Assignment' : 'New Assignment'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the assignment details.' : 'Create a new assignment for this week.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(85vh-10rem)] overflow-y-auto py-2">
          <div className={isSplit ? 'grid grid-cols-2 gap-6' : ''}>
            {/* Primary Project Column */}
            <div className="space-y-4">
              {isSplit && <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Primary Project</Label>}

              {/* Client Selection */}
              <div className="space-y-2">
                <Label>Client</Label>
                <ClientSelect clientId={clientId} clients={clients} onChange={handleClientChange} />
              </div>

              {/* Project Name */}
              <div className="space-y-2">
                <Label htmlFor="projectName">Project Name</Label>
                <Input
                  id="projectName"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Optional — leave blank for client-only"
                />
              </div>

              {/* Color Palette — only when no client selected (client provides color) */}
              {!clientId && (
                <div className="space-y-2">
                  <Label>Color</Label>
                  <ColorPalette selectedColor={projectColor} onColorSelect={setProjectColor} />
                </div>
              )}

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
                <TagSelector selectedTags={selectedTags} onToggle={toggleTag} />
              </div>
            </div>

            {/* Split Project Column (side by side when split is active) */}
            {isSplit && (
              <div className="space-y-4 pl-6 border-l-2 border-border">
                <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Second Project</Label>

                {/* Split Client */}
                <div className="space-y-2">
                  <Label>Client</Label>
                  <ClientSelect clientId={splitClientId} clients={clients} onChange={handleSplitClientChange} />
                </div>

                {/* Split Project Name */}
                <div className="space-y-2">
                  <Label htmlFor="splitProjectName">Project Name</Label>
                  <Input
                    id="splitProjectName"
                    value={splitProjectName}
                    onChange={(e) => setSplitProjectName(e.target.value)}
                    placeholder="Enter second project name..."
                  />
                </div>

                {/* Split Color — only when no split client selected */}
                {!splitClientId && (
                  <div className="space-y-2">
                    <Label>Color</Label>
                    <ColorPalette
                      selectedColor={splitProjectColor}
                      onColorSelect={setSplitProjectColor}
                    />
                  </div>
                )}

                {/* Split Status */}
                <div className="space-y-2">
                  <Label>Status</Label>
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

                {/* Split Tags */}
                <div className="space-y-2">
                  <Label>Tags</Label>
                  <TagSelector selectedTags={splitSelectedTags} onToggle={toggleSplitTag} />
                </div>
              </div>
            )}
          </div>

          {/* Split Toggle - below both columns */}
          <div className="flex items-center gap-2 mt-4">
            <Checkbox
              id="splitToggle"
              checked={isSplit}
              onCheckedChange={(checked) => setIsSplit(checked === true)}
            />
            <Label htmlFor="splitToggle" className="text-sm font-normal cursor-pointer">
              Split with second project
            </Label>
          </div>

          {error && (
            <p className="text-sm text-destructive mt-2">{error}</p>
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
