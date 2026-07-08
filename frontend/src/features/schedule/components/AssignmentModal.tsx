import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ClientCombobox } from '@/components/client-combobox'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { ExternalLink, Trash2, Lock, Unlock } from 'lucide-react'
import { ColorPalette } from './ColorPalette'
import { useUpsertAssignment, useDeleteAssignment, useClients, useToggleLock } from '../hooks'
import { useBoardCardByProjectId } from '../../board/hooks'
import { ASSIGNMENT_STATUSES, COLOR_PALETTE } from '../constants'
import { CreateAssignmentSchema, PREDEFINED_TAGS } from '../types'
import type { Assignment, AssignmentStatus } from '../types'

interface AssignmentModalProps {
  open: boolean
  onClose: () => void
  teamMemberId: string
  weekStart: string
  assignment: Assignment | undefined
}

function TagSelector({
  selectedTags,
  onToggle,
  disabled = false,
}: {
  selectedTags: string[]
  onToggle: (tag: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PREDEFINED_TAGS.map((tag) => (
        <button
          key={tag}
          type="button"
          disabled={disabled}
          onClick={() => onToggle(tag)}
          className={`px-2 py-0.5 text-xs rounded-full border transition-colors ${
            selectedTags.includes(tag)
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-transparent text-muted-foreground border-border hover:border-primary/50'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
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

  // Phase 24-02: look up the linked board card so we can render a
  // "View on Board" deep link for existing assignments. Disabled in
  // create-mode (assignment === undefined). Returns null when the
  // assignment has no card (e.g., legacy pre-Phase-23 rows) — in that
  // case the link is hidden, not an error.
  // Phase 24-R03: open the Planner via the assignment's primary projectId.
  // If the assignment has no Project link (legacy / missing fields), the
  // hook returns null and the "View on Board" link is hidden.
  const { data: boardCard } = useBoardCardByProjectId(
    isEdit && assignment ? assignment.projectId ?? undefined : undefined,
  )

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
  const toggleLock = useToggleLock()
  const clientsQuery = useClients()
  const clients = clientsQuery.data?.clients ?? []

  // Read lock state from the prop (server-authoritative). After unlocking,
  // useToggleLock invalidates ['schedule','assignments'] so the parent
  // re-passes assignment.isLocked: false — no local lock state needed.
  const isLocked = isEdit && !!assignment?.isLocked

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

  // ClientCombobox reports only the selected id; look the client up in the
  // same clients array to preserve the "adopt the client's color" behavior.
  const handleClientChange = (value: string | null) => {
    setClientId(value)
    const client = value ? clients.find((c) => c.id === value) : undefined
    if (client) {
      setProjectColor(client.color)
    }
  }

  const handleSplitClientChange = (value: string | null) => {
    setSplitClientId(value)
    const client = value ? clients.find((c) => c.id === value) : undefined
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
    const hasSplit = isSplit && (splitProjectName.trim() || splitClientId || splitSelectedTags.length > 0)
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

  // Remove the primary project, promote the secondary to primary, save.
  const handleRemovePrimary = () => {
    if (!assignment) return
    const data = {
      teamMemberId,
      projectName: splitProjectName.trim(),
      projectColor: splitProjectColor,
      status: splitProjectStatus,
      weekStart,
      splitProjectName: null,
      splitProjectColor: null,
      splitProjectStatus: null,
      splitClientId: null,
      splitTags: [],
      clientId: splitClientId || null,
      tags: splitSelectedTags,
      // Phase 24-R02: tell the backend which half was removed so the
      // surviving BoardCard's notes/files/comments are preserved.
      removedSide: 'primary' as const,
    }
    const result = CreateAssignmentSchema.safeParse(data)
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Invalid data')
      return
    }
    setError(null)
    upsertMutation.mutate(result.data, { onSuccess: () => onClose() })
  }

  // Remove the secondary project, keep the primary, save.
  const handleRemoveSecondary = () => {
    if (!assignment) return
    const data = {
      teamMemberId,
      projectName: projectName.trim(),
      projectColor,
      status,
      weekStart,
      splitProjectName: null,
      splitProjectColor: null,
      splitProjectStatus: null,
      splitClientId: null,
      splitTags: [],
      clientId: clientId || null,
      tags: selectedTags,
      // Phase 24-R02: signal which half was removed so the backend deletes
      // the right BoardCard (the now-orphaned secondary).
      removedSide: 'secondary' as const,
    }
    const result = CreateAssignmentSchema.safeParse(data)
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Invalid data')
      return
    }
    setError(null)
    upsertMutation.mutate(result.data, { onSuccess: () => onClose() })
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
              {isSplit && (
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Primary Project</Label>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        title="Remove primary project"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove primary project?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The second project will be kept and promoted to the only project. This saves immediately.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRemovePrimary}>Remove primary</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}

              {/* Client Selection */}
              <div className="space-y-2">
                <Label>Client</Label>
                <ClientCombobox clients={clients} value={clientId} onChange={handleClientChange} sentinelLabel="No client" sentinelMode="clear" disabled={isLocked} />
              </div>

              {/* Project Name */}
              <div className="space-y-2">
                <Label htmlFor="projectName">Project Name</Label>
                <Input
                  id="projectName"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Optional — leave blank for client-only"
                  disabled={isLocked}
                />
              </div>

              {/* Color Palette — only when no client selected (client provides color) */}
              {!clientId && (
                <div className="space-y-2">
                  <Label>Color</Label>
                  <ColorPalette selectedColor={projectColor} onColorSelect={setProjectColor} disabled={isLocked} />
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
                      disabled={isLocked}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label>Tags</Label>
                <TagSelector selectedTags={selectedTags} onToggle={toggleTag} disabled={isLocked} />
              </div>
            </div>

            {/* Split Project Column (side by side when split is active) */}
            {isSplit && (
              <div className="space-y-4 pl-6 border-l-2 border-border">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Second Project</Label>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        title="Remove second project"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove second project?</AlertDialogTitle>
                        <AlertDialogDescription>
                          The primary project will be kept. This saves immediately.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRemoveSecondary}>Remove second</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* Split Client */}
                <div className="space-y-2">
                  <Label>Client</Label>
                  <ClientCombobox clients={clients} value={splitClientId} onChange={handleSplitClientChange} sentinelLabel="No client" sentinelMode="clear" disabled={isLocked} />
                </div>

                {/* Split Project Name */}
                <div className="space-y-2">
                  <Label htmlFor="splitProjectName">Project Name</Label>
                  <Input
                    id="splitProjectName"
                    value={splitProjectName}
                    onChange={(e) => setSplitProjectName(e.target.value)}
                    placeholder="Optional — leave blank for client-only"
                    disabled={isLocked}
                  />
                </div>

                {/* Split Color — only when no split client selected */}
                {!splitClientId && (
                  <div className="space-y-2">
                    <Label>Color</Label>
                    <ColorPalette
                      selectedColor={splitProjectColor}
                      onColorSelect={setSplitProjectColor}
                      disabled={isLocked}
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
                        disabled={isLocked}
                      >
                        {s.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Split Tags */}
                <div className="space-y-2">
                  <Label>Tags</Label>
                  <TagSelector selectedTags={splitSelectedTags} onToggle={toggleSplitTag} disabled={isLocked} />
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
              disabled={isLocked}
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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={deleteMutation.isPending || isLocked}
                  className="mr-auto"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this assignment?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the schedule entry. The project&apos;s Board card is only
                    removed when this is the project&apos;s last assignment — if other
                    assignments remain, the card stays on the Board.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {isEdit && assignment && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => toggleLock.mutate(assignment.id)}
              disabled={toggleLock.isPending}
            >
              {assignment.isLocked ? (
                <Unlock className="w-4 h-4 mr-1" />
              ) : (
                <Lock className="w-4 h-4 mr-1" />
              )}
              {assignment.isLocked ? 'Unlock' : 'Lock'}
            </Button>
          )}
          {isEdit && boardCard && (
            <Button asChild type="button" variant="link" size="sm">
              <Link
                to={`/board?card=${boardCard.id}`}
                onClick={() => onClose()}
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                View on Board
              </Link>
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={upsertMutation.isPending || isLocked}
          >
            {upsertMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
