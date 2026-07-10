import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { NotesEditor } from '@/components/NotesEditor'
import { useClientNotes, useUpdateClientNotes } from '../hooks'
// Cross-feature reuse: the board members hook backs GET /api/board/members,
// a generic (requireAuth-only) user directory — not board-specific data — so
// a PM on this schedule surface may call it to resolve a notes editor's
// User.id to a display name. Intentional, mirrors CardDetailModal's
// resolveEditorName precedent (name + colour only; no raw ids shown).
import { useBoardMembers } from '@/features/board/hooks'
import type { Client } from '../types'

interface ClientNotesModalProps {
  clientId: string | null
  /** The selected client (name + colour) from the page's loaded useClients list. */
  client: Pick<Client, 'id' | 'name' | 'color'> | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ClientNotesModal({ clientId, client, open, onOpenChange }: ClientNotesModalProps) {
  // Only fetch once a client is selected (hook is `enabled: !!id`).
  const { data: notesData, isLoading } = useClientNotes(clientId)
  const updateClientNotes = useUpdateClientNotes()

  const { data: membersData } = useBoardMembers()
  const allMembers = membersData?.users ?? []

  // Resolve the raw editor User.id to a display name (displayName ?? username),
  // or null when the editor is unknown/deactivated — NotesEditor then omits the
  // "by X" clause. Never surface a raw id.
  const resolvedName = ((): string | null => {
    const editorId = notesData?.notesUpdatedBy ?? null
    if (!editorId) return null
    const m = allMembers.find((u) => u.id === editorId)
    if (m) return m.displayName ?? m.username
    return null
  })()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {client && (
              <span
                className="w-5 h-5 rounded-full border border-border shrink-0"
                style={{ backgroundColor: client.color }}
                aria-hidden
              />
            )}
            <span>{client?.name ?? 'Client Notes'}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Seed the editor only once notes have loaded so the draft isn't
            initialized from '' and then jumped when the fetch resolves. */}
        {clientId && isLoading ? (
          <div className="min-h-[24rem] flex items-center justify-center text-sm text-muted-foreground">
            Loading notes…
          </div>
        ) : clientId ? (
          <NotesEditor
            initialNotes={notesData?.notes ?? ''}
            notesUpdatedAt={notesData?.notesUpdatedAt ?? null}
            notesUpdatedBy={resolvedName}
            resetKey={clientId}
            isSaving={updateClientNotes.isPending}
            onSave={(notes) => updateClientNotes.mutateAsync({ id: clientId, notes })}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
