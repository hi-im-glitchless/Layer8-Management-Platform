import type { Assignment } from '@/features/schedule/types'
import type { DashboardProject } from './types'
import { getWeekMonday, toLocalDateString } from '@/features/schedule/constants'

/**
 * Parse tags that may arrive as a JSON string from SQLite or as an actual array.
 */
export function parseTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags
  if (typeof tags === 'string') {
    try {
      const parsed = JSON.parse(tags)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/**
 * Normalize a weekStart value (ISO DateTime or date string) to YYYY-MM-DD.
 */
function normalizeDate(dateStr: string): string {
  return toLocalDateString(new Date(dateStr))
}

/**
 * Build a grouping key for an assignment: same project = same name + client + tags.
 * Assignments with no name AND no client are truly empty (unassigned weeks) and excluded.
 */
function assignmentKey(a: Assignment): string | null {
  const name = a.projectName?.trim() ?? ''
  const client = a.client?.name ?? ''
  if (!name && !client) return null // truly empty — no project, no client
  const tags = [...parseTags(a.tags)].sort().join(',')
  return `${name}|${client}|${tags}`
}

/**
 * Groups consecutive same-project assignments into DashboardProject entries.
 * "Same project" means same projectName + client + tags combination.
 * A new group starts when the project identity changes or there is a gap of >7 days.
 */
export function buildProjectTimeline(assignments: Assignment[]): DashboardProject[] {
  if (assignments.length === 0) return []

  const sorted = [...assignments]
    .filter((a) => assignmentKey(a) !== null)
    .sort(
      (a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime()
    )

  const timeline: DashboardProject[] = []
  let current: DashboardProject | null = null
  let currentKey: string | null = null
  let lastWeekMs = 0

  for (const assignment of sorted) {
    const weekMs = new Date(assignment.weekStart).getTime()
    const gapDays = lastWeekMs ? (weekMs - lastWeekMs) / (24 * 60 * 60 * 1000) : 0
    const weekDate = normalizeDate(assignment.weekStart)
    const key = assignmentKey(assignment)

    const isContinuation =
      current !== null &&
      key === currentKey &&
      gapDays <= 7

    if (isContinuation && current) {
      current.endDate = weekDate
      current.durationWeeks += 1
    } else {
      if (current) timeline.push(current)
      const clientName = assignment.client?.name ?? null
      current = {
        projectName: assignment.projectName?.trim() || clientName || '',
        projectColor: assignment.projectColor,
        clientName,
        tags: parseTags(assignment.tags),
        startDate: weekDate,
        endDate: weekDate,
        durationWeeks: 1,
        status: assignment.status,
        assignmentId: assignment.id,
      }
      currentKey = key
    }

    lastWeekMs = weekMs
  }

  if (current) timeline.push(current)

  return timeline
}

/**
 * Finds the project covering the current week (startDate <= monday <= endDate).
 * Uses getWeekMonday to normalize the reference date.
 */
export function getCurrentProject(
  timeline: DashboardProject[],
  today?: Date
): DashboardProject | null {
  const monday = getWeekMonday(today ?? new Date())
  const mondayStr = toLocalDateString(monday)

  return (
    timeline.find((p) => p.startDate <= mondayStr && mondayStr <= p.endDate) ??
    null
  )
}

/**
 * Finds the first project whose startDate is after the current project's endDate.
 * If no current project, returns the first future project.
 */
export function getNextProject(
  timeline: DashboardProject[],
  today?: Date
): DashboardProject | null {
  const current = getCurrentProject(timeline, today)

  if (current) {
    return (
      timeline.find((p) => p.startDate > current.endDate) ?? null
    )
  }

  // No current project — return first future project
  const monday = getWeekMonday(today ?? new Date())
  const mondayStr = toLocalDateString(monday)

  return timeline.find((p) => p.startDate > mondayStr) ?? null
}
