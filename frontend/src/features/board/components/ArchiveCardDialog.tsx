import { useEffect, useId, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useArchiveCard } from '../hooks'

interface ArchiveCardDialogProps {
  cardId: string
  projectName: string
  fileCount: number
  totalBytes: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onArchived?: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function ArchiveCardDialog({
  cardId,
  projectName,
  fileCount,
  totalBytes,
  open,
  onOpenChange,
  onArchived,
}: ArchiveCardDialogProps) {
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const archive = useArchiveCard()
  const helpId = useId()

  // Reset state whenever the dialog reopens.
  useEffect(() => {
    if (open) {
      setTyped('')
      setError(null)
    }
  }, [open])

  const matches = typed === projectName
  const fileSummary =
    fileCount === 0
      ? 'There are no attached files to remove.'
      : `This will permanently delete ${fileCount} file${fileCount === 1 ? '' : 's'} totaling ${formatBytes(totalBytes)}.`

  const handleConfirm = (e?: React.MouseEvent | React.FormEvent) => {
    e?.preventDefault()
    if (!matches || archive.isPending) return
    setError(null)
    archive.mutate(
      { cardId, confirmProjectName: typed },
      {
        onSuccess: () => {
          onOpenChange(false)
          onArchived?.()
        },
        onError: (err: Error) => {
          const code = (err.message ?? '').toUpperCase()
          if (code.includes('PROJECT_NAME_MISMATCH')) {
            setError('Project name does not match exactly.')
          } else {
            setError(err.message || 'Failed to archive card.')
          }
        },
      },
    )
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this card?</AlertDialogTitle>
          <AlertDialogDescription>
            {fileSummary} Comments and notes are preserved. The linked schedule
            assignment is NOT affected. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form onSubmit={handleConfirm} className="space-y-2">
          <Label htmlFor={`${helpId}-input`} className="text-sm">
            Type the project name to confirm
          </Label>
          <Input
            id={`${helpId}-input`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={projectName}
            aria-describedby={`${helpId}-help`}
            autoFocus
            autoComplete="off"
          />
          <p id={`${helpId}-help`} className="text-xs text-muted-foreground">
            Must match <span className="font-semibold">{projectName}</span> exactly.
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </form>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={archive.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!matches || archive.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {archive.isPending ? 'Archiving…' : 'Archive card'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
