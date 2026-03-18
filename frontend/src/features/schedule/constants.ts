// ── Color Palette ──────────────────────────────────────────────────

export const COLOR_PALETTE = [
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Green', hex: '#22C55E' },
  { name: 'Red', hex: '#EF4444' },
  { name: 'Purple', hex: '#A855F7' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Teal', hex: '#14B8A6' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Yellow', hex: '#EAB308' },
  { name: 'Indigo', hex: '#6366F1' },
  { name: 'Cyan', hex: '#06B6D4' },
  { name: 'Rose', hex: '#F43F5E' },
  { name: 'Lime', hex: '#84CC16' },
] as const

// ── Assignment Statuses ────────────────────────────────────────────

export const ASSIGNMENT_STATUSES = [
  { value: 'placeholder' as const, label: 'Placeholder', description: 'Tentative assignment, not yet confirmed' },
  { value: 'needs-reqs' as const, label: 'Needs Requirements', description: 'Assigned but waiting for project requirements' },
  { value: 'confirmed' as const, label: 'Confirmed', description: 'Fully confirmed assignment' },
] as const

// ── Quarter Tabs ───────────────────────────────────────────────────

export const QUARTER_TABS = [
  { value: 'all' as const, label: 'All Year', startMonth: 1, endMonth: 12 },
  { value: 'Q1' as const, label: 'Q1', startMonth: 1, endMonth: 3 },
  { value: 'Q2' as const, label: 'Q2', startMonth: 4, endMonth: 6 },
  { value: 'Q3' as const, label: 'Q3', startMonth: 7, endMonth: 9 },
  { value: 'Q4' as const, label: 'Q4', startMonth: 10, endMonth: 12 },
] as const

// ── Portuguese Holidays ────────────────────────────────────────────

export const PORTUGUESE_HOLIDAYS = [
  { name: 'Ano Novo', month: 1, day: 1 },
  { name: 'Dia da Liberdade', month: 4, day: 25 },
  { name: 'Dia do Trabalhador', month: 5, day: 1 },
  { name: 'Dia de Portugal', month: 6, day: 10 },
  { name: 'Assuncao de Nossa Senhora', month: 8, day: 15 },
  { name: 'Implantacao da Republica', month: 10, day: 5 },
  { name: 'Dia de Todos os Santos', month: 11, day: 1 },
  { name: 'Restauracao da Independencia', month: 12, day: 1 },
  { name: 'Imaculada Conceicao', month: 12, day: 8 },
  { name: 'Natal', month: 12, day: 25 },
] as const

// ── Date Utility Functions ─────────────────────────────────────────

/**
 * Returns the Monday of the ISO week for the given date.
 */
export function getWeekMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  // Sunday = 0, adjust to make Monday = 0
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Returns an array of Monday dates between start and end (inclusive).
 */
export function getWeeksInRange(startDate: Date, endDate: Date): Date[] {
  const weeks: Date[] = []
  const current = getWeekMonday(new Date(startDate))
  const end = new Date(endDate)
  end.setHours(23, 59, 59, 999)

  while (current <= end) {
    weeks.push(new Date(current))
    current.setDate(current.getDate() + 7)
  }

  return weeks
}

/**
 * Returns the start and end dates for a quarter (or full year if quarter is null).
 */
export function getQuarterDateRange(
  year: number,
  quarter: number | null
): { start: Date; end: Date } {
  if (quarter === null || quarter === undefined) {
    return {
      start: new Date(year, 0, 1),
      end: new Date(year, 11, 31),
    }
  }

  const startMonth = (quarter - 1) * 3
  const endMonth = startMonth + 2
  return {
    start: new Date(year, startMonth, 1),
    end: new Date(year, endMonth + 1, 0), // Last day of end month
  }
}

/**
 * Formats a Monday date as a short label like "Mar 16".
 */
export function formatWeekLabel(mondayDate: Date): string {
  return mondayDate.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
  })
}
