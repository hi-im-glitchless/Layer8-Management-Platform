import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MappingOverlayCard } from '../MappingOverlayCard'
import type { SelectionEntry } from '../../types'

/**
 * Factory for building SelectionEntry test fixtures.
 */
function makeSelection(overrides: Partial<SelectionEntry> = {}): SelectionEntry {
  return {
    id: 'sel-1',
    selectionNumber: 1,
    paragraphIndex: 5,
    text: 'Executive Summary',
    boundingRect: { top: 100, left: 50, width: 200, height: 20, pageNumber: 1 },
    pageNumber: 1,
    status: 'pending',
    gwField: 'executive_summary',
    markerType: 'heading',
    confidence: 0.92,
    ...overrides,
  }
}

describe('MappingOverlayCard', () => {
  const defaultProps = {
    onAccept: vi.fn(),
    onReject: vi.fn(),
  }

  it('renders selection number and gwField', () => {
    render(
      <MappingOverlayCard
        selection={makeSelection({ selectionNumber: 3, gwField: 'vuln_table' })}
        {...defaultProps}
      />,
    )

    expect(screen.getByText('#3')).toBeInTheDocument()
    expect(screen.getByText('vuln_table')).toBeInTheDocument()
  })

  it('renders markerType badge', () => {
    render(
      <MappingOverlayCard
        selection={makeSelection({ markerType: 'table' })}
        {...defaultProps}
      />,
    )

    expect(screen.getByText('table')).toBeInTheDocument()
  })

  it('renders confidence as percentage', () => {
    render(
      <MappingOverlayCard
        selection={makeSelection({ confidence: 0.87 })}
        {...defaultProps}
      />,
    )

    expect(screen.getByText('87%')).toBeInTheDocument()
  })

  it('renders -- for null confidence', () => {
    render(
      <MappingOverlayCard
        selection={makeSelection({ confidence: null })}
        {...defaultProps}
      />,
    )

    expect(screen.getByText('--')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Pending + resolved state: shows accept/reject buttons
  // -------------------------------------------------------------------------

  it('shows accept and reject buttons for pending+resolved selection', () => {
    render(
      <MappingOverlayCard
        selection={makeSelection({ status: 'pending', gwField: 'exec_summary' })}
        {...defaultProps}
      />,
    )

    expect(screen.getByTestId('accept-button')).toBeInTheDocument()
    expect(screen.getByTestId('reject-button')).toBeInTheDocument()
  })

  it('calls onAccept with selection id when accept clicked', async () => {
    const onAccept = vi.fn()
    const user = userEvent.setup()

    render(
      <MappingOverlayCard
        selection={makeSelection({ id: 'sel-42', status: 'pending' })}
        onAccept={onAccept}
        onReject={vi.fn()}
      />,
    )

    await user.click(screen.getByTestId('accept-button'))
    expect(onAccept).toHaveBeenCalledWith('sel-42')
    expect(onAccept).toHaveBeenCalledTimes(1)
  })

  it('calls onReject with selection id when reject clicked', async () => {
    const onReject = vi.fn()
    const user = userEvent.setup()

    render(
      <MappingOverlayCard
        selection={makeSelection({ id: 'sel-99', status: 'pending' })}
        onAccept={vi.fn()}
        onReject={onReject}
      />,
    )

    await user.click(screen.getByTestId('reject-button'))
    expect(onReject).toHaveBeenCalledWith('sel-99')
    expect(onReject).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // Confirmed state: green checkmark, no action buttons
  // -------------------------------------------------------------------------

  it('shows green checkmark icon for confirmed selection', () => {
    render(
      <MappingOverlayCard
        selection={makeSelection({ status: 'confirmed' })}
        {...defaultProps}
      />,
    )

    expect(screen.getByTestId('confirmed-icon')).toBeInTheDocument()
    expect(screen.queryByTestId('accept-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reject-button')).not.toBeInTheDocument()
  })

  it('renders confirmed card with data-status=confirmed', () => {
    render(
      <MappingOverlayCard
        selection={makeSelection({ status: 'confirmed' })}
        {...defaultProps}
      />,
    )

    const card = screen.getByTestId('mapping-overlay-card')
    expect(card).toHaveAttribute('data-status', 'confirmed')
  })

  // -------------------------------------------------------------------------
  // Rejected state: orange icon, no action buttons
  // -------------------------------------------------------------------------

  it('shows orange alert icon for rejected selection', () => {
    render(
      <MappingOverlayCard
        selection={makeSelection({ status: 'rejected' })}
        {...defaultProps}
      />,
    )

    expect(screen.getByTestId('rejected-icon')).toBeInTheDocument()
    expect(screen.queryByTestId('accept-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reject-button')).not.toBeInTheDocument()
  })

  it('renders rejected card with data-status=rejected', () => {
    render(
      <MappingOverlayCard
        selection={makeSelection({ status: 'rejected' })}
        {...defaultProps}
      />,
    )

    const card = screen.getByTestId('mapping-overlay-card')
    expect(card).toHaveAttribute('data-status', 'rejected')
  })

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it('shows "unresolved" when gwField is null', () => {
    render(
      <MappingOverlayCard
        selection={makeSelection({ gwField: null })}
        {...defaultProps}
      />,
    )

    expect(screen.getByText('unresolved')).toBeInTheDocument()
  })

  it('does not show action buttons for pending selection without gwField', () => {
    render(
      <MappingOverlayCard
        selection={makeSelection({ status: 'pending', gwField: null })}
        {...defaultProps}
      />,
    )

    expect(screen.queryByTestId('accept-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reject-button')).not.toBeInTheDocument()
  })

  it('displays rationale text for resolved selection', () => {
    render(
      <MappingOverlayCard
        selection={makeSelection({ gwField: 'vuln_description' })}
        {...defaultProps}
      />,
    )

    expect(screen.getByTestId('rationale-text')).toHaveTextContent('Mapped to vuln_description')
  })
})
