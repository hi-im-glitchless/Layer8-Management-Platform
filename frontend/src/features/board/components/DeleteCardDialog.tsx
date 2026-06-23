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
  /**
   * Number of schedule assignments linked to this card's project. Surfaced in
   * the warning copy so the user knows exactly how many assignments the delete
   * will remove. Optional: when omitted the copy falls back to a count-free
   * warning that still states all linked assignments are removed.
   */
  assignmentCount?: number
}

/**
 * Hard-delete confirmation for a Planner card (= the linked project).
 *
 * Distinct from ArchiveCardDialog: this PERMANENTLY removes the card and its
 * comments/notes/files (schema cascade) AND every schedule assignment linked to
 * the project, for all pentesters. The warning surfaces the linked-assignment
 * count so the user knows the scope before confirming. Mirrors the AlertDialog
 * pattern in ArchiveCardDialog; never uses native confirm(). Server authorizes
 * via requireRole('PM') — this affordance is advisory.
 */
export function DeleteCardDialog({
  cardId,
  projectName,
  open,
  onOpenChange,
  onDeleted,
  assignmentCount,
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
            {typeof assignmentCount === 'number' ? (
              <>
                This permanently deletes the card, the project, and its{' '}
                {assignmentCount} schedule assignment
                {assignmentCount === 1 ? '' : 's'} (for all pentesters), along
                with all attached comments, notes, and files. This cannot be
                undone.
              </>
            ) : (
              <>
                This permanently deletes the card, the project, and all its
                linked schedule assignments (for all pentesters), along with all
                attached comments, notes, and files. This cannot be undone.
              </>
            )}
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
