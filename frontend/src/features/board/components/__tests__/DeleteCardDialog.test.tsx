import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the data hook so the dialog never reaches react-query / the network.
// useDeleteCard returns a mutate spy with the (id, { onSuccess }) shape the
// component calls, plus the isPending flag it reads.
const mutate = vi.fn()
vi.mock('../../hooks', () => ({
  useDeleteCard: () => ({ mutate, isPending: false }),
}))

import { DeleteCardDialog } from '../DeleteCardDialog'

const CARD_ID = 'card-abc'
const PROJECT_NAME = 'Acme Pentest'

function renderDialog(overrides: Partial<React.ComponentProps<typeof DeleteCardDialog>> = {}) {
  const onOpenChange = vi.fn()
  const onDeleted = vi.fn()
  render(
    <DeleteCardDialog
      cardId={CARD_ID}
      projectName={PROJECT_NAME}
      open
      onOpenChange={onOpenChange}
      onDeleted={onDeleted}
      {...overrides}
    />,
  )
  return { onOpenChange, onDeleted }
}

describe('DeleteCardDialog', () => {
  beforeEach(() => {
    mutate.mockReset()
  })

  it('(1) renders the permanent-delete warning text and the project name when open', () => {
    renderDialog()

    // Project name appears in the title.
    expect(screen.getByText(/Acme Pentest/)).toBeInTheDocument()
    // Warning makes clear this is a permanent, irreversible delete (not archive).
    expect(
      screen.getByText(/permanently deletes the card, the project/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
  })

  it('(2) Cancel closes the dialog without calling mutate', async () => {
    const user = userEvent.setup()
    const { onOpenChange } = renderDialog()

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(mutate).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('(3) Confirm calls useDeleteCard().mutate with the card id', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: /delete card/i }))

    expect(mutate).toHaveBeenCalledTimes(1)
    // First arg is the cardId; second arg carries the onSuccess callback.
    expect(mutate.mock.calls[0][0]).toBe(CARD_ID)
  })
})
