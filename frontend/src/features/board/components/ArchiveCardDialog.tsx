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
import { useArchiveCard } from '../hooks'

interface ArchiveCardDialogProps {
  cardId: string
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
  fileCount,
  totalBytes,
  open,
  onOpenChange,
  onArchived,
}: ArchiveCardDialogProps) {
  const archive = useArchiveCard()

  const fileSummary =
    fileCount === 0
      ? 'There are no attached files to remove.'
      : `This will permanently delete ${fileCount} file${fileCount === 1 ? '' : 's'} totaling ${formatBytes(totalBytes)}.`

  const handleConfirm = (e?: React.MouseEvent | React.FormEvent) => {
    e?.preventDefault()
    if (archive.isPending) return
    archive.mutate(
      { cardId },
      {
        onSuccess: () => {
          onOpenChange(false)
          onArchived?.()
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

        <AlertDialogFooter>
          <AlertDialogCancel disabled={archive.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={archive.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {archive.isPending ? 'Archiving…' : 'Archive card'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
