import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { KanbanCard } from '../KanbanCard'
import type { BoardCard, BoardCardAssignment, ChecklistItem } from '../../types'

/**
 * Build a single assignment. `id` is the teamMemberId (drives dedupe);
 * pass distinct ids for distinct pentesters, the same id to test dedupe.
 */
function makeAssignment(
  id: string,
  opts: { name?: string; avatarUrl?: string | null; backlog?: boolean } = {},
): BoardCardAssignment {
  const { name = id, avatarUrl = null, backlog = false } = opts
  return {
    assignmentId: `asg-${id}-${Math.random().toString(36).slice(2)}`,
    teamMemberId: id,
    weekStart: '2026-06-01',
    side: 'primary',
    teamMember: backlog
      ? { userId: null, displayName: name, user: null }
      : {
          userId: `user-${id}`,
          displayName: name,
          user: { displayName: name, username: name.toLowerCase(), avatarUrl },
        },
  }
}

const CHECKLIST: ChecklistItem[] = []

function makeCard(
  assignments: BoardCardAssignment[],
  projectOverrides: Partial<BoardCard['project']> = {},
): BoardCard {
  return {
    id: 'card-1',
    stage: 'execution',
    checklist: CHECKLIST,
    notes: '',
    notesUpdatedAt: null,
    notesUpdatedBy: null,
    stageLockedBy: null,
    archivedAt: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    project: {
      id: 'proj-1',
      name: 'Acme Pentest',
      clientId: 'client-1',
      tags: [],
      color: '#3366ff',
      status: 'confirmed',
      client: { id: 'client-1', name: 'Acme Corp', color: '#3366ff' },
      ...projectOverrides,
    },
    assignments,
  }
}

/** Render inside a DndContext so useDraggable mounts cleanly. */
function renderCard(card: BoardCard) {
  return render(
    <DndContext>
      <KanbanCard card={card} />
    </DndContext>,
  )
}

/** Avatar roots carry the pentester name in a title attribute. */
function avatarTitles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-slot="avatar"]')).map(
    (el) => el.getAttribute('title') ?? '',
  )
}

/** Read the inline backgroundColor each AvatarFallback carries (Phase 07). */
function fallbackBgColors(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-slot="avatar-fallback"]')).map(
    (el) => (el as HTMLElement).style.backgroundColor,
  )
}

