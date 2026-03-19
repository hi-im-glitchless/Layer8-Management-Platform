// ── Legend / Indicator Colors ──────────────────────────────────────
// Single source of truth — used by AvailabilityDots, AssignmentCell, and LegendBar

export const LEGEND_COLORS = {
  available: 'bg-green-500',
  absence: 'bg-orange-400',
  holiday: 'bg-red-400',
  other: 'bg-gray-400',
} as const

/** Status cycling order for click-to-cycle on assignment cells */
export const STATUS_CYCLE: readonly ('placeholder' | 'needs-reqs' | 'confirmed')[] = [
  'placeholder',
  'needs-reqs',
  'confirmed',
] as const

// ── Color Palette ──────────────────────────────────────────────────

export const COLOR_PALETTE = [
  { name: 'Slate Blue', hex: '#6B8DB5' },
  { name: 'Sage Green', hex: '#7BAF8B' },
  { name: 'Dusty Red', hex: '#C07070' },
  { name: 'Plum', hex: '#9B7DB8' },
  { name: 'Burnt Orange', hex: '#C49A6C' },
  { name: 'Teal', hex: '#6BA3A3' },
  { name: 'Rose', hex: '#B8839B' },
  { name: 'Gold', hex: '#BBA86B' },
  { name: 'Indigo', hex: '#7B7EB5' },
  { name: 'Sea Blue', hex: '#6BA3BF' },
  { name: 'Mauve', hex: '#B87B95' },
  { name: 'Olive', hex: '#8FA86B' },
] as const

// ── Status Dot Colors (theme-aware) ──────────────────────────────
// Used by AssignmentCell to render status indicator dots

export const STATUS_DOT_COLORS: Record<string, string> = {
  confirmed: 'bg-green-600 dark:bg-green-500',
  'needs-reqs': 'bg-amber-500 dark:bg-amber-400',
  placeholder: 'bg-slate-500 dark:bg-slate-400',
}

// ── Assignment Statuses ────────────────────────────────────────────

export const ASSIGNMENT_STATUSES = [
  { value: 'placeholder' as const, label: 'Placeholder', description: 'Tentative assignment, not yet confirmed' },
  { value: 'needs-reqs' as const, label: 'Needs Requirements', description: 'Assigned but waiting for project requirements' },
  { value: 'confirmed' as const, label: 'Confirmed', description: 'Fully confirmed assignment' },
] as const

// ── Quarter Tabs ───────────────────────────────────────────────────

export const QUARTER_TABS = [
  { value: 'all' as const, label: 'Todo o Ano', startMonth: 1, endMonth: 12 },
  { value: 'Q1' as const, label: 'Jan-Mar', startMonth: 1, endMonth: 3 },
  { value: 'Q2' as const, label: 'Abr-Jun', startMonth: 4, endMonth: 6 },
  { value: 'Q3' as const, label: 'Jul-Set', startMonth: 7, endMonth: 9 },
  { value: 'Q4' as const, label: 'Out-Dez', startMonth: 10, endMonth: 12 },
] as const

/** Quarter separator labels used in the All Year vertical layout */
export const QUARTER_LABELS = ['Jan-Mar', 'Abr-Jun', 'Jul-Set', 'Out-Dez'] as const

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
 * Formats a Date as YYYY-MM-DD in local time (avoids UTC shift from toISOString).
 */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
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
  const friday = new Date(mondayDate)
  friday.setDate(friday.getDate() + 4)

  const monDay = mondayDate.getDate()
  const friDay = friday.getDate()
  const friMonth = friday.toLocaleDateString('en-GB', { month: 'short' })

  // Cross-month: "29 Dec - 2 Jan"
  if (mondayDate.getMonth() !== friday.getMonth()) {
    const monMonth = mondayDate.toLocaleDateString('en-GB', { month: 'short' })
    return `${monDay} ${monMonth} - ${friDay} ${friMonth}`
  }

  // Same month: "5 - 9 Jan"
  return `${monDay} - ${friDay} ${friMonth}`
}
