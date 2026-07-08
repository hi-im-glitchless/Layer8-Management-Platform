import { describe, it, expect } from 'vitest'
import { sortClientsByName } from '../sort'

describe('sortClientsByName', () => {
  it('sorts case- and accent-insensitively (PT-PT), A→Z', () => {
    const input = [
      { name: 'Zeta' },
      { name: 'acme' },
      { name: 'Ácido' },
      { name: 'Bravo' },
    ]

    const result = sortClientsByName(input)

    // Case- and accent-insensitive collation compares base letters:
    //   "ácido" -> a,c,i,d,o   "acme" -> a,c,m,e   => i < m, so "Ácido" < "acme".
    // lowercase "acme" landing near the front (not after uppercase Z) proves
    // case-insensitivity; accented "Ácido" sorting by base "a" proves
    // accent-insensitivity.
    expect(result.map((c) => c.name)).toEqual(['Ácido', 'acme', 'Bravo', 'Zeta'])
  })

  it('does not mutate the input array', () => {
    const input = [{ name: 'Zeta' }, { name: 'acme' }]
    const snapshot = input.map((c) => c.name)

    const result = sortClientsByName(input)

    // Original order preserved; a new array is returned.
    expect(input.map((c) => c.name)).toEqual(snapshot)
    expect(result).not.toBe(input)
  })

  it('preserves extra fields on the generic item shape', () => {
    const input = [
      { id: '2', name: 'Beta', color: '#222' },
      { id: '1', name: 'alpha', color: '#111' },
    ]

    const result = sortClientsByName(input)

    expect(result.map((c) => c.id)).toEqual(['1', '2'])
    expect(result[0]).toEqual({ id: '1', name: 'alpha', color: '#111' })
  })
})
