import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Pin,
  CheckSquare,
  Square,
  Calendar,
  User,
  FileText,
  Pencil,
  MessageSquare,
} from 'lucide-react'
import type { BoardCard, BoardComment } from '../types'
import { useAuth } from '@/features/auth/hooks'
import {
  useAddComment,
  useEditComment,
  useSoftDeleteComment,
} from '../hooks'
import { NotesEditor } from './NotesEditor'
import { FilesPanel } from './FilesPanel'

interface Props {
  card: BoardCard | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onResetAutoMove?: (cardId: string) => void
}

const EDIT_WINDOW_MS = 10 * 60 * 1000

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return formatDate(iso)
}

function stageLabel(stage: string): string {
  return stage.charAt(0).toUpperCase() + stage.slice(1)
}

function CommentRow({
  cardId,
  comment,
  currentUserId,
}: {
  cardId: string
  comment: BoardComment
  currentUserId: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body ?? '')
  const editComment = useEditComment()
  const softDelete = useSoftDeleteComment()

  const isAuthor = !!currentUserId && comment.authorId === currentUserId
  const inWindow =
    isAuthor &&
    !comment.isDeleted &&
    Date.now() - new Date(comment.createdAt).getTime() < EDIT_WINDOW_MS

  const authorName =
    comment.authorName ??
    comment.author?.displayName ??
    comment.author?.username ??
    'Unknown'

  const handleSave = () => {
    if (!draft.trim() || draft === comment.body) {
      setEditing(false)
      return
    }
    editComment.mutate(
      { cardId, commentId: comment.id, body: draft },
      { onSuccess: () => setEditing(false) },
    )
  }

  const handleDelete = () => {
    if (!confirm('Delete this comment? It will be replaced by a [deleted] placeholder.')) return
    softDelete.mutate({ cardId, commentId: comment.id })
  }

  return (
    <div className="rounded-md border border-border p-2 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{authorName}</span>{' '}
          · {formatRelative(comment.createdAt)}
          {comment.editedAt && !comment.isDeleted && (
            <span className="italic"> (edited)</span>
          )}
        </div>
        {!editing && !comment.isDeleted && isAuthor && (
          <div className="flex items-center gap-1">
            {inWindow && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(comment.body ?? '')
                  setEditing(true)
                }}
                aria-label="Edit comment"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={softDelete.isPending}
              aria-label="Delete comment"
            >
              ×
            </Button>
          </div>
        )}
      </div>

      {comment.isDeleted ? (
        <p className="italic text-muted-foreground mt-1">[deleted]</p>
      ) : editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full min-h-[6rem] rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={editComment.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={editComment.isPending || !draft.trim()}
            >
              {editComment.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
      )}
    </div>
  )
}

function CommentSection({
  cardId,
  comments,
  currentUserId,
}: {
  cardId: string
  comments: BoardComment[]
  currentUserId: string | null
}) {
  const [draft, setDraft] = useState('')
  const add = useAddComment()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    add.mutate(
      { cardId, body },
      {
        onSuccess: () => setDraft(''),
      },
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <span>Comments ({comments.filter((c) => !c.isDeleted).length})</span>
      </div>
      {comments.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No comments yet.</p>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              cardId={cardId}
              comment={c}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment…"
          className="w-full min-h-[5rem] rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={add.isPending || !draft.trim()}>
            {add.isPending ? 'Posting…' : 'Post comment'}
          </Button>
        </div>
      </form>
    </div>
  )
}

export function CardDetailModal({ card, open, onOpenChange, onResetAutoMove }: Props) {
  const { user, role } = useAuth()

  if (!card) return null

  const assignment = card.assignment
  const checkedCount = card.checklist.filter((item) => item.checked).length
  const totalCount = card.checklist.length
  const isManuallyPlaced = card.stageLockedBy !== null && card.stageLockedBy !== 'auto'
  const canDelete = role === 'ADMIN' || role === 'PM'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Color accent bar */}
        {assignment?.projectColor && (
          <div
            className="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
            style={{ backgroundColor: assignment.projectColor }}
          />
        )}

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex-1">
              {assignment?.projectName ?? '(No project)'}
            </span>
            {isManuallyPlaced && onResetAutoMove && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onResetAutoMove(card.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pin className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  Manually placed — click to re-enable auto-move
                </TooltipContent>
              </Tooltip>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status + Stage */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary">{stageLabel(card.stage)}</Badge>
            {assignment?.status && (
              <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {assignment.status}
              </span>
            )}
            {card.archivedAt && (
              <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">
                archived
              </span>
            )}
          </div>

          {/* Pentester */}
          {assignment?.teamMemberId && (
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Pentester:</span>
              <span>{assignment.teamMemberId}</span>
            </div>
          )}

          {/* Dates */}
          {assignment?.weekStart && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Week start:</span>
              <span>{formatDate(assignment.weekStart)}</span>
            </div>
          )}

          {/* Checklist */}
          {totalCount > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckSquare className="h-4 w-4 text-muted-foreground" />
                <span>
                  Checklist ({checkedCount}/{totalCount})
                </span>
              </div>
              <ul className="space-y-1 pl-6">
                {card.checklist
                  .sort((a, b) => a.order - b.order)
                  .map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      {item.checked ? (
                        <CheckSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                      ) : (
                        <Square className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span
                        className={item.checked ? 'line-through text-muted-foreground' : ''}
                      >
                        {item.label}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span>Notes</span>
            </div>
            <NotesEditor
              cardId={card.id}
              initialNotes={card.notes ?? ''}
              notesUpdatedAt={card.notesUpdatedAt}
              notesUpdatedBy={card.notesUpdatedBy}
            />
          </div>

          {/* Files */}
          <FilesPanel cardId={card.id} files={card.files ?? []} canDelete={canDelete} />

          {/* Comments */}
          <CommentSection
            cardId={card.id}
            comments={card.comments ?? []}
            currentUserId={user?.id ?? null}
          />

          {/* Manual override indicator */}
          {isManuallyPlaced && (
            <p className="text-xs text-muted-foreground italic">
              This card was manually placed and will not be auto-moved.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
