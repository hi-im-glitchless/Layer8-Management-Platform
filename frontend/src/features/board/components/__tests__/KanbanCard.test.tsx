import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { KanbanCard } from '../KanbanCard'
import type { BoardCard, BoardCardAssignment, ChecklistItem } from '../../types'

/**
 * Build a single assignment. `id` is the teamMemberId (drives dedupe);
 * pass distinct ids for distinct pentesters, the same id to test dedupe.
 *
 * By default the TeamMember alias (teamMember.displayName) and the linked
 * user.displayName are both `name`. To exercise the Phase-08 precedence flip,
 * pass an explicit `alias` so the editable alias diverges from the account's
 * full user.displayName (which stays `name`).
 */
function makeAssignment(
  id: string,
  opts: { name?: string; alias?: string; avatarUrl?: string | null; backlog?: boolean } = {},
): BoardCardAssignment {
  const { name = id, alias, avatarUrl = null, backlog = false } = opts
  return {
    assignmentId: `asg-${id}-${Math.random().toString(36).slice(2)}`,
    teamMemberId: id,
    weekStart: '2026-06-01',
    side: 'primary',
    teamMember: backlog
      ? { userId: null, displayName: alias ?? name, user: null }
      : {
          userId: `user-${id}`,
          displayName: alias ?? name,
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
      client: {
        id: 'client-1',
        name: 'Acme Corp',
        color: '#3366ff',
        notes: '',
        notesUpdatedAt: null,
        notesUpdatedBy: null,
      },
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

/**
 * Grab the Row-2 client-name <p> by its text (Phase 10). The client name is
 * rendered as a bold, inline-coloured <p>; mirror fallbackBgColors by reading
 * its inline `.style.color` and className for the weight assertion.
 */
function clientNameEl(name: string): HTMLElement {
  return screen.getByText(name)
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

  it('(b1) Phase 08: linked user.displayName beats a single-word alias -> two initials + full-name hover', async () => {
    // Production bug: alias holds only the first name ('Rui') while the linked
    // account's user.displayName is the full 'Rui Marques'. The alias must NOT
    // shadow the full name — the avatar should render 'RM', not 'R', and the
    // hover/title must be 'Rui Marques', not 'Rui'.
    const { container } = renderCard(
      makeCard([makeAssignment('tm-rui', { name: 'Rui Marques', alias: 'Rui' })]),
    )

    // One avatar; full account name (not the alias) in the title.
    expect(avatarTitles(container)).toEqual(['Rui Marques'])
    expect(container.querySelector('[data-slot="avatar"][title="Rui"]')).toBeNull()

    // Two-initial monogram from the full name, NOT the single-letter alias.
    expect(await screen.findByText('RM')).toBeInTheDocument()
    expect(screen.queryByText('R')).toBeNull()
  })

  it('(b1b) backlog member (no linked user) still resolves the alias -> Phase-07 monogram', async () => {
    // No linked user -> the precedence chain falls through to the
    // teamMember.displayName alias, so the name resolves to 'Futuro 1'
    // (hover/title), unchanged from Phase 07: the flip must not regress
    // backlog members. 'Futuro 1' is two whitespace tokens, so the unchanged
    // splitter yields the two-char first+last monogram 'F1'.
    const { container } = renderCard(
      makeCard([makeAssignment('tm-futuro', { name: 'Futuro 1', backlog: true })]),
    )

    expect(avatarTitles(container)).toEqual(['Futuro 1'])
    expect(await screen.findByText('F1')).toBeInTheDocument()
  })

  it('(b1c) backlog member with a true mononym alias still renders a single initial', async () => {
    // A single-token backlog alias (e.g. 'Futuro') keeps the Phase-07
    // single-initial behaviour: no linked user, alias 'Futuro' -> 'F'.
    const { container } = renderCard(
      makeCard([makeAssignment('tm-mononym', { name: 'Futuro', backlog: true })]),
    )

    expect(avatarTitles(container)).toEqual(['Futuro'])
    expect(await screen.findByText('F')).toBeInTheDocument()
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
 * The Row-2 client name renders bold in the default text colour. Client-hex
 * colouring was tried (Phase 10) but light brand colours were illegible on the
 * white card, so the name now uses no inline colour — just the bold weight.
 */
describe('KanbanCard client name styling', () => {
  it('(1) renders the client name bold with no inline colour', () => {
    renderCard(
      makeCard([], {
        client: {
          id: 'client-1',
          name: 'Acme Corp',
          color: '#3366ff',
          notes: '',
          notesUpdatedAt: null,
          notesUpdatedBy: null,
        },
      }),
    )

    const el = clientNameEl('Acme Corp')
    // Bold weight class present; default (not muted) foreground.
    expect(el.className).toContain('font-bold')
    expect(el.className).not.toContain('text-muted-foreground')
    // No inline colour applied regardless of the client's stored hex.
    expect(el.style.color).toBe('')
  })

  it('(2) ignores a pale client colour — still bold, no inline colour', () => {
    // #FFFACD (lemon chiffon) would be illegible on the white card; the name no
    // longer renders in the client colour at all.
    renderCard(
      makeCard([], {
        client: {
          id: 'client-2',
          name: 'Pale Co',
          color: '#FFFACD',
          notes: '',
          notesUpdatedAt: null,
          notesUpdatedBy: null,
        },
      }),
    )

    const el = clientNameEl('Pale Co')
    expect(el.className).toContain('font-bold')
    expect(el.style.color).toBe('')
  })

  it('(3) renders the name safely when colour is missing/empty', () => {
    renderCard(
      makeCard([], {
        client: {
          id: 'client-3',
          name: 'No Colour Co',
          color: '',
          notes: '',
          notesUpdatedAt: null,
          notesUpdatedBy: null,
        },
      }),
    )

    const el = clientNameEl('No Colour Co')
    // No crash; name shows bold with no inline colour.
    expect(el).toBeInTheDocument()
    expect(el.className).toContain('font-bold')
    expect(el.style.color).toBe('')
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

/**
 * Phase 03-01: widening the card->project->client payload with the notes
 * columns must NOT alter the Kanban tile — KanbanCard never reads client.notes.
 * Rendering the same card with and without client notes must produce identical
 * DOM, proving the "Kanban tile visually unchanged" success criterion at the
 * test level (not just by code inspection). No assignments -> no Math.random
 * ids, so the markup is deterministic and directly comparable.
 */
describe('KanbanCard is unaffected by client.notes (Phase 03-01)', () => {
  // DndContext stamps monotonic ids (DndDescribedBy-N / DndLiveRegion-N) that
  // increment per render and are unrelated to the card content — normalise them
  // so the comparison isolates the actual KanbanCard tile markup.
  const normaliseDnd = (html: string) =>
    html.replace(/Dnd(?:DescribedBy|LiveRegion)-\d+/g, 'Dnd-X')

  it('renders identical DOM whether or not client.notes is present', () => {
    const withoutNotes = renderCard(
      makeCard([], {
        client: {
          id: 'client-1',
          name: 'Acme Corp',
          color: '#3366ff',
          notes: '',
          notesUpdatedAt: null,
          notesUpdatedBy: null,
        },
      }),
    )
    const htmlWithoutNotes = normaliseDnd(withoutNotes.container.innerHTML)
    withoutNotes.unmount()

    const withNotes = renderCard(
      makeCard([], {
        client: {
          id: 'client-1',
          name: 'Acme Corp',
          color: '#3366ff',
          notes: '**Important** — handle with care',
          notesUpdatedAt: '2026-07-10T00:00:00.000Z',
          notesUpdatedBy: 'user-1',
        },
      }),
    )

    // The tile markup is byte-identical: the notes never reach the render.
    expect(normaliseDnd(withNotes.container.innerHTML)).toBe(htmlWithoutNotes)
  })
})
