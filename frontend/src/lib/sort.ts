/**
 * Shared, cross-feature sort helpers.
 *
 * Phase 01-01: client dropdowns must list clients case- AND accent-insensitively
 * A→Z. Both the schedule feature (AssignmentModal) and the board feature
 * (BoardFilters) need this, and they do not import each other, so the helper
 * lives in lib/ per CONVENTIONS.md (shared/cross-feature location).
 */

/**
 * Return a NEW array of `items` ordered by `name`, case- and accent-insensitively
 * using PT-PT collation.
 *
 * Generic over `<T extends { name: string }>` so it works for the full `Client`
 * type (which has `color`) and Board's derived `{ id, name }` subset alike — do
 * NOT tie this to the schedule `Client` type.
 *
 * The explicit `'pt-PT'` locale + `sensitivity: 'base'` make collation
 * deterministic regardless of the runtime/test environment's default locale
 * (e.g. "acme" / "Acme" / "Ácido" sort together, not by ASCII code point).
 * Does not mutate the input array.
 */
export function sortClientsByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-PT', { sensitivity: 'base' }),
  )
}
