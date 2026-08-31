import { useEffect, useRef, useState } from 'react'
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
  Archive,
  Trash2,
} from 'lucide-react'
import type { BoardComment } from '../types'
import { useAuth } from '@/features/auth/hooks'
import {
  useAddComment,
  useBoardCard,
  useBoardMembers,
  useEditComment,
  useMarkCardNotificationsRead,
  useSoftDeleteComment,
  useUpdateCard,
  useUpdateNotes,
} from '../hooks'
import { NotesEditor, NotesPreview } from '@/components/NotesEditor'
import { FilesPanel } from './FilesPanel'
import { ArchiveCardDialog } from './ArchiveCardDialog'
import { DeleteCardDialog } from './DeleteCardDialog'

interface Props {
  cardId: string | null
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
  // Render-time affordance gate stays pure (react-hooks/purity): only the
  // author/deleted checks decide whether to show the edit control. The
  // 10-minute window is enforced against the live clock at interaction time
  // (handleStartEdit / handleSave) so the same edit-window rule still holds.
  const inWindow = isAuthor && !comment.isDeleted
  const isWithinEditWindow = () =>
    Date.now() - new Date(comment.createdAt).getTime() < EDIT_WINDOW_MS

  const authorName =
    comment.authorName ??
    comment.author?.displayName ??
    comment.author?.username ??
    'Unknown'

  const handleStartEdit = () => {
    if (!isWithinEditWindow()) return
    setDraft(comment.body ?? '')
    setEditing(true)
  }

