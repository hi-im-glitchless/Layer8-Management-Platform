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
import { useDeleteCard } from '../hooks'

interface DeleteCardDialogProps {
  cardId: string
  projectName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}

/**
 * Hard-delete confirmation for a Planner card (= the linked project).
 *
 * Distinct from ArchiveCardDialog: this PERMANENTLY removes the card and its
 * comments/notes/files (schema cascade). The linked schedule assignments are
 * left intact. Mirrors the AlertDialog pattern in ArchiveCardDialog; never uses
 * native confirm(). Server authorizes via requireRole('PM') — this affordance
 * is advisory.
 */
export function DeleteCardDialog({
  cardId,
  projectName,
  open,
  onOpenChange,
  onDeleted,
}: DeleteCardDialogProps) {
  const deleteCard = useDeleteCard()

  const handleConfirm = (e?: React.MouseEvent | React.FormEvent) => {
    e?.preventDefault()
    if (deleteCard.isPending) return
    deleteCard.mutate(cardId, {
      onSuccess: () => {
        onDeleted?.()
        onOpenChange(false)
      },
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Permanently delete &ldquo;{projectName}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the card and all attached comments, notes,
            and files. The linked schedule assignments are not affected. This
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteCard.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={deleteCard.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteCard.isPending ? 'Deleting…' : 'Delete card'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
