import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BoardFilters } from '../BoardFilters'

// hasRole -> true so the "Show Archived" toggle renders; irrelevant to the
// client-filter assertions but keeps the component happy.
vi.mock('@/features/auth/hooks', () => ({
  useAuth: () => ({ hasRole: () => true }),
}))

// Deliberately unsorted, mixed case + PT accents, and NO `color` field
// (the board passes a colorless {id,name} subset). Expected sorted order:
// Ácido, acme, Bravo, Zeta.
const CLIENTS = [
  { id: 'z', name: 'Zeta' },
  { id: 'a', name: 'acme' },
  { id: 'ac', name: 'Ácido' },
  { id: 'b', name: 'Bravo' },
]

const setFilterClientId = vi.fn()

function renderFilters() {
  return render(
    <BoardFilters
      filterMode="all"
      setFilterMode={vi.fn()}
      filterClientId={null}
      setFilterClientId={setFilterClientId}
      filterPentesterId={null}
      setFilterPentesterId={vi.fn()}
      showArchived={false}
      setShowArchived={vi.fn()}
      clients={CLIENTS}
      pentesters={[]}
    />,
  )
}

function openClientCombobox() {
  // The client combobox trigger shows the "All clients" sentinel as placeholder.
  fireEvent.click(screen.getAllByRole('button', { name: 'All clients' })[0])
}

function clientRowNames(): string[] {
  const names = new Set(['Ácido', 'acme', 'Bravo', 'Zeta'])
  return screen
    .getAllByRole('button')
    .map((b) => b.textContent?.trim() ?? '')
    .filter((t) => names.has(t))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BoardFilters client filter', () => {
  it('(a) exposes a search input that filters the client list', () => {
    renderFilters()
    openClientCombobox()

    const input = screen.getByPlaceholderText('Search clients...') as HTMLInputElement
    expect(input).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'br' } })
    expect(clientRowNames()).toEqual(['Bravo'])
  })

  it('(b) renders clients case- & accent-insensitively sorted', () => {
    renderFilters()
    openClientCombobox()

    expect(clientRowNames()).toEqual(['Ácido', 'acme', 'Bravo', 'Zeta'])
  })

  it('(c) pins "All clients" at top; selecting it calls setFilterClientId(null)', () => {
    renderFilters()
    openClientCombobox()

    const buttons = screen.getAllByRole('button').map((b) => b.textContent?.trim())
    const sentinelIdx = buttons.indexOf('All clients', 1) // skip the trigger at 0
    const firstClientIdx = buttons.indexOf('Ácido')
    expect(sentinelIdx).toBeGreaterThan(0)
    expect(sentinelIdx).toBeLessThan(firstClientIdx)

    // Index 1 = the pinned list sentinel (index 0 is the trigger button).
    fireEvent.click(screen.getAllByRole('button', { name: 'All clients' })[1])
    expect(setFilterClientId).toHaveBeenCalledWith(null)
  })

  it('(d) selecting a client calls setFilterClientId with its id', () => {
    renderFilters()
    openClientCombobox()

    fireEvent.click(screen.getByRole('button', { name: 'Bravo' }))
    expect(setFilterClientId).toHaveBeenCalledWith('b')
  })
})