  const handleSave = () => {
    if (!draft.trim() || draft === comment.body) {
      setEditing(false)
      return
    }
    if (!isWithinEditWindow()) {
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
                onClick={handleStartEdit}
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
  // Track each successfully picked mention — preserved across keystrokes.
  // De-duplicated on submit by id. Cleared after a successful post.
  const [mentions, setMentions] = useState<Array<{ id: string; username: string }>>([])
  // Active @-trigger state: when the cursor is inside a `@partial` token,
  // `triggerStart` is the index of the `@` and `query` is everything after it
  // up to the cursor. `null` when no trigger is active.
  const [trigger, setTrigger] = useState<
    { start: number; query: string } | null
  >(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const add = useAddComment()
  const { data: membersData } = useBoardMembers()
  const allMembers = membersData?.users ?? []

  // Filter suggestions: case-insensitive prefix/substring match on username
  // OR displayName, exclude the current user, cap at 5 entries to keep the
  // popover compact.
  const suggestions = trigger
    ? allMembers
        .filter((u) => u.id !== currentUserId)
        .filter((u) => {
          const q = trigger.query.toLowerCase()
          if (q === '') return true
          return (
            u.username.toLowerCase().includes(q) ||
            (u.displayName ?? '').toLowerCase().includes(q)
          )
        })
        .slice(0, 5)
    : []

  // Compute trigger state from the textarea content + cursor position.
  // A trigger is active when the cursor sits immediately after a contiguous
  // `@<word-chars>` sequence with the `@` either at string start or preceded
  // by whitespace.
  const updateTrigger = (value: string, cursor: number) => {
    const before = value.slice(0, cursor)
    const atIdx = before.lastIndexOf('@')
    if (atIdx === -1) {
      setTrigger(null)
      return
    }
    // Reject if `@` is preceded by a non-whitespace char (e.g. email "a@b").
    if (atIdx > 0 && /\S/.test(before[atIdx - 1])) {
      setTrigger(null)
      return
    }
    const partial = before.slice(atIdx + 1)
    // Reject if the partial contains whitespace — trigger ended.
    if (/\s/.test(partial)) {
      setTrigger(null)
      return
    }
    setTrigger({ start: atIdx, query: partial })
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value)
    updateTrigger(e.target.value, e.target.selectionStart ?? e.target.value.length)
  }

  const handleKeyUpOrClick = (
    e: React.SyntheticEvent<HTMLTextAreaElement>,
  ) => {
    const ta = e.currentTarget
    updateTrigger(ta.value, ta.selectionStart ?? ta.value.length)
  }

  const handleSelectSuggestion = (user: {
    id: string
    username: string
    displayName: string | null
  }) => {
    if (!trigger) return
    const before = draft.slice(0, trigger.start)
    const after = draft.slice(trigger.start + 1 + trigger.query.length)
    const inserted = `@${user.username} `
    const next = before + inserted + after
    setDraft(next)
    setMentions((prev) =>
      prev.some((m) => m.id === user.id)
        ? prev
        : [...prev, { id: user.id, username: user.username }],
    )
    setTrigger(null)
    // Restore focus and place cursor after the inserted mention.
    queueMicrotask(() => {
      const ta = textareaRef.current
      if (ta) {
        const pos = before.length + inserted.length
        ta.focus()
        ta.setSelectionRange(pos, pos)
      }
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    // Only include mentions whose `@username` token still appears in the
    // body — if the user deleted the mention text, drop it from the array.
    const liveMentionIds = Array.from(
      new Set(
        mentions
          .filter((m) => new RegExp(`@${m.username}\\b`).test(body))
          .map((m) => m.id),
      ),
    )
    add.mutate(
      { cardId, body, mentions: liveMentionIds },
      {
        onSuccess: () => {
          setDraft('')
          setMentions([])
          setTrigger(null)
        },
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
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleChange}
            onKeyUp={handleKeyUpOrClick}
            onClick={handleKeyUpOrClick}
            placeholder="Add a comment… use @ to mention a teammate"
            className="w-full min-h-[5rem] rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {trigger && suggestions.length > 0 && (
            <ul
              role="listbox"
              aria-label="Mention suggestions"
              className="absolute left-0 right-0 z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-md"
            >
              {suggestions.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      // Prevent textarea blur stealing the click before it lands.
                      e.preventDefault()
                      handleSelectSuggestion(u)
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <span className="font-medium">@{u.username}</span>
                    {u.displayName && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {u.displayName}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={add.isPending || !draft.trim()}>
            {add.isPending ? 'Posting…' : 'Post comment'}
          </Button>
        </div>
      </form>
    </div>
  )
}

export function CardDetailModal({ cardId, open, onOpenChange, onResetAutoMove }: Props) {
  const { user, role } = useAuth()
  const markRead = useMarkCardNotificationsRead()
  const updateCard = useUpdateCard()
  const updateNotes = useUpdateNotes()
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { data } = useBoardCard(cardId ?? '')
  const card = data?.card
  const { data: membersData } = useBoardMembers()
  const allMembers = membersData?.users ?? []

  // Fire mark-read once per open transition so the sidebar dot clears.
  // Stable mutate identity is captured via ref to keep the effect deps tight.
  const markReadMutate = markRead.mutate
  const markReadRef = useRef(markReadMutate)
  // Keep the ref pointed at the latest mutate fn without writing during render.
  useEffect(() => {
    markReadRef.current = markReadMutate
  }, [markReadMutate])
  useEffect(() => {
    if (open && cardId) {
      markReadRef.current({ cardId })
    }
  }, [open, cardId])

  if (!cardId || !card) return null

  // Phase 24-R03: card.project carries the canonical metadata; card.assignments
  // is the list of (pentester, week) commitments that link to this Project.
  const project = card.project
  const assignments = card.assignments
  const earliestWeek = assignments.length
    ? [...assignments].map((a) => a.weekStart).sort()[0]
    : null

  // Group assignments by pentester so a multi-week engagement on the same
  // person renders as one row ("Ricardo · weeks of 18 May, 25 May 2026")
  // rather than one row per week.
  const pentesterGroups = (() => {
    const map = new Map<string, { name: string; weeks: string[] }>()
    for (const a of assignments) {
      const name =
        a.teamMember?.displayName ??
        a.teamMember?.user?.displayName ??
        a.teamMember?.user?.username ??
        'Unknown'
      const existing = map.get(a.teamMemberId)
      if (existing) {
        existing.weeks.push(a.weekStart)
      } else {
        map.set(a.teamMemberId, { name, weeks: [a.weekStart] })
      }
    }
    return Array.from(map.entries()).map(([teamMemberId, g]) => ({
      teamMemberId,
      name: g.name,
      weeks: [...g.weeks].sort(),
    }))
  })()

  // Resolve a User.id to a display name using the same alias > displayName >
  // username precedence as the rest of the planner (see commit 6797b19).
  // Prefers a per-card pentester alias when the editor is on the card; falls
  // back to the global member list for PM/Admin editors who aren't assigned.
  const resolveEditorName = (userId: string | null): string | null => {
    if (!userId) return null
    for (const a of assignments) {
      if (a.teamMember?.userId === userId) {
        return (
          a.teamMember.displayName ??
          a.teamMember.user?.displayName ??
          a.teamMember.user?.username ??
          null
        )
      }
    }
    const m = allMembers.find((u) => u.id === userId)
    if (m) return m.displayName ?? m.username
    return null
  }
  const notesUpdatedByName = resolveEditorName(card.notesUpdatedBy)
  const checkedCount = card.checklist.filter((item) => item.checked).length
  const totalCount = card.checklist.length
  const isManuallyPlaced = card.stageLockedBy !== null && card.stageLockedBy !== 'auto'
  const canDelete = role === 'ADMIN' || role === 'PM'
  const canArchive = role === 'ADMIN' && !card.archivedAt
  const filesTotalBytes = (card.files ?? []).reduce(
    (sum, f) => sum + f.sizeBytes,
    0,
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Color accent bar */}
        <div
          className="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
          style={{ backgroundColor: project.color }}
        />

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8">
            <span className="flex-1">
              {project.client?.name || project.name || '(No project)'}
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
          {/* The project name follows the client in the header, mirroring the
              Planner card's row order. Rendered only when the client supplied
              the title — a clientless project already reads as the title. */}
          {project.client?.name && (
            <p className="text-sm font-bold leading-tight pr-8">
              {project.name || '(No project)'}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-6">
          {/* Status + Stage */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary">{stageLabel(card.stage)}</Badge>
            {project.status && (
              <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {project.status}
              </span>
            )}
            {card.archivedAt && (
              <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">
                archived
              </span>
            )}
          </div>

          {/* Tags row — the client name now leads the header instead. */}
          {project.tags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
              {project.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Pentesters — one row per distinct pentester, weeks listed. */}
          {pentesterGroups.length > 0 && (
            <div className="flex items-start gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-muted-foreground mb-1">
                  Pentester{pentesterGroups.length > 1 ? 's' : ''}:
                </p>
                <ul className="space-y-0.5">
                  {pentesterGroups.map((g) => (
                    <li key={g.teamMemberId} className="flex items-center gap-2">
                      <span>{g.name}</span>
                      <span className="text-xs text-muted-foreground">
                        · week{g.weeks.length > 1 ? 's' : ''} of{' '}
                        {g.weeks.map(formatDate).join(', ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Earliest week (legacy "Week start" line — keep for quick reference) */}
          {earliestWeek && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Starts:</span>
              <span>{formatDate(earliestWeek)}</span>
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
                  .map((item) => (
                    <li key={item.order}>
                      <button
                        type="button"
                        onClick={() => {
                          const next = card.checklist.map((it) =>
                            it.order === item.order ? { ...it, checked: !it.checked } : it,
                          )
                          updateCard.mutate({ id: card.id, data: { checklist: next } })
                        }}
                        disabled={updateCard.isPending}
                        className="flex w-full items-center gap-2 rounded text-left text-sm hover:bg-accent/50 px-1 py-0.5 disabled:opacity-60"
                      >
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
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* Client Notes (read-only) — Phase 03-01. Surfaced from the widened
              card->project->client select, rendered through the single shared
              NotesPreview markdown path. Read-only for every role including
              ADMIN: no editor, no tabs, no save. The single guard covers both
              the null-client case (project.client?.notes short-circuits) and
              the empty/whitespace-notes case (''.trim() is falsy) — nothing,
              not even the heading, renders in either case. */}
          {project.client?.notes?.trim() && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>Client Notes</span>
              </div>
              <NotesPreview content={project.client.notes} />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span>Notes</span>
            </div>
            <NotesEditor
              initialNotes={card.notes ?? ''}
              notesUpdatedAt={card.notesUpdatedAt}
              notesUpdatedBy={notesUpdatedByName}
              resetKey={card.id}
              isSaving={updateNotes.isPending}
              onSave={(notes) => updateNotes.mutateAsync({ cardId: card.id, notes })}
              previewFirst
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
          {canArchive && (
            <Button
              variant="destructive"
              onClick={() => setArchiveOpen(true)}
              className="mr-auto"
            >
              <Archive className="h-4 w-4 mr-1" />
              Archive card
            </Button>
          )}
          {canDelete && (
            <Button
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              className={canArchive ? undefined : 'mr-auto'}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete card
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>

      {canArchive && (
        <ArchiveCardDialog
          cardId={card.id}
          fileCount={(card.files ?? []).length}
          totalBytes={filesTotalBytes}
          open={archiveOpen}
          onOpenChange={setArchiveOpen}
          onArchived={() => onOpenChange(false)}
        />
      )}

      {canDelete && (
        <DeleteCardDialog
          cardId={card.id}
          projectName={project.name || '(No project)'}
          assignmentCount={assignments.length}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  )
}
