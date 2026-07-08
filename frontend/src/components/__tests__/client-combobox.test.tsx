import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ClientCombobox, type ClientComboboxOption } from '../client-combobox'

// Deliberately unsorted, mixed case + PT accents. Expected sorted order
// (case/accent-insensitive, base letters): Ácido, acme, Bravo, Zeta.
const CLIENTS_WITH_COLOR: ClientComboboxOption[] = [
  { id: 'z', name: 'Zeta', color: '#111111' },
  { id: 'a', name: 'acme', color: '#222222' },
  { id: 'ac', name: 'Ácido', color: '#333333' },
  { id: 'b', name: 'Bravo', color: '#444444' },
]

// Board shape: no `color` field.
const CLIENTS_NO_COLOR: ClientComboboxOption[] = [
  { id: 'z', name: 'Zeta' },
  { id: 'a', name: 'acme' },
]

const SENTINEL = 'No client'

function openPopover() {
  // The trigger is the first button; it shows the sentinel label as placeholder.
  fireEvent.click(screen.getAllByRole('button', { name: SENTINEL })[0])
}

/** Names of the client rows (excludes trigger + pinned sentinel), in DOM order. */
function clientRowNames(): string[] {
  const clientNames = new Set(['Ácido', 'acme', 'Bravo', 'Zeta'])
  return screen
    .getAllByRole('button')
    .map((b) => b.textContent?.trim() ?? '')
    .filter((t) => clientNames.has(t))
}

function getSearchInput() {
  return screen.getByPlaceholderText('Search clients...') as HTMLInputElement
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ClientCombobox', () => {
  it('(a) renders clients case- & accent-insensitively sorted', () => {
    render(
      <ClientCombobox clients={CLIENTS_WITH_COLOR} value={null} onChange={vi.fn()} sentinelLabel={SENTINEL} />,
    )
    openPopover()

    expect(clientRowNames()).toEqual(['Ácido', 'acme', 'Bravo', 'Zeta'])
  })

  it('(b) typing filters the list (case-insensitive substring)', () => {
    render(
      <ClientCombobox clients={CLIENTS_WITH_COLOR} value={null} onChange={vi.fn()} sentinelLabel={SENTINEL} />,
    )
    openPopover()

    fireEvent.change(getSearchInput(), { target: { value: 'BR' } })

    expect(clientRowNames()).toEqual(['Bravo'])
  })

  it('(c) clearing the input restores the full sorted list', () => {
    render(
      <ClientCombobox clients={CLIENTS_WITH_COLOR} value={null} onChange={vi.fn()} sentinelLabel={SENTINEL} />,
    )
    openPopover()
    const input = getSearchInput()

    fireEvent.change(input, { target: { value: 'br' } })
    expect(clientRowNames()).toEqual(['Bravo'])

    fireEvent.change(input, { target: { value: '' } })
    expect(clientRowNames()).toEqual(['Ácido', 'acme', 'Bravo', 'Zeta'])
  })

  it('(d) shows "No clients found" on no match', () => {
    render(
      <ClientCombobox clients={CLIENTS_WITH_COLOR} value={null} onChange={vi.fn()} sentinelLabel={SENTINEL} />,
    )
    openPopover()

    fireEvent.change(getSearchInput(), { target: { value: 'zzz-nope' } })

    expect(screen.getByText('No clients found')).toBeInTheDocument()
    expect(clientRowNames()).toEqual([])
  })

  it('(e) sentinel stays pinned at top and visible regardless of search text', () => {
    render(
      <ClientCombobox clients={CLIENTS_WITH_COLOR} value={null} onChange={vi.fn()} sentinelLabel={SENTINEL} />,
    )
    openPopover()

    // Two matches for the sentinel label: the trigger + the pinned list button.
    expect(screen.getAllByRole('button', { name: SENTINEL })).toHaveLength(2)

    // The pinned sentinel is the first button inside the list (before any client).
    const listButtons = screen.getAllByRole('button').map((b) => b.textContent?.trim())
    // [trigger(sentinel), sentinel, Ácido, ...] — first client is preceded by the sentinel.
    const sentinelIdx = listButtons.indexOf(SENTINEL, 1) // skip the trigger at index 0
    const firstClientIdx = listButtons.indexOf('Ácido')
    expect(sentinelIdx).toBeGreaterThan(0)
    expect(sentinelIdx).toBeLessThan(firstClientIdx)

    // Even a query that matches no client keeps the sentinel visible.
    fireEvent.change(getSearchInput(), { target: { value: 'zzz-nope' } })
    expect(screen.getAllByRole('button', { name: SENTINEL })).toHaveLength(2)
  })

  it('(f) selecting a client calls onChange(id); selecting the sentinel calls onChange(null)', () => {
    const onChange = vi.fn()
    render(
      <ClientCombobox clients={CLIENTS_WITH_COLOR} value={null} onChange={onChange} sentinelLabel={SENTINEL} />,
    )
    openPopover()

    fireEvent.click(screen.getByRole('button', { name: 'Bravo' }))
    expect(onChange).toHaveBeenCalledWith('b')

    // Re-open (popover closed on select) and pick the pinned sentinel.
    openPopover()
    // Index 1 = the pinned list sentinel (index 0 is the trigger).
    fireEvent.click(screen.getAllByRole('button', { name: SENTINEL })[1])
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('(g) renders a swatch only when the option has a color', () => {
    // With color -> swatch present on each row.
    const { unmount } = render(
      <ClientCombobox clients={CLIENTS_WITH_COLOR} value={null} onChange={vi.fn()} sentinelLabel={SENTINEL} />,
    )
    openPopover()
    const coloredRow = screen.getByRole('button', { name: 'Bravo' })
    expect(within(coloredRow).getByText('', { selector: 'span[style]' })).toBeTruthy()
    // Sanity: the swatch carries the option color.
    expect(coloredRow.querySelector('span[style*="background-color"]')).not.toBeNull()
    unmount()

    // No color (board shape) -> no swatch span with a background-color style.
    render(
      <ClientCombobox clients={CLIENTS_NO_COLOR} value={null} onChange={vi.fn()} sentinelLabel="All clients" />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'All clients' })[0])
    const plainRow = screen.getByRole('button', { name: 'Zeta' })
    expect(plainRow.querySelector('span[style*="background-color"]')).toBeNull()
  })
})
