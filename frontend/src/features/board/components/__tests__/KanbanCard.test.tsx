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

describe('KanbanCard pentester avatars', () => {
  it('(a) renders one avatar per distinct pentester and no comma-joined name string', () => {
    const { container } = renderCard(
      makeCard([
        makeAssignment('tm-alice', { name: 'Alice', avatarUrl: '/uploads/avatars/alice.png' }),
        makeAssignment('tm-bob', { name: 'Bob', avatarUrl: '/uploads/avatars/bob.png' }),
      ]),
    )

    const titles = avatarTitles(container)
    expect(titles).toHaveLength(2)
    expect(titles).toEqual(expect.arrayContaining(['Alice', 'Bob']))

    // The old comma-joined name text must be gone.
    expect(screen.queryByText('Alice, Bob')).toBeNull()
    expect(screen.queryByText('Bob, Alice')).toBeNull()

    // Names remain accessible via the avatar title attribute.
    expect(container.querySelector('[data-slot="avatar"][title="Alice"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="avatar"][title="Bob"]')).not.toBeNull()
  })

  it('(b) renders an initials fallback when avatarUrl is null (backlog member)', async () => {
    const { container } = renderCard(
      makeCard([makeAssignment('tm-futuro', { name: 'Futuro 1', backlog: true })]),
    )

    // One avatar, name preserved in title.
    expect(avatarTitles(container)).toEqual(['Futuro 1'])

    // Radix AvatarFallback renders the uppercased first initial. In jsdom the
    // image never "loads", so the fallback is the rendered branch.
    expect(await screen.findByText('F')).toBeInTheDocument()
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
