import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import {
  AlertDialog,
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
import { toast } from 'sonner'
import { usePurgeSchedule } from '../hooks'

export function PurgeScheduleDialog() {
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const purge = usePurgeSchedule()

  const handlePurge = () => {
    if (confirmation !== 'DELETE') return

    purge.mutate(undefined, {
      onSuccess: (data) => {
        const { assignments, absences, projectColors } = data.deleted
        toast.success(
          `Schedule purged: ${assignments} assignments, ${absences} absences, ${projectColors} project colors removed`
        )
        setOpen(false)
        setConfirmation('')
      },
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirmation('') }}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Schedule
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Entire Schedule</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              This will permanently delete <strong>all assignments</strong>, <strong>all absences</strong>,
              and <strong>all project colors</strong>. Team members and clients will not be affected.
            </span>
            <span className="block font-semibold text-destructive">
              This action cannot be undone.
            </span>
            <span className="block mt-4">
              Type <strong>DELETE</strong> to confirm:
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder="Type DELETE to confirm"
          className="font-mono"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handlePurge}
            disabled={confirmation !== 'DELETE' || purge.isPending}
          >
            {purge.isPending ? 'Deleting...' : 'Delete Everything'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
