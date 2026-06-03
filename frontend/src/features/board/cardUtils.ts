import type { BoardCard } from './types'

// ── Card lookup helper ──────────────────────────────────────────────
// Extracted from KanbanCard.tsx so the component file exports only the
// KanbanCard component (satisfies react-refresh/only-export-components).
// Pure move — identical signature and behavior.

export function findCardById(cards: BoardCard[], id: string): BoardCard | undefined {
  return cards.find((c) => c.id === id)
}