describe('KanbanCard pentester avatars', () => {
  it('(a) renders one avatar per distinct pentester with no comma-joined name and no <img> (Phase 07)', () => {
    const { container } = renderCard(
      makeCard([
        // avatarUrl is set but Phase 07 drops the photo entirely.
        makeAssignment('tm-ana', { name: 'Ana Sousa', avatarUrl: '/uploads/avatars/ana.png' }),
        makeAssignment('tm-bob', { name: 'Bob Lee', avatarUrl: '/uploads/avatars/bob.png' }),
      ]),
    )

    const titles = avatarTitles(container)
    expect(titles).toHaveLength(2)
    expect(titles).toEqual(expect.arrayContaining(['Ana Sousa', 'Bob Lee']))

    // The old comma-joined name text must be gone.
    expect(screen.queryByText('Ana Sousa, Bob Lee')).toBeNull()

    // Names remain accessible via the avatar title attribute.
    expect(container.querySelector('[data-slot="avatar"][title="Ana Sousa"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="avatar"][title="Bob Lee"]')).not.toBeNull()

    // Phase 07: board cards never render a photo, even when avatarUrl is set.
    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })

  it('(b) renders a two-initial monogram (first + last initial, uppercase)', async () => {
    const { container } = renderCard(
      makeCard([makeAssignment('tm-ana', { name: 'Ana Sousa' })]),
    )

    // One avatar, name preserved in title.
    expect(avatarTitles(container)).toEqual(['Ana Sousa'])

    // 'Ana Sousa' -> 'AS' (first initial of first + last token, uppercased).
    expect(await screen.findByText('AS')).toBeInTheDocument()
  })

  it('(b2) renders a single initial for a mononym / username with no spaces', async () => {
    // displayName-less backlog member falls back to lowercase username 'alice'.
    const { container } = renderCard(
      makeCard([
        makeAssignment('tm-alice', { name: 'Alice' }),
        makeAssignment('tm-mono', { name: 'asousa', backlog: false }),
      ]),
    )

    expect(avatarTitles(container)).toHaveLength(2)
    // 'Alice' -> 'A'; mononym 'asousa' -> 'A' (single token, uppercased).
    expect(await screen.findAllByText('A')).toHaveLength(2)
  })

  it('(b3) degrades to "?" for a missing/whitespace-only name without crashing', async () => {
    const blank: BoardCardAssignment = {
      assignmentId: 'asg-blank',
      teamMemberId: 'tm-blank',
      weekStart: '2026-06-01',
      side: 'primary',
      teamMember: { userId: null, displayName: '   ', user: null },
    }
    renderCard(makeCard([blank]))

    expect(await screen.findByText('?')).toBeInTheDocument()
  })

  it('(b4) derives the background colour deterministically from the teamMemberId', () => {
    // Same id rendered in two separate cards -> identical backgroundColor.
    const first = renderCard(makeCard([makeAssignment('tm-deterministic', { name: 'Dee Term' })]))
    const colorA = fallbackBgColors(first.container)
    expect(colorA).toHaveLength(1)
    expect(colorA[0]).toBeTruthy()

    const second = renderCard(makeCard([makeAssignment('tm-deterministic', { name: 'Dee Term' })]))
    const colorB = fallbackBgColors(second.container)
    expect(colorB[0]).toBe(colorA[0])

    // A different id is free to differ; the SAME id is stable across renders.
    const third = renderCard(makeCard([makeAssignment('tm-other-account', { name: 'Oth Er' })]))
    const colorC = fallbackBgColors(third.container)
    expect(colorC[0]).toBeTruthy()

    // Re-rendering the SAME other id again still yields the same colour.
    const fourth = renderCard(makeCard([makeAssignment('tm-other-account', { name: 'Oth Er' })]))
    expect(fallbackBgColors(fourth.container)[0]).toBe(colorC[0])
  })

  it('(c) dedupes by teamMemberId — two assignments for one pentester render one avatar', () => {
    const { container } = renderCard(
      makeCard([
        makeAssignment('tm-alice', { name: 'Alice', avatarUrl: '/uploads/avatars/alice.png' }),
        // Same teamMemberId (primary + split on the same card) -> one avatar.
        { ...makeAssignment('tm-alice', { name: 'Alice' }), side: 'secondary' },
      ]),
    )

    expect(avatarTitles(container)).toEqual(['Alice'])
  })

  it('(d) renders no avatar group when there are zero assignments', () => {
    const { container } = renderCard(makeCard([]))

    expect(container.querySelector('[data-slot="avatar-group"]')).toBeNull()
    expect(container.querySelectorAll('[data-slot="avatar"]')).toHaveLength(0)
    // Client name (text) still renders.
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  it('(e) caps at 3 avatars and shows a "+N" overflow for more than 3 pentesters', () => {
    const { container } = renderCard(
      makeCard([
        makeAssignment('tm-1', { name: 'One' }),
        makeAssignment('tm-2', { name: 'Two' }),
        makeAssignment('tm-3', { name: 'Three' }),
        makeAssignment('tm-4', { name: 'Four' }),
        makeAssignment('tm-5', { name: 'Five' }),
      ]),
    )

    // Exactly 3 visible avatars + a "+2" overflow node.
    expect(container.querySelectorAll('[data-slot="avatar"]')).toHaveLength(3)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })
})

/**
 * Phase 05-01: the custom memo comparator must NOT block a re-render when
 * project.status changes (the Bug 1 status-sync path). With status added to the
 * comparator, re-rendering the same card id with a new status updates the badge.
 */
describe('KanbanCard memo re-render on project change', () => {
  it('re-renders the status badge when project.status changes', () => {
    const { rerender } = render(
      <DndContext>
        <KanbanCard card={makeCard([], { status: 'confirmed' })} />
      </DndContext>,
    )

    // StatusBadge label for 'confirmed' (status.charAt(0).toUpperCase() + ...).
    expect(screen.getByText('Confirmed')).toBeInTheDocument()

    // Same card id, new status — comparator must return false so the card
    // re-renders. A stale comparator would keep showing "Confirmed".
    rerender(
      <DndContext>
        <KanbanCard card={makeCard([], { status: 'placeholder' })} />
      </DndContext>,
    )

    expect(screen.getByText('Placeholder')).toBeInTheDocument()
    expect(screen.queryByText('Confirmed')).toBeNull()
  })
})
