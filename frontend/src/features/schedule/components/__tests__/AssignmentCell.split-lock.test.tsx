import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { AssignmentCell } from '../AssignmentCell'
import type { Assignment } from '../types'

/**
 * Build a split (two-project) assignment. `splitProjectColor` is what flips
 * AssignmentCell into its SplitCell branch (isSplit = !!splitProjectColor), so
 * it must be set. `splitProjectId` is set too to mirror a real linked split.
 */
function makeSplitAssignment(opts: { isLocked?: boolean } = {}): Assignment {
  const { isLocked = false } = opts
  return {
    id: 'asg-split-1',
    teamMemberId: 'tm-1',
    projectName: 'Primary Proj',
    projectColor: '#3366ff',
    status: 'confirmed',
    weekStart: '2026-06-01',
    isLocked,
    splitProjectName: 'Second Proj',
    splitProjectColor: '#ff6633',
    splitProjectStatus: 'placeholder',
    splitClientId: null,
    splitTags: [],
    splitClient: null,
    createdBy: null,
    clientId: null,
    tags: [],
    client: null,
    projectId: 'proj-1',
    splitProjectId: 'proj-2',
    project: null,
    splitProject: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  }
}

/** Render inside a DndContext so the SplitHalf useDraggable/useDroppable mount. */
function renderCell(
  assignment: Assignment,
  props: {
    canEdit?: boolean
    onLockToggle?: (e: React.MouseEvent) => void
    onCellClick?: (e?: React.MouseEvent) => void
  } = {},
) {
  const { canEdit = true, onLockToggle = vi.fn(), onCellClick = vi.fn() } = props
  const result = render(
    <DndContext>
      <AssignmentCell
        assignment={assignment}
        teamMemberId="tm-1"
        weekStart="2026-06-01"
        canEdit={canEdit}
        onCellClick={onCellClick}
        onLockToggle={onLockToggle}
      />
    </DndContext>,
  )
  return { ...result, onLockToggle, onCellClick }
}

describe('SplitCell lock toggle', () => {
  it('(a) canEdit=true & isLocked=true: a clickable lock button is present and clicking it calls onLockToggle', () => {
    const { container, onLockToggle } = renderCell(
      makeSplitAssignment({ isLocked: true }),
      { canEdit: true },
    )

    // The status dots in a SplitHalf are <div>s, so the only <button> in a
    // split cell is the lock toggle.
    const buttons = container.querySelectorAll('button')
    expect(buttons).toHaveLength(1)

    fireEvent.click(buttons[0])
    expect(onLockToggle).toHaveBeenCalledTimes(1)
  })

  it('(b) canEdit=true & isLocked=false: the lock button still exists in the DOM (hover reveal is a visual-only smoke check)', () => {
    // jsdom cannot evaluate the CSS group-hover that controls visibility, so we
    // assert the clickable button element is present rather than its visibility.
    const { container, onLockToggle } = renderCell(
      makeSplitAssignment({ isLocked: false }),
      { canEdit: true },
    )

    const buttons = container.querySelectorAll('button')
    expect(buttons).toHaveLength(1)

    fireEvent.click(buttons[0])
    expect(onLockToggle).toHaveBeenCalledTimes(1)
  })

  it('(c) canEdit=false & isLocked=true: a static lock icon renders and NO clickable lock button is present', () => {
    const { container } = renderCell(
      makeSplitAssignment({ isLocked: true }),
      { canEdit: false },
    )

    // No clickable lock button when the user cannot edit.
    expect(container.querySelectorAll('button')).toHaveLength(0)

    // A static Lock icon (lucide renders an <svg class="lucide-lock ...">) is
    // still shown to indicate the locked state.
    expect(container.querySelector('svg.lucide-lock')).not.toBeNull()
  })

  it('(d) clicking the lock button does not also trigger onCellClick (stopPropagation)', () => {
    const { container, onLockToggle, onCellClick } = renderCell(
      makeSplitAssignment({ isLocked: true }),
      { canEdit: true },
    )

    const button = container.querySelector('button')!
    fireEvent.click(button)

    expect(onLockToggle).toHaveBeenCalledTimes(1)
    // stopPropagation on the lock button must prevent the cell onClick firing.
    expect(onCellClick).not.toHaveBeenCalled()
  })
})
