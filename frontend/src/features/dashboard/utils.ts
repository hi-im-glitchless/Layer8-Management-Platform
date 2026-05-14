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
 * Phase 24-R02: a single half of an Assignment row, flattened for the
 * dashboard timeline. We always emit a primary half, and emit a secondary
 * half only when the assignment carries split data. Each virtual row goes
 * through buildProjectTimeline independently, so split halves get their
 * own continuation chains, dates, and click-through targets.
 */
interface VirtualAssignment {
  assignmentId: string
  side: 'primary' | 'secondary'
  weekStart: string
  projectName: string
  projectColor: string
  status: string
  clientName: string | null
  tags: string[]
}

/** Does an Assignment row have meaningful split content? */
function hasSplitContent(a: Assignment): boolean {
  const hasSplitName = !!(a.splitProjectName?.trim())
  const hasSplitClient = !!a.splitClientId
  return hasSplitName || hasSplitClient
}

/**
 * Expand an Assignment into 1 or 2 virtual rows — one per side that has content.
 * Mirrors the backend's resolveCardSide / hasSecondaryData semantics so the FE
 * timeline always matches whichever BoardCards actually exist on the server.
 */
function expandAssignments(assignments: Assignment[]): VirtualAssignment[] {
  const out: VirtualAssignment[] = []
  for (const a of assignments) {
    out.push({
      assignmentId: a.id,
      side: 'primary',
      weekStart: a.weekStart,
      projectName: a.projectName?.trim() ?? '',
      projectColor: a.projectColor,
      status: a.status,
      clientName: a.client?.name ?? null,
      tags: parseTags(a.tags),
    })
    if (hasSplitContent(a)) {
      out.push({
        assignmentId: a.id,
        side: 'secondary',
        weekStart: a.weekStart,
        projectName: a.splitProjectName?.trim() ?? '',
        projectColor: a.splitProjectColor ?? a.projectColor,
        status: a.splitProjectStatus ?? a.status,
        clientName: a.splitClient?.name ?? null,
        tags: parseTags(a.splitTags),
      })
    }
  }
  return out
}

/**
 * Grouping key for a virtual assignment: same project on the same side =
 * same name + client + tags. Including `side` ensures split halves can never
 * merge into one timeline even if they happen to share a name. Virtual rows
 * with no name AND no client are excluded (truly empty).
 */
function virtualKey(v: VirtualAssignment): string | null {
  if (!v.projectName && !v.clientName) return null
  const tags = [...v.tags].sort().join(',')
  return `${v.side}|${v.projectName}|${v.clientName ?? ''}|${tags}`
}

/**
 * Groups consecutive same-project entries into DashboardProject entries.
 * "Same project" means same projectName + client + tags + side combination.
 * A new group starts when the project identity changes or there is a gap of >7 days.
 *
 * Phase 24-R02: a split assignment contributes two entries per week (one
 * primary, one secondary), so this can return up to 2× the original count.
 */
export function buildProjectTimeline(assignments: Assignment[]): DashboardProject[] {
  if (assignments.length === 0) return []

  // Expand split rows, then sort by (side, weekStart) so each side's
  // continuation chain is contiguous and ordered.
  const expanded = expandAssignments(assignments)
    .filter((v) => virtualKey(v) !== null)
    .sort((a, b) => {
      const ms = a.side.localeCompare(b.side)
      if (ms !== 0) return ms
      return new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime()
    })

  const timeline: DashboardProject[] = []
  let current: DashboardProject | null = null
  let currentKey: string | null = null
  let lastWeekMs = 0

  for (const v of expanded) {
    const weekMs = new Date(v.weekStart).getTime()
    const gapDays = lastWeekMs ? (weekMs - lastWeekMs) / (24 * 60 * 60 * 1000) : 0
    const weekDate = normalizeDate(v.weekStart)
    const key = virtualKey(v)

    const isContinuation =
      current !== null &&
      key === currentKey &&
      gapDays <= 7

    if (isContinuation && current) {
      current.endDate = weekDate
      current.durationWeeks += 1
    } else {
      if (current) timeline.push(current)
      current = {
        projectName: v.projectName || v.clientName || '',
        projectColor: v.projectColor,
        clientName: v.clientName,
        tags: v.tags,
        startDate: weekDate,
        endDate: weekDate,
        durationWeeks: 1,
        status: v.status,
        assignmentId: v.assignmentId,
        side: v.side,
      }
      currentKey = key
    }

    lastWeekMs = weekMs
  }

  if (current) timeline.push(current)

  return timeline
}

/**
 * Finds the projects covering the current week (startDate <= monday <= endDate).
 * Returns an array because a split week has two concurrent projects.
 */
export function getCurrentProjects(
  timeline: DashboardProject[],
  today?: Date,
): DashboardProject[] {
  const monday = getWeekMonday(today ?? new Date())
  const mondayStr = toLocalDateString(monday)
  return timeline.filter((p) => p.startDate <= mondayStr && mondayStr <= p.endDate)
}

/**
 * Finds the next set of projects after the current ones end. If current is
 * split, "next" is computed from the latest current end date so both split
 * halves transition together. If there is no current, returns all projects
 * starting on the earliest future Monday (covers a future split).
 */
export function getNextProjects(
  timeline: DashboardProject[],
  today?: Date,
): DashboardProject[] {
  const monday = getWeekMonday(today ?? new Date())
  const mondayStr = toLocalDateString(monday)
  const current = getCurrentProjects(timeline, today)

  const cutoff =
    current.length > 0
      ? current.reduce((max, p) => (p.endDate > max ? p.endDate : max), current[0].endDate)
      : null

  const futures = timeline
    .filter((p) => (cutoff ? p.startDate > cutoff : p.startDate > mondayStr))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  if (futures.length === 0) return []

  const earliest = futures[0].startDate
  return futures.filter((p) => p.startDate === earliest)
}

/**
 * Back-compat singular helpers — return the FIRST current/next project.
 * Prefer the plural getCurrentProjects / getNextProjects.
 */
export function getCurrentProject(
  timeline: DashboardProject[],
  today?: Date,
): DashboardProject | null {
  return getCurrentProjects(timeline, today)[0] ?? null
}

export function getNextProject(
  timeline: DashboardProject[],
  today?: Date,
): DashboardProject | null {
  return getNextProjects(timeline, today)[0] ?? null
}
