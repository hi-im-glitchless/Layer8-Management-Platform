import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AssignmentModal } from '../AssignmentModal'
import type { Assignment } from '../../types'

// Spies shared across the mocked hooks.
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

function makeAssignment(opts: { isLocked?: boolean } = {}): Assignment {
  const { isLocked = false } = opts
  return {
    id: 'asg-1',
    teamMemberId: 'tm-1',
    projectName: 'Acme Pentest',
    projectColor: '#3366ff',
    status: 'confirmed',
    weekStart: '2026-06-01',
    isLocked,
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

describe('AssignmentModal lock control', () => {
  it('(1) locked: Save + project-name input disabled, toggle shows "Unlock" and is itself NOT disabled', () => {
    renderModal(makeAssignment({ isLocked: true }))

    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()

    const projectInput = screen.getByLabelText('Project Name') as HTMLInputElement
    expect(projectInput).toBeDisabled()

    // The lock toggle reflects the locked state with an "Unlock" label and must
    // stay enabled so the user can actually unlock.
    const unlock = screen.getByRole('button', { name: 'Unlock' })
    expect(unlock).toBeInTheDocument()
    expect(unlock).not.toBeDisabled()

    // Delete is also disabled while locked (prevents a 409 from the backend).
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('(2) unlocked: Save enabled and the toggle shows the "Lock" label', () => {
    renderModal(makeAssignment({ isLocked: false }))

    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Lock' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unlock' })).toBeNull()
  })

  it('(3) clicking the toggle calls useToggleLock().mutate with the assignment id', () => {
    renderModal(makeAssignment({ isLocked: false }))

    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))
    expect(toggleLockMutate).toHaveBeenCalledTimes(1)
    expect(toggleLockMutate).toHaveBeenCalledWith('asg-1')
  })
})
