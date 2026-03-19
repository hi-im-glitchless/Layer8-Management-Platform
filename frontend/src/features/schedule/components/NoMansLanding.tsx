import { Plus, Trash2 } from 'lucide-react'
import { AssignmentCell } from './AssignmentCell'
import { AvailabilityDots } from './AvailabilityDots'
import { toLocalDateString } from '../constants'
import type { Assignment, Absence, Holiday, TeamMember, AssignmentStatus } from '../types'

interface NoMansLandingProps {
  backlogMembers: TeamMember[]
  weekSlice: Date[]
  year: number
  canEdit: boolean
  absences: Absence[]
  holidays: Holiday[]
  holidaysByWeek: Map<string, string[]>
  getAssignment: (teamMemberId: string, weekStart: Date) => Assignment | undefined
  isFullyAbsent: (teamMemberId: string, weekStart: Date) => boolean
  onCellClick: (teamMemberId: string, weekStart: Date, assignment: Assignment | undefined, e?: React.MouseEvent) => void
  onCellHover: (teamMemberId: string, weekStart: string) => void
  onLockToggle: (assignmentId: string) => void
  onStatusCycle?: (assignmentId: string, nextStatus: AssignmentStatus) => void
  onAddRow: () => void
  onDeleteRow: (id: string) => void
}

function getMemberLabel(member: TeamMember): string {
  if (member.displayName) return member.displayName
  if (member.user?.displayName) return member.user.displayName
  if (member.user?.username) return member.user.username
  return `Futuro ${member.displayOrder}`
}

export function NoMansLanding({
  backlogMembers,
  weekSlice,
  year,
  canEdit,
  absences,
  holidays,
  getAssignment,
  isFullyAbsent,
  onCellClick,
  onCellHover,
  onLockToggle,
  onStatusCycle,
  onAddRow,
  onDeleteRow,
}: NoMansLandingProps) {
  return (
    <>
      {/* Separator row with add button */}
      <tr>
        <td
          colSpan={weekSlice.length + 1}
          className="bg-slate-200 dark:bg-slate-800 border-t-2 border-slate-300 dark:border-slate-600 px-4 py-1.5"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300 tracking-wide">
              No Man&apos;s Landing
            </span>
            {canEdit && (
              <button
                onClick={onAddRow}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add row
              </button>
            )}
          </div>
        </td>
      </tr>
      {/* Backlog member rows */}
      {backlogMembers.map((member, rowIdx) => {
        const rowBg = rowIdx % 2 === 0 ? 'bg-slate-50 dark:bg-slate-800/50' : 'bg-white dark:bg-slate-900/50'
        return (
        <tr key={member.id} className={`transition-colors hover:bg-blue-50/50 dark:hover:bg-blue-900/20 ${rowBg}`}>
          <td className={`sticky left-0 z-20 ${rowBg} border-b border-r-2 border-slate-300 dark:border-slate-600 px-3 py-1.5 text-sm font-medium w-[140px] min-w-[120px] max-w-[140px] text-slate-500 dark:text-slate-400 italic`}>
            <div className="flex items-center justify-between gap-1 group/row">
              <span className="truncate">{getMemberLabel(member)}</span>
              {canEdit && (
                <button
                  onClick={() => onDeleteRow(member.id)}
                  className="shrink-0 p-0.5 rounded opacity-0 group-hover/row:opacity-60 hover:!opacity-100 hover:bg-destructive/10 transition-all"
                  title="Delete row"
                >
                  <Trash2 className="w-3 h-3 text-destructive" />
                </button>
              )}
            </div>
          </td>
          {weekSlice.map((week) => {
            const assignment = getAssignment(member.id, week)
            const fullyOut = isFullyAbsent(member.id, week)
            const weekStr = toLocalDateString(week)
            return (
              <td
                key={week.toISOString()}
                className={`border-b border-r border-slate-200 dark:border-slate-700 p-0.5 min-w-[150px] h-[64px] align-top${fullyOut ? ' bg-muted' : ''}`}
                onMouseEnter={() => onCellHover(member.id, weekStr)}
              >
                {fullyOut ? (
                  <div className="h-full flex items-center justify-center">
                    <span className="text-xs font-semibold text-muted-foreground">OUT</span>
                  </div>
                ) : (
                  <>
                    <AssignmentCell
                      assignment={assignment}
                      teamMemberId={member.id}
                      weekStart={weekStr}
                      canEdit={canEdit}
                      isDragOverlay={false}
                      onCellClick={(e) => onCellClick(member.id, week, assignment, e)}
                      onLockToggle={assignment ? () => onLockToggle(assignment.id) : undefined}
                      onStatusCycle={canEdit && assignment ? onStatusCycle : undefined}
                    />
                    <AvailabilityDots
                      weekStart={week}
                      teamMemberId={member.id}
                      absences={absences}
                      holidays={holidays}
                      year={year}
                    />
                  </>
                )}
              </td>
            )
          })}
        </tr>
      )})}
    </>
  )
}
