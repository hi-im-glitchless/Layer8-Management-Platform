import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the data hooks so the modal never reaches react-query / the network.
// (mock-prefixed names so the hoisted vi.mock factories may reference them.)
const mockMutateAsync = vi.fn().mockResolvedValue({})
let mockNotesReturn: {
  data?: { notes: string; notesUpdatedAt: string | null; notesUpdatedBy: string | null }
  isLoading: boolean
} = {
  data: { notes: 'hello', notesUpdatedAt: '2026-07-10T12:00:00.000Z', notesUpdatedBy: 'u1' },
  isLoading: false,
}
let mockMembersReturn: { data?: { users: Array<{ id: string; username: string; displayName: string | null }> } } = {
  data: { users: [{ id: 'u1', username: 'alice', displayName: 'Alice' }] },
}

vi.mock('../../hooks', () => ({
  useClientNotes: () => mockNotesReturn,
  useUpdateClientNotes: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}))
vi.mock('@/features/board/hooks', () => ({
  useBoardMembers: () => mockMembersReturn,
}))

import { ClientNotesModal } from '../ClientNotesModal'

const CLIENT = { id: 'client-1', name: 'Acme Corp', color: '#ff0000' }

function renderModal() {
  return render(
    <ClientNotesModal
      clientId={CLIENT.id}
      client={CLIENT}
      open
      onOpenChange={vi.fn()}
    />,
  )
}

beforeEach(() => {
  mockMutateAsync.mockClear()
  mockNotesReturn = {
    data: { notes: 'hello', notesUpdatedAt: '2026-07-10T12:00:00.000Z', notesUpdatedBy: 'u1' },
    isLoading: false,
  }
  mockMembersReturn = {
    data: { users: [{ id: 'u1', username: 'alice', displayName: 'Alice' }] },
  }
})

describe('ClientNotesModal', () => {
  it('(1) opens with the client name, colour swatch, and seeds the editor with the current notes', () => {
    renderModal()

    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    // Colour swatch present with the client's colour applied. Radix renders the
    // dialog into a portal on document.body, so query the whole document.
    const swatch = document.querySelector('span[style*="background"]') as HTMLElement | null
    expect(swatch).not.toBeNull()
    expect(swatch?.style.backgroundColor).toBeTruthy()
    // Edit tab (default) shows the seeded notes.
    expect(screen.getByDisplayValue('hello')).toBeInTheDocument()
  })

  it('(2) attribution shows the resolved editor name, not the raw user id', () => {
    renderModal()

    expect(screen.getByText(/Alice/)).toBeInTheDocument()
    expect(screen.queryByText(/u1/)).not.toBeInTheDocument()
  })

  it('(3) editing and clicking Save calls the update mutation once with { id, notes }', async () => {
    const user = userEvent.setup()
    renderModal()

    const textarea = screen.getByRole('textbox')
    await user.clear(textarea)
    await user.type(textarea, 'updated notes')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(mockMutateAsync).toHaveBeenCalledTimes(1)
    expect(mockMutateAsync).toHaveBeenCalledWith({ id: 'client-1', notes: 'updated notes' })
  })

  it('(4) unknown editor id resolves to null — no "by X" clause and no raw id shown', () => {
    mockNotesReturn = {
      data: { notes: 'hello', notesUpdatedAt: '2026-07-10T12:00:00.000Z', notesUpdatedBy: 'ghost' },
      isLoading: false,
    }
    renderModal()

    const attribution = screen.getByText(/Last edited/)
    expect(attribution.textContent).not.toMatch(/by/i)
    expect(attribution.textContent).not.toContain('ghost')
  })
})
