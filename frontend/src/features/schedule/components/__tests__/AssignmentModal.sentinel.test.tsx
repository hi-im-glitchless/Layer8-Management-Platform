// UAT-3 coverage: the "No client" sentinel at the real AssignmentModal call site.
//
// Note on the round-02 report: the round-02 UAT-3 symptom ("No client" missing
// for the assignment picker while "All clients" showed for the board) is the
// exact behavior of the PRE-abbfe3a build (commit 1bfe71a's sentinelMode="clear").
// The committed code uses `showSentinel = !search` and is symmetric across call
// sites, so that report reproduced a stale bundle. This test closes the
// previously-untested integration point; the user must still re-test UAT-3 on a
// freshly rebuilt / hard-refreshed frontend to confirm the stale build is gone.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AssignmentModal } from '../AssignmentModal'

const upsertMutate = vi.fn()
const deleteMutate = vi.fn()
const toggleLockMutate = vi.fn()

vi.mock('../../hooks', () => ({
  useUpsertAssignment: () => ({ mutate: upsertMutate, isPending: false }),
  useDeleteAssignment: () => ({ mutate: deleteMutate, isPending: false }),
  useToggleLock: () => ({ mutate: toggleLockMutate, isPending: false }),
  // Non-empty client list so the picker has real rows to search over.
  useClients: () => ({ data: { clients: [{ id: 'c1', name: 'Acme', color: '#3366ff' }] } }),
}))

vi.mock('../../../board/hooks', () => ({
  useBoardCardByProjectId: () => ({ data: null }),
}))

function renderNewAssignmentModal() {
  return render(
    <MemoryRouter>
      <AssignmentModal
        open
        onClose={vi.fn()}
        teamMemberId="tm-1"
        weekStart="2026-06-01"
        assignment={undefined}
      />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  upsertMutate.mockClear()
  deleteMutate.mockClear()
  toggleLockMutate.mockClear()
})

describe('AssignmentModal "No client" sentinel (UAT-3)', () => {
  it('shows "No client" as a pinned row when the client picker is open with empty search', () => {
    renderNewAssignmentModal()

    // New assignment => clientId is null => trigger label reads "No client".
    const trigger = screen.getByRole('button', { name: 'No client' })
    fireEvent.click(trigger)

    // Trigger label + pinned sentinel row both read "No client".
    expect(screen.getAllByText('No client')).toHaveLength(2)
  })

  it('hides the pinned "No client" row once search text is entered', () => {
    renderNewAssignmentModal()

    fireEvent.click(screen.getByRole('button', { name: 'No client' }))
    expect(screen.getAllByText('No client')).toHaveLength(2)

    // Typing search text hides the pinned sentinel row; only the trigger label remains.
    fireEvent.change(screen.getByPlaceholderText('Search clients...'), {
      target: { value: 'Ac' },
    })
    expect(screen.getAllByText('No client')).toHaveLength(1)
  })
})
