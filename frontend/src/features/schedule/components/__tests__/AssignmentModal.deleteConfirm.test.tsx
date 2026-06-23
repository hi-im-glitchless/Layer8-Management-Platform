import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AssignmentModal } from '../AssignmentModal'
import type { Assignment } from '../../types'

// Spies shared across the mocked hooks (mirrors AssignmentModal.lock.test.tsx).
const toggleLockMutate = vi.fn()
const upsertMutate = vi.fn()
const deleteMutate = vi.fn()

vi.mock('../../hooks', () => ({
  useUpsertAssignment: () => ({ mutate: upsertMutate, isPending: false }),
  useDeleteAssignment: () => ({ mutate: deleteMutate, isPending: false }),
  useToggleLock: () => ({ mutate: toggleLockMutate, isPending: false }),
  useClients: () => ({ data: { clients: [] } }),
}))

vi.mock('../../../board/hooks', () => ({
  // No linked board card so the "View on Board" link stays hidden.
  useBoardCardByProjectId: () => ({ data: null }),
}))

function makeAssignment(): Assignment {
  return {
    id: 'asg-1',
    teamMemberId: 'tm-1',
    projectName: 'Acme Pentest',
    projectColor: '#3366ff',
    status: 'confirmed',
    weekStart: '2026-06-01',
    isLocked: false,
    splitProjectName: null,
    splitProjectColor: null,
    splitProjectStatus: null,
    splitClientId: null,
    splitTags: [],
    splitClient: null,
    createdBy: null,
    clientId: null,
    tags: [],
    client: null,
    projectId: 'proj-1',
    splitProjectId: null,
    project: null,
    splitProject: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  }
}

function renderModal(assignment: Assignment | undefined) {
  return render(
    <MemoryRouter>
      <AssignmentModal
        open
        onClose={vi.fn()}
        teamMemberId="tm-1"
        weekStart="2026-06-01"
        assignment={assignment}
      />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  toggleLockMutate.mockClear()
  upsertMutate.mockClear()
  deleteMutate.mockClear()
})

describe('AssignmentModal delete confirmation dialog', () => {
  it('(1) does not delete until confirmed: clicking the footer Delete only opens the dialog', () => {
    renderModal(makeAssignment())

    // The footer Delete button is now an AlertDialog trigger — clicking it must
    // NOT fire the delete mutation, only reveal the confirmation.
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(deleteMutate).not.toHaveBeenCalled()
    // Clarifying copy about the last-assignment card-removal rule is visible.
    expect(screen.getByText('Delete this assignment?')).toBeInTheDocument()
    expect(
      screen.getByText(/only\s+removed when this is the project's last assignment/i),
    ).toBeInTheDocument()
  })

  it('(2) confirming via the dialog Delete action invokes the delete mutation with the assignment id', () => {
    renderModal(makeAssignment())

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    // Once the dialog is open there are two "Delete" buttons (the trigger and
    // the AlertDialogAction). The action lives inside the alertdialog.
    const dialog = screen.getByRole('alertdialog')
    const { getByRole } = within(dialog)
    fireEvent.click(getByRole('button', { name: 'Delete' }))

    expect(deleteMutate).toHaveBeenCalledTimes(1)
    expect(deleteMutate).toHaveBeenCalledWith('asg-1', expect.anything())
  })

  it('(3) Cancel dismisses the dialog without deleting', () => {
    renderModal(makeAssignment())

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(deleteMutate).not.toHaveBeenCalled()
    expect(screen.queryByText('Delete this assignment?')).toBeNull()
  })
})
