import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { BoardCard } from '../../types'

/**
 * Phase 03-01: read-only Client Notes on the card detail modal.
 *
 * CardDetailModal has heavy hook coupling (useBoardCard, useBoardMembers,
 * useUpdateCard/Notes, comment + file mutations) plus useAuth for role. We
 * follow DeleteCardDialog.test.tsx's convention: mock the hooks module
 * wholesale so the modal never touches react-query / the network, and drive
 * the card + role through a vi.hoisted() holder the mock factories read.
 *
 * The four required rendering cases:
 *  (a) client.notes non-empty + non-empty card.notes -> both render, and the
 *      client-notes section precedes the project "Notes" heading.
 *  (b) project.client = null -> no client-notes section (no heading).
 *  (c) client.notes = '' -> no client-notes section (no heading).
 *  (d) role ADMIN with client.notes set -> the client-notes subtree has NO
 *      edit affordance (no textarea, no Edit/Preview tab, no Save button).
 */

const h = vi.hoisted(() => ({
  card: null as BoardCard | null,
  role: 'NORMAL' as string,
  user: { id: 'user-1', username: 'tester' } as { id: string; username: string },
}))

vi.mock('../../hooks', () => {
  const mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
  return {
    useBoardCard: () => ({ data: h.card ? { card: h.card } : undefined }),
    useBoardMembers: () => ({ data: { users: [] } }),
    useUpdateCard: () => mutation,
    useUpdateNotes: () => mutation,
    useMarkCardNotificationsRead: () => mutation,
    useAddComment: () => mutation,
    useEditComment: () => mutation,
    useSoftDeleteComment: () => mutation,
    useUploadFile: () => mutation,
    useDownloadFile: () => mutation,
    useDeleteFile: () => mutation,
    // ADMIN/PM render the Archive + Delete dialogs, which use these.
    useArchiveCard: () => mutation,
    useDeleteCard: () => mutation,
  }
})

vi.mock('@/features/auth/hooks', () => ({
  useAuth: () => ({
    user: h.user,
    role: h.role,
    isLoading: false,
    isAuthenticated: true,
    hasRole: () => false,
    refetch: vi.fn(),
    error: null,
  }),
}))

import { CardDetailModal } from '../CardDetailModal'

type ClientOverride = BoardCard['project']['client']

function makeCard(opts: {
  clientNotes?: string
  cardNotes?: string
  noClient?: boolean
} = {}): BoardCard {
  const { clientNotes = '', cardNotes = '', noClient = false } = opts
  const client: ClientOverride = noClient
    ? null
    : {
        id: 'client-1',
        name: 'Acme Corp',
        color: '#3366ff',
        notes: clientNotes,
        notesUpdatedAt: null,
        notesUpdatedBy: null,
      }
  return {
    id: 'card-1',
    stage: 'execution',
    checklist: [],
    notes: cardNotes,
    notesUpdatedAt: null,
    notesUpdatedBy: null,
    stageLockedBy: null,
    archivedAt: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    project: {
      id: 'proj-1',
      name: 'Acme Pentest',
      clientId: noClient ? null : 'client-1',
      tags: [],
      color: '#3366ff',
      status: 'confirmed',
      client,
    },
    assignments: [],
    comments: [],
    files: [],
  }
}

function renderModal() {
  return render(
    <CardDetailModal cardId="card-1" open onOpenChange={vi.fn()} />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  h.card = null
  h.role = 'NORMAL'
})

describe('CardDetailModal — read-only client notes (Phase 03-01)', () => {
  it('(a) renders client notes above the project notes when both are present', () => {
    h.card = makeCard({
      clientNotes: 'Client is VIP, handle with care',
      cardNotes: 'Project note body',
    })
    renderModal()

    // The client notes markdown text renders.
    expect(screen.getByText('Client is VIP, handle with care')).toBeInTheDocument()
    // The card's own notes still render in the editor textarea.
    expect(screen.getByDisplayValue('Project note body')).toBeInTheDocument()

    // The Client Notes section precedes the project "Notes" heading in the DOM.
    const clientHeading = screen.getByText('Client Notes')
    const projectHeading = screen.getByText('Notes')
    expect(
      clientHeading.compareDocumentPosition(projectHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('(b) renders no client-notes section when the project has no client', () => {
    h.card = makeCard({ noClient: true, cardNotes: 'Project note body' })
    renderModal()

    expect(screen.queryByText(/client notes/i)).toBeNull()
    // The project notes editor still renders.
    expect(screen.getByDisplayValue('Project note body')).toBeInTheDocument()
  })

  it('(c) renders no client-notes section when the client notes are empty', () => {
    h.card = makeCard({ clientNotes: '', cardNotes: 'Project note body' })
    renderModal()

    expect(screen.queryByText(/client notes/i)).toBeNull()
  })

  it('(d) exposes no edit affordance in the client-notes subtree, even for ADMIN', () => {
    h.role = 'ADMIN'
    h.card = makeCard({
      clientNotes: '**Important** — read only',
      cardNotes: 'Project note body',
    })
    renderModal()

    const clientHeading = screen.getByText('Client Notes')
    const section = clientHeading.closest('.space-y-2') as HTMLElement
    expect(section).not.toBeNull()

    // Read-only: no textarea, no tabs (Edit/Preview), no Save/Cancel button
    // anywhere inside the client-notes section subtree.
    expect(section.querySelector('textarea')).toBeNull()
    expect(section.querySelector('button')).toBeNull()
    expect(section.querySelector('[role="tab"]')).toBeNull()
    // Sanity: the markdown emphasis did render (proving the section is present).
    expect(section.querySelector('strong')?.textContent).toBe('Important')
  })
})
