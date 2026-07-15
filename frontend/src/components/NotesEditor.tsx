import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import type { Options as Schema } from 'rehype-sanitize'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface NotesEditorProps {
  initialNotes: string
  notesUpdatedAt: string | null
  notesUpdatedBy: string | null
  onSave: (notes: string) => Promise<unknown> | void
  isSaving: boolean
  resetKey?: string
  /**
   * When true, the TabsList renders the Preview trigger before Edit and the
   * editor opens on the Preview tab. Default `false` preserves today's
   * Edit-first / Edit-default behavior (used by the client-notes editor).
   */
  previewFirst?: boolean
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

/**
 * The single read-only markdown render path (Phase 03-01). Owns the hardened
 * `rehypeSanitize`/`SANITIZE_SCHEMA` plumbing so there is exactly one place
 * markdown is rendered — the NotesEditor's own Preview tab delegates here, and
 * the planner card's read-only "Client Notes" section reuses it. `SANITIZE_SCHEMA`
 * stays module-private; only this component is exported.
 *
 * `className` layers extra chrome onto the base prose wrapper: the editor's
 * Preview tab passes the bordered field styling so its DOM stays byte-identical
 * to the pre-extraction markup; read-only callers omit it for a lighter look.
 */
export function NotesPreview({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  const rehypePlugins = useMemo(() => [[rehypeSanitize, SANITIZE_SCHEMA]] as const, [])
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none', className)}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <ReactMarkdown rehypePlugins={rehypePlugins as any}>
        {content || '*No notes yet.*'}
      </ReactMarkdown>
    </div>
  )
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
  initialNotes,
  notesUpdatedAt,
  notesUpdatedBy,
  onSave,
  isSaving,
  resetKey,
  previewFirst = false,
}: NotesEditorProps) {
  const [tab, setTab] = useState<'edit' | 'preview'>(previewFirst ? 'preview' : 'edit')
  const [draft, setDraft] = useState(initialNotes)

  // Reset the draft whenever the entity identity or persisted notes shift.
  useEffect(() => {
    setDraft(initialNotes)
  }, [resetKey, initialNotes])

  const dirty = draft !== initialNotes

  const handleSave = async () => {
    if (!dirty || isSaving) return
    try {
      await onSave(draft)
      setTab('preview')
    } catch {
      // caller's mutation surfaces its own error; stay on Edit
    }
  }

  return (
    <div className="space-y-2">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'edit' | 'preview')}>
        <TabsList>
          {previewFirst ? (
            <>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="edit">Edit</TabsTrigger>
            </>
          ) : (
            <>
              <TabsTrigger value="edit">Edit</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </>
          )}
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
          <NotesPreview
            content={draft}
            className="rounded-md border border-input bg-background p-3 min-h-[24rem]"
          />
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
            disabled={!dirty || isSaving}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || isSaving}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}
