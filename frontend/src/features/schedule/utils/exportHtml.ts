import {
  getQuarterDateRange,
  getWeeksInRange,
  formatWeekLabel,
  toLocalDateString,
  getWeekMonday,
  QUARTER_LABELS,
} from '../constants'
import type { TeamMember, Assignment, Absence, Holiday, AssignmentStatus } from '../types'

// ── Types ─────────────────────────────────────────────────────────

export interface ExportHtmlParams {
  year: number
  quarter: number | null
  teamMembers: TeamMember[]
  assignments: Assignment[]
  absences: Absence[]
  holidays: Holiday[]
}

// ── Hex Color Maps ────────────────────────────────────────────────

const STATUS_HEX: Record<string, string> = {
  confirmed: '#16a34a',
  'needs-reqs': '#f59e0b',
  placeholder: '#64748b',
}

// ── Local Helpers ─────────────────────────────────────────────────

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#1a1a1a' : '#ffffff'
}

function parseTags(tags: unknown): string[] {
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

function getTagDisplay(tags: string[]): string {
  if (tags.length === 0) return ''
  if (tags.length === 1) return tags[0]
  return tags
    .map((t) => {
      if (t === 'Red Team') return 'RT'
      return t.charAt(0).toUpperCase()
    })
    .join('+')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getMemberName(member: TeamMember): string {
  return (
    member.displayName ||
    member.user?.displayName ||
    member.user?.username ||
    'Unknown'
  )
}

function getMemberInitial(member: TeamMember): string {
  return getMemberName(member).charAt(0).toUpperCase()
}

// ── CSS Template ──────────────────────────────────────────────────

const CSS_TEMPLATE = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; font-size: 11px; background: #fff; color: #1e293b; }
    table { border-collapse: collapse; table-layout: fixed; }
    th.col-team { width: 140px; min-width: 120px; }
    th.col-week { min-width: 150px; }
    thead tr { background: #cbd5e1; }
    th { padding: 6px 4px; text-align: center; border-bottom: 2px solid #94a3b8; border-right: 1px solid #94a3b8; white-space: nowrap; font-size: 10px; }
    th.current-week { background: #3b82f6; color: #fff; font-weight: bold; }
    td { border-bottom: 1px solid #cbd5e1; border-right: 1px solid #cbd5e1; padding: 2px; height: 80px; vertical-align: top; }
    tr.even td { background: #f1f5f9; }
    tr.odd td { background: #f8fafc; }
    td.col-team { font-weight: 500; padding: 4px 8px; border-right: 2px solid #94a3b8; }
    td.month-start, th.month-start { border-left: 2px solid #94a3b8; }
    .out-cell { background: rgba(76, 5, 25, 0.8); color: #fff; border-radius: 2px; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
    .assignment { border-radius: 2px; height: 100%; display: flex; flex-direction: column; justify-content: space-between; padding: 3px 4px; overflow: hidden; }
    .assignment-name { font-size: 10px; font-weight: 500; line-height: 1.2; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .status-row { display: flex; align-items: center; gap: 3px; }
    .status-dot { width: 16px; height: 10px; border-radius: 2px; flex-shrink: 0; }
    .tag-badge { font-size: 8px; font-weight: bold; padding: 1px 4px; border-radius: 9999px; background: #172554; color: #93c5fd; border: 1px solid rgba(59,130,246,0.4); }
    .split-cell { display: flex; flex-direction: row; height: 100%; border-radius: 2px; overflow: hidden; }
    .split-half { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 2px 4px; overflow: hidden; }
    .dots { display: flex; gap: 2px; justify-content: center; margin-top: 2px; }
    .dot { width: 10px; height: 10px; border-radius: 2px; }
    .dot-available { background: transparent; border: 1px solid #cbd5e1; }
    .dot-absent { background: #dc2626; }
    .dot-holiday { background: #dc2626; }
    .member-cell { display: flex; align-items: center; gap: 6px; }
    .avatar { width: 32px; height: 32px; border-radius: 50%; background: #cbd5e1; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; color: #475569; flex-shrink: 0; }
    .quarter-sep { background: #cbd5e1; border-top: 2px solid #94a3b8; border-bottom: 1px solid #94a3b8; padding: 4px 12px; font-size: 10px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; }
    @media print {
      body { font-size: 8px; }
      @page { size: A3 landscape; margin: 10mm; }
    }
    .lock-icon { font-size: 9px; color: inherit; opacity: 0.6; }
    .nml-sep { background: #cbd5e1; border-top: 2px solid #94a3b8; padding: 4px 12px; font-size: 10px; font-weight: bold; }
`

// ── Cell Renderers ────────────────────────────────────────────────

function renderAvailabilityDots(
  teamMemberId: string,
  weekMonday: Date,
  absenceSet: Set<string>,
  holidaySet: Set<string>,
): string {
  const dots: string[] = []
  for (let i = 0; i < 5; i++) {
    const d = new Date(weekMonday)
    d.setDate(d.getDate() + i)
    const dateKey = toLocalDateString(d)
    const isHoliday = holidaySet.has(dateKey)
    const isAbsent = absenceSet.has(`${teamMemberId}-${dateKey}`)

    if (isHoliday) {
      dots.push('<div class="dot dot-holiday"></div>')
    } else if (isAbsent) {
      dots.push('<div class="dot dot-absent"></div>')
    } else {
      dots.push('<div class="dot dot-available"></div>')
    }
  }
  return `<div class="dots">${dots.join('')}</div>`
}

function isFullyAbsent(
  teamMemberId: string,
  weekMonday: Date,
  absenceSet: Set<string>,
  holidaySet: Set<string>,
): boolean {
  for (let i = 0; i < 5; i++) {
    const d = new Date(weekMonday)
    d.setDate(d.getDate() + i)
    const dateKey = toLocalDateString(d)
    const hasAbsence = absenceSet.has(`${teamMemberId}-${dateKey}`)
    const hasHoliday = holidaySet.has(dateKey)
    if (!hasAbsence && !hasHoliday) return false
  }
  return true
}

function renderOutCell(
  teamMemberId: string,
  weekMonday: Date,
  absenceSet: Set<string>,
  holidaySet: Set<string>,
): string {
  const dots = renderAvailabilityDots(teamMemberId, weekMonday, absenceSet, holidaySet)
  return `<div class="out-cell"><span style="font-size:10px;font-weight:600;">OUT</span>${dots}</div>`
}

function renderTagBadge(tags: unknown): string {
  const parsed = parseTags(tags)
  if (parsed.length === 0) return ''
  const label = getTagDisplay(parsed)
  return `<span class="tag-badge">${escapeHtml(label)}</span>`
}

function renderStatusDot(status: AssignmentStatus): string {
  const color = STATUS_HEX[status] ?? STATUS_HEX.placeholder
  return `<div class="status-dot" style="background:${color};"></div>`
}

function getAssignmentLabel(
  projectName: string,
  clientName: string | undefined,
): string {
  if (clientName) {
    return projectName
      ? `${escapeHtml(clientName)} - ${escapeHtml(projectName)}`
      : escapeHtml(clientName)
  }
  return escapeHtml(projectName)
}

function renderLockIcon(textColor: string): string {
  return `<span class="lock-icon" style="color:${textColor};">&#x1F512;</span>`
}

function renderAssignmentCell(assignment: Assignment): string {
  const textColor = getContrastColor(assignment.projectColor)
  const label = getAssignmentLabel(assignment.projectName, assignment.client?.name)
  const lockHtml = assignment.isLocked ? renderLockIcon(textColor) : ''

  return (
    `<div class="assignment" style="background:${assignment.projectColor};color:${textColor};">` +
    `<div style="display:flex;align-items:start;justify-content:space-between;gap:2px;">` +
    `<div class="assignment-name">${label}</div>` +
    lockHtml +
    `</div>` +
    `<div class="status-row">${renderStatusDot(assignment.status)}${renderTagBadge(assignment.tags)}</div>` +
    `</div>`
  )
}

function renderSplitCell(assignment: Assignment): string {
  const leftColor = assignment.projectColor
  const rightColor = assignment.splitProjectColor!
  const leftText = getContrastColor(leftColor)
  const rightText = getContrastColor(rightColor)
  const leftLabel = getAssignmentLabel(assignment.projectName, assignment.client?.name)
  const rightLabel = getAssignmentLabel(
    assignment.splitProjectName ?? '',
    assignment.splitClient?.name,
  )
  const leftStatus = assignment.status
  const rightStatus = (assignment.splitProjectStatus as AssignmentStatus) ?? 'placeholder'
  const lockHtml = assignment.isLocked
    ? `<div style="position:absolute;top:1px;right:2px;">${renderLockIcon(leftText)}</div>`
    : ''

  return (
    `<div class="split-cell" style="position:relative;">` +
    `<div class="split-half" style="background:${leftColor};color:${leftText};">` +
    `<div style="display:flex;align-items:center;gap:2px;">${renderStatusDot(leftStatus)}<span style="font-size:10px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${leftLabel}</span></div>` +
    renderTagBadge(assignment.tags) +
    `</div>` +
    `<div class="split-half" style="background:${rightColor};color:${rightText};">` +
    `<div style="display:flex;align-items:center;gap:2px;">${renderStatusDot(rightStatus)}<span style="font-size:10px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${rightLabel}</span></div>` +
    renderTagBadge(assignment.splitTags) +
    `</div>` +
    lockHtml +
    `</div>`
  )
}

function renderEmptyCell(): string {
  return ''
}

// ── Table Renderers ───────────────────────────────────────────────

function renderHeader(
  weeks: Date[],
  holidaysByWeek: Map<string, string[]>,
  currentWeekStr: string | null,
): string {
  const monthTransitions = new Set<number>()
  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i].getMonth() !== weeks[i - 1].getMonth()) {
      monthTransitions.add(i)
    }
  }

  const cols = weeks
    .map((week, colIdx) => {
      const weekKey = toLocalDateString(week)
      const isCurrent = weekKey === currentWeekStr
      const isMonthStart = monthTransitions.has(colIdx)
      const holidayNames = holidaysByWeek.get(weekKey)
      const titleAttr =
        holidayNames && holidayNames.length > 0
          ? ` title="${escapeHtml(holidayNames.join(', '))}"`
          : ''
      const classes = [
        'col-week',
        isCurrent ? 'current-week' : '',
        isMonthStart ? 'month-start' : '',
      ]
        .filter(Boolean)
        .join(' ')

      return `<th class="${classes}"${titleAttr}>${escapeHtml(formatWeekLabel(week))}</th>`
    })
    .join('')

  return `<thead><tr><th class="col-team">Team</th>${cols}</tr></thead>`
}

function renderMemberRow(
  member: TeamMember,
  weeks: Date[],
  assignmentMap: Map<string, Assignment>,
  absenceSet: Set<string>,
  holidaySet: Set<string>,
  rowIndex: number,
  monthTransitions: Set<number>,
  currentWeekStr: string | null,
): string {
  const rowClass = rowIndex % 2 === 0 ? 'even' : 'odd'
  const name = escapeHtml(getMemberName(member))
  const initial = escapeHtml(getMemberInitial(member))

  const cells = weeks
    .map((week, colIdx) => {
      const weekKey = toLocalDateString(week)
      const key = `${member.id}-${weekKey}`
      const assignment = assignmentMap.get(key)
      const fullyOut = isFullyAbsent(member.id, week, absenceSet, holidaySet)
      const isMonthStart = monthTransitions.has(colIdx)
      const isCurrent = weekKey === currentWeekStr
      const extraClasses = [
        isMonthStart ? 'month-start' : '',
      ]
        .filter(Boolean)
        .join(' ')
      const extraStyle = isCurrent && !fullyOut ? ' background:#dbeafe;' : ''

      let content: string
      if (fullyOut) {
        content = renderOutCell(member.id, week, absenceSet, holidaySet)
      } else if (assignment && assignment.splitProjectColor) {
        content =
          renderSplitCell(assignment) +
          renderAvailabilityDots(member.id, week, absenceSet, holidaySet)
      } else if (assignment) {
        content =
          renderAssignmentCell(assignment) +
          renderAvailabilityDots(member.id, week, absenceSet, holidaySet)
      } else {
        content =
          renderEmptyCell() +
          renderAvailabilityDots(member.id, week, absenceSet, holidaySet)
      }

      return `<td class="${extraClasses}" style="${extraStyle}">${content}</td>`
    })
    .join('')

  return (
    `<tr class="${rowClass}">` +
    `<td class="col-team"><div class="member-cell">` +
    `<div class="avatar">${initial}</div>` +
    `<span>${name}</span>` +
    `</div></td>` +
    cells +
    `</tr>`
  )
}

function renderTable(
  weeks: Date[],
  activeMembers: TeamMember[],
  backlogMembers: TeamMember[],
  assignmentMap: Map<string, Assignment>,
  absenceSet: Set<string>,
  holidaySet: Set<string>,
  currentWeekStr: string | null,
  holidaysByWeek: Map<string, string[]>,
): string {
  const monthTransitions = new Set<number>()
  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i].getMonth() !== weeks[i - 1].getMonth()) {
      monthTransitions.add(i)
    }
  }

  const header = renderHeader(weeks, holidaysByWeek, currentWeekStr)

  const activeRows = activeMembers
    .map((member, idx) =>
      renderMemberRow(member, weeks, assignmentMap, absenceSet, holidaySet, idx, monthTransitions, currentWeekStr),
    )
    .join('')

  const totalCols = weeks.length + 1
  const nmlSep = `<tr><td colspan="${totalCols}" class="nml-sep">No Man&#39;s Landing</td></tr>`

  const backlogRows = backlogMembers
    .map((member, idx) =>
      renderMemberRow(member, weeks, assignmentMap, absenceSet, holidaySet, idx, monthTransitions, currentWeekStr),
    )
    .join('')

  return `<table>${header}<tbody>${activeRows}${nmlSep}${backlogRows}</tbody></table>`
}

// ── Main Export Function ──────────────────────────────────────────

export function generateScheduleHtml(params: ExportHtmlParams): string {
  const { year, quarter, teamMembers, assignments, absences, holidays } = params

  // Derive week list
  const { start, end } = getQuarterDateRange(year, quarter)
  const weeks = getWeeksInRange(start, end)

  // Build assignment map
  const assignmentMap = new Map<string, Assignment>()
  for (const a of assignments) {
    const weekDate = new Date(a.weekStart)
    const key = `${a.teamMemberId}-${toLocalDateString(weekDate)}`
    assignmentMap.set(key, a)
  }

  // Build absence set
  const absenceSet = new Set<string>()
  for (const a of absences) {
    absenceSet.add(`${a.teamMemberId}-${toLocalDateString(new Date(a.date))}`)
  }

  // Build holiday set
  const holidaySet = new Set<string>()
  for (const h of holidays) {
    const date = new Date(year, h.month - 1, h.day)
    holidaySet.add(toLocalDateString(date))
  }

  // Build holidaysByWeek map
  const holidaysByWeek = new Map<string, string[]>()
  for (const h of holidays) {
    const hDate = new Date(year, h.month - 1, h.day)
    const hDay = hDate.getDay()
    if (hDay === 0 || hDay === 6) continue
    const monday = new Date(hDate)
    monday.setDate(monday.getDate() - (hDay - 1))
    const key = toLocalDateString(monday)
    const list = holidaysByWeek.get(key) ?? []
    list.push(h.name)
    holidaysByWeek.set(key, list)
  }

  // Separate active and backlog members
  const activeMembers = teamMembers.filter((m) => !m.isBacklog && m.status === 'active')
  const backlogMembers = teamMembers.filter((m) => m.isBacklog && m.status === 'active')

  // Determine current week
  const nowMonday = getWeekMonday(new Date())
  const nowMondayStr = toLocalDateString(nowMonday)
  const currentWeekStr = weeks.some((w) => toLocalDateString(w) === nowMondayStr)
    ? nowMondayStr
    : null

  // Build title
  const quarterLabel =
    quarter !== null ? `Q${quarter}` : 'Full Year'
  const title = `Schedule &#8212; ${year} ${quarterLabel}`

  // Build table content
  let tableContent: string

  if (quarter !== null) {
    // Single quarter: one table
    tableContent = renderTable(
      weeks,
      activeMembers,
      backlogMembers,
      assignmentMap,
      absenceSet,
      holidaySet,
      currentWeekStr,
      holidaysByWeek,
    )
  } else {
    // Full year: 4 quarter-separated tables
    const quarterChunks: { label: string; weeks: Date[] }[] = [
      { label: QUARTER_LABELS[0], weeks: [] },
      { label: QUARTER_LABELS[1], weeks: [] },
      { label: QUARTER_LABELS[2], weeks: [] },
      { label: QUARTER_LABELS[3], weeks: [] },
    ]
    for (const week of weeks) {
      const thu = new Date(week)
      thu.setDate(thu.getDate() + 3)
      const month = thu.getMonth()
      const q = Math.floor(month / 3)
      quarterChunks[q].weeks.push(week)
    }

    tableContent = quarterChunks
      .filter((chunk) => chunk.weeks.length > 0)
      .map(
        (chunk) =>
          `<div class="quarter-sep">${escapeHtml(chunk.label)}</div>` +
          renderTable(
            chunk.weeks,
            activeMembers,
            backlogMembers,
            assignmentMap,
            absenceSet,
            holidaySet,
            currentWeekStr,
            holidaysByWeek,
          ),
      )
      .join('')
  }

  return (
    `<!DOCTYPE html>` +
    `<html lang="en">` +
    `<head>` +
    `<meta charset="UTF-8">` +
    `<title>Schedule ${year} ${quarterLabel}</title>` +
    `<style>${CSS_TEMPLATE}</style>` +
    `</head>` +
    `<body>` +
    `<h2 style="padding:8px 12px;font-size:14px;">${title}</h2>` +
    `<div style="overflow-x:auto;">` +
    tableContent +
    `</div>` +
    `</body>` +
    `</html>`
  )
}
