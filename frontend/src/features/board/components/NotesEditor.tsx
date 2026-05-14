import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import type { Options as Schema } from 'rehype-sanitize'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { useUpdateNotes } from '../hooks'

interface NotesEditorProps {
  cardId: string
  initialNotes: string
  notesUpdatedAt: string | null
  notesUpdatedBy: string | null
}

/**
 * Hardened sanitize schema for the notes preview tab. Starts from
 * `rehype-sanitize`'s `defaultSchema` (already drops <script>, <iframe>,
 * inline event handlers, and javascript: hrefs) and removes those tag
 * names defensively in case upstream defaults relax. Inline event
 * attributes (`on*`) are not in defaultSchema's allow-list to begin with
 * so they are dropped automatically.
 */
const SANITIZE_SCHEMA: Schema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter(
    (tag) => tag !== 'script' && tag !== 'iframe' && tag !== 'object' && tag !== 'embed',
  ),
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function NotesEditor({
  cardId,
  initialNotes,
  notesUpdatedAt,
  notesUpdatedBy,
}: NotesEditorProps) {
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [draft, setDraft] = useState(initialNotes)
  const update = useUpdateNotes()

  // Reset the draft whenever the card identity or persisted notes shift.
  useEffect(() => {
    setDraft(initialNotes)
  }, [cardId, initialNotes])

  const dirty = draft !== initialNotes
  const rehypePlugins = useMemo(() => [[rehypeSanitize, SANITIZE_SCHEMA]] as const, [])

  const handleSave = () => {
    if (!dirty || update.isPending) return
    update.mutate(
      { cardId, notes: draft },
      {
        onSuccess: () => setTab('preview'),
      },
    )
  }

  return (
    <div className="space-y-2">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'edit' | 'preview')}>
        <TabsList>
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="edit">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write notes in markdown — long form is fine."
            className="w-full min-h-[24rem] rounded-md border border-input bg-background p-3 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </TabsContent>
        <TabsContent value="preview">
          <div className="prose prose-sm max-w-none rounded-md border border-input bg-background p-3 min-h-[24rem]">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <ReactMarkdown rehypePlugins={rehypePlugins as any}>
              {draft || '*No notes yet.*'}
            </ReactMarkdown>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {notesUpdatedAt ? (
            <>
              Last edited{notesUpdatedBy ? ` by ${notesUpdatedBy}` : ''}{' '}
              {relativeTime(notesUpdatedAt)}
            </>
          ) : (
            <>No edits yet.</>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDraft(initialNotes)}
            disabled={!dirty || update.isPending}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
